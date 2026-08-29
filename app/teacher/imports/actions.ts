"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { formatKstDate, parseKstDateString } from "@/lib/date";
import { parseSlotLabel } from "@/lib/slot";
import type { StudySlot } from "@prisma/client";

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportResult {
  ok: boolean;
  fileName?: string;
  totalRows: number;
  validRows: number;
  createdRows: number;
  existingSkipped: number;
  duplicateRows: number;
  excludedByCalendar: number;
  errors: ImportRowError[];
  perDate: Array<{ date: string; slot: StudySlot; count: number }>;
  message?: string;
}

const REQUIRED = ["학번", "이름", "반", "날짜", "구분"] as const;

interface ParsedRow {
  row: number;
  studentNo: string;
  name: string;
  classroom: string;
  date: string;
  slot: StudySlot;
}

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  const m = str.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}

function toCellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

export async function uploadExcelAction(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      totalRows: 0,
      validRows: 0,
      createdRows: 0,
      existingSkipped: 0,
      duplicateRows: 0,
      excludedByCalendar: 0,
      errors: [],
      perDate: [],
      message: "파일을 선택하세요.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return {
      ok: false,
      fileName: file.name,
      totalRows: 0,
      validRows: 0,
      createdRows: 0,
      existingSkipped: 0,
      duplicateRows: 0,
      excludedByCalendar: 0,
      errors: [],
      perDate: [],
      message: "Excel 파일 형식을 읽을 수 없습니다.",
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      ok: false,
      fileName: file.name,
      totalRows: 0,
      validRows: 0,
      createdRows: 0,
      existingSkipped: 0,
      duplicateRows: 0,
      excludedByCalendar: 0,
      errors: [],
      perDate: [],
      message: "시트가 비어 있습니다.",
    };
  }
  const sheet = workbook.Sheets[firstSheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (rows.length === 0) {
    return {
      ok: false,
      fileName: file.name,
      totalRows: 0,
      validRows: 0,
      createdRows: 0,
      existingSkipped: 0,
      duplicateRows: 0,
      excludedByCalendar: 0,
      errors: [],
      perDate: [],
      message: "데이터가 없습니다.",
    };
  }

  const header = Object.keys(rows[0] ?? {});
  const missing = REQUIRED.filter((k) => !header.includes(k));
  if (missing.length > 0) {
    return {
      ok: false,
      fileName: file.name,
      totalRows: rows.length,
      validRows: 0,
      createdRows: 0,
      existingSkipped: 0,
      duplicateRows: 0,
      excludedByCalendar: 0,
      errors: [],
      perDate: [],
      message: `필수 열 누락: ${missing.join(", ")}`,
    };
  }

  const errors: ImportRowError[] = [];
  const parsed: ParsedRow[] = [];
  const seen = new Set<string>();
  let duplicateRows = 0;

  rows.forEach((raw, idx) => {
    const rowNo = idx + 2;
    const studentNo = toCellString(raw["학번"]);
    const name = toCellString(raw["이름"]);
    const classroom = toCellString(raw["반"]);
    const dateStr = toIsoDate(raw["날짜"]);
    const slotLabel = toCellString(raw["구분"]);

    if (!studentNo && !name && !classroom && !dateStr && !slotLabel) {
      return;
    }

    if (!studentNo || !name || !classroom) {
      errors.push({ row: rowNo, reason: "학번/이름/반 필수값 누락" });
      return;
    }
    if (!dateStr) {
      errors.push({ row: rowNo, reason: "날짜 형식 오류" });
      return;
    }
    try {
      parseKstDateString(dateStr);
    } catch {
      errors.push({ row: rowNo, reason: `잘못된 날짜: ${dateStr}` });
      return;
    }
    const slot = parseSlotLabel(slotLabel);
    if (!slot) {
      errors.push({
        row: rowNo,
        reason: `구분 값은 야자1/야자2/심자만 허용: ${slotLabel}`,
      });
      return;
    }

    const key = `${studentNo}|${dateStr}|${slot}`;
    if (seen.has(key)) {
      duplicateRows += 1;
      return;
    }
    seen.add(key);

    parsed.push({ row: rowNo, studentNo, name, classroom, date: dateStr, slot });
  });

  const uniqueDates = Array.from(new Set(parsed.map((p) => p.date)));
  const calendarExceptions = await prisma.calendarException.findMany({
    where: { date: { in: uniqueDates.map((d) => parseKstDateString(d)) } },
  });
  const exceptionSet = new Set(
    calendarExceptions.map((c) => formatKstDate(c.date)),
  );

  const filtered: ParsedRow[] = [];
  let excludedByCalendar = 0;
  for (const p of parsed) {
    if (exceptionSet.has(p.date)) {
      excludedByCalendar += 1;
      errors.push({
        row: p.row,
        reason: `캘린더 예외일(${p.date})로 대상자 생성 제외`,
      });
      continue;
    }
    filtered.push(p);
  }

  const batch = await prisma.importBatch.create({
    data: {
      fileName: file.name,
      rowCount: rows.length,
      errorCount: errors.length,
      actor: "teacher",
    },
  });

  const perDate = new Map<string, number>();
  let createdRows = 0;
  let existingSkipped = 0;
  for (const p of filtered) {
    const student = await prisma.student.upsert({
      where: { studentNo: p.studentNo },
      update: { name: p.name, classroom: p.classroom, active: true },
      create: {
        studentNo: p.studentNo,
        name: p.name,
        classroom: p.classroom,
        active: true,
      },
    });

    const existing = await prisma.participationPlan.findUnique({
      where: {
        studentId_date_slot: {
          studentId: student.id,
          date: parseKstDateString(p.date),
          slot: p.slot,
        },
      },
    });
    if (existing) {
      existingSkipped += 1;
      continue;
    }

    await prisma.participationPlan.create({
      data: {
        studentId: student.id,
        date: parseKstDateString(p.date),
        slot: p.slot,
        importBatchId: batch.id,
        attendance: { create: { state: "UNCHECKED" } },
      },
    });
    createdRows += 1;

    const k = `${p.date}|${p.slot}`;
    perDate.set(k, (perDate.get(k) ?? 0) + 1);
  }

  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action: "IMPORT_BATCH",
      targetType: "ImportBatch",
      targetId: batch.id,
      meta: JSON.stringify({
        fileName: file.name,
        totalRows: rows.length,
        validRows: filtered.length,
        createdRows,
        existingSkipped,
        duplicateRows,
        excludedByCalendar,
        errorCount: errors.length,
      }),
    },
  });

  revalidatePath("/teacher/attendance");
  revalidatePath("/teacher/reports");

  return {
    ok: true,
    fileName: file.name,
    totalRows: rows.length,
    validRows: filtered.length,
    createdRows,
    existingSkipped,
    duplicateRows,
    excludedByCalendar,
    errors,
    perDate: Array.from(perDate.entries())
      .map(([k, count]) => {
        const [date, slot] = k.split("|");
        return { date: date!, slot: slot as StudySlot, count };
      })
      .sort((a, b) =>
        a.date === b.date ? a.slot.localeCompare(b.slot) : a.date.localeCompare(b.date),
      ),
  };
}

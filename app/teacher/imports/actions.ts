"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  formatKstDate,
  kstTodayString,
  kstWeekMonday,
  kstWeekdayDates,
  parseKstDateString,
} from "@/lib/date";
import { parseSlotLabel } from "@/lib/slot";
import { getKoreanHolidaysForDatesWithCache } from "@/lib/korean-holiday-cache";
import {
  isSurveyWorkbook,
  parseSurveyWorkbook,
  type SurveyStudentDetail,
} from "@/lib/survey-import";
import type { AttState, StudySlot } from "@prisma/client";

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
  /** 기존 대상자에 명부의 출결 표시(출/지/조/결/인)를 반영해 갱신한 수 */
  updatedRows: number;
  /** 설문 명부 재업로드 시, 새 명부에 없어 제거한 이전 계획 수 */
  removedRows: number;
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
  /** 명부 셀의 출결 표시에서 읽은 상태. 단순 양식은 항상 UNCHECKED. */
  state: AttState;
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

const WEEK_MONDAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function failResult(message: string, fileName?: string, totalRows = 0): ImportResult {
  return {
    ok: false,
    fileName,
    totalRows,
    validRows: 0,
    createdRows: 0,
    updatedRows: 0,
    removedRows: 0,
    existingSkipped: 0,
    duplicateRows: 0,
    excludedByCalendar: 0,
    errors: [],
    perDate: [],
    message,
  };
}

// 설문(구글폼) 제출내역 xlsx → 참여계획. 요일→날짜 환산에 기준 월요일이 필요하다.
// 기준 월요일을 비우면 업로드 시점 기준 이번 주 월요일로 자동 적용한다.
async function importSurvey(
  workbook: XLSX.WorkBook,
  fileName: string,
  weekMondayInput: string,
): Promise<ImportResult> {
  let weekMonday: string;
  if (!weekMondayInput) {
    weekMonday = kstWeekMonday(kstTodayString());
  } else if (WEEK_MONDAY_RE.test(weekMondayInput)) {
    weekMonday = weekMondayInput;
  } else {
    return failResult(
      "기준 월요일 형식이 올바르지 않습니다 (YYYY-MM-DD). 비우면 이번 주로 자동 적용됩니다.",
      fileName,
    );
  }
  const [y = 0, m = 0, d = 0] = weekMonday.split("-").map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 1) {
    return failResult(`기준일은 월요일이어야 합니다: ${weekMonday}`, fileName);
  }

  const { rows, duplicateRows, rawRows, slots, students } = parseSurveyWorkbook(
    workbook,
    weekMonday,
  );
  if (rawRows === 0) {
    return failResult(
      "설문에서 참여 기록을 찾지 못했습니다. (오자/야자/심자 열 확인)",
      fileName,
    );
  }

  const parsed: ParsedRow[] = rows.map((r, i) => ({
    row: i + 1,
    studentNo: r.studentNo,
    name: r.name,
    classroom: r.classroom,
    date: r.date,
    slot: r.slot,
    state: r.state,
  }));

  return persistParsed({
    fileName,
    totalRows: rawRows,
    parsed,
    errors: [],
    duplicateRows,
    studentDetails: students,
    replaceScope: { dates: kstWeekdayDates(weekMonday), slots },
  });
}

export async function uploadExcelAction(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return failResult("파일을 선택하세요.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    return failResult("Excel 파일 형식을 읽을 수 없습니다.", file.name);
  }

  const weekMonday = toCellString(formData.get("weekMonday"));
  if (isSurveyWorkbook(workbook)) {
    return importSurvey(workbook, file.name, weekMonday);
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return failResult("시트가 비어 있습니다.", file.name);
  }
  const sheet = workbook.Sheets[firstSheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (rows.length === 0) {
    return failResult("데이터가 없습니다.", file.name);
  }

  const header = Object.keys(rows[0] ?? {});
  const missing = REQUIRED.filter((k) => !header.includes(k));
  if (missing.length > 0) {
    return failResult(`필수 열 누락: ${missing.join(", ")}`, file.name, rows.length);
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
        reason: `구분 값은 오자/야자/심자만 허용: ${slotLabel}`,
      });
      return;
    }

    const key = `${studentNo}|${dateStr}|${slot}`;
    if (seen.has(key)) {
      duplicateRows += 1;
      return;
    }
    seen.add(key);

    parsed.push({ row: rowNo, studentNo, name, classroom, date: dateStr, slot, state: "UNCHECKED" });
  });

  return persistParsed({
    fileName: file.name,
    totalRows: rows.length,
    parsed,
    errors,
    duplicateRows,
  });
}

// 업로드한 출결 표시를 저장용 필드로 변환한다. 결석/인정결석은 사유 분류를 함께 둔다.
// 표시만으로는 정확한 시각을 알 수 없어 입·퇴실 시각은 비운다.
function attendanceFieldsFor(state: AttState) {
  const base = {
    state,
    checkInAt: null,
    checkOutAt: null,
    absenceCategory: null as "PERSONAL" | "OFFICIAL" | null,
    absenceNote: null,
  };
  if (state === "ABSENT") return { ...base, absenceCategory: "PERSONAL" as const };
  if (state === "EXCUSED") return { ...base, absenceCategory: "OFFICIAL" as const };
  return base;
}

// 파싱된 참여 행을 캘린더 예외 제외 후 학생/계획으로 저장하고 결과를 만든다.
async function persistParsed(args: {
  fileName: string;
  totalRows: number;
  parsed: ParsedRow[];
  errors: ImportRowError[];
  duplicateRows: number;
  /** 설문 정보열에서 읽은 학생별 상세(연락처/제출/수정시간). 교사용 내부 저장. */
  studentDetails?: SurveyStudentDetail[];
  /** 설정되면 이 날짜·슬롯 범위를 새 명부로 교체한다(없는 이전 계획 제거). */
  replaceScope?: { dates: string[]; slots: StudySlot[] };
}): Promise<ImportResult> {
  const { fileName, totalRows, parsed, errors, duplicateRows } = args;

  const detailByNo = new Map<string, SurveyStudentDetail>();
  for (const d of args.studentDetails ?? []) detailByNo.set(d.studentNo, d);

  const scopeDates = args.replaceScope?.dates ?? [];
  const uniqueDates = Array.from(
    new Set([...parsed.map((p) => p.date), ...scopeDates]),
  );
  const calendarExceptions = await prisma.calendarException.findMany({
    where: { date: { in: uniqueDates.map((d) => parseKstDateString(d)) } },
  });
  const exceptionSet = new Set(
    calendarExceptions.map((c) => formatKstDate(c.date)),
  );
  const officialHolidays = await getKoreanHolidaysForDatesWithCache(uniqueDates);
  const officialHolidayByDate = new Map(
    officialHolidays.map((holiday) => [holiday.date, holiday.name]),
  );
  for (const holiday of officialHolidays) exceptionSet.add(holiday.date);

  const filtered: ParsedRow[] = [];
  let excludedByCalendar = 0;
  for (const p of parsed) {
    if (exceptionSet.has(p.date)) {
      excludedByCalendar += 1;
      errors.push({
        row: p.row,
        reason: officialHolidayByDate.has(p.date)
          ? `공식 공휴일(${officialHolidayByDate.get(p.date)}, ${p.date})로 대상자 생성 제외`
          : `캘린더 예외일(${p.date})로 대상자 생성 제외`,
      });
      continue;
    }
    filtered.push(p);
  }

  const batch = await prisma.importBatch.create({
    data: {
      fileName,
      rowCount: totalRows,
      errorCount: errors.length,
      actor: "teacher",
    },
  });

  // 설문 명부 재업로드는 해당 주를 새 명부로 교체한다: 이 주·슬롯 범위에서
  // 새 명부에 없는 이전 계획(과 출결)을 제거해 이전 명부 잔재가 남지 않게 한다.
  let removedRows = 0;
  if (args.replaceScope) {
    const reconcileDates = args.replaceScope.dates.filter((d) => !exceptionSet.has(d));
    if (reconcileDates.length > 0 && args.replaceScope.slots.length > 0) {
      const existingInScope = await prisma.participationPlan.findMany({
        where: {
          date: { in: reconcileDates.map((d) => parseKstDateString(d)) },
          slot: { in: args.replaceScope.slots },
        },
        include: { student: true },
      });
      const keep = new Set(filtered.map((p) => `${p.studentNo}|${p.date}|${p.slot}`));
      const staleIds = existingInScope
        .filter(
          (pl) => !keep.has(`${pl.student.studentNo}|${formatKstDate(pl.date)}|${pl.slot}`),
        )
        .map((pl) => pl.id);
      if (staleIds.length > 0) {
        await prisma.attendance.deleteMany({
          where: { participationPlanId: { in: staleIds } },
        });
        await prisma.participationPlan.deleteMany({ where: { id: { in: staleIds } } });
        removedRows = staleIds.length;
      }
    }
  }

  const perDate = new Map<string, number>();
  let createdRows = 0;
  let updatedRows = 0;
  let existingSkipped = 0;
  for (const p of filtered) {
    const detail = detailByNo.get(p.studentNo);
    // 설문에 값이 있는 항목만 갱신한다(빈 값으로 교사 입력 연락처를 덮지 않음).
    const detailFields: {
      contact?: string;
      surveySubmittedAt?: string;
      surveyUpdatedAt?: string;
    } = {};
    if (detail?.contact) detailFields.contact = detail.contact;
    if (detail?.surveySubmittedAt) detailFields.surveySubmittedAt = detail.surveySubmittedAt;
    if (detail?.surveyUpdatedAt) detailFields.surveyUpdatedAt = detail.surveyUpdatedAt;

    const student = await prisma.student.upsert({
      where: { studentNo: p.studentNo },
      update: { name: p.name, classroom: p.classroom, active: true, ...detailFields },
      create: {
        studentNo: p.studentNo,
        name: p.name,
        classroom: p.classroom,
        active: true,
        ...detailFields,
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
      include: { attendance: true },
    });
    if (existing) {
      // 명부에 확정 출결 표시(출/지/조/결/인)가 있으면 기존 출결을 그 상태로 갱신한다.
      // 미체크(○·요일·1)는 기존 기록을 덮어쓰지 않는다.
      if (p.state !== "UNCHECKED" && existing.attendance?.state !== p.state) {
        await prisma.attendance.update({
          where: { participationPlanId: existing.id },
          data: attendanceFieldsFor(p.state),
        });
        updatedRows += 1;
      } else {
        existingSkipped += 1;
      }
      continue;
    }

    await prisma.participationPlan.create({
      data: {
        studentId: student.id,
        date: parseKstDateString(p.date),
        slot: p.slot,
        importBatchId: batch.id,
        attendance: { create: attendanceFieldsFor(p.state) },
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
        fileName,
        totalRows,
        validRows: filtered.length,
        createdRows,
        updatedRows,
        removedRows,
        existingSkipped,
        duplicateRows,
        excludedByCalendar,
        errorCount: errors.length,
      }),
    },
  });

  revalidatePath("/teacher/attendance");
  revalidatePath("/teacher/attendance/week");
  revalidatePath("/teacher/reports");

  return {
    ok: true,
    fileName,
    totalRows,
    validRows: filtered.length,
    createdRows,
    updatedRows,
    removedRows,
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

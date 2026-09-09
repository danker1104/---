import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { STATE_LABEL, SLOT_LABEL, SLOT_ORDER } from "@/lib/slot";
import { loadDetailedRows, type ReportFilter } from "../../report-data";
import type { StudySlot } from "@prisma/client";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS: ReadonlySet<StudySlot> = new Set(["OJA", "YAJA", "SIMJA"]);

function readFilter(url: URL): ReportFilter | null {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const slotParam = url.searchParams.get("slot") ?? "ALL";
  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) return null;
  const slot: ReportFilter["slot"] = SLOTS.has(slotParam as StudySlot)
    ? (slotParam as StudySlot)
    : "ALL";
  return { from, to, slot };
}

export async function GET(request: Request) {
  const filter = readFilter(new URL(request.url));
  if (!filter) {
    return NextResponse.json({ error: "invalid filter" }, { status: 400 });
  }
  const rows = await loadDetailedRows(filter);

  const data = [
    [
      "학번",
      "이름",
      "반",
      "날짜",
      "구분",
      "참석 여부",
      "입실 시각",
      "퇴실 시각",
      "불참 사유",
    ],
    ...rows.map((r) => [
      r.studentNo,
      r.name,
      r.classroom,
      r.date,
      r.slot,
      STATE_LABEL[r.state],
      r.checkIn,
      r.checkOut,
      r.absenceNote,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "출결결과");

  // 매트릭스 시트: 학생 × (날짜·슬롯) 교차표, 셀 = 참석 상태.
  const studentMap = new Map<string, { studentNo: string; name: string; classroom: string }>();
  const colMap = new Map<string, { date: string; slot: string }>();
  const cell = new Map<string, string>();
  for (const r of rows) {
    studentMap.set(r.studentNo, { studentNo: r.studentNo, name: r.name, classroom: r.classroom });
    colMap.set(`${r.date}__${r.slot}`, { date: r.date, slot: r.slot });
    cell.set(`${r.studentNo}|${r.date}|${r.slot}`, STATE_LABEL[r.state]);
  }
  const slotIndex = (s: string) => {
    const i = (SLOT_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? 99 : i;
  };
  const cols = Array.from(colMap.values()).sort((a, b) =>
    a.date === b.date ? slotIndex(a.slot) - slotIndex(b.slot) : a.date.localeCompare(b.date),
  );
  const students = Array.from(studentMap.values()).sort((a, b) =>
    a.classroom === b.classroom
      ? a.studentNo.localeCompare(b.studentNo)
      : a.classroom.localeCompare(b.classroom),
  );
  const matrixData = [
    ["학번", "이름", "반", ...cols.map((c) => `${c.date} ${SLOT_LABEL[c.slot as StudySlot] ?? c.slot}`)],
    ...students.map((s) => [
      s.studentNo,
      s.name,
      s.classroom,
      ...cols.map((c) => cell.get(`${s.studentNo}|${c.date}|${c.slot}`) ?? ""),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrixData), "매트릭스");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const fileName = `attendance_${filter.from}_${filter.to}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

import { NextResponse } from "next/server";
import { loadReport, type ReportFilter } from "../../report-data";
import type { StudySlot } from "@prisma/client";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS: ReadonlySet<StudySlot> = new Set(["YAJA1", "YAJA2", "SIMJA"]);

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

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const filter = readFilter(new URL(request.url));
  if (!filter) {
    return NextResponse.json({ error: "invalid filter" }, { status: 400 });
  }
  const { rows } = await loadReport(filter);

  const header = [
    "학번",
    "이름",
    "반",
    "대상일수",
    "출석",
    "지각",
    "조퇴",
    "결석",
    "인정결석",
    "미체크",
    "참석률(%)",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.studentNo,
        r.name,
        r.classroom,
        r.total,
        r.present,
        r.late,
        r.leaveEarly,
        r.absent,
        r.excused,
        r.unchecked,
        r.rate === "-" ? "-" : r.rate,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const body = "\uFEFF" + lines.join("\n");

  const fileName = `report_${filter.from}_${filter.to}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

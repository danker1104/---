import { prisma } from "@/lib/db";
import type { AttState, StudySlot } from "@prisma/client";
import { parseKstDateString, formatKstDate, formatKstTime } from "@/lib/date";
import { summarizeStudent, type AttStateValue } from "@/lib/report";
import { SLOT_LABEL } from "@/lib/slot";

export interface ReportFilter {
  from: string;
  to: string;
  slot: StudySlot | "ALL";
}

export interface ReportRow {
  studentNo: string;
  name: string;
  classroom: string;
  total: number;
  present: number;
  late: number;
  leaveEarly: number;
  absent: number;
  excused: number;
  unchecked: number;
  rate: number | "-";
}

export interface SlotSeriesPoint {
  date: string;
  slot: StudySlot;
  processed: number;
  attended: number;
  rate: number | null;
}

export async function loadReport(filter: ReportFilter): Promise<{
  rows: ReportRow[];
  series: SlotSeriesPoint[];
  totalPlans: number;
}> {
  const from = parseKstDateString(filter.from);
  const to = parseKstDateString(filter.to);
  const where = {
    date: { gte: from, lte: to },
    ...(filter.slot === "ALL" ? {} : { slot: filter.slot }),
  };

  const plans = await prisma.participationPlan.findMany({
    where,
    include: { student: true, attendance: true },
    orderBy: [{ student: { classroom: "asc" } }, { student: { studentNo: "asc" } }],
  });

  const byStudent = new Map<string, { student: typeof plans[number]["student"]; states: AttStateValue[] }>();
  for (const p of plans) {
    const key = p.student.id;
    const entry =
      byStudent.get(key) ?? { student: p.student, states: [] as AttStateValue[] };
    entry.states.push((p.attendance?.state ?? "UNCHECKED") as AttStateValue);
    byStudent.set(key, entry);
  }

  const rows: ReportRow[] = Array.from(byStudent.values())
    .map(({ student, states }) => {
      const s = summarizeStudent(states);
      return {
        studentNo: student.studentNo,
        name: student.name,
        classroom: student.classroom,
        ...s,
      };
    })
    .sort((a, b) =>
      a.classroom === b.classroom
        ? a.studentNo.localeCompare(b.studentNo)
        : a.classroom.localeCompare(b.classroom),
    );

  const seriesMap = new Map<
    string,
    { date: string; slot: StudySlot; processed: number; attended: number }
  >();
  for (const p of plans) {
    const dateStr = formatKstDate(p.date);
    const state = (p.attendance?.state ?? "UNCHECKED") as AttStateValue;
    const key = `${dateStr}|${p.slot}`;
    const cur = seriesMap.get(key) ?? { date: dateStr, slot: p.slot, processed: 0, attended: 0 };
    if (state !== "UNCHECKED" && state !== "EXCUSED") {
      cur.processed += 1;
      if (state === "PRESENT" || state === "LATE" || state === "LEAVE_EARLY") {
        cur.attended += 1;
      }
    }
    seriesMap.set(key, cur);
  }
  const series: SlotSeriesPoint[] = Array.from(seriesMap.values())
    .map((p) => ({
      ...p,
      rate: p.processed === 0 ? null : Math.round((p.attended / p.processed) * 1000) / 10,
    }))
    .sort((a, b) => (a.date === b.date ? a.slot.localeCompare(b.slot) : a.date.localeCompare(b.date)));

  return { rows, series, totalPlans: plans.length };
}

export interface DetailedRow {
  studentNo: string;
  name: string;
  classroom: string;
  date: string;
  slot: string;
  state: AttState;
  checkIn: string;
  checkOut: string;
  absenceNote: string;
}

export async function loadDetailedRows(filter: ReportFilter): Promise<DetailedRow[]> {
  const from = parseKstDateString(filter.from);
  const to = parseKstDateString(filter.to);
  const plans = await prisma.participationPlan.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(filter.slot === "ALL" ? {} : { slot: filter.slot }),
    },
    include: { student: true, attendance: true },
    orderBy: [
      { date: "asc" },
      { slot: "asc" },
      { student: { classroom: "asc" } },
      { student: { studentNo: "asc" } },
    ],
  });

  return plans.map((p) => ({
    studentNo: p.student.studentNo,
    name: p.student.name,
    classroom: p.student.classroom,
    date: formatKstDate(p.date),
    slot: SLOT_LABEL[p.slot],
    state: p.attendance?.state ?? "UNCHECKED",
    checkIn: p.attendance?.checkInAt ? formatKstTime(p.attendance.checkInAt) : "",
    checkOut: p.attendance?.checkOutAt ? formatKstTime(p.attendance.checkOutAt) : "",
    absenceNote: p.attendance?.absenceNote ?? "",
  }));
}

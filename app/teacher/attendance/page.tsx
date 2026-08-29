import Link from "next/link";
import type { Route } from "next";
import type { StudySlot } from "@prisma/client";
import { prisma } from "@/lib/db";
import { kstTodayString, parseKstDateString } from "@/lib/date";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/slot";
import { AttendanceTable, type AttendanceRow } from "./AttendanceTable";

export const dynamic = "force-dynamic";

interface SearchParams {
  date?: string;
  slot?: string;
}

const SLOTS = new Set<StudySlot>(["YAJA1", "YAJA2", "SIMJA"]);

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const today = kstTodayString();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? (params.date as string)
    : today;
  const slot: StudySlot = SLOTS.has(params.slot as StudySlot)
    ? (params.slot as StudySlot)
    : "YAJA1";

  const dateUtc = parseKstDateString(date);
  const plans = await prisma.participationPlan.findMany({
    where: { date: dateUtc, slot },
    include: { student: true, attendance: true },
    orderBy: [{ student: { classroom: "asc" } }, { student: { studentNo: "asc" } }],
  });

  const rows: AttendanceRow[] = plans.map((p) => ({
    planId: p.id,
    studentNo: p.student.studentNo,
    name: p.student.name,
    classroom: p.student.classroom,
    state: p.attendance?.state ?? "UNCHECKED",
    checkInAt: p.attendance?.checkInAt?.toISOString() ?? null,
    checkOutAt: p.attendance?.checkOutAt?.toISOString() ?? null,
    absenceNote: p.attendance?.absenceNote ?? null,
  }));

  const slotCounts = await prisma.participationPlan.groupBy({
    by: ["slot"],
    where: { date: dateUtc },
    _count: { _all: true },
  });
  const countMap = new Map(slotCounts.map((s) => [s.slot, s._count._all]));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">일일 출결 체크</h1>
        <form className="flex flex-wrap items-center gap-2 text-sm" method="get">
          <label htmlFor="date" className="text-slate-600">날짜</label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={date}
            className="min-h-[40px] flex-1 rounded border border-slate-300 px-2 py-1 sm:flex-none"
          />
          <input type="hidden" name="slot" value={slot} />
          <button
            type="submit"
            className="min-h-[40px] rounded bg-slate-900 px-3 py-1 text-white"
          >
            이동
          </button>
        </form>
      </div>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {SLOT_ORDER.map((s) => {
          const href = `/teacher/attendance?date=${date}&slot=${s}` as Route;
          const active = s === slot;
          return (
            <Link
              key={s}
              href={href}
              className={`min-h-[40px] shrink-0 rounded border px-3 py-1.5 text-sm ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {SLOT_LABEL[s]} ({countMap.get(s) ?? 0})
            </Link>
          );
        })}
      </div>

      <AttendanceTable date={date} slot={slot} rows={rows} />
    </div>
  );
}

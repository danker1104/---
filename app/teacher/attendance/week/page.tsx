import Link from "next/link";
import type { Route } from "next";
import { prisma } from "@/lib/db";
import {
  formatKstDate,
  isoAddDays,
  kstTodayString,
  kstWeekMonday,
  kstWeekdayDates,
  parseKstDateString,
} from "@/lib/date";
import { buildWeekMatrix, type WeekPlan } from "@/lib/weekly-attendance";
import { WeekMatrix } from "./WeekMatrix";

export const dynamic = "force-dynamic";

interface SearchParams {
  monday?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const base = DATE_RE.test(params.monday ?? "")
    ? (params.monday as string)
    : kstTodayString();
  const monday = kstWeekMonday(base);
  const dates = kstWeekdayDates(monday);
  const friday = dates[4] ?? monday;

  const [allStudents, plansRaw] = await Promise.all([
    prisma.student.findMany({
      where: { active: true },
      select: { studentNo: true, name: true, classroom: true },
      orderBy: [{ classroom: "asc" }, { studentNo: "asc" }],
    }),
    prisma.participationPlan.findMany({
      where: { date: { in: dates.map((d) => parseKstDateString(d)) } },
      include: { student: true, attendance: true },
    }),
  ]);

  const plans: WeekPlan[] = plansRaw.map((p) => ({
    planId: p.id,
    studentNo: p.student.studentNo,
    name: p.student.name,
    classroom: p.student.classroom,
    date: formatKstDate(p.date),
    slot: p.slot,
    state: p.attendance?.state ?? "UNCHECKED",
  }));
  const rows = buildWeekMatrix(monday, plans, allStudents);

  const prevMonday = isoAddDays(monday, -7);
  const nextMonday = isoAddDays(monday, 7);
  const thisMonday = kstWeekMonday(kstTodayString());

  return (
    <div className="space-y-4">
      {/* 상단 탭 */}
      <div className="flex border-b border-slate-200">
        <Link
          href={`/teacher/attendance/week?monday=${monday}` as Route}
          className="border-b-2 border-slate-900 px-4 py-2 text-sm font-bold text-slate-900"
        >
          주간 출결 (엑셀 양식)
        </Link>
        <Link
          href={`/teacher/attendance?date=${dates[0]}&slot=OJA` as Route}
          className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          일일 출결 (상세)
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">주간 출결표 (엑셀 양식)</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {monday} ~ {friday} · 총 {allStudents.length}명 등록
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/teacher/attendance/week?monday=${prevMonday}` as Route}
            className="min-h-[40px] rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
          >
            ← 이전 주
          </Link>
          <Link
            href={`/teacher/attendance/week?monday=${thisMonday}` as Route}
            className="min-h-[40px] rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
          >
            이번 주
          </Link>
          <Link
            href={`/teacher/attendance/week?monday=${nextMonday}` as Route}
            className="min-h-[40px] rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
          >
            다음 주 →
          </Link>
          <a
            href={`/teacher/attendance/week/download/xlsx?monday=${monday}`}
            className="min-h-[40px] rounded bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800"
          >
            엑셀 내려받기
          </a>
        </div>
      </div>

      <WeekMatrix dates={dates} rows={rows} />
    </div>
  );
}

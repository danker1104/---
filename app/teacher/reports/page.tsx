import Link from "next/link";
import type { Route } from "next";
import { kstTodayString } from "@/lib/date";
import { SLOT_ORDER, SLOT_LABEL } from "@/lib/slot";
import { loadReport, type ReportFilter } from "./report-data";
import { ReportChart } from "./ReportChart";
import type { StudySlot } from "@prisma/client";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS = new Set<StudySlot>(["YAJA1", "YAJA2", "SIMJA"]);

function defaultRange(): { from: string; to: string } {
  const today = kstTodayString();
  const parts = today.split("-").map(Number);
  const [y = 1970, m = 1, d = 1] = parts;
  const end = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`;
  return { from, to: today };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; slot?: string }>;
}) {
  const params = await searchParams;
  const range = defaultRange();
  const from = params.from && DATE_RE.test(params.from) ? params.from : range.from;
  const to = params.to && DATE_RE.test(params.to) ? params.to : range.to;
  const slot: ReportFilter["slot"] = SLOTS.has(params.slot as StudySlot)
    ? (params.slot as StudySlot)
    : "ALL";

  const { rows, series, totalPlans } = await loadReport({ from, to, slot });
  const q = `from=${from}&to=${to}&slot=${slot}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">리포트</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/teacher/reports/download/csv?${q}` as Route}
            prefetch={false}
            className="min-h-[40px] flex-1 rounded border border-slate-300 px-3 py-1.5 text-center hover:bg-slate-100 sm:flex-none"
          >
            CSV 다운로드
          </Link>
          <Link
            href={`/teacher/reports/download/xlsx?${q}` as Route}
            prefetch={false}
            className="min-h-[40px] flex-1 rounded bg-slate-900 px-3 py-1.5 text-center text-white sm:flex-none"
          >
            결과 Excel 다운로드
          </Link>
        </div>
      </div>

      <form className="rounded-md border bg-white p-4 shadow-sm" method="get">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            시작일
            <input
              name="from"
              type="date"
              defaultValue={from}
              className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              name="to"
              type="date"
              defaultValue={to}
              className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            슬롯
            <select
              name="slot"
              defaultValue={slot}
              className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
            >
              <option value="ALL">전체</option>
              {SLOT_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full min-h-[40px] rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
            >
              적용
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          대상 기간 총 대상자: {totalPlans}건
        </p>
      </form>

      <ReportChart series={series} />

      <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">학번</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">반</th>
              <th className="px-3 py-2 text-right">대상일수</th>
              <th className="px-3 py-2 text-right">출석</th>
              <th className="px-3 py-2 text-right">지각</th>
              <th className="px-3 py-2 text-right">조퇴</th>
              <th className="px-3 py-2 text-right">결석</th>
              <th className="px-3 py-2 text-right">인정</th>
              <th className="px-3 py-2 text-right">미체크</th>
              <th className="px-3 py-2 text-right">참석률(%)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-4 text-center text-slate-500">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.studentNo} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">{r.studentNo}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-slate-600">{r.classroom}</td>
                <td className="px-3 py-2 text-right">{r.total}</td>
                <td className="px-3 py-2 text-right">{r.present}</td>
                <td className="px-3 py-2 text-right">{r.late}</td>
                <td className="px-3 py-2 text-right">{r.leaveEarly}</td>
                <td className="px-3 py-2 text-right">{r.absent}</td>
                <td className="px-3 py-2 text-right">{r.excused}</td>
                <td className="px-3 py-2 text-right">{r.unchecked}</td>
                <td className="px-3 py-2 text-right font-medium">
                  {r.rate === "-" ? "-" : r.rate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

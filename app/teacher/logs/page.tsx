import Link from "next/link";
import type { Route } from "next";
import { formatKstDate, formatKstTime } from "@/lib/date";
import {
  auditActionLabel,
  auditTargetLabel,
  summarizeAuditMeta,
  AUDIT_ACTION_ORDER,
} from "@/lib/audit-log";
import { loadAuditLogs, loadImportBatches } from "./log-data";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 30;
const ACTIONS = new Set<string>(AUDIT_ACTION_ORDER);

interface SearchParams {
  from?: string;
  to?: string;
  action?: string;
  page?: string;
}

function formatAt(at: Date): string {
  return `${formatKstDate(at)} ${formatKstTime(at)}`;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const from = params.from && DATE_RE.test(params.from) ? params.from : undefined;
  const to = params.to && DATE_RE.test(params.to) ? params.to : undefined;
  const action = params.action && ACTIONS.has(params.action) ? params.action : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [batches, logs] = await Promise.all([
    loadImportBatches(20),
    loadAuditLogs({ from, to, action, page, pageSize: PAGE_SIZE }),
  ]);

  const pageLink = (p: number): Route => {
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (action) sp.set("action", action);
    sp.set("page", String(p));
    return `/teacher/logs?${sp.toString()}` as Route;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">운영 기록</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          명부 업로드 이력과 출결·설정 변경 이력을 확인합니다. 이 화면은 조회 전용입니다.
        </p>
      </div>

      {/* 업로드 이력 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">업로드 이력</h2>
        {batches.length === 0 ? (
          <p className="rounded-md border bg-white p-4 text-sm text-slate-500 shadow-sm">
            업로드 이력이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">업로드 시각</th>
                  <th className="px-3 py-2">파일명</th>
                  <th className="px-3 py-2 text-right">행 수</th>
                  <th className="px-3 py-2 text-right">오류 수</th>
                  <th className="px-3 py-2">작업자</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatAt(b.importedAt)}</td>
                    <td className="px-3 py-2 text-slate-700">{b.fileName}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{b.rowCount}</td>
                    <td className={`px-3 py-2 text-right ${b.errorCount > 0 ? "font-medium text-red-700" : "text-slate-700"}`}>
                      {b.errorCount}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{b.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 활동 로그 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">활동 로그</h2>

        <form className="rounded-md border bg-white p-4 shadow-sm" method="get">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="text-sm">
              시작일
              <input
                name="from"
                type="date"
                defaultValue={from ?? ""}
                className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              종료일
              <input
                name="to"
                type="date"
                defaultValue={to ?? ""}
                className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              액션
              <select
                name="action"
                defaultValue={action ?? ""}
                className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
              >
                <option value="">전체</option>
                {AUDIT_ACTION_ORDER.map((a) => (
                  <option key={a} value={a}>
                    {auditActionLabel(a)}
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
          <p className="mt-2 text-xs text-slate-500">전체 {logs.total}건 · {logs.page}/{logs.totalPages} 페이지</p>
        </form>

        {logs.rows.length === 0 ? (
          <p className="rounded-md border bg-white p-4 text-sm text-slate-500 shadow-sm">
            해당 조건의 활동 로그가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">시각</th>
                  <th className="px-3 py-2">작업자</th>
                  <th className="px-3 py-2">액션</th>
                  <th className="px-3 py-2">대상</th>
                  <th className="px-3 py-2">요약</th>
                </tr>
              </thead>
              <tbody>
                {logs.rows.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatAt(log.at)}</td>
                    <td className="px-3 py-2 text-slate-700">{log.actor}</td>
                    <td className="px-3 py-2 text-slate-800">{auditActionLabel(log.action)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      <span className="text-slate-800">{auditTargetLabel(log.targetType)}</span>
                      <span className="ml-1 block max-w-[10rem] truncate text-xs text-slate-400" title={log.targetId}>
                        {log.targetId}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{summarizeAuditMeta(log.action, log.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {logs.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            {logs.page > 1 ? (
              <Link
                href={pageLink(logs.page - 1)}
                className="min-h-[40px] rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                이전
              </Link>
            ) : (
              <span className="min-h-[40px] rounded border border-slate-200 px-3 py-1.5 text-slate-300">이전</span>
            )}
            <span className="text-slate-500">
              {logs.page} / {logs.totalPages}
            </span>
            {logs.page < logs.totalPages ? (
              <Link
                href={pageLink(logs.page + 1)}
                className="min-h-[40px] rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
              >
                다음
              </Link>
            ) : (
              <span className="min-h-[40px] rounded border border-slate-200 px-3 py-1.5 text-slate-300">다음</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

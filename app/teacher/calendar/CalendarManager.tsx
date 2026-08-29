"use client";

import { useState, useTransition } from "react";
import { addExceptionAction, deleteExceptionAction } from "./actions";
import { CALENDAR_REASON_LABEL } from "@/lib/slot";
import type { CalendarReason } from "@prisma/client";

export interface ExceptionRow {
  id: string;
  date: string;
  reason: CalendarReason;
  memo: string | null;
}

export function CalendarManager({ rows }: { rows: ExceptionRow[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const form = e.currentTarget;
          startTransition(async () => {
            const res = await addExceptionAction(fd);
            setMessage(res.warning ?? res.message ?? null);
            if (res.ok) form.reset();
          });
        }}
        className="rounded-md border bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            날짜
            <input
              name="date"
              type="date"
              required
              className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            사유
            <select
              name="reason"
              defaultValue="HOLIDAY"
              className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
            >
              <option value="HOLIDAY">휴일</option>
              <option value="EXAM">시험</option>
              <option value="OTHER">기타</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            메모(선택)
            <input
              name="memo"
              type="text"
              maxLength={200}
              className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="min-h-[40px] w-full rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 sm:w-auto"
          >
            등록/갱신
          </button>
        </div>
        {message && (
          <p className="mt-2 text-sm text-slate-600">{message}</p>
        )}
      </form>

      {/* 모바일: 카드 리스트 */}
      <ul className="space-y-2 sm:hidden">
        {rows.length === 0 && (
          <li className="rounded-md border bg-white p-3 text-center text-sm text-slate-500 shadow-sm">
            등록된 예외일이 없습니다.
          </li>
        )}
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-md border bg-white p-3 shadow-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">{r.date}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {CALENDAR_REASON_LABEL[r.reason]}
                </span>
              </div>
              {r.memo && (
                <p className="mt-1 text-xs text-slate-600">{r.memo}</p>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res = await deleteExceptionAction(fd);
                  setMessage(res.message ?? null);
                });
              }}
            >
              <input type="hidden" name="id" value={r.id} />
              <button
                type="submit"
                disabled={pending}
                className="min-h-[36px] rounded border border-slate-300 px-3 text-xs text-slate-700 disabled:opacity-50"
              >
                삭제
              </button>
            </form>
          </li>
        ))}
      </ul>

      {/* 데스크톱: 테이블 */}
      <div className="hidden overflow-hidden rounded-md border bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">날짜</th>
              <th className="px-3 py-2">사유</th>
              <th className="px-3 py-2">메모</th>
              <th className="px-3 py-2 text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                  등록된 예외일이 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">{r.date}</td>
                <td className="px-3 py-2">{CALENDAR_REASON_LABEL[r.reason]}</td>
                <td className="px-3 py-2 text-slate-600">{r.memo ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      startTransition(async () => {
                        const res = await deleteExceptionAction(fd);
                        setMessage(res.message ?? null);
                      });
                    }}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                    >
                      삭제
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

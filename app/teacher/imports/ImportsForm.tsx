"use client";

import { useState, useTransition } from "react";
import { uploadExcelAction, type ImportResult } from "./actions";
import { SLOT_LABEL } from "@/lib/slot";

export function ImportsForm() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            try {
              const res = await uploadExcelAction(fd);
              setResult(res);
              if (!res.ok && res.message) setError(res.message);
            } catch (err) {
              setError(err instanceof Error ? err.message : "업로드 실패");
            }
          });
        }}
        className="rounded-md border bg-white p-4 shadow-sm"
      >
        <label className="block text-sm font-medium text-slate-800">
          Excel 파일 (.xlsx)
        </label>
        <p className="mt-1 text-xs text-slate-500">
          필수 열: 학번, 이름, 반, 날짜(YYYY-MM-DD), 구분(야자1/야자2/심자)
        </p>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          className="mt-2 block w-full min-h-[40px] text-sm file:mr-3 file:min-h-[36px] file:rounded file:border-0 file:bg-slate-900 file:px-3 file:text-white"
        />
        <button
          type="submit"
          disabled={isPending}
          className="mt-3 min-h-[40px] w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
        >
          {isPending ? "업로드 중..." : "업로드"}
        </button>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </form>

      {result && result.ok && (
        <div className="rounded-md border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">업로드 결과</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <dt className="text-slate-500">전체 행</dt>
              <dd className="font-medium">{result.totalRows}</dd>
            </div>
            <div>
              <dt className="text-slate-500">유효 행</dt>
              <dd className="font-medium">{result.validRows}</dd>
            </div>
            <div>
              <dt className="text-slate-500">신규 생성</dt>
              <dd className="font-medium text-emerald-700">{result.createdRows}</dd>
            </div>
            <div>
              <dt className="text-slate-500">기존 유지</dt>
              <dd className="font-medium">{result.existingSkipped}</dd>
            </div>
            <div>
              <dt className="text-slate-500">중복 행</dt>
              <dd className="font-medium">{result.duplicateRows}</dd>
            </div>
            <div>
              <dt className="text-slate-500">캘린더 제외</dt>
              <dd className="font-medium">{result.excludedByCalendar}</dd>
            </div>
          </dl>

          {result.perDate.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-slate-600">
                날짜·슬롯별 생성 수
              </h4>
              <ul className="mt-1 text-sm text-slate-700">
                {result.perDate.map((r) => (
                  <li key={`${r.date}-${r.slot}`}>
                    {r.date} · {SLOT_LABEL[r.slot]}: {r.count}명
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-red-600">
                오류/제외 행 ({result.errors.length})
              </h4>
              <ul className="mt-1 max-h-64 space-y-0.5 overflow-auto text-sm text-slate-700">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.row}행: {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

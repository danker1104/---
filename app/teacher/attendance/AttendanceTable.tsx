"use client";

import { useState, useTransition } from "react";
import type { StudySlot, AttState } from "@prisma/client";
import { SLOT_LABEL, STATE_LABEL } from "@/lib/slot";
import { formatKstTime } from "@/lib/date";
import {
  checkInAction,
  checkOutAction,
  markAbsentAction,
  markExcusedAction,
  resetAction,
  updateAbsenceNoteAction,
} from "./actions";

export interface AttendanceRow {
  planId: string;
  studentNo: string;
  name: string;
  classroom: string;
  state: AttState;
  checkInAt: string | null;
  checkOutAt: string | null;
  absenceNote: string | null;
}

interface Props {
  date: string;
  slot: StudySlot;
  rows: AttendanceRow[];
}

const STATE_STYLE: Record<AttState, string> = {
  UNCHECKED: "bg-slate-100 text-slate-600",
  PRESENT: "bg-emerald-100 text-emerald-800",
  LATE: "bg-amber-100 text-amber-800",
  LEAVE_EARLY: "bg-orange-100 text-orange-800",
  ABSENT: "bg-red-100 text-red-800",
  EXCUSED: "bg-sky-100 text-sky-800",
};

interface ActionButtonsProps {
  row: AttendanceRow;
  date: string;
  slot: StudySlot;
  pending: boolean;
  onOpenAbsence: (row: AttendanceRow) => void;
  startTransition: (cb: () => Promise<void> | void) => void;
}

function ActionButtons({
  row,
  date,
  slot,
  pending,
  onOpenAbsence,
  startTransition,
}: ActionButtonsProps) {
  const base =
    "min-h-[36px] rounded px-2.5 text-xs font-medium text-white disabled:opacity-50";
  const canCheckOut =
    row.state === "PRESENT" || row.state === "LATE" || row.state === "LEAVE_EARLY";
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            checkInAction({ planId: row.planId, date, slot }),
          )
        }
        className={`${base} bg-emerald-600`}
      >
        입실
      </button>
      <button
        type="button"
        disabled={pending || !canCheckOut}
        title={canCheckOut ? undefined : "입실 후에만 퇴실을 기록할 수 있습니다."}
        onClick={() =>
          startTransition(async () => {
            await checkOutAction({ planId: row.planId, date, slot });
          })
        }
        className={`${base} bg-orange-600`}
      >
        퇴실
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => onOpenAbsence(row)}
        className={`${base} bg-red-600`}
      >
        불참
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => markExcusedAction({ planId: row.planId }))
        }
        className={`${base} bg-sky-600`}
      >
        인정
      </button>
      <button
        type="button"
        disabled={pending || row.state === "UNCHECKED"}
        onClick={() =>
          startTransition(() => resetAction({ planId: row.planId }))
        }
        className="min-h-[36px] rounded border border-slate-300 px-2.5 text-xs font-medium text-slate-700 disabled:opacity-50"
      >
        초기화
      </button>
    </div>
  );
}

export function AttendanceTable({ date, slot, rows }: Props) {
  const [pending, startTransition] = useTransition();
  const [absenceFor, setAbsenceFor] = useState<AttendanceRow | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-white p-4 text-sm text-slate-600 shadow-sm">
        해당 날짜·슬롯({SLOT_LABEL[slot]})의 대상자가 없습니다. 명부 업로드 화면에서 Excel을 업로드하세요.
      </div>
    );
  }

  const openAbsence = (row: AttendanceRow) => {
    setAbsenceFor(row);
    setNoteDraft(row.absenceNote ?? "");
  };

  return (
    <div className="space-y-3">
      {/* 모바일: 카드 리스트 */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li
            key={row.planId}
            className="rounded-md border bg-white p-3 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {row.name}
                  </span>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[row.state]}`}
                  >
                    {STATE_LABEL[row.state]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono">{row.studentNo}</span>
                  <span className="mx-1">·</span>
                  <span>{row.classroom}</span>
                </div>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>
                  입실 {row.checkInAt ? formatKstTime(new Date(row.checkInAt)) : "-"}
                </div>
                <div>
                  퇴실 {row.checkOutAt ? formatKstTime(new Date(row.checkOutAt)) : "-"}
                </div>
              </div>
            </div>
            {row.absenceNote && (
              <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                사유: {row.absenceNote}
              </p>
            )}
            <div className="mt-3">
              <ActionButtons
                row={row}
                date={date}
                slot={slot}
                pending={pending}
                onOpenAbsence={openAbsence}
                startTransition={startTransition}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* 데스크톱: 테이블 (기존 디자인 유지) */}
      <div className="hidden overflow-x-auto rounded-md border bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">학번</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">반</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">입실</th>
              <th className="px-3 py-2">퇴실</th>
              <th className="px-3 py-2">사유</th>
              <th className="px-3 py-2 text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.planId} className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs text-slate-700">
                  {row.studentNo}
                </td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-slate-600">{row.classroom}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATE_STYLE[row.state]}`}
                  >
                    {STATE_LABEL[row.state]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {row.checkInAt ? formatKstTime(new Date(row.checkInAt)) : "-"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {row.checkOutAt ? formatKstTime(new Date(row.checkOutAt)) : "-"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {row.absenceNote ?? "-"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <ActionButtons
                      row={row}
                      date={date}
                      slot={slot}
                      pending={pending}
                      onOpenAbsence={openAbsence}
                      startTransition={startTransition}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {absenceFor && (
        <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-md border bg-white p-4 shadow-lg">
          <h3 className="text-sm font-semibold">
            불참 사유 입력 — {absenceFor.name} ({absenceFor.studentNo})
          </h3>
          <p className="mt-1 text-xs text-red-600">
            질병명·건강정보·가정사 등 민감한 상세 개인정보는 입력하지 마세요.
          </p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value.slice(0, 200))}
            rows={3}
            maxLength={200}
            className="mt-2 w-full rounded border border-slate-300 p-2 text-sm"
            placeholder="사유 (최대 200자)"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{noteDraft.length}/200</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAbsenceFor(null);
                  setNoteDraft("");
                }}
                className="min-h-[36px] rounded border border-slate-300 px-3 text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const planId = absenceFor.planId;
                  const note = noteDraft;
                  startTransition(async () => {
                    await markAbsentAction({ planId, note });
                    setAbsenceFor(null);
                    setNoteDraft("");
                  });
                }}
                className="min-h-[36px] rounded bg-red-600 px-3 text-white disabled:opacity-50"
              >
                불참 저장
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const planId = absenceFor.planId;
                  const note = noteDraft;
                  startTransition(async () => {
                    await updateAbsenceNoteAction({ planId, note });
                    setAbsenceFor(null);
                    setNoteDraft("");
                  });
                }}
                className="min-h-[36px] rounded border border-slate-300 px-3 text-slate-700 disabled:opacity-50"
              >
                사유만 갱신
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { AttState } from "@prisma/client";
import { SLOT_LABEL, SLOT_ORDER, STATE_LABEL } from "@/lib/slot";
import {
  WEEKDAY_LABELS,
  attendanceMark,
  type WeekRow,
} from "@/lib/weekly-attendance";
import { cycleCellAction } from "./actions";
import { StudentDetailDialog } from "./StudentDetailDialog";

const CELL_STYLE: Record<AttState, string> = {
  UNCHECKED: "bg-white text-slate-300 hover:bg-slate-100",
  PRESENT: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  LATE: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  LEAVE_EARLY: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  ABSENT: "bg-red-100 text-red-800 hover:bg-red-200",
  EXCUSED: "bg-sky-100 text-sky-800 hover:bg-sky-200",
};

const LEGEND: Array<{ mark: string; label: string }> = [
  { mark: "○", label: "미체크(참여 예정)" },
  { mark: "출", label: "출석" },
  { mark: "지", label: "지각" },
  { mark: "조", label: "조퇴" },
  { mark: "결", label: "결석" },
  { mark: "인", label: "인정결석" },
];

interface Props {
  dates: string[];
  rows: WeekRow[];
}

export function WeekMatrix({ dates, rows }: Props) {
  const [pending, startTransition] = useTransition();
  const [openStudent, setOpenStudent] = useState<{
    studentNo: string;
    name: string;
    classroom: string;
  } | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-white p-4 text-sm text-slate-600 shadow-sm">
        이 주(월~금)에 참여 계획이 없습니다. 명부 업로드 화면에서 설문 Excel을 업로드하세요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border bg-white shadow-sm">
        <table className="min-w-max text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="border-b px-3 py-2 text-left" rowSpan={2}>
                학번
              </th>
              <th className="border-b px-3 py-2 text-left" rowSpan={2}>
                이름
              </th>
              <th className="border-b px-3 py-2 text-left" rowSpan={2}>
                반
              </th>
              {SLOT_ORDER.map((slot) => (
                <th
                  key={slot}
                  className="border-b border-l px-2 py-1 text-center"
                  colSpan={WEEKDAY_LABELS.length}
                >
                  {SLOT_LABEL[slot]}
                </th>
              ))}
            </tr>
            <tr>
              {SLOT_ORDER.flatMap((slot) =>
                WEEKDAY_LABELS.map((wd, i) => (
                  <th
                    key={`${slot}-${i}`}
                    className={`border-b px-1 py-1 text-center font-normal ${i === 0 ? "border-l" : ""}`}
                    title={dates[i] ?? ""}
                  >
                    {wd}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentNo} className="border-b last:border-b-0">
                <td className="px-3 py-1 font-mono text-xs text-slate-700">
                  {row.studentNo}
                </td>
                <td className="whitespace-nowrap px-3 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenStudent({
                        studentNo: row.studentNo,
                        name: row.name,
                        classroom: row.classroom,
                      })
                    }
                    title={`${row.name} 상세 정보`}
                    className="rounded px-1 py-0.5 text-left font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:bg-slate-100 hover:decoration-slate-500"
                  >
                    {row.name}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-1 text-slate-600">
                  {row.classroom}
                </td>
                {SLOT_ORDER.flatMap((slot) =>
                  WEEKDAY_LABELS.map((wd, i) => {
                    const cell = row.cells[slot][i] ?? null;
                    const leftBorder = i === 0 ? "border-l" : "";
                    const date = dates[i];
                    if (!cell) {
                      return (
                        <td
                          key={`${slot}-${i}`}
                          className={`p-0 text-center ${leftBorder}`}
                        >
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await cycleCellAction({
                                  studentNo: row.studentNo,
                                  date,
                                  slot,
                                });
                              })
                            }
                            title={`${row.name} · ${SLOT_LABEL[slot]} ${wd} (미신청 — 클릭 시 출석 등록)`}
                            className="min-h-[36px] w-9 text-xs text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                          >
                            +
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={`${slot}-${i}`} className={`p-0 text-center ${leftBorder}`}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await cycleCellAction({ planId: cell.planId });
                            })
                          }
                          title={`${row.name} · ${SLOT_LABEL[slot]} ${wd} — ${STATE_LABEL[cell.state]} (클릭: 출석→결석→인정→미체크)`}
                          className={`min-h-[36px] w-9 text-xs font-semibold disabled:opacity-50 ${CELL_STYLE[cell.state]}`}
                        >
                          {attendanceMark(cell.state)}
                        </button>
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {LEGEND.map((l) => (
          <span key={l.mark} className="inline-flex items-center gap-1">
            <span className="inline-block min-w-[1.25rem] rounded bg-slate-100 text-center font-semibold">
              {l.mark}
            </span>
            {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-slate-400">
          <span className="inline-block min-w-[1.25rem] rounded bg-slate-100 text-center font-semibold">+</span>
          미신청 (클릭 시 출석 등록)
        </span>
      </div>
      <p className="text-xs text-slate-500">
        셀을 누르면 출석(출)→결석(결)→인정(인)→미체크(○) 순으로 변경됩니다. 미신청(+) 칸을 누르면 즉시 현장 출석으로 등록됩니다.
      </p>

      {openStudent && (
        <StudentDetailDialog
          studentNo={openStudent.studentNo}
          name={openStudent.name}
          classroom={openStudent.classroom}
          onClose={() => setOpenStudent(null)}
        />
      )}
    </div>
  );
}

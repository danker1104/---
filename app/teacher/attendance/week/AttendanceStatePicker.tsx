"use client";

import { useState } from "react";
import type { AttState } from "@prisma/client";
import { STATE_LABEL } from "@/lib/slot";
import { attendanceMark } from "@/lib/weekly-attendance";

const STATE_OPTIONS: AttState[] = [
  "UNCHECKED",
  "PRESENT",
  "LATE",
  "LEAVE_EARLY",
  "ABSENT",
  "EXCUSED",
];

const OPTION_STYLE: Record<AttState, string> = {
  UNCHECKED: "border-slate-300 bg-white text-slate-700",
  PRESENT: "border-emerald-300 bg-emerald-50 text-emerald-800",
  LATE: "border-amber-300 bg-amber-50 text-amber-800",
  LEAVE_EARLY: "border-orange-300 bg-orange-50 text-orange-800",
  ABSENT: "border-red-300 bg-red-50 text-red-800",
  EXCUSED: "border-sky-300 bg-sky-50 text-sky-800",
};

interface AttendanceStatePickerProps {
  currentState: AttState | null;
  accessibleLabel: string;
  onSelect: (state: AttState) => void;
  disabled?: boolean;
  buttonClassName?: string;
}

export function AttendanceStatePicker({
  currentState,
  accessibleLabel,
  onSelect,
  disabled = false,
  buttonClassName = "",
}: AttendanceStatePickerProps) {
  const [open, setOpen] = useState(false);
  const currentLabel = currentState ? STATE_LABEL[currentState] : "미신청";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${accessibleLabel}: ${currentLabel}`}
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        {currentState ? attendanceMark(currentState) : "+"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-3 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="menu"
            aria-label="출결 상태 선택"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className="w-full max-w-sm rounded-md border bg-white p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">출결 상태 선택</h3>
                <p className="mt-0.5 text-xs text-slate-500">{accessibleLabel}</p>
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="min-h-10 min-w-10 rounded border border-slate-300 text-slate-600"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STATE_OPTIONS.map((state) => (
                <button
                  key={state}
                  type="button"
                  role="menuitem"
                  aria-label={STATE_LABEL[state]}
                  aria-current={currentState === state ? "true" : undefined}
                  onClick={() => {
                    onSelect(state);
                    setOpen(false);
                  }}
                  className={`flex min-h-12 items-center justify-center rounded border px-3 text-sm font-semibold ${OPTION_STYLE[state]} ${
                    currentState === state ? "ring-2 ring-slate-900 ring-offset-1" : ""
                  }`}
                >
                  <span>{STATE_LABEL[state]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

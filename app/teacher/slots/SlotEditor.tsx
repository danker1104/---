"use client";

import { useState, useTransition } from "react";
import type { StudySlot } from "@prisma/client";
import { SLOT_LABEL } from "@/lib/slot";
import { updateSlotAction } from "./actions";

interface SlotRow {
  slot: StudySlot;
  startTime: string;
  endTime: string;
  lateThresholdMinutes: number | null;
  active: boolean;
}

export function SlotEditor({ slots }: { slots: SlotRow[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {message && (
        <p className="rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      )}
      {slots.map((s) => (
        <form
          key={s.slot}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await updateSlotAction(fd);
              setMessage(res.message ?? null);
            });
          }}
          className="rounded-md border bg-white p-4 shadow-sm"
        >
          <input type="hidden" name="slot" value={s.slot} />
          <h3 className="text-sm font-semibold">{SLOT_LABEL[s.slot]}</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="text-sm">
              시작
              <input
                name="startTime"
                type="time"
                defaultValue={s.startTime}
                required
                className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              종료
              <input
                name="endTime"
                type="time"
                defaultValue={s.endTime}
                required
                className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              지각 기준(분)
              <input
                name="lateThresholdMinutes"
                type="number"
                min={0}
                step={1}
                defaultValue={s.lateThresholdMinutes ?? ""}
                placeholder="비우면 지각 판정 비활성"
                className="mt-1 block w-full min-h-[40px] rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="flex items-end gap-2 text-sm">
              <input
                name="active"
                type="checkbox"
                defaultChecked={s.active}
                className="h-5 w-5"
              />
              활성
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="min-h-[40px] w-full rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 sm:w-auto"
            >
              저장
            </button>
          </div>
        </form>
      ))}
    </div>
  );
}

"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { useMemo } from "react";
import { SLOT_LABEL } from "@/lib/slot";
import type { SlotSeriesPoint } from "./report-data";
import type { StudySlot } from "@prisma/client";

const SLOTS: StudySlot[] = ["OJA", "YAJA", "SIMJA"];
const COLORS: Record<StudySlot, string> = {
  OJA: "#0f766e",
  YAJA: "#b45309",
  SIMJA: "#1d4ed8",
};

export function ReportChart({ series }: { series: SlotSeriesPoint[] }) {
  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string | null>>();
    for (const p of series) {
      const entry = byDate.get(p.date) ?? { date: p.date };
      entry[p.slot] = p.rate;
      byDate.set(p.date, entry);
    }
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [series]);

  if (data.length === 0) {
    return (
      <div className="rounded-md border bg-white p-4 text-sm text-slate-500 shadow-sm">
        데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold">슬롯별 참여율 시계열 (%)</h3>
      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis domain={[0, 100]} fontSize={12} />
            <Tooltip />
            <Legend />
            {SLOTS.map((s) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                name={SLOT_LABEL[s]}
                stroke={COLORS[s]}
                connectNulls
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

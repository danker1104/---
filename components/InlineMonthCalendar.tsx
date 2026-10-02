"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KoreanHoliday } from "@/lib/korean-holidays";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const LONG_PRESS_MS = 350;

function parseDateParts(value: string) {
  const [year = new Date().getFullYear(), month = 1] = value.split("-").map(Number);
  return { year, month };
}

function formatDate(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateRange(start: string, end: string): string[] {
  const [first, last] = start <= end ? [start, end] : [end, start];
  const cursor = new Date(`${first}T00:00:00Z`);
  const finish = new Date(`${last}T00:00:00Z`);
  const result: string[] = [];
  while (cursor <= finish) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

interface InlineMonthCalendarProps {
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  holidays?: KoreanHoliday[];
  initialMonth?: string;
  onVisibleYearChange?: (year: number) => void;
}

export function InlineMonthCalendar({
  selectedDates,
  onSelectionChange,
  holidays = [],
  initialMonth,
  onVisibleYearChange,
}: InlineMonthCalendarProps) {
  const seed = selectedDates[0] || initialMonth || new Date().toISOString().slice(0, 10);
  const initial = parseDateParts(seed);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initial.year, initial.month - 1, 1),
  );
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const dragStartRef = useRef<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const year = visibleMonth.getFullYear();
  const monthIndex = visibleMonth.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlankCount = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells = useMemo(
    () => [
      ...Array.from({ length: leadingBlankCount }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ],
    [daysInMonth, leadingBlankCount],
  );
  const holidayByDate = useMemo(
    () => new Map(holidays.map((holiday) => [holiday.date, holiday.name])),
    [holidays],
  );
  const activeDates = dragStart && dragEnd
    ? new Set(dateRange(dragStart, dragEnd))
    : new Set(selectedDates);

  useEffect(() => {
    onVisibleYearChange?.(year);
  }, [onVisibleYearChange, year]);

  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  const moveMonth = (offset: number) => {
    setVisibleMonth(new Date(year, monthIndex + offset, 1));
  };

  const beginPress = (date: string) => {
    suppressClick.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      dragStartRef.current = date;
      setDragStart(date);
      setDragEnd(date);
    }, LONG_PRESS_MS);
  };

  const finishPress = (date: string) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    if (dragStartRef.current) {
      onSelectionChange(dateRange(dragStartRef.current, date));
      dragStartRef.current = null;
      setDragStart(null);
      setDragEnd(null);
    }
  };

  return (
    <div className="w-full max-w-sm select-none rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)} className="flex min-h-10 min-w-10 items-center justify-center rounded border border-slate-300 bg-white text-lg text-slate-700 hover:bg-slate-100">‹</button>
        <strong className="text-sm text-slate-900">{year}년 {monthIndex + 1}월</strong>
        <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)} className="flex min-h-10 min-w-10 items-center justify-center rounded border border-slate-300 bg-white text-lg text-slate-700 hover:bg-slate-100">›</button>
      </div>

      <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-slate-500">
        {WEEKDAYS.map((weekday, index) => (
          <span key={weekday} className={`py-1 ${index === 6 ? "text-red-600" : index === 5 ? "text-blue-600" : ""}`}>{weekday}</span>
        ))}
      </div>
      <div
        role="grid"
        aria-label="날짜 선택 달력"
        className="grid touch-none grid-cols-7 gap-0.5"
        onPointerMove={(event) => {
          if (!dragStartRef.current) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-date]");
          if (target?.dataset.date) setDragEnd(target.dataset.date);
        }}
      >
        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} aria-hidden="true" />;
          const date = formatDate(year, monthIndex, day);
          const holidayName = holidayByDate.get(date);
          const selected = activeDates.has(date);
          const dayOfWeek = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
          const redDay = Boolean(holidayName) || dayOfWeek === 0;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              data-date={date}
              aria-label={`${year}년 ${monthIndex + 1}월 ${day}일 선택${holidayName ? `, 공휴일 ${holidayName}` : ""}`}
              aria-selected={selected}
              title={holidayName}
              onPointerDown={() => beginPress(date)}
              onPointerEnter={() => {
                if (dragStartRef.current) setDragEnd(date);
              }}
              onPointerUp={() => finishPress(date)}
              onPointerCancel={() => finishPress(dragEnd ?? date)}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onSelectionChange([date]);
              }}
              className={`flex min-h-12 flex-col items-center justify-center rounded px-0.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 ${
                selected
                  ? "bg-emerald-700 text-white"
                  : redDay
                    ? "bg-red-50 text-red-700 hover:bg-red-100"
                    : dayOfWeek === 6
                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              <span>{day}</span>
              {holidayName && <span className="mt-0.5 max-w-full truncate text-[9px] leading-none">{holidayName}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-5 text-center text-xs text-slate-600" aria-live="polite">
        {selectedDates.length > 1
          ? `${selectedDates[0]} ~ ${selectedDates.at(-1)} · ${selectedDates.length}일 선택`
          : selectedDates.length === 1
            ? `선택한 날짜: ${selectedDates[0]}`
            : "날짜를 선택하거나 길게 눌러 범위를 지정하세요."}
      </p>
    </div>
  );
}

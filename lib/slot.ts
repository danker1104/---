import type { StudySlot, AttState, CalendarReason } from "@prisma/client";

export const SLOT_LABEL: Record<StudySlot, string> = {
  YAJA1: "야자1",
  YAJA2: "야자2",
  SIMJA: "심자",
};

export const SLOT_ORDER: readonly StudySlot[] = ["YAJA1", "YAJA2", "SIMJA"];

export const STATE_LABEL: Record<AttState, string> = {
  UNCHECKED: "미체크",
  PRESENT: "출석",
  LATE: "지각",
  LEAVE_EARLY: "조퇴",
  ABSENT: "결석",
  EXCUSED: "인정결석",
};

export const CALENDAR_REASON_LABEL: Record<CalendarReason, string> = {
  HOLIDAY: "휴일",
  EXAM: "시험",
  OTHER: "기타",
};

const KOR_TO_SLOT: Record<string, StudySlot> = {
  "야자1": "YAJA1",
  "야자2": "YAJA2",
  "심자": "SIMJA",
};

export function parseSlotLabel(value: string): StudySlot | null {
  const key = value.trim();
  return KOR_TO_SLOT[key] ?? null;
}

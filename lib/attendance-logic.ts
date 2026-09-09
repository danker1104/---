import { kstDateFromParts } from "./date";

export type StudySlot = "OJA" | "YAJA" | "SIMJA";

export interface SlotWindow {
  slot: StudySlot;
  /** KST 기준 YYYY-MM-DD */
  date: string;
  /** KST 기준 HH:mm */
  startTime: string;
  endTime: string;
  /** null 또는 undefined 이면 지각 판정 비활성 (AC-6.4) */
  lateThresholdMinutes: number | null | undefined;
}

/** AC-6.3, AC-6.4, T-5.1, T-5.2 */
export function classifyCheckIn(
  slot: SlotWindow,
  checkInAt: Date,
): "PRESENT" | "LATE" {
  const threshold = slot.lateThresholdMinutes;
  if (threshold === null || threshold === undefined) {
    return "PRESENT";
  }
  const start = kstDateFromParts(slot.date, slot.startTime);
  const boundaryMs = start.getTime() + threshold * 60_000;
  return checkInAt.getTime() > boundaryMs ? "LATE" : "PRESENT";
}

/** AC-6.5, T-5.3 — 슬롯 종료 이전 퇴실이면 LEAVE_EARLY, 아니면 null. */
export function classifyCheckOut(
  slot: SlotWindow,
  checkOutAt: Date,
): "LEAVE_EARLY" | null {
  const end = kstDateFromParts(slot.date, slot.endTime);
  return checkOutAt.getTime() < end.getTime() ? "LEAVE_EARLY" : null;
}

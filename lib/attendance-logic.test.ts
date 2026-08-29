import { describe, expect, it } from "vitest";
import {
  classifyCheckIn,
  classifyCheckOut,
  type SlotWindow,
} from "./attendance-logic";
import { kstDateFromParts } from "./date";

// AC-6.3 / AC-6.4 / AC-6.5 / T-5.1 / T-5.2 / T-5.3 — 지각·조퇴 자동 판정

const YAJA1: SlotWindow = {
  slot: "YAJA1",
  date: "2026-08-28",
  startTime: "20:00",
  endTime: "22:00",
  lateThresholdMinutes: 10,
};

const YAJA1_NO_THRESHOLD: SlotWindow = {
  ...YAJA1,
  lateThresholdMinutes: null,
};

describe("classifyCheckIn (AC-6.3, AC-6.4, T-5.1, T-5.2)", () => {
  it("T-5.1: 슬롯 시작 5분 전 입실 → PRESENT", () => {
    const at = kstDateFromParts("2026-08-28", "19:55");
    expect(classifyCheckIn(YAJA1, at)).toBe("PRESENT");
  });

  it("정시 입실 → PRESENT (경계값)", () => {
    const at = kstDateFromParts("2026-08-28", "20:00");
    expect(classifyCheckIn(YAJA1, at)).toBe("PRESENT");
  });

  it("start + late = 정확히 임계값 → PRESENT (경계값 포함)", () => {
    const at = kstDateFromParts("2026-08-28", "20:10");
    expect(classifyCheckIn(YAJA1, at)).toBe("PRESENT");
  });

  it("T-5.2: start + late + 1분 → LATE", () => {
    const at = kstDateFromParts("2026-08-28", "20:11");
    expect(classifyCheckIn(YAJA1, at)).toBe("LATE");
  });

  it("AC-6.4: lateThresholdMinutes 미설정 시 항상 PRESENT", () => {
    const at = kstDateFromParts("2026-08-28", "20:59");
    expect(classifyCheckIn(YAJA1_NO_THRESHOLD, at)).toBe("PRESENT");
  });
});

describe("classifyCheckOut (AC-6.5, T-5.3)", () => {
  it("T-5.3: 슬롯 종료 10분 전 퇴실 → LEAVE_EARLY", () => {
    const at = kstDateFromParts("2026-08-28", "21:50");
    expect(classifyCheckOut(YAJA1, at)).toBe("LEAVE_EARLY");
  });

  it("정시 퇴실 (== slot.end) → null (조퇴 아님)", () => {
    const at = kstDateFromParts("2026-08-28", "22:00");
    expect(classifyCheckOut(YAJA1, at)).toBeNull();
  });

  it("슬롯 종료 이후 퇴실 → null (조퇴 아님)", () => {
    const at = kstDateFromParts("2026-08-28", "22:05");
    expect(classifyCheckOut(YAJA1, at)).toBeNull();
  });
});

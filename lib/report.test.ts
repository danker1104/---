import { describe, expect, it } from "vitest";
import { computeAttendanceRate, summarizeStudent } from "./report";
import type { AttStateValue } from "./report";

// AC-7.3 / T-6.1 — 참석률 계산 규칙
// rate = (PRESENT + LATE + LEAVE_EARLY) / 처리 완료 대상 수 × 100
// EXCUSED는 분모 제외, UNCHECKED는 처리 완료 대상에서 제외
// 처리 완료 대상 수 0 이면 "-"

describe("computeAttendanceRate (AC-7.3, T-6.1)", () => {
  it("모두 PRESENT 이면 100.0", () => {
    const states: AttStateValue[] = ["PRESENT", "PRESENT", "PRESENT"];
    expect(computeAttendanceRate(states)).toBe(100);
  });

  it("PRESENT + LATE + LEAVE_EARLY 는 모두 참석으로 집계", () => {
    const states: AttStateValue[] = ["PRESENT", "LATE", "LEAVE_EARLY"];
    expect(computeAttendanceRate(states)).toBe(100);
  });

  it("ABSENT 는 참석률을 낮춘다", () => {
    const states: AttStateValue[] = ["PRESENT", "PRESENT", "ABSENT", "ABSENT"];
    expect(computeAttendanceRate(states)).toBe(50);
  });

  it("EXCUSED 는 분모에서 제외한다", () => {
    const states: AttStateValue[] = ["PRESENT", "PRESENT", "EXCUSED"];
    expect(computeAttendanceRate(states)).toBe(100);
  });

  it("UNCHECKED 는 처리 완료 대상에서 제외한다", () => {
    const states: AttStateValue[] = ["PRESENT", "UNCHECKED", "UNCHECKED"];
    expect(computeAttendanceRate(states)).toBe(100);
  });

  it("처리 완료 대상 수가 0 이면 '-' 를 돌려준다 (모두 UNCHECKED)", () => {
    const states: AttStateValue[] = ["UNCHECKED", "UNCHECKED"];
    expect(computeAttendanceRate(states)).toBe("-");
  });

  it("처리 완료 대상 수가 0 이면 '-' 를 돌려준다 (모두 EXCUSED)", () => {
    const states: AttStateValue[] = ["EXCUSED", "EXCUSED"];
    expect(computeAttendanceRate(states)).toBe("-");
  });

  it("소수점은 첫째 자리까지 반올림한다", () => {
    // 2/3 → 66.666… → 66.7
    const states: AttStateValue[] = ["PRESENT", "PRESENT", "ABSENT"];
    expect(computeAttendanceRate(states)).toBe(66.7);
  });
});

describe("summarizeStudent (AC-7.2)", () => {
  it("대상 일수·상태별 카운트·참석률을 함께 계산한다", () => {
    const states: AttStateValue[] = [
      "PRESENT",
      "LATE",
      "LEAVE_EARLY",
      "ABSENT",
      "EXCUSED",
      "UNCHECKED",
    ];
    const s = summarizeStudent(states);
    expect(s.total).toBe(6);
    expect(s.present).toBe(1);
    expect(s.late).toBe(1);
    expect(s.leaveEarly).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.excused).toBe(1);
    expect(s.unchecked).toBe(1);
    // 처리 완료 대상 = 4 (excused, unchecked 제외), 참석 = 3
    expect(s.rate).toBe(75);
  });

  it("처리 완료 대상 0 이면 rate 는 '-' 이고 나머지는 0/실제 카운트로 표시된다", () => {
    const s = summarizeStudent(["UNCHECKED", "UNCHECKED", "EXCUSED"]);
    expect(s.total).toBe(3);
    expect(s.unchecked).toBe(2);
    expect(s.excused).toBe(1);
    expect(s.rate).toBe("-");
  });
});

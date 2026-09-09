import { describe, expect, it } from "vitest";
import {
  formatKstDate,
  formatKstTime,
  isoAddDays,
  kstDateFromParts,
  kstTodayString,
  kstWeekMonday,
  kstWeekdayDates,
  parseKstDateString,
} from "./date";

// AC-6.1 / NF-6 / TRD §11.1 — KST 기준 날짜·시각 처리

describe("date utils — KST (NF-6, AC-6.1)", () => {
  it("kstTodayString: UTC 자정 직전이어도 KST 기준으로 다음 날짜를 돌려준다", () => {
    // 2026-08-27T15:30:00Z == 2026-08-28 00:30 KST
    const now = new Date("2026-08-27T15:30:00Z");
    expect(kstTodayString(now)).toBe("2026-08-28");
  });

  it("kstTodayString: KST 기준 정오는 같은 날짜를 돌려준다", () => {
    const now = new Date("2026-08-28T03:00:00Z"); // 12:00 KST
    expect(kstTodayString(now)).toBe("2026-08-28");
  });

  it("parseKstDateString: YYYY-MM-DD 를 KST 자정 UTC Date 로 변환한다", () => {
    const d = parseKstDateString("2026-08-28");
    // 2026-08-28 00:00 KST = 2026-08-27 15:00 UTC
    expect(d.toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  it("parseKstDateString: 잘못된 형식은 예외를 던진다", () => {
    expect(() => parseKstDateString("2026/08/28")).toThrow();
    expect(() => parseKstDateString("2026-13-01")).toThrow();
    expect(() => parseKstDateString("")).toThrow();
  });

  it("formatKstDate: UTC Date 를 KST 기준 YYYY-MM-DD 로 포맷한다", () => {
    const d = new Date("2026-08-27T15:30:00Z");
    expect(formatKstDate(d)).toBe("2026-08-28");
  });

  it("formatKstTime: UTC Date 를 KST 기준 HH:mm 으로 포맷한다", () => {
    const d = new Date("2026-08-27T15:30:00Z");
    expect(formatKstTime(d)).toBe("00:30");
  });

  it("kstDateFromParts: 날짜와 HH:mm 문자열을 결합해 UTC Date 를 반환한다", () => {
    const d = kstDateFromParts("2026-08-28", "20:05");
    // 2026-08-28 20:05 KST = 2026-08-28 11:05 UTC
    expect(d.toISOString()).toBe("2026-08-28T11:05:00.000Z");
  });

  it("kstDateFromParts: 잘못된 시간 형식은 예외를 던진다", () => {
    expect(() => kstDateFromParts("2026-08-28", "25:00")).toThrow();
    expect(() => kstDateFromParts("2026-08-28", "20:60")).toThrow();
    expect(() => kstDateFromParts("2026-08-28", "20-05")).toThrow();
  });
});

describe("주간 날짜 유틸 — 월요일 계산", () => {
  it("isoAddDays: 월 경계를 넘겨 날짜를 더한다", () => {
    expect(isoAddDays("2026-08-31", 4)).toBe("2026-09-04");
    expect(isoAddDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("kstWeekMonday: 주중 어느 날이든 그 주 월요일을 돌려준다", () => {
    // 2026-09-02(수) → 2026-08-31(월)
    expect(kstWeekMonday("2026-09-02")).toBe("2026-08-31");
    // 월요일은 자기 자신
    expect(kstWeekMonday("2026-08-31")).toBe("2026-08-31");
    // 일요일은 그 주(직전) 월요일
    expect(kstWeekMonday("2026-09-06")).toBe("2026-08-31");
    // 다음 월요일
    expect(kstWeekMonday("2026-09-07")).toBe("2026-09-07");
  });

  it("kstWeekdayDates: 월요일 기준 월~금 5일을 돌려준다", () => {
    expect(kstWeekdayDates("2026-08-31")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { getBundledKoreanHolidays } from "./korean-holidays";

describe("대한민국 공식 공휴일", () => {
  it("2026년 설날·선거일·노동절·제헌절·추석 연휴를 포함한다", () => {
    const holidays = getBundledKoreanHolidays(2026);
    const dates = new Set(holidays.map((holiday) => holiday.date));

    expect([...dates]).toEqual(expect.arrayContaining([
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-05-01",
      "2026-06-03",
      "2026-07-17",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]));
  });
});

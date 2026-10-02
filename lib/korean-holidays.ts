import { getHolidays, hasYear } from "@hangukit/holidays-core";
import { holidays as fetchHolidays } from "@kyungseopk1m/holidays-kr";

export interface KoreanHoliday {
  date: string;
  name: string;
}

function ymdFromNumber(value: number): string {
  const text = String(value);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function mergeHolidayNames(holidays: KoreanHoliday[]): KoreanHoliday[] {
  const byDate = new Map<string, Set<string>>();
  for (const holiday of holidays) {
    const names = byDate.get(holiday.date) ?? new Set<string>();
    names.add(holiday.name);
    byDate.set(holiday.date, names);
  }
  return [...byDate.entries()]
    .map(([date, names]) => ({ date, name: [...names].join(" · ") }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getBundledKoreanHolidays(year: number): KoreanHoliday[] {
  if (!hasYear(year)) return [];
  return mergeHolidayNames(
    getHolidays(year).map((holiday) => ({ date: holiday.date, name: holiday.name })),
  );
}

export async function getKoreanHolidays(year: number): Promise<KoreanHoliday[]> {
  const bundled = getBundledKoreanHolidays(year);
  if (bundled.length > 0) return bundled;

  try {
    const result = await fetchHolidays(String(year), undefined, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!result.success) return [];
    return mergeHolidayNames(
      result.data.map((holiday) => ({
        date: ymdFromNumber(holiday.date),
        name: holiday.name,
      })),
    );
  } catch {
    return [];
  }
}

export async function getKoreanHolidaysForDates(dates: string[]): Promise<KoreanHoliday[]> {
  const years = [...new Set(dates.map((date) => Number(date.slice(0, 4))))]
    .filter(Number.isInteger);
  const results = await Promise.all(years.map(getKoreanHolidays));
  return mergeHolidayNames(results.flat());
}

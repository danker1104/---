import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const KST = "Asia/Seoul";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function kstTodayString(now: Date = new Date()): string {
  return formatInTimeZone(now, KST, "yyyy-MM-dd");
}

export function formatKstDate(date: Date): string {
  return formatInTimeZone(date, KST, "yyyy-MM-dd");
}

export function formatKstTime(date: Date): string {
  return formatInTimeZone(date, KST, "HH:mm");
}

export function parseKstDateString(value: string): Date {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid KST date string: ${value}`);
  }
  const utc = fromZonedTime(`${value} 00:00:00`, KST);
  if (Number.isNaN(utc.getTime())) {
    throw new Error(`Invalid KST date string: ${value}`);
  }
  if (formatInTimeZone(utc, KST, "yyyy-MM-dd") !== value) {
    throw new Error(`Invalid KST date string: ${value}`);
  }
  return utc;
}

export function kstDateFromParts(dateStr: string, timeStr: string): Date {
  if (!DATE_RE.test(dateStr)) {
    throw new Error(`Invalid KST date string: ${dateStr}`);
  }
  if (!TIME_RE.test(timeStr)) {
    throw new Error(`Invalid KST time string: ${timeStr}`);
  }
  return fromZonedTime(`${dateStr} ${timeStr}:00`, KST);
}

// 달력 날짜(요일) 계산은 시간대와 무관하므로 UTC 기준 순수 연산으로 처리한다.
export function isoAddDays(baseIso: string, days: number): string {
  if (!DATE_RE.test(baseIso)) {
    throw new Error(`Invalid KST date string: ${baseIso}`);
  }
  const [y = 0, m = 0, d = 0] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 해당 날짜가 속한 주의 월요일(YYYY-MM-DD)을 돌려준다. */
export function kstWeekMonday(dateStr: string): string {
  if (!DATE_RE.test(dateStr)) {
    throw new Error(`Invalid KST date string: ${dateStr}`);
  }
  const [y = 0, m = 0, d = 0] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일 … 6=토
  const offset = dow === 0 ? -6 : 1 - dow;
  return isoAddDays(dateStr, offset);
}

/** 월요일 기준 그 주의 월~금 5일(YYYY-MM-DD) 배열을 돌려준다. */
export function kstWeekdayDates(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => isoAddDays(monday, i));
}

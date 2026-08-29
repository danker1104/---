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

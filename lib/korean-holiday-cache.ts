import { prisma } from "@/lib/db";
import { parseKstDateString } from "@/lib/date";
import { getKoreanHolidays, type KoreanHoliday } from "@/lib/korean-holidays";

const OFFICIAL_HOLIDAY_PREFIX = "[공식 공휴일] ";

type HolidayLoader = (year: number) => Promise<KoreanHoliday[]>;

function yearBounds(year: number) {
  return {
    gte: parseKstDateString(`${year}-01-01`),
    lte: parseKstDateString(`${year}-12-31`),
  };
}

export async function getKoreanHolidaysWithCache(
  year: number,
  loader: HolidayLoader = getKoreanHolidays,
): Promise<KoreanHoliday[]> {
  const holidays = await loader(year);

  if (holidays.length > 0) {
    await prisma.$transaction(
      holidays.map((holiday) => prisma.calendarException.upsert({
        where: { date: parseKstDateString(holiday.date) },
        update: {},
        create: {
          date: parseKstDateString(holiday.date),
          reason: "HOLIDAY",
          memo: `${OFFICIAL_HOLIDAY_PREFIX}${holiday.name}`,
        },
      })),
    );
    return holidays;
  }

  const cached = await prisma.calendarException.findMany({
    where: {
      date: yearBounds(year),
      reason: "HOLIDAY",
      memo: { startsWith: OFFICIAL_HOLIDAY_PREFIX },
    },
    orderBy: { date: "asc" },
  });

  return cached.map((holiday) => ({
    date: holiday.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
    name: holiday.memo!.slice(OFFICIAL_HOLIDAY_PREFIX.length),
  }));
}

export async function getKoreanHolidaysForDatesWithCache(
  dates: string[],
): Promise<KoreanHoliday[]> {
  const years = [...new Set(dates.map((date) => Number(date.slice(0, 4))))]
    .filter(Number.isInteger);
  return (await Promise.all(years.map((year) => getKoreanHolidaysWithCache(year))))
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date));
}

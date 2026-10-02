"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatKstDate, kstTodayString, parseKstDateString } from "@/lib/date";
import { getKoreanHolidaysWithCache } from "@/lib/korean-holiday-cache";

const AddSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  reason: z.enum(["HOLIDAY", "EXAM", "OTHER"]),
  memo: z.string().max(200).optional().default(""),
});

const AddManySchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식")).min(1).max(62),
  reason: z.enum(["HOLIDAY", "EXAM", "OTHER"]),
  memo: z.string().max(200).optional().default(""),
});

export interface CalendarActionResult {
  ok: boolean;
  warning?: string;
  message?: string;
}

export async function getOfficialHolidaysAction(year: number) {
  const currentKstYear = Number(kstTodayString().slice(0, 4));
  if (!Number.isInteger(year) || year < 2004 || year > currentKstYear + 2) {
    return [];
  }
  return getKoreanHolidaysWithCache(year);
}

export async function addExceptionsAction(formData: FormData): Promise<CalendarActionResult> {
  const datesValue = formData.get("dates");
  const parsed = AddManySchema.safeParse({
    dates: typeof datesValue === "string" ? datesValue.split(",").filter(Boolean) : [],
    reason: formData.get("reason"),
    memo: formData.get("memo") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((issue) => issue.message).join(", ") };
  }

  const { dates, reason, memo } = parsed.data;
  const dateValues = dates.map(parseKstDateString);
  const existingPlans = await prisma.participationPlan.count({
    where: { date: { in: dateValues } },
  });

  await prisma.$transaction([
    ...dates.map((date, index) => prisma.calendarException.upsert({
      where: { date: dateValues[index] },
      update: { reason, memo: memo || null },
      create: { date: dateValues[index]!, reason, memo: memo || null },
    })),
    ...dates.map((date) => prisma.auditLog.create({
      data: {
        actor: "teacher",
        action: "CALENDAR_EXCEPTION_UPSERT",
        targetType: "CalendarException",
        targetId: date,
        meta: JSON.stringify({ reason, memo, batchSize: dates.length, existingPlans }),
      },
    })),
  ]);

  revalidatePath("/teacher/calendar");
  revalidatePath("/teacher/attendance");
  return {
    ok: true,
    warning: existingPlans > 0
      ? `선택 범위에 이미 대상자 ${existingPlans}건이 존재합니다. 감사 로그에 기록되었습니다.`
      : undefined,
    message: dates.length === 1 ? "등록되었습니다." : `${dates.length}일이 등록되었습니다.`,
  };
}

export async function addExceptionAction(formData: FormData): Promise<CalendarActionResult> {
  const parsed = AddSchema.safeParse({
    date: formData.get("date"),
    reason: formData.get("reason"),
    memo: formData.get("memo") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }
  const nextFormData = new FormData();
  nextFormData.set("dates", parsed.data.date);
  nextFormData.set("reason", parsed.data.reason);
  nextFormData.set("memo", parsed.data.memo);
  return addExceptionsAction(nextFormData);
}

export async function deleteExceptionAction(formData: FormData): Promise<CalendarActionResult> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const existing = await prisma.calendarException.findUnique({ where: { id } });
  if (!existing) return { ok: false, message: "존재하지 않는 항목입니다." };
  await prisma.calendarException.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action: "CALENDAR_EXCEPTION_DELETE",
      targetType: "CalendarException",
      targetId: formatKstDate(existing.date),
      meta: JSON.stringify({ reason: existing.reason }),
    },
  });
  revalidatePath("/teacher/calendar");
  return { ok: true, message: "삭제되었습니다." };
}

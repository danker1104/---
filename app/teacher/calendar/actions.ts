"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatKstDate, parseKstDateString } from "@/lib/date";

const AddSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  reason: z.enum(["HOLIDAY", "EXAM", "OTHER"]),
  memo: z.string().max(200).optional().default(""),
});

export interface CalendarActionResult {
  ok: boolean;
  warning?: string;
  message?: string;
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
  const { date, reason, memo } = parsed.data;
  const dateUtc = parseKstDateString(date);

  const existingPlans = await prisma.participationPlan.count({
    where: { date: dateUtc },
  });

  await prisma.calendarException.upsert({
    where: { date: dateUtc },
    update: { reason, memo: memo || null },
    create: { date: dateUtc, reason, memo: memo || null },
  });

  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action: "CALENDAR_EXCEPTION_UPSERT",
      targetType: "CalendarException",
      targetId: date,
      meta: JSON.stringify({ reason, memo, existingPlans }),
    },
  });

  revalidatePath("/teacher/calendar");
  revalidatePath("/teacher/attendance");
  return {
    ok: true,
    warning:
      existingPlans > 0
        ? `이미 대상자 ${existingPlans}건이 존재합니다. 감사 로그에 기록되었습니다.`
        : undefined,
    message: "등록되었습니다.",
  };
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

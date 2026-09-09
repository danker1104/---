"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SlotFormSchema = z.object({
  slot: z.enum(["OJA", "YAJA", "SIMJA"]),
  startTime: z.string().regex(TIME_RE, "HH:mm 형식이어야 합니다."),
  endTime: z.string().regex(TIME_RE, "HH:mm 형식이어야 합니다."),
  lateThresholdMinutes: z
    .union([z.string(), z.number()])
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 0),
      "지각 기준은 0 이상의 정수여야 합니다.",
    ),
  active: z.boolean().optional().default(true),
});

export interface SlotUpdateResult {
  ok: boolean;
  message?: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export async function updateSlotAction(formData: FormData): Promise<SlotUpdateResult> {
  const raw = {
    slot: formData.get("slot"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    lateThresholdMinutes: formData.get("lateThresholdMinutes"),
    active: formData.get("active") === "on",
  };

  const parsed = SlotFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }
  const { slot, startTime, endTime, lateThresholdMinutes, active } = parsed.data;
  if (toMinutes(endTime) <= toMinutes(startTime)) {
    return { ok: false, message: "종료 시간이 시작 시간보다 늦어야 합니다." };
  }

  const before = await prisma.slotConfig.findUnique({ where: { slot } });
  await prisma.slotConfig.upsert({
    where: { slot },
    update: { startTime, endTime, lateThresholdMinutes, active },
    create: { slot, startTime, endTime, lateThresholdMinutes, active },
  });
  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action: "SLOT_UPDATE",
      targetType: "SlotConfig",
      targetId: slot,
      meta: JSON.stringify({ before, after: { startTime, endTime, lateThresholdMinutes, active } }),
    },
  });
  revalidatePath("/teacher/slots");
  revalidatePath("/teacher/attendance");
  return { ok: true, message: "저장되었습니다." };
}

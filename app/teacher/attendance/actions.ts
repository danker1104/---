"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { classifyCheckIn, classifyCheckOut } from "@/lib/attendance-logic";
import type { StudySlot } from "@prisma/client";

const SlotEnum = z.enum(["OJA", "YAJA", "SIMJA"]);

const CheckInSchema = z.object({
  planId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: SlotEnum,
});

const AbsenceSchema = z.object({
  planId: z.string().min(1),
  note: z.string().max(200).optional().default(""),
});

async function loadSlotWindow(date: string, slot: StudySlot) {
  const cfg = await prisma.slotConfig.findUnique({ where: { slot } });
  if (!cfg) throw new Error(`SlotConfig 없음: ${slot}`);
  return {
    slot,
    date,
    startTime: cfg.startTime,
    endTime: cfg.endTime,
    lateThresholdMinutes: cfg.lateThresholdMinutes,
  };
}

async function loadPlanOrThrow(planId: string) {
  const plan = await prisma.participationPlan.findUnique({
    where: { id: planId },
    include: { attendance: true, student: true },
  });
  if (!plan) throw new Error("대상자를 찾을 수 없습니다.");
  return plan;
}

async function writeAudit(
  planId: string,
  before: string,
  after: string,
  action: string,
) {
  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action,
      targetType: "Attendance",
      targetId: planId,
      meta: JSON.stringify({ before, after }),
    },
  });
}

export async function checkInAction(input: {
  planId: string;
  date: string;
  slot: StudySlot;
}) {
  const parsed = CheckInSchema.parse(input);
  const plan = await loadPlanOrThrow(parsed.planId);
  const window = await loadSlotWindow(parsed.date, parsed.slot);
  const now = new Date();
  const state = classifyCheckIn(window, now);

  const beforeState = plan.attendance?.state ?? "UNCHECKED";
  await prisma.attendance.update({
    where: { participationPlanId: parsed.planId },
    data: {
      checkInAt: now,
      state,
      absenceCategory: null,
      absenceNote: null,
    },
  });
  await writeAudit(parsed.planId, beforeState, state, "CHECK_IN");
  revalidatePath("/teacher/attendance");
}

export async function checkOutAction(input: {
  planId: string;
  date: string;
  slot: StudySlot;
}) {
  const parsed = CheckInSchema.parse(input);
  const plan = await loadPlanOrThrow(parsed.planId);
  const window = await loadSlotWindow(parsed.date, parsed.slot);
  const now = new Date();
  const beforeState = plan.attendance?.state ?? "UNCHECKED";

  // 입실하지 않은 상태(미체크/결석/인정결석)에서는 퇴실을 무시해 상태를 뒤집지 않는다.
  if (beforeState !== "PRESENT" && beforeState !== "LATE" && beforeState !== "LEAVE_EARLY") {
    return { ok: false, reason: "입실하지 않은 상태에서는 퇴실을 기록할 수 없습니다." };
  }

  const leaveEarly = classifyCheckOut(window, now);
  const nextState = leaveEarly ?? beforeState;

  await prisma.attendance.update({
    where: { participationPlanId: parsed.planId },
    data: {
      checkOutAt: now,
      state: nextState,
    },
  });
  await writeAudit(parsed.planId, beforeState, nextState, "CHECK_OUT");
  revalidatePath("/teacher/attendance");
  return { ok: true };
}

export async function markAbsentAction(input: {
  planId: string;
  note?: string;
}) {
  const parsed = AbsenceSchema.parse(input);
  const plan = await loadPlanOrThrow(parsed.planId);
  const beforeState = plan.attendance?.state ?? "UNCHECKED";

  await prisma.attendance.update({
    where: { participationPlanId: parsed.planId },
    data: {
      state: "ABSENT",
      absenceCategory: "PERSONAL",
      absenceNote: parsed.note?.trim() || null,
      checkInAt: null,
      checkOutAt: null,
    },
  });
  await writeAudit(parsed.planId, beforeState, "ABSENT", "MARK_ABSENT");
  revalidatePath("/teacher/attendance");
}

export async function markExcusedAction(input: {
  planId: string;
  note?: string;
}) {
  const parsed = AbsenceSchema.parse(input);
  const plan = await loadPlanOrThrow(parsed.planId);
  const beforeState = plan.attendance?.state ?? "UNCHECKED";

  await prisma.attendance.update({
    where: { participationPlanId: parsed.planId },
    data: {
      state: "EXCUSED",
      absenceCategory: "OFFICIAL",
      absenceNote: parsed.note?.trim() || null,
      checkInAt: null,
      checkOutAt: null,
    },
  });
  await writeAudit(parsed.planId, beforeState, "EXCUSED", "MARK_EXCUSED");
  revalidatePath("/teacher/attendance");
}

export async function resetAction(input: { planId: string }) {
  const plan = await loadPlanOrThrow(input.planId);
  const beforeState = plan.attendance?.state ?? "UNCHECKED";
  await prisma.attendance.update({
    where: { participationPlanId: input.planId },
    data: {
      state: "UNCHECKED",
      checkInAt: null,
      checkOutAt: null,
      absenceCategory: null,
      absenceNote: null,
    },
  });
  await writeAudit(input.planId, beforeState, "UNCHECKED", "RESET");
  revalidatePath("/teacher/attendance");
}

export async function updateAbsenceNoteAction(input: {
  planId: string;
  note: string;
}) {
  const parsed = z
    .object({ planId: z.string().min(1), note: z.string().max(200) })
    .parse(input);
  await prisma.attendance.update({
    where: { participationPlanId: parsed.planId },
    data: { absenceNote: parsed.note.trim() || null },
  });
  await writeAudit(parsed.planId, "note", "note-updated", "UPDATE_NOTE");
  revalidatePath("/teacher/attendance");
}

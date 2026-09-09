import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { parseKstDateString } from "@/lib/date";
import {
  checkInAction,
  checkOutAction,
  markAbsentAction,
  markExcusedAction,
  resetAction,
} from "@/app/teacher/attendance/actions";
import { resetDb } from "./helpers";
import type { StudySlot } from "@prisma/client";

// 미래 날짜: now < 슬롯 시작 → PRESENT / now < 종료 → LEAVE_EARLY 판정에 사용.
const FUTURE = "2099-03-02";
// 과거 날짜: now > 시작 + 지각기준 → LATE 판정에 사용.
const PAST = "2020-03-02";

async function makePlan(date: string, slot: StudySlot): Promise<string> {
  const student = await prisma.student.create({
    data: { studentNo: `s-${date}-${slot}`, name: "홍길동", classroom: "2학년 1반" },
  });
  const plan = await prisma.participationPlan.create({
    data: {
      student: { connect: { id: student.id } },
      date: parseKstDateString(date),
      slot,
      importBatch: {
        create: { fileName: "t.xlsx", rowCount: 1, errorCount: 0, actor: "teacher" },
      },
      attendance: { create: { state: "UNCHECKED" } },
    },
  });
  return plan.id;
}

async function stateOf(planId: string): Promise<string> {
  const att = await prisma.attendance.findUniqueOrThrow({
    where: { participationPlanId: planId },
  });
  return att.state;
}

beforeEach(async () => {
  await resetDb();
});

describe("출결 체크 통합 (T-5)", () => {
  it("T-5.1 슬롯 시작 전 입실 → PRESENT", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    await checkInAction({ planId, date: FUTURE, slot: "YAJA" });
    expect(await stateOf(planId)).toBe("PRESENT");
  });

  it("T-5.2 지각 기준 경과 후 입실 → LATE", async () => {
    const planId = await makePlan(PAST, "YAJA");
    await checkInAction({ planId, date: PAST, slot: "YAJA" });
    expect(await stateOf(planId)).toBe("LATE");
  });

  it("T-5.3 슬롯 종료 전 퇴실 → LEAVE_EARLY", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    await checkInAction({ planId, date: FUTURE, slot: "YAJA" });
    const res = await checkOutAction({ planId, date: FUTURE, slot: "YAJA" });
    expect(res.ok).toBe(true);
    expect(await stateOf(planId)).toBe("LEAVE_EARLY");
  });

  it("입실 전 퇴실 시도 → 무시(상태 불변)", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    const res = await checkOutAction({ planId, date: FUTURE, slot: "YAJA" });
    expect(res.ok).toBe(false);
    expect(await stateOf(planId)).toBe("UNCHECKED");
  });

  it("T-5.4 불참 처리 + 사유 저장 (개인 불참)", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    await markAbsentAction({ planId, note: "무단 결석" });
    const att = await prisma.attendance.findUniqueOrThrow({
      where: { participationPlanId: planId },
    });
    expect(att.state).toBe("ABSENT");
    expect(att.absenceCategory).toBe("PERSONAL");
    expect(att.absenceNote).toBe("무단 결석");
  });

  it("인정결석 처리 → EXCUSED + OFFICIAL", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    await markExcusedAction({ planId, note: "병결" });
    const att = await prisma.attendance.findUniqueOrThrow({
      where: { participationPlanId: planId },
    });
    expect(att.state).toBe("EXCUSED");
    expect(att.absenceCategory).toBe("OFFICIAL");
  });

  it("초기화 → UNCHECKED", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    await markAbsentAction({ planId, note: "x" });
    await resetAction({ planId });
    expect(await stateOf(planId)).toBe("UNCHECKED");
  });

  it("입실 시 AuditLog(CHECK_IN) 기록", async () => {
    const planId = await makePlan(FUTURE, "YAJA");
    await checkInAction({ planId, date: FUTURE, slot: "YAJA" });
    const logs = await prisma.auditLog.findMany({
      where: { action: "CHECK_IN", targetId: planId },
    });
    expect(logs).toHaveLength(1);
  });

  it("T-5.7 과거 날짜 대상 상태 수정 → 반영 + AuditLog", async () => {
    const planId = await makePlan(PAST, "SIMJA");
    await markAbsentAction({ planId, note: "과거 수정" });
    expect(await stateOf(planId)).toBe("ABSENT");
    const logs = await prisma.auditLog.findMany({
      where: { action: "MARK_ABSENT", targetId: planId },
    });
    expect(logs).toHaveLength(1);
  });
});

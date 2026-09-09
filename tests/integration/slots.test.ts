import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { parseKstDateString } from "@/lib/date";
import { updateSlotAction } from "@/app/teacher/slots/actions";
import { checkInAction } from "@/app/teacher/attendance/actions";
import { resetDb } from "./helpers";

function slotForm(fields: {
  slot: string;
  startTime: string;
  endTime: string;
  lateThresholdMinutes?: string;
  active?: boolean;
}): FormData {
  const fd = new FormData();
  fd.set("slot", fields.slot);
  fd.set("startTime", fields.startTime);
  fd.set("endTime", fields.endTime);
  fd.set("lateThresholdMinutes", fields.lateThresholdMinutes ?? "10");
  if (fields.active !== false) fd.set("active", "on");
  return fd;
}

beforeEach(async () => {
  await resetDb();
});

describe("슬롯 설정 통합 (T-3)", () => {
  it("T-3.1 시간 저장 → DB 반영 + AuditLog", async () => {
    const res = await updateSlotAction(
      slotForm({ slot: "YAJA", startTime: "20:00", endTime: "22:00" }),
    );
    expect(res.ok).toBe(true);

    const cfg = await prisma.slotConfig.findUniqueOrThrow({ where: { slot: "YAJA" } });
    expect(cfg.startTime).toBe("20:00");
    expect(cfg.endTime).toBe("22:00");

    const logs = await prisma.auditLog.findMany({ where: { action: "SLOT_UPDATE" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("T-3.2 지각 기준 미설정(빈값) → 저장 시 null, 입실은 항상 PRESENT", async () => {
    const res = await updateSlotAction(
      slotForm({ slot: "YAJA", startTime: "19:00", endTime: "20:30", lateThresholdMinutes: "" }),
    );
    expect(res.ok).toBe(true);

    const cfg = await prisma.slotConfig.findUniqueOrThrow({ where: { slot: "YAJA" } });
    expect(cfg.lateThresholdMinutes).toBeNull();

    // 과거 날짜라 원래는 LATE지만, 지각 기준이 null이면 PRESENT.
    const student = await prisma.student.create({
      data: { studentNo: "20260101", name: "김민준", classroom: "2학년 1반" },
    });
    const plan = await prisma.participationPlan.create({
      data: {
        student: { connect: { id: student.id } },
        date: parseKstDateString("2020-03-02"),
        slot: "YAJA",
        importBatch: { create: { fileName: "t.xlsx", rowCount: 1, errorCount: 0, actor: "teacher" } },
        attendance: { create: { state: "UNCHECKED" } },
      },
    });
    await checkInAction({ planId: plan.id, date: "2020-03-02", slot: "YAJA" });
    const att = await prisma.attendance.findUniqueOrThrow({
      where: { participationPlanId: plan.id },
    });
    expect(att.state).toBe("PRESENT");
  });

  it("T-3.3 종료가 시작보다 이르면 저장 거부", async () => {
    const res = await updateSlotAction(
      slotForm({ slot: "YAJA", startTime: "22:00", endTime: "20:00" }),
    );
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/종료/);

    // 저장되지 않아 기본값(19:00) 유지
    const cfg = await prisma.slotConfig.findUniqueOrThrow({ where: { slot: "YAJA" } });
    expect(cfg.startTime).toBe("19:00");
  });

  it("잘못된 시간 형식 → 저장 거부", async () => {
    const res = await updateSlotAction(
      slotForm({ slot: "YAJA", startTime: "9시", endTime: "22:00" }),
    );
    expect(res.ok).toBe(false);
  });
});

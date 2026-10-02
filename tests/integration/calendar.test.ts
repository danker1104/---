import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { parseKstDateString } from "@/lib/date";
import { addExceptionAction, addExceptionsAction, deleteExceptionAction } from "@/app/teacher/calendar/actions";
import { resetDb } from "./helpers";
import { getKoreanHolidaysWithCache } from "@/lib/korean-holiday-cache";

function calForm(date: string, reason: string, memo = ""): FormData {
  const fd = new FormData();
  fd.set("date", date);
  fd.set("reason", reason);
  fd.set("memo", memo);
  return fd;
}

async function makePlanOn(date: string): Promise<void> {
  const student = await prisma.student.create({
    data: { studentNo: `s-${date}`, name: "홍길동", classroom: "2학년 1반" },
  });
  await prisma.participationPlan.create({
    data: {
      student: { connect: { id: student.id } },
      date: parseKstDateString(date),
      slot: "YAJA",
      importBatch: { create: { fileName: "t.xlsx", rowCount: 1, errorCount: 0, actor: "teacher" } },
      attendance: { create: { state: "UNCHECKED" } },
    },
  });
}

beforeEach(async () => {
  await resetDb();
});

describe("캘린더 예외 통합 (T-3)", () => {
  it("미래 연도 공식 공휴일을 자동 저장하고 조회 실패 시 저장본을 사용한다", async () => {
    const holidays = [{ date: "2027-01-01", name: "1월 1일" }];

    const first = await getKoreanHolidaysWithCache(2027, async () => holidays);
    const cached = await getKoreanHolidaysWithCache(2027, async () => []);

    expect(first).toEqual(holidays);
    expect(cached).toEqual(holidays);
    expect(await prisma.calendarException.count()).toBe(1);
    expect(await prisma.calendarException.findFirst()).toMatchObject({
      reason: "HOLIDAY",
      memo: "[공식 공휴일] 1월 1일",
    });
  });

  it("공식 공휴일 자동 저장은 같은 날짜의 교사 입력을 덮어쓰지 않는다", async () => {
    await addExceptionAction(calForm("2027-01-01", "OTHER", "학교 자체 일정"));

    await getKoreanHolidaysWithCache(2027, async () => [
      { date: "2027-01-01", name: "1월 1일" },
    ]);

    expect(await prisma.calendarException.findFirst()).toMatchObject({
      reason: "OTHER",
      memo: "학교 자체 일정",
    });
  });

  it("연속 날짜를 한 번에 예외일로 등록한다", async () => {
    const form = new FormData();
    form.set("dates", "2026-10-20,2026-10-21,2026-10-22");
    form.set("reason", "EXAM");
    form.set("memo", "중간고사");

    const res = await addExceptionsAction(form);

    expect(res.ok).toBe(true);
    expect(res.message).toBe("3일이 등록되었습니다.");
    expect(await prisma.calendarException.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: "CALENDAR_EXCEPTION_UPSERT" } })).toBe(3);
  });

  it("T-3.4 예외일 등록 → 저장 + AuditLog, 경고 없음", async () => {
    const res = await addExceptionAction(calForm("2026-09-10", "HOLIDAY", "개교기념일"));
    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();

    const rows = await prisma.calendarException.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe("HOLIDAY");

    const logs = await prisma.auditLog.findMany({
      where: { action: "CALENDAR_EXCEPTION_UPSERT" },
    });
    expect(logs).toHaveLength(1);
  });

  it("T-3.5 이미 대상자 있는 날짜를 예외 등록 → 경고 후 저장 + 감사 로그", async () => {
    await makePlanOn("2026-09-10");
    const res = await addExceptionAction(calForm("2026-09-10", "HOLIDAY"));

    expect(res.ok).toBe(true);
    expect(res.warning).toMatch(/이미 대상자/);
    expect(await prisma.calendarException.count()).toBe(1);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CALENDAR_EXCEPTION_UPSERT" },
    });
    expect(log.meta).toContain("existingPlans");
  });

  it("잘못된 날짜 형식 → 거부", async () => {
    const res = await addExceptionAction(calForm("2026/09/10", "HOLIDAY"));
    expect(res.ok).toBe(false);
    expect(await prisma.calendarException.count()).toBe(0);
  });

  it("예외 삭제 → 제거 + AuditLog", async () => {
    await addExceptionAction(calForm("2026-09-10", "EXAM"));
    const row = await prisma.calendarException.findFirstOrThrow();

    const fd = new FormData();
    fd.set("id", row.id);
    const res = await deleteExceptionAction(fd);

    expect(res.ok).toBe(true);
    expect(await prisma.calendarException.count()).toBe(0);
    const logs = await prisma.auditLog.findMany({
      where: { action: "CALENDAR_EXCEPTION_DELETE" },
    });
    expect(logs).toHaveLength(1);
  });
});

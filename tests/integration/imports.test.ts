import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { formatKstDate, parseKstDateString } from "@/lib/date";
import { uploadExcelAction } from "@/app/teacher/imports/actions";
import { resetDb, makeExcelFile, importFormData } from "./helpers";

const HEADER = ["학번", "이름", "반", "날짜", "구분"];

beforeEach(async () => {
  await resetDb();
});

describe("Excel 임포트 통합 (T-2, T-4)", () => {
  it("T-2.1 정상 업로드 → 대상자 + 미체크 출결 생성, 오류 0", async () => {
    const file = makeExcelFile([
      HEADER,
      ["20260101", "김민준", "2학년 1반", "2026-09-01", "야자"],
      ["20260102", "이서연", "2학년 1반", "2026-09-01", "야자"],
      ["20260103", "박도윤", "2학년 1반", "2026-09-01", "심자"],
    ]);
    const res = await uploadExcelAction(importFormData(file));

    expect(res.ok).toBe(true);
    expect(res.createdRows).toBe(3);
    expect(res.errors).toHaveLength(0);

    const plans = await prisma.participationPlan.findMany({ include: { attendance: true } });
    expect(plans).toHaveLength(3);
    expect(plans.every((p) => p.attendance?.state === "UNCHECKED")).toBe(true);
  });

  it("T-2.2 필수 열 누락 → 업로드 거부, 누락 열 표시", async () => {
    const file = makeExcelFile([
      ["학번", "이름", "반", "날짜"], // 구분 누락
      ["20260101", "김민준", "2학년 1반", "2026-09-01"],
    ]);
    const res = await uploadExcelAction(importFormData(file));

    expect(res.ok).toBe(false);
    expect(res.message).toContain("구분");
    expect(await prisma.participationPlan.count()).toBe(0);
  });

  it("T-2.3 잘못된 날짜·구분 행 → 미생성 + 행 번호/사유", async () => {
    const file = makeExcelFile([
      HEADER,
      ["20260101", "김민준", "2학년 1반", "잘못된날짜", "야자"],
      ["20260102", "이서연", "2학년 1반", "2026-09-01", "야자9"],
      ["20260103", "박도윤", "2학년 1반", "2026-09-01", "야자"],
    ]);
    const res = await uploadExcelAction(importFormData(file));

    expect(res.createdRows).toBe(1);
    expect(res.errors).toHaveLength(2);
    expect(res.errors.map((e) => e.row).sort((a, b) => a - b)).toEqual([2, 3]);
    expect(await prisma.participationPlan.count()).toBe(1);
  });

  it("T-2.4 동일 학생·날짜·구분 중복 행 → 하나만 생성", async () => {
    const file = makeExcelFile([
      HEADER,
      ["20260101", "김민준", "2학년 1반", "2026-09-01", "야자"],
      ["20260101", "김민준", "2학년 1반", "2026-09-01", "야자"],
    ]);
    const res = await uploadExcelAction(importFormData(file));

    expect(res.createdRows).toBe(1);
    expect(res.duplicateRows).toBe(1);
    expect(await prisma.participationPlan.count()).toBe(1);
  });

  it("T-4.2 캘린더 예외일 행 → 대상 미생성 + 오류 결과", async () => {
    await prisma.calendarException.create({
      data: { date: parseKstDateString("2026-09-01"), reason: "HOLIDAY" },
    });
    const file = makeExcelFile([
      HEADER,
      ["20260101", "김민준", "2학년 1반", "2026-09-01", "야자"],
    ]);
    const res = await uploadExcelAction(importFormData(file));

    expect(res.excludedByCalendar).toBe(1);
    expect(res.createdRows).toBe(0);
    expect(await prisma.participationPlan.count()).toBe(0);
  });

  it("대한민국 공식 공휴일 행은 별도 등록 없이 대상에서 자동 제외한다", async () => {
    const file = makeExcelFile([
      HEADER,
      ["20260101", "김민준", "2학년 1반", "2026-10-09", "야자"],
    ]);

    const res = await uploadExcelAction(importFormData(file));

    expect(res.excludedByCalendar).toBe(1);
    expect(res.createdRows).toBe(0);
    expect(res.errors[0]?.reason).toContain("공식 공휴일");
    expect(res.errors[0]?.reason).toContain("한글날");
  });

  it("T-4.4 임포트 결과가 AuditLog에 기록", async () => {
    const file = makeExcelFile([
      HEADER,
      ["20260101", "김민준", "2학년 1반", "2026-09-01", "야자"],
    ]);
    await uploadExcelAction(importFormData(file));

    const logs = await prisma.auditLog.findMany({ where: { action: "IMPORT_BATCH" } });
    expect(logs).toHaveLength(1);
  });

  it("재업로드 시 기존 출결 보존 (덮어쓰기 금지)", async () => {
    const rows = [HEADER, ["20260101", "김민준", "2학년 1반", "2026-09-01", "야자"]];
    await uploadExcelAction(importFormData(makeExcelFile(rows)));

    const plan = await prisma.participationPlan.findFirstOrThrow();
    await prisma.attendance.update({
      where: { participationPlanId: plan.id },
      data: { state: "PRESENT" },
    });

    const res2 = await uploadExcelAction(importFormData(makeExcelFile(rows)));
    expect(res2.existingSkipped).toBe(1);
    expect(res2.createdRows).toBe(0);

    const att = await prisma.attendance.findUniqueOrThrow({
      where: { participationPlanId: plan.id },
    });
    expect(att.state).toBe("PRESENT");
  });

  it("설문(제출내역) 매트릭스 + 기준 월요일 업로드 → 요일별 대상 생성", async () => {
    const file = makeExcelFile([
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
      ["1", "20901", "김화원", "", "", "", "", "", "", "", "", "", "", "", "1", "", "", "", "", "1", ""],
    ]);
    const fd = importFormData(file);
    fd.set("weekMonday", "2026-08-31"); // 월요일

    const res = await uploadExcelAction(fd);
    expect(res.ok).toBe(true);
    expect(res.createdRows).toBe(2);

    const plans = await prisma.participationPlan.findMany({ include: { student: true } });
    expect(plans).toHaveLength(2);
    expect(plans.every((p) => p.student.classroom === "2학년 9반")).toBe(true);
    expect(plans.map((p) => p.slot).sort()).toEqual(["SIMJA", "YAJA"]);
  });

  it("설문 업로드 시 연락처·제출/수정시간을 학생 내부 상세로 저장 (AC-6.11)", async () => {
    const file = makeExcelFile([
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
      ["1", "20901", "김화원", "010-1234-5678", "2026-08-27 13:22:55", "2026-08-27 13:40:00", "", "", "", "", "", "", "", "", "1", "", "", "", "", "", ""],
    ]);
    const fd = importFormData(file);
    fd.set("weekMonday", "2026-08-31");

    const res = await uploadExcelAction(fd);
    expect(res.ok).toBe(true);

    const student = await prisma.student.findUniqueOrThrow({
      where: { studentNo: "20901" },
    });
    expect(student.contact).toBe("010-1234-5678");
    expect(student.surveySubmittedAt).toBe("2026-08-27 13:22:55");
    expect(student.surveyUpdatedAt).toBe("2026-08-27 13:40:00");
  });

  it("설문 형식인데 기준 월요일 누락 → 이번 주 월요일로 자동 적용", async () => {
    const file = makeExcelFile([
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
      ["1", "20901", "김화원", "", "", "", "", "", "", "", "", "", "", "", "1", "", "", "", "", "", ""],
    ]);
    const res = await uploadExcelAction(importFormData(file));
    expect(res.ok).toBe(true);
    expect(res.createdRows).toBe(1); // 야자 목 1건
    expect(await prisma.participationPlan.count()).toBe(1);
  });

  it("설문(제출내역_텍스트) 형식 업로드 → 요일 텍스트 파싱", async () => {
    const file = makeExcelFile([
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "2. 야자 참여 요일", "3. 심자 참여 요일"],
      ["2", "20902", "이화원", "", "", "", "금", "금", "수\n목\n금"],
    ]);
    const fd = importFormData(file);
    fd.set("weekMonday", "2026-08-31");

    const res = await uploadExcelAction(fd);
    expect(res.ok).toBe(true);
    expect(res.createdRows).toBe(5); // 오자 금, 야자 금, 심자 수·목·금

    const plans = await prisma.participationPlan.findMany({ include: { student: true } });
    expect(plans.every((p) => p.student.classroom === "2학년 9반")).toBe(true);
    expect(plans.filter((p) => p.slot === "SIMJA")).toHaveLength(3);
  });

  it("이전에 작성한 명부(출결 표시 채운 주간표)를 올리면 그 상태로 생성", async () => {
    const file = makeExcelFile([
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
      ["1", "20901", "김화원", "", "", "", "출", "", "", "", "", "", "", "", "인", "", "", "", "", "결", ""],
    ]);
    const fd = importFormData(file);
    fd.set("weekMonday", "2026-08-31");

    const res = await uploadExcelAction(fd);
    expect(res.ok).toBe(true);
    expect(res.createdRows).toBe(3);

    const plans = await prisma.participationPlan.findMany({ include: { attendance: true } });
    const stateBySlot = Object.fromEntries(plans.map((p) => [p.slot, p.attendance?.state]));
    expect(stateBySlot.OJA).toBe("PRESENT"); // 오자 월 = 출
    expect(stateBySlot.YAJA).toBe("EXCUSED"); // 야자 목 = 인
    expect(stateBySlot.SIMJA).toBe("ABSENT"); // 심자 목 = 결
  });

  it("재업로드로 출결 표시가 바뀌면 기존 출결을 갱신", async () => {
    const header = [
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
    ];
    const first = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "○", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]),
    );
    first.set("weekMonday", "2026-08-31");
    await uploadExcelAction(first); // 오자 월 미체크

    const second = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "결", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]),
    );
    second.set("weekMonday", "2026-08-31");
    const res = await uploadExcelAction(second); // 오자 월 결(ABSENT)

    expect(res.createdRows).toBe(0);
    expect(res.updatedRows).toBe(1);

    const plan = await prisma.participationPlan.findFirstOrThrow({ include: { attendance: true } });
    expect(plan.attendance?.state).toBe("ABSENT");
  });

  it("재업로드가 미체크(○)면 기존 출결을 보존", async () => {
    const header = [
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
    ];
    const first = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "출", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]),
    );
    first.set("weekMonday", "2026-08-31");
    await uploadExcelAction(first); // 오자 월 출(PRESENT)

    const second = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "○", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]),
    );
    second.set("weekMonday", "2026-08-31");
    const res = await uploadExcelAction(second); // 오자 월 ○(미체크)

    expect(res.updatedRows).toBe(0);
    expect(res.existingSkipped).toBe(1);

    const plan = await prisma.participationPlan.findFirstOrThrow({ include: { attendance: true } });
    expect(plan.attendance?.state).toBe("PRESENT"); // 덮어쓰지 않음
  });

  it("설문 명부 재업로드 시 새 명부에 없는 이전 계획을 제거(주간 교체)", async () => {
    const header = [
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
    ];
    // A: 20901 야자 수·목
    const a = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "", "", "", "", "", "", "", "1", "1", "", "", "", "", "", ""]]),
    );
    a.set("weekMonday", "2026-08-31");
    const resA = await uploadExcelAction(a);
    expect(resA.createdRows).toBe(2);
    expect(await prisma.participationPlan.count()).toBe(2);

    // B: 20901 야자 수만 (목 제외)
    const b = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "", "", "", "", "", "", "", "1", "", "", "", "", "", "", ""]]),
    );
    b.set("weekMonday", "2026-08-31");
    const resB = await uploadExcelAction(b);
    expect(resB.createdRows).toBe(0);
    expect(resB.removedRows).toBe(1);

    const remaining = await prisma.participationPlan.findMany();
    expect(remaining).toHaveLength(1);
    expect(formatKstDate(remaining[0]!.date)).toBe("2026-09-02"); // 수만 남음
    expect(remaining[0]!.slot).toBe("YAJA");
    // 고아 출결(Attendance)도 함께 제거되어 유령 없음
    expect(await prisma.attendance.count()).toBe(1);
  });

  it("설문 재업로드 교체는 다른 주 계획을 건드리지 않는다", async () => {
    const header = [
      ["순번", "학번", "이름", "연락처", "제출시간", "수정시간", "1. 오자 참여 요일", "", "", "", "", "2. 야자 참여 요일", "", "", "", "", "3. 심자 참여 요일", "", "", "", ""],
      ["", "", "", "", "", "", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금", "월", "화", "수", "목", "금"],
    ];
    // 지난 주(2026-08-24 월) 야자 수
    const prev = importFormData(
      makeExcelFile([...header, ["1", "20901", "김화원", "", "", "", "", "", "", "", "", "", "", "1", "", "", "", "", "", "", ""]]),
    );
    prev.set("weekMonday", "2026-08-24");
    await uploadExcelAction(prev);

    // 이번 주(2026-08-31) 다른 학생만
    const cur = importFormData(
      makeExcelFile([...header, ["1", "20902", "이화원", "", "", "", "", "", "", "", "", "", "", "1", "", "", "", "", "", "", ""]]),
    );
    cur.set("weekMonday", "2026-08-31");
    const res = await uploadExcelAction(cur);
    expect(res.removedRows).toBe(0); // 지난 주는 교체 범위 밖
    expect(await prisma.participationPlan.count()).toBe(2);
  });
});

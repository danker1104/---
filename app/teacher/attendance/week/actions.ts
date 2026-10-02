"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseKstDateString } from "@/lib/date";
import { nextCellState } from "@/lib/weekly-attendance";
import type { AbsenceCategory, AttState, StudySlot } from "@prisma/client";

interface AttendanceStateData {
  state: AttState;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  absenceCategory: AbsenceCategory | null;
  absenceNote?: string | null;
}

function attendanceDataFor(state: AttState): AttendanceStateData {
  switch (state) {
    case "PRESENT":
    case "LATE":
      return {
        state,
        checkInAt: new Date(),
        checkOutAt: null,
        absenceCategory: null,
        absenceNote: null,
      };
    case "LEAVE_EARLY":
      return {
        state,
        checkInAt: new Date(),
        checkOutAt: new Date(),
        absenceCategory: null,
        absenceNote: null,
      };
    case "ABSENT":
      return {
        state,
        absenceCategory: "PERSONAL",
        checkInAt: null,
        checkOutAt: null,
      };
    case "EXCUSED":
      return {
        state,
        absenceCategory: "OFFICIAL",
        checkInAt: null,
        checkOutAt: null,
      };
    default:
      return {
        state: "UNCHECKED",
        checkInAt: null,
        checkOutAt: null,
        absenceCategory: null,
        absenceNote: null,
      };
  }
}

export interface SetCellStateInput extends CycleCellInput {
  state: AttState;
}

const AttStateSchema = z.enum([
  "UNCHECKED",
  "PRESENT",
  "LATE",
  "LEAVE_EARLY",
  "ABSENT",
  "EXCUSED",
]);

export async function setCellStateAction(input: SetCellStateInput) {
  const state = AttStateSchema.parse(input.state);

  if (input.planId) {
    const plan = await prisma.participationPlan.findUnique({
      where: { id: input.planId },
      include: { attendance: true },
    });
    if (!plan) throw new Error("대상자를 찾을 수 없습니다.");

    const before = plan.attendance?.state ?? "UNCHECKED";
    await prisma.attendance.update({
      where: { participationPlanId: input.planId },
      data: attendanceDataFor(state),
    });
    await prisma.auditLog.create({
      data: {
        actor: "teacher",
        action: "WEEK_SET_STATE",
        targetType: "Attendance",
        targetId: input.planId,
        meta: JSON.stringify({ before, after: state }),
      },
    });

    revalidatePath("/teacher/attendance/week");
    revalidatePath("/teacher/attendance");
    return { ok: true, state, planId: input.planId };
  }

  if (input.studentNo && input.date && input.slot) {
    const student = await prisma.student.findUnique({
      where: { studentNo: input.studentNo },
    });
    if (!student) throw new Error("학생을 찾을 수 없습니다.");

    const attendanceData = attendanceDataFor(state);
    const newPlan = await prisma.participationPlan.create({
      data: {
        student: { connect: { id: student.id } },
        importBatch: {
          create: {
            fileName: "현장추가",
            rowCount: 1,
            errorCount: 0,
            actor: "teacher",
          },
        },
        date: parseKstDateString(input.date),
        slot: input.slot,
        attendance: { create: attendanceData },
      },
      include: { attendance: true },
    });

    await prisma.auditLog.create({
      data: {
        actor: "teacher",
        action: "WEEK_ADD_AND_SET_STATE",
        targetType: "Attendance",
        targetId: newPlan.id,
        meta: JSON.stringify({ before: "NONE", after: state }),
      },
    });

    revalidatePath("/teacher/attendance/week");
    revalidatePath("/teacher/attendance");
    return { ok: true, state, planId: newPlan.id };
  }

  throw new Error("잘못된 요청 파라미터입니다.");
}

export interface CycleCellInput {
  planId?: string;
  studentNo?: string;
  date?: string;
  slot?: StudySlot;
}

// 주간 표의 셀 클릭: 현재 상태를 다음 상태로 순환시키고 저장한다.
// 계획이 없는 빈칸을 클릭하면 즉시 현장 참여(PRESENT)로 신규 등록한다.
export async function cycleCellAction(input: CycleCellInput) {
  if (input.planId) {
    const plan = await prisma.participationPlan.findUnique({
      where: { id: input.planId },
      include: { attendance: true },
    });
    if (!plan) throw new Error("대상자를 찾을 수 없습니다.");

    const before = plan.attendance?.state ?? "UNCHECKED";
    const after = nextCellState(before);

    await prisma.attendance.update({
      where: { participationPlanId: input.planId },
      data: attendanceDataFor(after),
    });

    await prisma.auditLog.create({
      data: {
        actor: "teacher",
        action: "WEEK_CYCLE",
        targetType: "Attendance",
        targetId: input.planId,
        meta: JSON.stringify({ before, after }),
      },
    });

    revalidatePath("/teacher/attendance/week");
    revalidatePath("/teacher/attendance");
    return { ok: true, state: after, planId: input.planId };
  }

  // 빈칸 클릭 시: 신규 참여 계획 생성 후 PRESENT 처리
  if (input.studentNo && input.date && input.slot) {
    const student = await prisma.student.findUnique({
      where: { studentNo: input.studentNo },
    });
    if (!student) throw new Error("학생을 찾을 수 없습니다.");

    const dateUtc = parseKstDateString(input.date);
    const newPlan = await prisma.participationPlan.create({
      data: {
        student: { connect: { id: student.id } },
        importBatch: {
          create: {
            fileName: "현장추가",
            rowCount: 1,
            errorCount: 0,
            actor: "teacher",
          },
        },
        date: dateUtc,
        slot: input.slot,
        attendance: {
          create: {
            state: "PRESENT",
            checkInAt: new Date(),
          },
        },
      },
      include: { attendance: true },
    });

    await prisma.auditLog.create({
      data: {
        actor: "teacher",
        action: "WEEK_ADD_AND_CHECK",
        targetType: "Attendance",
        targetId: newPlan.id,
        meta: JSON.stringify({ before: "NONE", after: "PRESENT" }),
      },
    });

    revalidatePath("/teacher/attendance/week");
    revalidatePath("/teacher/attendance");
    return { ok: true, state: "PRESENT", planId: newPlan.id };
  }

  throw new Error("잘못된 요청 파라미터입니다.");
}

// ── 학생 상세(교사용 내부) ─────────────────────────────────────
// 연락처·제출·수정시간은 교사용 내부 상세 화면에서만 조회·편집한다.
// 결과 Excel·CSV·감사 로그 meta·외부 공유에는 값을 포함하지 않는다.

export interface StudentDetail {
  studentNo: string;
  name: string;
  classroom: string;
  contact: string;
  surveySubmittedAt: string;
  surveyUpdatedAt: string;
}

export async function getStudentDetailAction(
  studentNo: string,
): Promise<StudentDetail | null> {
  const s = await prisma.student.findUnique({
    where: { studentNo },
    select: {
      studentNo: true,
      name: true,
      classroom: true,
      contact: true,
      surveySubmittedAt: true,
      surveyUpdatedAt: true,
    },
  });
  if (!s) return null;
  return {
    studentNo: s.studentNo,
    name: s.name,
    classroom: s.classroom,
    contact: s.contact ?? "",
    surveySubmittedAt: s.surveySubmittedAt ?? "",
    surveyUpdatedAt: s.surveyUpdatedAt ?? "",
  };
}

const StudentDetailSchema = z.object({
  studentNo: z.string().min(1),
  contact: z.string().max(50).optional().default(""),
  surveySubmittedAt: z.string().max(50).optional().default(""),
  surveyUpdatedAt: z.string().max(50).optional().default(""),
});

export async function updateStudentDetailAction(input: {
  studentNo: string;
  contact?: string;
  surveySubmittedAt?: string;
  surveyUpdatedAt?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = StudentDetailSchema.parse(input);
  const student = await prisma.student.findUnique({
    where: { studentNo: parsed.studentNo },
    select: {
      contact: true,
      surveySubmittedAt: true,
      surveyUpdatedAt: true,
    },
  });
  if (!student) return { ok: false, message: "학생을 찾을 수 없습니다." };

  const after = {
    contact: parsed.contact.trim(),
    surveySubmittedAt: parsed.surveySubmittedAt.trim(),
    surveyUpdatedAt: parsed.surveyUpdatedAt.trim(),
  };

  await prisma.student.update({
    where: { studentNo: parsed.studentNo },
    data: {
      contact: after.contact || null,
      surveySubmittedAt: after.surveySubmittedAt || null,
      surveyUpdatedAt: after.surveyUpdatedAt || null,
    },
  });

  // 개인정보 보호: 로그에는 값 대신 변경 여부만 남긴다.
  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action: "STUDENT_DETAIL_UPDATE",
      targetType: "Student",
      targetId: parsed.studentNo,
      meta: JSON.stringify({
        changed: {
          contact: (student.contact ?? "") !== after.contact,
          surveySubmittedAt: (student.surveySubmittedAt ?? "") !== after.surveySubmittedAt,
          surveyUpdatedAt: (student.surveyUpdatedAt ?? "") !== after.surveyUpdatedAt,
        },
      }),
    },
  });

  revalidatePath("/teacher/attendance/week");
  return { ok: true };
}

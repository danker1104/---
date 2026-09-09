import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import {
  getStudentDetailAction,
  updateStudentDetailAction,
} from "@/app/teacher/attendance/week/actions";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

describe("학생 상세(교사용 내부) 액션 (AC-6.11)", () => {
  it("조회: 없는 학생은 null, 있는 학생은 상세 반환", async () => {
    expect(await getStudentDetailAction("00000")).toBeNull();

    await prisma.student.create({
      data: {
        studentNo: "20901",
        name: "김화원",
        classroom: "2학년 9반",
        contact: "010-1111-2222",
      },
    });
    const d = await getStudentDetailAction("20901");
    expect(d?.name).toBe("김화원");
    expect(d?.classroom).toBe("2학년 9반");
    expect(d?.contact).toBe("010-1111-2222");
  });

  it("수정: 상세 저장 + 감사 로그에 값 없이 변경 여부만 기록", async () => {
    await prisma.student.create({
      data: { studentNo: "20902", name: "이화원", classroom: "2학년 9반" },
    });

    const res = await updateStudentDetailAction({
      studentNo: "20902",
      contact: "010-3333-4444",
      surveySubmittedAt: "2026-08-27 10:29:33",
      surveyUpdatedAt: "",
    });
    expect(res.ok).toBe(true);

    const s = await prisma.student.findUniqueOrThrow({ where: { studentNo: "20902" } });
    expect(s.contact).toBe("010-3333-4444");
    expect(s.surveySubmittedAt).toBe("2026-08-27 10:29:33");
    expect(s.surveyUpdatedAt).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "STUDENT_DETAIL_UPDATE" },
    });
    expect(log.targetType).toBe("Student");
    expect(log.targetId).toBe("20902");
    // 개인정보 보호: 로그 meta에 실제 연락처 값이 남지 않아야 한다.
    expect(log.meta ?? "").not.toContain("010-3333-4444");
    const meta = JSON.parse(log.meta ?? "{}");
    expect(meta.changed.contact).toBe(true);
  });

  it("빈 문자열 저장 시 null로 정리", async () => {
    await prisma.student.create({
      data: {
        studentNo: "20903",
        name: "박화원",
        classroom: "2학년 9반",
        contact: "010-5555-6666",
      },
    });

    await updateStudentDetailAction({ studentNo: "20903", contact: "" });

    const s = await prisma.student.findUniqueOrThrow({ where: { studentNo: "20903" } });
    expect(s.contact).toBeNull();
  });
});

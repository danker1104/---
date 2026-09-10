import { describe, it, expect } from "vitest";
import {
  auditActionLabel,
  auditTargetLabel,
  summarizeAuditMeta,
  AUDIT_ACTION_ORDER,
} from "./audit-log";

describe("audit-log 라벨/요약 (US-9)", () => {
  describe("auditActionLabel", () => {
    it("알려진 액션을 한글 라벨로 변환한다", () => {
      expect(auditActionLabel("CHECK_IN")).toBe("입실 체크");
      expect(auditActionLabel("IMPORT_BATCH")).toBe("명부 업로드");
      expect(auditActionLabel("SLOT_UPDATE")).toBe("슬롯 설정 변경");
    });

    it("알 수 없는 액션은 원문을 유지한다", () => {
      expect(auditActionLabel("UNKNOWN_ACTION")).toBe("UNKNOWN_ACTION");
    });
  });

  describe("auditTargetLabel", () => {
    it("대상 유형을 한글로 변환하고 미지의 값은 원문을 유지한다", () => {
      expect(auditTargetLabel("Attendance")).toBe("출결");
      expect(auditTargetLabel("ImportBatch")).toBe("업로드");
      expect(auditTargetLabel("Mystery")).toBe("Mystery");
    });
  });

  describe("summarizeAuditMeta", () => {
    it("null/빈 meta는 '-'", () => {
      expect(summarizeAuditMeta("CHECK_IN", null)).toBe("-");
    });

    it("파싱 불가한 meta는 원문을 그대로 반환한다", () => {
      expect(summarizeAuditMeta("CHECK_IN", "{not-json")).toBe("{not-json");
    });

    it("상태 전이 액션은 한글 상태로 요약한다", () => {
      expect(summarizeAuditMeta("CHECK_IN", JSON.stringify({ before: "UNCHECKED", after: "PRESENT" }))).toBe(
        "미체크 → 출석",
      );
      expect(summarizeAuditMeta("WEEK_ADD_AND_CHECK", JSON.stringify({ before: "NONE", after: "PRESENT" }))).toBe(
        "없음 → 출석",
      );
      expect(summarizeAuditMeta("MARK_ABSENT", JSON.stringify({ before: "PRESENT", after: "ABSENT" }))).toBe(
        "출석 → 결석",
      );
    });

    it("T-9.5 STUDENT_DETAIL_UPDATE는 값 없이 변경된 항목명만 표시한다", () => {
      const meta = JSON.stringify({
        changed: { contact: true, surveySubmittedAt: false, surveyUpdatedAt: true },
      });
      const summary = summarizeAuditMeta("STUDENT_DETAIL_UPDATE", meta);
      expect(summary).toBe("변경: 연락처, 수정시간");
      // 개인정보 값이 노출되지 않아야 한다.
      expect(summary).not.toMatch(/010|@|[0-9]{4}-[0-9]{2}-[0-9]{2}/);
    });

    it("STUDENT_DETAIL_UPDATE 변경 항목이 없으면 '변경 없음'", () => {
      const meta = JSON.stringify({
        changed: { contact: false, surveySubmittedAt: false, surveyUpdatedAt: false },
      });
      expect(summarizeAuditMeta("STUDENT_DETAIL_UPDATE", meta)).toBe("변경 없음");
    });

    it("UPDATE_NOTE는 사유 원문 없이 고정 문구로 표시한다", () => {
      const summary = summarizeAuditMeta("UPDATE_NOTE", JSON.stringify({ before: "note", after: "note-updated" }));
      expect(summary).toBe("불참 사유 변경");
    });

    it("캘린더 예외 등록은 사유와 기존 대상자 수를 요약한다", () => {
      expect(
        summarizeAuditMeta("CALENDAR_EXCEPTION_UPSERT", JSON.stringify({ reason: "HOLIDAY", memo: "", existingPlans: 0 })),
      ).toBe("휴일");
      expect(
        summarizeAuditMeta("CALENDAR_EXCEPTION_UPSERT", JSON.stringify({ reason: "EXAM", memo: "중간고사", existingPlans: 3 })),
      ).toBe("시험 · 기존 대상자 3건");
    });

    it("캘린더 예외 삭제는 사유를 표시한다", () => {
      expect(summarizeAuditMeta("CALENDAR_EXCEPTION_DELETE", JSON.stringify({ reason: "OTHER" }))).toBe("삭제 · 기타");
    });

    it("명부 업로드는 신규/갱신/제거/오류 건수를 요약한다", () => {
      const meta = JSON.stringify({
        fileName: "a.xlsx",
        totalRows: 30,
        validRows: 28,
        createdRows: 20,
        updatedRows: 5,
        removedRows: 3,
        existingSkipped: 0,
        duplicateRows: 0,
        excludedByCalendar: 0,
        errorCount: 2,
      });
      expect(summarizeAuditMeta("IMPORT_BATCH", meta)).toBe("신규 20, 갱신 5, 제거 3, 오류 2");
    });

    it("슬롯 설정 변경은 변경 후 시간대를 표시한다", () => {
      const meta = JSON.stringify({
        before: { startTime: "19:00", endTime: "21:00" },
        after: { startTime: "20:00", endTime: "22:00", lateThresholdMinutes: 10, active: true },
      });
      expect(summarizeAuditMeta("SLOT_UPDATE", meta)).toBe("20:00~22:00");
    });
  });

  it("AUDIT_ACTION_ORDER는 실제 기록되는 13개 액션을 포함한다", () => {
    expect(AUDIT_ACTION_ORDER).toContain("CHECK_IN");
    expect(AUDIT_ACTION_ORDER).toContain("STUDENT_DETAIL_UPDATE");
    expect(AUDIT_ACTION_ORDER.length).toBe(13);
  });
});

import type { AttState, CalendarReason } from "@prisma/client";
import { STATE_LABEL, CALENDAR_REASON_LABEL } from "@/lib/slot";

/** AuditLog.action 코드를 교사가 읽을 한글 라벨로 변환한다. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CHECK_IN: "입실 체크",
  CHECK_OUT: "퇴실 체크",
  MARK_ABSENT: "결석 처리",
  MARK_EXCUSED: "인정결석 처리",
  RESET: "상태 초기화",
  UPDATE_NOTE: "불참 사유 수정",
  WEEK_CYCLE: "주간표 상태 변경",
  WEEK_ADD_AND_CHECK: "주간표 현장 추가",
  STUDENT_DETAIL_UPDATE: "학생 상세 수정",
  CALENDAR_EXCEPTION_UPSERT: "캘린더 예외 등록",
  CALENDAR_EXCEPTION_DELETE: "캘린더 예외 삭제",
  IMPORT_BATCH: "명부 업로드",
  SLOT_UPDATE: "슬롯 설정 변경",
};

/** AuditLog.targetType 코드를 한글 라벨로 변환한다. */
export const AUDIT_TARGET_LABEL: Record<string, string> = {
  Attendance: "출결",
  Student: "학생",
  CalendarException: "캘린더",
  ImportBatch: "업로드",
  SlotConfig: "슬롯",
};

/** 필터 드롭다운·조회 대상으로 노출하는 액션 목록(정의 순서 유지). */
export const AUDIT_ACTION_ORDER: readonly string[] = Object.keys(AUDIT_ACTION_LABEL);

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export function auditTargetLabel(targetType: string): string {
  return AUDIT_TARGET_LABEL[targetType] ?? targetType;
}

function stateLabel(value: string): string {
  if (value === "NONE") return "없음";
  if (value in STATE_LABEL) return STATE_LABEL[value as AttState];
  return value;
}

function reasonLabel(value: string): string {
  return value in CALENDAR_REASON_LABEL
    ? CALENDAR_REASON_LABEL[value as CalendarReason]
    : value;
}

const STATE_TRANSITION_ACTIONS = new Set([
  "CHECK_IN",
  "CHECK_OUT",
  "MARK_ABSENT",
  "MARK_EXCUSED",
  "RESET",
  "WEEK_CYCLE",
  "WEEK_ADD_AND_CHECK",
]);

const STUDENT_DETAIL_FIELD_LABEL: Record<string, string> = {
  contact: "연락처",
  surveySubmittedAt: "제출시간",
  surveyUpdatedAt: "수정시간",
};

/**
 * AuditLog.meta(JSON 문자열)를 사람이 읽을 한 줄 요약으로 변환한다.
 * 개인정보 보호(P-1): 상태 코드·건수·변경 여부만 노출하고 연락처·사유 원문 값은 표시하지 않는다.
 * 파싱 실패 시 원문을 그대로 돌려준다.
 */
export function summarizeAuditMeta(action: string, metaJson: string | null): string {
  if (!metaJson) return "-";

  let meta: unknown;
  try {
    meta = JSON.parse(metaJson);
  } catch {
    return metaJson;
  }
  if (typeof meta !== "object" || meta === null) return metaJson;
  const m = meta as Record<string, unknown>;

  if (STATE_TRANSITION_ACTIONS.has(action)) {
    const before = typeof m.before === "string" ? stateLabel(m.before) : "?";
    const after = typeof m.after === "string" ? stateLabel(m.after) : "?";
    return `${before} → ${after}`;
  }

  switch (action) {
    case "UPDATE_NOTE":
      return "불참 사유 변경";

    case "STUDENT_DETAIL_UPDATE": {
      const changed = m.changed;
      if (typeof changed !== "object" || changed === null) return "변경 없음";
      const fields = Object.entries(changed as Record<string, unknown>)
        .filter(([, v]) => v === true)
        .map(([k]) => STUDENT_DETAIL_FIELD_LABEL[k] ?? k);
      return fields.length > 0 ? `변경: ${fields.join(", ")}` : "변경 없음";
    }

    case "CALENDAR_EXCEPTION_UPSERT": {
      const reason = typeof m.reason === "string" ? reasonLabel(m.reason) : "?";
      const existing = typeof m.existingPlans === "number" ? m.existingPlans : 0;
      return existing > 0 ? `${reason} · 기존 대상자 ${existing}건` : reason;
    }

    case "CALENDAR_EXCEPTION_DELETE": {
      const reason = typeof m.reason === "string" ? reasonLabel(m.reason) : "?";
      return `삭제 · ${reason}`;
    }

    case "IMPORT_BATCH": {
      const parts: string[] = [];
      if (typeof m.createdRows === "number") parts.push(`신규 ${m.createdRows}`);
      if (typeof m.updatedRows === "number") parts.push(`갱신 ${m.updatedRows}`);
      if (typeof m.removedRows === "number") parts.push(`제거 ${m.removedRows}`);
      if (typeof m.errorCount === "number") parts.push(`오류 ${m.errorCount}`);
      return parts.length > 0 ? parts.join(", ") : "-";
    }

    case "SLOT_UPDATE": {
      const after = m.after;
      if (
        typeof after === "object" &&
        after !== null &&
        typeof (after as Record<string, unknown>).startTime === "string" &&
        typeof (after as Record<string, unknown>).endTime === "string"
      ) {
        const a = after as Record<string, string>;
        return `${a.startTime}~${a.endTime}`;
      }
      return "-";
    }

    default:
      return metaJson;
  }
}

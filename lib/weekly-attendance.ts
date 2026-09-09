// 주간 출결 매트릭스: 설문(제출내역) 엑셀과 같은 "학생 × 요일별 오자/야자/심자" 표를
// 구성한다. 화면(WeekMatrix)과 엑셀 내보내기 라우트가 이 순수 로직을 공유한다.

import type { StudySlot, AttState } from "@prisma/client";
import { SLOT_ORDER } from "./slot";
import { kstWeekdayDates } from "./date";

export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금"] as const;

export interface WeekPlan {
  planId: string;
  studentNo: string;
  name: string;
  classroom: string;
  /** KST 기준 YYYY-MM-DD */
  date: string;
  slot: StudySlot;
  state: AttState;
}

export interface WeekCell {
  planId: string;
  date: string;
  slot: StudySlot;
  state: AttState;
}

export interface WeekRow {
  studentNo: string;
  name: string;
  classroom: string;
  /** 슬롯별 월~금 5칸. 참여 계획이 없는 칸은 null. */
  cells: Record<StudySlot, Array<WeekCell | null>>;
}

function emptyCells(): Record<StudySlot, Array<WeekCell | null>> {
  const rec = {} as Record<StudySlot, Array<WeekCell | null>>;
  for (const s of SLOT_ORDER) rec[s] = [null, null, null, null, null];
  return rec;
}

export interface StudentInfo {
  studentNo: string;
  name: string;
  classroom: string;
}

/** 참여 계획을 학생 행 × (슬롯 × 월~금) 매트릭스로 변환한다. 반→학번 순 정렬.
 * allStudents 목록이 제공되면 참여 계획이 없는 학생도 행에 포함된다. */
export function buildWeekMatrix(
  monday: string,
  plans: WeekPlan[],
  allStudents?: StudentInfo[],
): WeekRow[] {
  const dates = kstWeekdayDates(monday);
  const dateIndex = new Map(dates.map((d, i) => [d, i] as const));
  const rowByStudent = new Map<string, WeekRow>();

  if (allStudents) {
    for (const s of allStudents) {
      rowByStudent.set(s.studentNo, {
        studentNo: s.studentNo,
        name: s.name,
        classroom: s.classroom,
        cells: emptyCells(),
      });
    }
  }

  for (const p of plans) {
    const di = dateIndex.get(p.date);
    if (di === undefined) continue; // 그 주(월~금) 밖이면 제외
    let row = rowByStudent.get(p.studentNo);
    if (!row) {
      row = {
        studentNo: p.studentNo,
        name: p.name,
        classroom: p.classroom,
        cells: emptyCells(),
      };
      rowByStudent.set(p.studentNo, row);
    }
    row.cells[p.slot][di] = {
      planId: p.planId,
      date: p.date,
      slot: p.slot,
      state: p.state,
    };
  }

  return Array.from(rowByStudent.values()).sort((a, b) =>
    a.classroom === b.classroom
      ? a.studentNo.localeCompare(b.studentNo)
      : a.classroom.localeCompare(b.classroom),
  );
}

// 엑셀/표 셀에 찍는 기호. 빈칸(계획 없음)과 "○"(참여 예정, 미체크)를 구분한다.
export const ATT_MARK: Record<AttState, string> = {
  UNCHECKED: "○",
  PRESENT: "출",
  LATE: "지",
  LEAVE_EARLY: "조",
  ABSENT: "결",
  EXCUSED: "인",
};

export function attendanceMark(state: AttState): string {
  return ATT_MARK[state];
}

// attendanceMark의 역변환. 이전에 내려받아 표시를 채운 출결표를 다시 업로드할 때
// 셀 기호(○/출/지/조/결/인)를 상태로 되돌린다. 알 수 없는 기호는 null.
const STATE_BY_MARK: Record<string, AttState> = Object.fromEntries(
  (Object.entries(ATT_MARK) as Array<[AttState, string]>).map(([state, mark]) => [
    mark,
    state,
  ]),
) as Record<string, AttState>;

export function parseAttendanceMark(text: string): AttState | null {
  return STATE_BY_MARK[text.trim()] ?? null;
}

// 주간 표에서 셀을 누를 때 상태 순환: 미체크→출석→결석→인정→미체크.
// 세부 상태(지각/조퇴)는 일일 화면에서 기록되며, 여기선 누르면 미체크로 되돌린다.
export function nextCellState(current: AttState): AttState {
  switch (current) {
    case "UNCHECKED":
      return "PRESENT";
    case "PRESENT":
      return "ABSENT";
    case "ABSENT":
      return "EXCUSED";
    case "EXCUSED":
    case "LATE":
    case "LEAVE_EARLY":
      return "UNCHECKED";
  }
}

// ── 엑셀 내보내기: 설문(제출내역) 원본과 동일한 양식 ─────────────────────────
// 정보 6열(순번/학번/이름/연락처/제출시간/수정시간) + 슬롯 그룹 × 월~금 + 합계 행.
export const SURVEY_INFO_HEADERS = [
  "순번",
  "학번",
  "이름",
  "연락처",
  "제출시간",
  "수정시간",
] as const;

export const SURVEY_SLOT_HEADERS: Record<StudySlot, string> = {
  OJA: "1. 오자 참여 요일",
  YAJA: "2. 야자 참여 요일",
  SIMJA: "3. 심자 참여 요일",
};

export interface CellMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface SurveySheet {
  aoa: Array<Array<string | number>>;
  merges: CellMerge[];
}

/** 주간 매트릭스를 설문(제출내역) 원본과 같은 양식의 시트 데이터로 만든다. */
export function buildSurveyStyleSheet(rows: WeekRow[]): SurveySheet {
  const INFO = SURVEY_INFO_HEADERS.length; // 6
  const DAYS = WEEKDAY_LABELS.length; // 5

  const top: Array<string | number> = [...SURVEY_INFO_HEADERS];
  const sub: Array<string | number> = SURVEY_INFO_HEADERS.map(() => "");
  for (const slot of SLOT_ORDER) {
    top.push(SURVEY_SLOT_HEADERS[slot]);
    for (let i = 1; i < DAYS; i++) top.push("");
    for (const wd of WEEKDAY_LABELS) sub.push(wd);
  }

  const aoa: Array<Array<string | number>> = [top, sub];

  rows.forEach((row, idx) => {
    const line: Array<string | number> = [idx + 1, row.studentNo, row.name, "", "", ""];
    for (const slot of SLOT_ORDER) {
      for (let i = 0; i < DAYS; i++) {
        const cell = row.cells[slot][i] ?? null;
        line.push(cell ? attendanceMark(cell.state) : "");
      }
    }
    aoa.push(line);
  });

  // 합계 행: 열별 참여 인원(계획이 있는 학생 수).
  const totalRowIndex = aoa.length;
  const totals: Array<string | number> = ["합계", "", "", "", "", ""];
  for (const slot of SLOT_ORDER) {
    for (let i = 0; i < DAYS; i++) {
      let count = 0;
      for (const row of rows) if (row.cells[slot][i]) count += 1;
      totals.push(count);
    }
  }
  aoa.push(totals);

  const merges: CellMerge[] = [];
  for (let c = 0; c < INFO; c++) merges.push({ s: { r: 0, c }, e: { r: 1, c } });
  SLOT_ORDER.forEach((_, gi) => {
    const start = INFO + gi * DAYS;
    merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + DAYS - 1 } });
  });
  merges.push({ s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: INFO - 1 } });

  return { aoa, merges };
}

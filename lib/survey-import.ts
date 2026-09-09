// 학교 설문(구글폼) 제출내역 xlsx를 앱 참여계획으로 파싱한다.
// - "제출내역"(매트릭스): 슬롯별 월~금 열에 "1" 표기 = 참여.
// - "제출내역_텍스트": 슬롯 셀에 요일 텍스트(콤마/개행) = 참여.
// 설문에는 실제 날짜가 없으므로 기준 주의 월요일(weekMonday)로 요일→날짜를 환산한다.

import * as XLSX from "xlsx";
import type { AttState, StudySlot } from "@prisma/client";
import { parseAttendanceMark } from "./weekly-attendance";

export interface SurveyPlanRow {
  studentNo: string;
  name: string;
  classroom: string;
  /** KST 기준 YYYY-MM-DD */
  date: string;
  slot: StudySlot;
  /** 셀에 적힌 출결 표시에서 읽은 상태. 표시가 없으면 UNCHECKED(참여 예정). */
  state: AttState;
}

export interface SurveyStudentDetail {
  studentNo: string;
  /** 설문 정보열(연락처/제출시간/수정시간)에서 읽은 값. 없으면 빈 문자열. */
  contact: string;
  surveySubmittedAt: string;
  surveyUpdatedAt: string;
}

export interface SurveyParseResult {
  rows: SurveyPlanRow[];
  /** 중복 제거로 걸러진 레코드 수 */
  duplicateRows: number;
  /** 중복 제거 전 추출 레코드 수 */
  rawRows: number;
  /** 명부가 다루는 슬롯(헤더에 존재하는 오자/야자/심자). 주간 교체 범위 산정에 쓴다. */
  slots: StudySlot[];
  /** 학생별 정보열(연락처/제출/수정시간). 교사용 내부 상세에만 저장. */
  students: SurveyStudentDetail[];
}

const SLOT_KEYWORD_TO_ENUM: Record<string, StudySlot> = {
  오자: "OJA",
  야자: "YAJA",
  심자: "SIMJA",
};

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function isFilled(value: unknown): boolean {
  const t = cellText(value);
  return t !== "" && t !== "0";
}

// 학번 20901 → "2학년 9반" (학년1 + 반n + 번호2)
export function deriveClassroom(studentNo: string): string {
  const digits = studentNo.replace(/\D/g, "");
  if (digits.length >= 5) {
    const grade = digits.slice(0, 1);
    const cls = String(parseInt(digits.slice(1, digits.length - 2), 10));
    return `${grade}학년 ${cls}반`;
  }
  return "";
}

function addDaysIso(baseIso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function weekdayToDate(day: string, weekMonday: string): string | null {
  const idx = WEEKDAYS.indexOf(day.trim() as (typeof WEEKDAYS)[number]);
  if (idx === -1) return null;
  return addDaysIso(weekMonday, idx);
}

function slotKeywordOf(headerCell: string): StudySlot | null {
  for (const key of Object.keys(SLOT_KEYWORD_TO_ENUM)) {
    if (headerCell.includes(key)) return SLOT_KEYWORD_TO_ENUM[key]!;
  }
  return null;
}

type Grid = unknown[][];

function readGrid(sheet: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
}

function findHeaderRow(grid: Grid): number {
  return grid.findIndex(
    (r) => r.map(cellText).includes("학번") && r.map(cellText).includes("이름"),
  );
}

function columnIndex(headerRow: unknown[], label: string): number {
  return headerRow.map(cellText).indexOf(label);
}

function extractRecords(
  grid: Grid,
  weekMonday: string,
): { rows: SurveyPlanRow[]; slots: StudySlot[]; students: SurveyStudentDetail[] } {
  const headerRowIdx = findHeaderRow(grid);
  if (headerRowIdx === -1) return { rows: [], slots: [], students: [] };

  const headerRow = grid[headerRowIdx] ?? [];
  const noCol = columnIndex(headerRow, "학번");
  const nameCol = columnIndex(headerRow, "이름");
  if (noCol === -1 || nameCol === -1) return { rows: [], slots: [], students: [] };
  const contactCol = columnIndex(headerRow, "연락처");
  const submittedCol = columnIndex(headerRow, "제출시간");
  const updatedCol = columnIndex(headerRow, "수정시간");

  // 매트릭스의 요일 서브헤더 행은 학번/이름 칸이 비어 있다. 텍스트 형식의 첫 데이터 행
  // (요일 텍스트가 든)이 매트릭스로 오인되지 않도록 이 조건을 함께 확인한다.
  const subHeader = grid[headerRowIdx + 1] ?? [];
  const subHeaderHasStudent =
    cellText(subHeader[noCol]) !== "" || cellText(subHeader[nameCol]) !== "";
  const hasWeekdayRow =
    !subHeaderHasStudent &&
    subHeader.map(cellText).some((c) => (WEEKDAYS as readonly string[]).includes(c));

  // 헤더에서 오자/야자/심자 키워드 위치로 슬롯 그룹을 구성한다.
  const groups: Array<{
    slot: StudySlot;
    dayCols: Array<{ col: number; day: string }>;
    textCol: number;
  }> = [];
  headerRow.forEach((cell, col) => {
    const slot = slotKeywordOf(cellText(cell));
    if (!slot) return;
    if (hasWeekdayRow) {
      // 매트릭스: 이 헤더 뒤로 이어지는 요일 서브헤더 열을 모은다.
      const dayCols: Array<{ col: number; day: string }> = [];
      let c = col;
      while (c < subHeader.length) {
        const day = cellText(subHeader[c]);
        const nextIsNewGroup =
          c !== col && slotKeywordOf(cellText(headerRow[c])) !== null;
        if (nextIsNewGroup) break;
        if ((WEEKDAYS as readonly string[]).includes(day)) dayCols.push({ col: c, day });
        else if (c !== col) break;
        c += 1;
      }
      groups.push({ slot, dayCols, textCol: -1 });
    } else {
      // 텍스트: 셀 안에 요일 문자열이 들어있다.
      groups.push({ slot, dayCols: [], textCol: col });
    }
  });

  const dataStart = hasWeekdayRow ? headerRowIdx + 2 : headerRowIdx + 1;
  const out: SurveyPlanRow[] = [];
  const studentDetails = new Map<string, SurveyStudentDetail>();
  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const studentNo = cellText(row[noCol]);
    const name = cellText(row[nameCol]);
    if (!studentNo || !name) continue;
    const classroom = deriveClassroom(studentNo);

    if (!studentDetails.has(studentNo)) {
      studentDetails.set(studentNo, {
        studentNo,
        contact: contactCol >= 0 ? cellText(row[contactCol]) : "",
        surveySubmittedAt: submittedCol >= 0 ? cellText(row[submittedCol]) : "",
        surveyUpdatedAt: updatedCol >= 0 ? cellText(row[updatedCol]) : "",
      });
    }

    for (const g of groups) {
      if (g.textCol >= 0) {
        const days = cellText(row[g.textCol])
          .split(/[\s,/·]+/)
          .map((d) => d.trim())
          .filter(Boolean);
        for (const day of days) {
          const date = weekdayToDate(day, weekMonday);
          if (date)
            out.push({ studentNo, name, classroom, date, slot: g.slot, state: "UNCHECKED" });
        }
      } else {
        for (const { col, day } of g.dayCols) {
          const raw = cellText(row[col]);
          if (!isFilled(raw)) continue;
          const date = weekdayToDate(day, weekMonday);
          if (date)
            out.push({
              studentNo,
              name,
              classroom,
              date,
              slot: g.slot,
              state: parseAttendanceMark(raw) ?? "UNCHECKED",
            });
        }
      }
    }
  }
  const slots = Array.from(new Set(groups.map((g) => g.slot)));
  return { rows: out, slots, students: Array.from(studentDetails.values()) };
}

/** 워크북이 설문(오자/야자/심자 헤더) 형식인지 판별한다. */
export function isSurveyWorkbook(workbook: XLSX.WorkBook): boolean {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const grid = readGrid(sheet);
    const headerRowIdx = findHeaderRow(grid);
    if (headerRowIdx === -1) continue;
    const headerRow = (grid[headerRowIdx] ?? []).map(cellText);
    if (headerRow.some((c) => slotKeywordOf(c) !== null)) return true;
  }
  return false;
}

/** 설문 워크북을 파싱한다. 참여 기록이 잡히는 첫 시트를 사용한다(매트릭스 우선). */
export function parseSurveyWorkbook(
  workbook: XLSX.WorkBook,
  weekMonday: string,
): SurveyParseResult {
  let records: SurveyPlanRow[] = [];
  let slots: StudySlot[] = [];
  let students: SurveyStudentDetail[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const found = extractRecords(readGrid(sheet), weekMonday);
    if (found.rows.length > 0) {
      records = found.rows;
      slots = found.slots;
      students = found.students;
      break;
    }
  }

  const seen = new Set<string>();
  const unique: SurveyPlanRow[] = [];
  for (const rec of records) {
    const key = `${rec.studentNo}|${rec.date}|${rec.slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rec);
  }

  return {
    rows: unique,
    duplicateRows: records.length - unique.length,
    rawRows: records.length,
    slots,
    students,
  };
}

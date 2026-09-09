// 실제 학교 설문(구글폼) 제출내역 xlsx → 앱 임포트 양식(학번·이름·반·날짜·구분)으로 변환한다.
//
// 배경
// - 학교 원본은 학생이 요일(월~금)별로 오자/야자/심자 참여를 표기한 "제출내역" 형태다.
// - 앱 임포트 양식(app/teacher/imports/actions.ts)은 한 행 = (학번,이름,반,날짜,구분) 이며
//   `구분` 허용값은 오자/야자/심자다. 원본에는 반·실제 날짜가 없어 아래 규칙으로 보완한다.
//
// 실행: pnpm convert:survey [입력.xlsx] [출력.xlsx]
//   기본 입력  = ~/Downloads/샘플.xlsx
//   기본 출력  = 입력 파일명 + "_임포트변환.xlsx"

import * as XLSX from "xlsx";
import * as os from "os";
import * as path from "path";

// ── 편집 포인트 1) 슬롯 매핑 ───────────────────────────────────────────────
// 원본과 앱 모델(StudySlot) 모두 오자/야자/심자 3종이므로 그대로 매핑한다.
const SLOT_MAP: Record<"오자" | "야자" | "심자", "오자" | "야자" | "심자"> = {
  오자: "오자",
  야자: "야자",
  심자: "심자",
};

// ── 편집 포인트 2) 대상 주간(요일 → 실제 날짜) ────────────────────────────
// 설문은 요일만 있으므로 기준 주의 월요일을 지정한다. 화~금은 여기서 +1~+4일.
const TARGET_WEEK_MONDAY = "2026-08-31"; // YYYY-MM-DD (월요일)

// ── 상수 ──────────────────────────────────────────────────────────────────
const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
const SLOT_ORDER = ["오자", "야자", "심자"] as const;
const OUT_HEADER = ["학번", "이름", "반", "날짜", "구분"] as const;

interface PlanRow {
  studentNo: string;
  name: string;
  classroom: string;
  date: string;
  slot: string;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function isFilled(value: unknown): boolean {
  const t = cellText(value);
  return t !== "" && t !== "0";
}

// 학번 20901 → "2학년 9반" (학년1 + 반2 + 번호2 = 5자리 가정)
function deriveClassroom(studentNo: string): string {
  const digits = studentNo.replace(/\D/g, "");
  if (digits.length >= 5) {
    const grade = digits.slice(0, 1);
    const cls = String(parseInt(digits.slice(1, digits.length - 2), 10));
    return `${grade}학년 ${cls}반`;
  }
  return "";
}

function addDaysIso(baseIso: string, days: number): string {
  const parts = baseIso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function weekdayToDate(day: string): string | null {
  const idx = WEEKDAYS.indexOf(day.trim() as (typeof WEEKDAYS)[number]);
  if (idx === -1) return null;
  return addDaysIso(TARGET_WEEK_MONDAY, idx);
}

function slotKeywordOf(headerCell: string): keyof typeof SLOT_MAP | null {
  for (const key of Object.keys(SLOT_MAP) as Array<keyof typeof SLOT_MAP>) {
    if (headerCell.includes(key)) return key;
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

// 설문 시트(매트릭스 또는 텍스트) 한 장에서 참여 기록을 추출한다.
function extractRecords(grid: Grid): PlanRow[] {
  const headerRowIdx = findHeaderRow(grid);
  if (headerRowIdx === -1) return [];

  const headerRow = grid[headerRowIdx] ?? [];
  const noCol = columnIndex(headerRow, "학번");
  const nameCol = columnIndex(headerRow, "이름");
  if (noCol === -1 || nameCol === -1) return [];

  const subHeader = grid[headerRowIdx + 1] ?? [];
  const hasWeekdayRow = subHeader
    .map(cellText)
    .some((c) => (WEEKDAYS as readonly string[]).includes(c));

  // 슬롯 그룹 구성: 헤더에서 오자/야자/심자 키워드 위치를 찾는다.
  const groups: Array<{ slot: string; dayCols: Array<{ col: number; day: string }>; textCol: number }> = [];
  headerRow.forEach((cell, col) => {
    const keyword = slotKeywordOf(cellText(cell));
    if (!keyword) return;
    const slot = SLOT_MAP[keyword]!;
    if (hasWeekdayRow) {
      // 매트릭스: 이 헤더 뒤로 요일 서브헤더가 이어지는 열들을 모은다.
      const dayCols: Array<{ col: number; day: string }> = [];
      let c = col;
      while (c < subHeader.length) {
        const day = cellText(subHeader[c]);
        const nextIsNewGroup = c !== col && slotKeywordOf(cellText(headerRow[c])) !== null;
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
  const out: PlanRow[] = [];

  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const studentNo = cellText(row[noCol]);
    const name = cellText(row[nameCol]);
    if (!studentNo || !name) continue;
    const classroom = deriveClassroom(studentNo);

    for (const g of groups) {
      if (g.textCol >= 0) {
        const days = cellText(row[g.textCol])
          .split(/[\s,/·]+/)
          .map((d) => d.trim())
          .filter(Boolean);
        for (const day of days) {
          const date = weekdayToDate(day);
          if (date) out.push({ studentNo, name, classroom, date, slot: g.slot });
        }
      } else {
        for (const { col, day } of g.dayCols) {
          if (!isFilled(row[col])) continue;
          const date = weekdayToDate(day);
          if (date) out.push({ studentNo, name, classroom, date, slot: g.slot });
        }
      }
    }
  }
  return out;
}

function dedupeAndSort(records: PlanRow[]): PlanRow[] {
  const seen = new Set<string>();
  const unique: PlanRow[] = [];
  for (const rec of records) {
    const key = `${rec.studentNo}|${rec.date}|${rec.slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rec);
  }
  unique.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const sa = SLOT_ORDER.indexOf(a.slot as (typeof SLOT_ORDER)[number]);
    const sb = SLOT_ORDER.indexOf(b.slot as (typeof SLOT_ORDER)[number]);
    if (sa !== sb) return sa - sb;
    return a.studentNo.localeCompare(b.studentNo);
  });
  return unique;
}

function main(): void {
  const inputPath =
    process.argv[2] ?? path.join(os.homedir(), "Downloads", "샘플.xlsx");
  const outputPath =
    process.argv[3] ??
    path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}_임포트변환.xlsx`,
    );

  const wb = XLSX.readFile(inputPath, { cellDates: true });

  // 여러 시트 중 참여 기록이 잡히는 첫 시트를 사용한다(매트릭스 우선).
  let records: PlanRow[] = [];
  let usedSheet = "";
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const found = extractRecords(readGrid(sheet));
    if (found.length > 0) {
      records = found;
      usedSheet = name;
      break;
    }
  }

  if (records.length === 0) {
    console.error(
      "변환할 참여 기록을 찾지 못했습니다. 헤더에 학번/이름과 오자/야자/심자 열이 있는지 확인하세요.",
    );
    process.exit(1);
  }

  const finalRecords = dedupeAndSort(records);
  const aoa: (string | number)[][] = [
    [...OUT_HEADER],
    ...finalRecords.map((r) => [r.studentNo, r.name, r.classroom, r.date, r.slot]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, ws, "임포트");
  XLSX.writeFile(outWb, outputPath);

  // 요약 출력
  const perSlot = new Map<string, number>();
  const perDate = new Map<string, number>();
  const students = new Set<string>();
  for (const r of finalRecords) {
    perSlot.set(r.slot, (perSlot.get(r.slot) ?? 0) + 1);
    perDate.set(r.date, (perDate.get(r.date) ?? 0) + 1);
    students.add(r.studentNo);
  }

  console.log("── 설문 → 임포트 양식 변환 완료 ─────────────────────");
  console.log("입력 :", inputPath, `(시트: ${usedSheet})`);
  console.log("출력 :", outputPath);
  console.log("기준 주(월) :", TARGET_WEEK_MONDAY);
  console.log(
    "슬롯 매핑 :",
    Object.entries(SLOT_MAP)
      .map(([k, v]) => `${k}→${v}`)
      .join(", "),
  );
  console.log("학생 수 :", students.size, "/ 참여행 :", finalRecords.length);
  console.log(
    "슬롯별 :",
    [...perSlot.entries()].map(([k, v]) => `${k}=${v}`).join(", "),
  );
  console.log(
    "날짜별 :",
    [...perDate.entries()].sort().map(([k, v]) => `${k}=${v}`).join(", "),
  );
}

main();

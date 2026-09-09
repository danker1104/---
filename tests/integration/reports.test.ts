import { describe, it, expect, beforeEach } from "vitest";

import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { parseKstDateString } from "@/lib/date";
import { loadReport, loadDetailedRows } from "@/app/teacher/reports/report-data";
import { GET as downloadXlsx } from "@/app/teacher/reports/download/xlsx/route";
import { resetDb } from "./helpers";
import type { AttState, StudySlot } from "@prisma/client";

async function makePlanWithState(opts: {
  studentNo: string;
  name: string;
  classroom: string;
  date: string;
  slot: StudySlot;
  state: AttState;
}): Promise<void> {
  const student = await prisma.student.upsert({
    where: { studentNo: opts.studentNo },
    update: {},
    create: { studentNo: opts.studentNo, name: opts.name, classroom: opts.classroom },
  });
  await prisma.participationPlan.create({
    data: {
      student: { connect: { id: student.id } },
      date: parseKstDateString(opts.date),
      slot: opts.slot,
      importBatch: {
        create: { fileName: "t.xlsx", rowCount: 1, errorCount: 0, actor: "teacher" },
      },
      attendance: { create: { state: opts.state } },
    },
  });
}

const RANGE = { from: "2026-09-01", to: "2026-09-30", slot: "ALL" as const };

beforeEach(async () => {
  await resetDb();
});

describe("리포트 통합 (T-6)", () => {
  it("T-6.1 참석률 = (PRESENT+LATE+LEAVE_EARLY)/처리완료 × 100", async () => {
    const base = { studentNo: "20260101", name: "김민준", classroom: "2학년 1반", slot: "YAJA" as StudySlot };
    await makePlanWithState({ ...base, date: "2026-09-01", state: "PRESENT" });
    await makePlanWithState({ ...base, date: "2026-09-02", state: "LATE" });
    await makePlanWithState({ ...base, date: "2026-09-03", state: "ABSENT" });

    const { rows } = await loadReport(RANGE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.total).toBe(3);
    expect(rows[0]?.rate).toBe(66.7);
  });

  it("처리 완료 대상 0(전부 미체크/인정결석) → 참석률 '-'", async () => {
    const base = { studentNo: "20260102", name: "이서연", classroom: "2학년 1반", slot: "YAJA" as StudySlot };
    await makePlanWithState({ ...base, date: "2026-09-01", state: "UNCHECKED" });
    await makePlanWithState({ ...base, date: "2026-09-02", state: "EXCUSED" });

    const { rows } = await loadReport(RANGE);
    expect(rows[0]?.rate).toBe("-");
  });

  it("슬롯 시계열(series) 집계", async () => {
    await makePlanWithState({ studentNo: "20260101", name: "김민준", classroom: "2학년 1반", date: "2026-09-01", slot: "YAJA", state: "PRESENT" });
    await makePlanWithState({ studentNo: "20260102", name: "이서연", classroom: "2학년 1반", date: "2026-09-01", slot: "YAJA", state: "ABSENT" });

    const { series } = await loadReport(RANGE);
    const point = series.find((s) => s.date === "2026-09-01" && s.slot === "YAJA");
    expect(point?.processed).toBe(2);
    expect(point?.attended).toBe(1);
    expect(point?.rate).toBe(50);
  });

  it("슬롯 필터 적용 → 해당 슬롯만 집계", async () => {
    await makePlanWithState({ studentNo: "20260101", name: "김민준", classroom: "2학년 1반", date: "2026-09-01", slot: "YAJA", state: "PRESENT" });
    await makePlanWithState({ studentNo: "20260101", name: "김민준", classroom: "2학년 1반", date: "2026-09-01", slot: "SIMJA", state: "ABSENT" });

    const { rows } = await loadReport({ from: "2026-09-01", to: "2026-09-30", slot: "YAJA" });
    expect(rows[0]?.total).toBe(1);
    expect(rows[0]?.present).toBe(1);
  });

  it("T-6.4/T-6.5 상세행은 화이트리스트 열만 포함(연락처·건강정보 없음)", async () => {
    await makePlanWithState({ studentNo: "20260101", name: "김민준", classroom: "2학년 1반", date: "2026-09-01", slot: "YAJA", state: "ABSENT" });

    const rows = await loadDetailedRows(RANGE);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ["absenceNote", "checkIn", "checkOut", "classroom", "date", "name", "slot", "state", "studentNo"].sort(),
    );
  });

  it("결과 Excel 매트릭스 시트 = 학생×날짜·슬롯 교차표(셀=상태)", async () => {
    await makePlanWithState({ studentNo: "20260101", name: "김민준", classroom: "2학년 1반", date: "2026-09-01", slot: "OJA", state: "PRESENT" });
    await makePlanWithState({ studentNo: "20260101", name: "김민준", classroom: "2학년 1반", date: "2026-09-01", slot: "YAJA", state: "ABSENT" });
    await makePlanWithState({ studentNo: "20260102", name: "이서연", classroom: "2학년 1반", date: "2026-09-02", slot: "SIMJA", state: "LATE" });

    const res = await downloadXlsx(
      new Request("http://localhost/x?from=2026-09-01&to=2026-09-30&slot=ALL"),
    );
    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    expect(wb.SheetNames).toContain("매트릭스");

    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["매트릭스"]!, {
      header: 1,
      defval: "",
    });
    // 헤더: 날짜·슬롯은 날짜 오름차순, 같은 날짜는 오자→야자→심자 순서.
    expect(grid[0]).toEqual([
      "학번", "이름", "반", "2026-09-01 오자", "2026-09-01 야자", "2026-09-02 심자",
    ]);
    const kim = grid.find((r) => r[0] === "20260101") ?? [];
    expect([kim[3], kim[4], kim[5] ?? ""]).toEqual(["출석", "결석", ""]);
    const lee = grid.find((r) => r[0] === "20260102") ?? [];
    expect([lee[3] ?? "", lee[4] ?? "", lee[5]]).toEqual(["", "", "지각"]);
  });
});

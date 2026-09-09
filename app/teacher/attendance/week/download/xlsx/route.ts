import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import {
  formatKstDate,
  kstTodayString,
  kstWeekMonday,
  kstWeekdayDates,
  parseKstDateString,
} from "@/lib/date";
import {
  buildSurveyStyleSheet,
  buildWeekMatrix,
  SURVEY_INFO_HEADERS,
  type WeekPlan,
} from "@/lib/weekly-attendance";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mParam = url.searchParams.get("monday");
  const base = mParam && DATE_RE.test(mParam) ? mParam : kstTodayString();
  const monday = kstWeekMonday(base);
  const dates = kstWeekdayDates(monday);

  const [allStudents, plansRaw] = await Promise.all([
    prisma.student.findMany({
      where: { active: true },
      select: { studentNo: true, name: true, classroom: true },
      orderBy: [{ classroom: "asc" }, { studentNo: "asc" }],
    }),
    prisma.participationPlan.findMany({
      where: { date: { in: dates.map((d) => parseKstDateString(d)) } },
      include: { student: true, attendance: true },
    }),
  ]);

  const plans: WeekPlan[] = plansRaw.map((p) => ({
    planId: p.id,
    studentNo: p.student.studentNo,
    name: p.student.name,
    classroom: p.student.classroom,
    date: formatKstDate(p.date),
    slot: p.slot,
    state: p.attendance?.state ?? "UNCHECKED",
  }));
  const rows = buildWeekMatrix(monday, plans, allStudents);

  // 설문(제출내역) 원본과 동일한 셀 구조(헤더·요일·병합)를 유지하되, 샘플처럼
  // 테두리·가운데정렬·헤더 음영을 입혀 요일/참여요일 두 줄이 또렷이 구분되게 한다.
  const { aoa, merges } = buildSurveyStyleSheet(rows);
  const INFO = SURVEY_INFO_HEADERS.length; // 6
  const COLS = aoa[0]?.length ?? INFO; // 6 + 3*5 = 21
  const totalRowIndex = aoa.length; // 1-based 마지막 행(합계)

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`주간출결(${monday})`, {
    views: [{ state: "frozen", xSplit: INFO, ySplit: 2 }],
  });

  aoa.forEach((row) => ws.addRow(row));
  for (const m of merges) {
    ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
  }

  const thin = { style: "thin" as const, color: { argb: "FFB0B0B0" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF7" },
  };
  const totalFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F2F2" },
  };

  for (let r = 1; r <= totalRowIndex; r++) {
    const isHeader = r <= 2;
    const isTotal = r === totalRowIndex;
    for (let c = 1; c <= COLS; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (isHeader) {
        cell.font = { bold: true };
        cell.fill = headerFill;
      } else if (isTotal) {
        cell.font = { bold: true };
        cell.fill = totalFill;
      }
    }
  }
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 20;

  const widths = [6, 9, 9, 11, 12, 12]; // 순번/학번/이름/연락처/제출시간/수정시간
  for (let c = 1; c <= COLS; c++) {
    ws.getColumn(c).width = c <= INFO ? (widths[c - 1] ?? 10) : 5;
  }

  const legend = wb.addWorksheet("범례");
  legend.addRows([
    ["기호", "의미"],
    ["○", "미체크(참여 예정)"],
    ["출", "출석"],
    ["지", "지각"],
    ["조", "조퇴"],
    ["결", "결석"],
    ["인", "인정결석"],
    ["(빈칸)", "해당 슬롯 미참여"],
  ]);
  legend.getRow(1).font = { bold: true };
  legend.getColumn(1).width = 8;
  legend.getColumn(2).width = 18;

  const buf = await wb.xlsx.writeBuffer();
  const asciiName = `weekly_attendance_${monday}.xlsx`;
  const utf8Name = encodeURIComponent(`주간출결_${monday}.xlsx`);
  return new NextResponse(buf as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}

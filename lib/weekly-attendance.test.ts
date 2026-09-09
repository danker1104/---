import { describe, expect, it } from "vitest";
import {
  attendanceMark,
  buildSurveyStyleSheet,
  buildWeekMatrix,
  nextCellState,
  parseAttendanceMark,
  type WeekPlan,
} from "./weekly-attendance";

const MONDAY = "2026-08-31"; // 월

function plan(partial: Partial<WeekPlan> & Pick<WeekPlan, "studentNo" | "date" | "slot">): WeekPlan {
  return {
    planId: `${partial.studentNo}-${partial.date}-${partial.slot}`,
    name: partial.name ?? "홍길동",
    classroom: partial.classroom ?? "2학년 9반",
    state: partial.state ?? "UNCHECKED",
    ...partial,
  };
}

describe("buildWeekMatrix — 학생 × 요일 매트릭스", () => {
  it("참여 계획을 슬롯·요일 칸에 배치한다", () => {
    const rows = buildWeekMatrix(MONDAY, [
      plan({ studentNo: "20903", name: "박화원", date: "2026-09-02", slot: "OJA" }), // 수
      plan({ studentNo: "20901", name: "김화원", date: "2026-09-03", slot: "YAJA", state: "PRESENT" }), // 목
    ]);

    expect(rows).toHaveLength(2);
    // 반→학번 정렬: 20901 먼저
    expect(rows[0]?.studentNo).toBe("20901");
    // 김화원 야자 목(index 3)
    expect(rows[0]?.cells.YAJA[3]?.state).toBe("PRESENT");
    // 박화원 오자 수(index 2)
    expect(rows[1]?.cells.OJA[2]?.planId).toBe("20903-2026-09-02-OJA");
    // 계획 없는 칸은 null
    expect(rows[0]?.cells.OJA[0]).toBeNull();
  });

  it("그 주(월~금) 밖의 날짜는 제외한다", () => {
    const rows = buildWeekMatrix(MONDAY, [
      plan({ studentNo: "20901", date: "2026-09-07", slot: "OJA" }), // 다음 주 월
    ]);
    expect(rows).toHaveLength(0);
  });

  it("한 학생의 여러 슬롯·요일을 한 행에 모은다", () => {
    const rows = buildWeekMatrix(MONDAY, [
      plan({ studentNo: "20902", date: "2026-09-02", slot: "SIMJA" }), // 수
      plan({ studentNo: "20902", date: "2026-09-04", slot: "OJA" }), // 금
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.SIMJA[2]).not.toBeNull();
    expect(rows[0]?.cells.OJA[4]).not.toBeNull();
  });

  it("allStudents 목록이 전달되면 계획이 없는 학생도 행에 포함된다", () => {
    const all = [
      { studentNo: "20901", name: "김화원", classroom: "2학년 9반" },
      { studentNo: "20902", name: "이화원", classroom: "2학년 9반" },
      { studentNo: "20903", name: "박화원", classroom: "2학년 9반" },
    ];
    // 이화원만 계획이 있는 상황
    const rows = buildWeekMatrix(
      MONDAY,
      [plan({ studentNo: "20902", date: "2026-09-02", slot: "SIMJA" })],
      all,
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.studentNo)).toEqual(["20901", "20902", "20903"]);
    expect(rows[0]?.cells.YAJA[0]).toBeNull(); // 계획 없는 칸은 null
    expect(rows[1]?.cells.SIMJA[2]?.state).toBe("UNCHECKED"); // 계획 있는 칸
  });
});

describe("nextCellState — 셀 클릭 순환", () => {
  it("미체크→출석→결석→인정→미체크", () => {
    expect(nextCellState("UNCHECKED")).toBe("PRESENT");
    expect(nextCellState("PRESENT")).toBe("ABSENT");
    expect(nextCellState("ABSENT")).toBe("EXCUSED");
    expect(nextCellState("EXCUSED")).toBe("UNCHECKED");
  });

  it("지각/조퇴는 누르면 미체크로 되돌린다", () => {
    expect(nextCellState("LATE")).toBe("UNCHECKED");
    expect(nextCellState("LEAVE_EARLY")).toBe("UNCHECKED");
  });
});

describe("attendanceMark — 셀 기호", () => {
  it("상태별 기호를 돌려준다", () => {
    expect(attendanceMark("UNCHECKED")).toBe("○");
    expect(attendanceMark("PRESENT")).toBe("출");
    expect(attendanceMark("ABSENT")).toBe("결");
    expect(attendanceMark("EXCUSED")).toBe("인");
  });
});

describe("parseAttendanceMark — 기호 → 상태 (역변환)", () => {
  it("attendanceMark의 각 기호를 원래 상태로 되돌린다", () => {
    expect(parseAttendanceMark("○")).toBe("UNCHECKED");
    expect(parseAttendanceMark("출")).toBe("PRESENT");
    expect(parseAttendanceMark("지")).toBe("LATE");
    expect(parseAttendanceMark("조")).toBe("LEAVE_EARLY");
    expect(parseAttendanceMark("결")).toBe("ABSENT");
    expect(parseAttendanceMark("인")).toBe("EXCUSED");
  });

  it("공백은 무시하고, 알 수 없는 기호는 null", () => {
    expect(parseAttendanceMark(" 출 ")).toBe("PRESENT");
    expect(parseAttendanceMark("1")).toBeNull();
    expect(parseAttendanceMark("")).toBeNull();
    expect(parseAttendanceMark("X")).toBeNull();
  });
});

describe("buildSurveyStyleSheet — 설문(제출내역) 양식", () => {
  const all = [
    { studentNo: "20901", name: "김화원", classroom: "2학년 9반" },
    { studentNo: "20902", name: "이화원", classroom: "2학년 9반" },
    { studentNo: "20903", name: "박화원", classroom: "2학년 9반" },
  ];

  it("학생당 정확히 한 행이며, 순번·합계 행과 병합을 포함한다", () => {
    const rows = buildWeekMatrix(
      MONDAY,
      [
        plan({ studentNo: "20902", date: "2026-09-02", slot: "SIMJA", state: "PRESENT" }), // 수
        plan({ studentNo: "20902", date: "2026-09-04", slot: "OJA", state: "ABSENT" }), // 금
      ],
      all,
    );
    const { aoa, merges } = buildSurveyStyleSheet(rows);

    // 헤더 2줄 + 학생 3명 + 합계 1줄 = 6행
    expect(aoa).toHaveLength(6);
    // Row 0: 정보 6열 + 슬롯 그룹 헤더
    expect(aoa[0]?.slice(0, 6)).toEqual(["순번", "학번", "이름", "연락처", "제출시간", "수정시간"]);
    expect(aoa[0]?.[6]).toBe("1. 오자 참여 요일");
    expect(aoa[0]?.[11]).toBe("2. 야자 참여 요일");
    expect(aoa[0]?.[16]).toBe("3. 심자 참여 요일");
    // Row 1: 월~금 서브헤더 (오자 그룹)
    expect(aoa[1]?.slice(6, 11)).toEqual(["월", "화", "수", "목", "금"]);

    // 학생 행은 정확히 3개(학번은 중복 없음)
    const studentNos = aoa.slice(2, 5).map((r) => r[1]);
    expect(studentNos).toEqual(["20901", "20902", "20903"]);
    // 순번은 1,2,3
    expect(aoa.slice(2, 5).map((r) => r[0])).toEqual([1, 2, 3]);

    // 이화원(2행째, idx=3): 오자 금(idx10)=결, 심자 수(idx18)=출
    const leeRow = aoa[3]!;
    expect(leeRow[10]).toBe("결"); // 오자 금 ABSENT
    expect(leeRow[18]).toBe("출"); // 심자 수 PRESENT

    // 합계 행
    const totalRow = aoa[5]!;
    expect(totalRow[0]).toBe("합계");
    expect(totalRow[10]).toBe(1); // 오자 금 참여 1명
    expect(totalRow[18]).toBe(1); // 심자 수 참여 1명

    // 병합: 정보 6열 수직 + 슬롯 3그룹 가로 + 합계 라벨 = 6+3+1 = 10
    expect(merges).toHaveLength(10);
  });
});

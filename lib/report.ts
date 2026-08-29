export type AttStateValue =
  | "UNCHECKED"
  | "PRESENT"
  | "LATE"
  | "LEAVE_EARLY"
  | "ABSENT"
  | "EXCUSED";

// AC-7.3, T-6.1 참석률 = (PRESENT + LATE + LEAVE_EARLY) / 처리 완료 대상 수 × 100
// EXCUSED는 분모 제외, UNCHECKED는 처리 완료 대상에서 제외
export function computeAttendanceRate(
  states: readonly AttStateValue[],
): number | "-" {
  let attended = 0;
  let processed = 0;
  for (const s of states) {
    if (s === "UNCHECKED" || s === "EXCUSED") continue;
    processed += 1;
    if (s === "PRESENT" || s === "LATE" || s === "LEAVE_EARLY") attended += 1;
  }
  if (processed === 0) return "-";
  return Math.round((attended / processed) * 1000) / 10;
}

export interface StudentSummary {
  total: number;
  present: number;
  late: number;
  leaveEarly: number;
  absent: number;
  excused: number;
  unchecked: number;
  rate: number | "-";
}

// AC-7.2 학생별 지표
export function summarizeStudent(
  states: readonly AttStateValue[],
): StudentSummary {
  const counts = {
    present: 0,
    late: 0,
    leaveEarly: 0,
    absent: 0,
    excused: 0,
    unchecked: 0,
  };
  for (const s of states) {
    switch (s) {
      case "PRESENT":
        counts.present += 1;
        break;
      case "LATE":
        counts.late += 1;
        break;
      case "LEAVE_EARLY":
        counts.leaveEarly += 1;
        break;
      case "ABSENT":
        counts.absent += 1;
        break;
      case "EXCUSED":
        counts.excused += 1;
        break;
      case "UNCHECKED":
        counts.unchecked += 1;
        break;
    }
  }
  return {
    total: states.length,
    ...counts,
    rate: computeAttendanceRate(states),
  };
}

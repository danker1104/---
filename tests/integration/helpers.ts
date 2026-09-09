import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";

export const SLOT_DEFAULTS = [
  { slot: "OJA", startTime: "07:40", endTime: "08:20", lateThresholdMinutes: 10 },
  { slot: "YAJA", startTime: "19:00", endTime: "21:00", lateThresholdMinutes: 10 },
  { slot: "SIMJA", startTime: "21:10", endTime: "22:40", lateThresholdMinutes: 10 },
] as const;

export async function seedSlots(): Promise<void> {
  for (const s of SLOT_DEFAULTS) {
    await prisma.slotConfig.upsert({
      where: { slot: s.slot },
      update: { ...s, active: true },
      create: { ...s, active: true },
    });
  }
}

// 각 테스트 사이 모든 데이터를 비우고 슬롯 기본값만 다시 심는다(외래키 순서 준수).
export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.participationPlan.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.calendarException.deleteMany();
  await prisma.student.deleteMany();
  await prisma.slotConfig.deleteMany();
  await seedSlots();
}

// 임포트 양식(학번/이름/반/날짜/구분) 행 배열을 xlsx File로 만든다.
export function makeExcelFile(
  rows: Array<Array<string | number>>,
  fileName = "test.xlsx",
): File {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buf)], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function importFormData(file: File): FormData {
  const fd = new FormData();
  fd.set("file", file);
  return fd;
}

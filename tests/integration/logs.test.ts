import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { kstDateFromParts } from "@/lib/date";
import { loadAuditLogs, loadImportBatches } from "@/app/teacher/logs/log-data";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

async function addLog(opts: {
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: string;
  at?: Date;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: "teacher",
      action: opts.action,
      targetType: opts.targetType ?? "Attendance",
      targetId: opts.targetId ?? "t1",
      meta: opts.meta ?? null,
      ...(opts.at ? { at: opts.at } : {}),
    },
  });
}

describe("운영 기록 조회 통합 (T-9)", () => {
  it("T-9.1 활동 로그를 최신순으로 반환한다", async () => {
    await addLog({ action: "CHECK_IN", at: kstDateFromParts("2026-09-01", "09:00") });
    await addLog({ action: "MARK_ABSENT", at: kstDateFromParts("2026-09-03", "09:00") });
    await addLog({ action: "SLOT_UPDATE", at: kstDateFromParts("2026-09-02", "09:00") });

    const { rows, total } = await loadAuditLogs({ page: 1, pageSize: 30 });

    expect(total).toBe(3);
    expect(rows.map((r) => r.action)).toEqual(["MARK_ABSENT", "SLOT_UPDATE", "CHECK_IN"]);
  });

  it("T-9.2 액션 종류 필터를 적용하면 해당 액션만 반환한다", async () => {
    await addLog({ action: "CHECK_IN" });
    await addLog({ action: "CHECK_IN" });
    await addLog({ action: "IMPORT_BATCH", targetType: "ImportBatch" });

    const { rows, total } = await loadAuditLogs({ action: "CHECK_IN", page: 1, pageSize: 30 });

    expect(total).toBe(2);
    expect(rows.every((r) => r.action === "CHECK_IN")).toBe(true);
  });

  it("T-9.3 날짜 범위 필터는 범위 내 로그만 반환한다", async () => {
    await addLog({ action: "CHECK_IN", targetId: "before", at: kstDateFromParts("2026-09-01", "12:00") });
    await addLog({ action: "CHECK_IN", targetId: "inside", at: kstDateFromParts("2026-09-05", "12:00") });
    await addLog({ action: "CHECK_IN", targetId: "after", at: kstDateFromParts("2026-09-10", "12:00") });

    const { rows, total } = await loadAuditLogs({
      from: "2026-09-03",
      to: "2026-09-07",
      page: 1,
      pageSize: 30,
    });

    expect(total).toBe(1);
    expect(rows[0]?.targetId).toBe("inside");
  });

  it("T-9.3 종료일 당일 로그도 범위에 포함된다(경계)", async () => {
    await addLog({ action: "CHECK_IN", targetId: "endday", at: kstDateFromParts("2026-09-07", "23:30") });

    const { total } = await loadAuditLogs({
      from: "2026-09-03",
      to: "2026-09-07",
      page: 1,
      pageSize: 30,
    });

    expect(total).toBe(1);
  });

  it("페이지네이션: pageSize로 나누고 totalPages를 계산한다", async () => {
    for (let i = 0; i < 5; i += 1) {
      await addLog({ action: "CHECK_IN", targetId: `p${i}`, at: kstDateFromParts("2026-09-01", `1${i}:00`) });
    }

    const first = await loadAuditLogs({ page: 1, pageSize: 2 });
    expect(first.total).toBe(5);
    expect(first.totalPages).toBe(3);
    expect(first.rows).toHaveLength(2);

    const last = await loadAuditLogs({ page: 3, pageSize: 2 });
    expect(last.page).toBe(3);
    expect(last.rows).toHaveLength(1);

    // 범위를 벗어난 페이지는 마지막 페이지로 보정한다.
    const overflow = await loadAuditLogs({ page: 99, pageSize: 2 });
    expect(overflow.page).toBe(3);
  });

  it("T-9.4 업로드 이력(ImportBatch)을 최신순으로 반환한다", async () => {
    await prisma.importBatch.create({
      data: { fileName: "old.xlsx", rowCount: 10, errorCount: 1, actor: "teacher", importedAt: kstDateFromParts("2026-09-01", "09:00") },
    });
    await prisma.importBatch.create({
      data: { fileName: "new.xlsx", rowCount: 20, errorCount: 0, actor: "teacher", importedAt: kstDateFromParts("2026-09-05", "09:00") },
    });

    const batches = await loadImportBatches(20);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.fileName).toBe("new.xlsx");
    expect(batches[1]?.fileName).toBe("old.xlsx");
  });
});

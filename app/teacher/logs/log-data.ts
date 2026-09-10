import type { AuditLog, ImportBatch, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseKstDateString, isoAddDays } from "@/lib/date";

export interface AuditLogFilter {
  from?: string;
  to?: string;
  action?: string;
  page: number;
  pageSize: number;
}

export interface AuditLogPage {
  rows: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 업로드 이력(ImportBatch)을 최신순으로 조회한다. */
export async function loadImportBatches(limit = 20): Promise<ImportBatch[]> {
  return prisma.importBatch.findMany({
    orderBy: { importedAt: "desc" },
    take: limit,
  });
}

/** 활동 로그(AuditLog)를 필터·페이지네이션과 함께 최신순으로 조회한다. */
export async function loadAuditLogs(filter: AuditLogFilter): Promise<AuditLogPage> {
  const where: Prisma.AuditLogWhereInput = {};
  if (filter.action) where.action = filter.action;

  const at: Prisma.DateTimeFilter = {};
  if (filter.from) at.gte = parseKstDateString(filter.from);
  if (filter.to) at.lt = parseKstDateString(isoAddDays(filter.to, 1));
  if (at.gte !== undefined || at.lt !== undefined) where.at = at;

  const pageSize = Math.max(1, filter.pageSize);
  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filter.page), totalPages);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { at: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return { rows, total, page, pageSize, totalPages };
}

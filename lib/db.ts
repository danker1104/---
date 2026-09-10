import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Vercel 배포 파일시스템은 읽기 전용(/tmp 제외)이라, 빌드 시 만든 SQLite 파일을 /tmp로 복사해 써야 함
// (콜드스타트마다 초기화되는 데모용 임시 저장소 — 영구 저장이 필요하면 Postgres 등으로 전환 필요)
function resolveRuntimeDatabaseUrl(): string | undefined {
  if (!process.env.VERCEL) return undefined;
  const tmpDb = "/tmp/app.db";
  if (!existsSync(tmpDb)) {
    const bundledDb = path.join(process.cwd(), "data", "app.db");
    if (existsSync(bundledDb)) copyFileSync(bundledDb, tmpDb);
  }
  return `file:${tmpDb}`;
}

const runtimeUrl = resolveRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(runtimeUrl ? { datasources: { db: { url: runtimeUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

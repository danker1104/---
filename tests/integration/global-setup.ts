import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TEST_DB_URL = "file:./data/test-integration.db";
const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(here, "../../prisma/data/test-integration.db");

// 통합 테스트 시작 전 스키마를 새 테스트 DB에 반영한다.
export default function setup(): void {
  for (const f of [dbFile, `${dbFile}-journal`]) {
    try {
      rmSync(f);
    } catch {
      // 파일이 없으면 무시
    }
  }
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });
}

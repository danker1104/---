import { execSync } from "node:child_process";

const TEST_DB_URL = "postgresql://postgres:postgres@localhost:55432/yaja_simja?schema=test_integration";

// 통합 테스트 시작 전 전용 PostgreSQL 스키마를 초기화한다.
export default function setup(): void {
  execSync("pnpm exec prisma db push --skip-generate --force-reset", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
  });
}

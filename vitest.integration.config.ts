import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "tests/e2e/**"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // 통합 테스트는 전용 SQLite 파일을 사용해 dev DB를 건드리지 않는다.
    env: {
      DATABASE_URL: "file:./data/test-integration.db",
      NODE_ENV: "test",
      TZ: "Asia/Seoul",
    },
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});

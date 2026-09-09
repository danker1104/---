import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        // 서버 시작 전에 전용 e2e DB를 새로 만들고 스키마 반영 + 슬롯 시드까지 끝낸다.
        command:
          "rm -f prisma/data/e2e.db prisma/data/e2e.db-journal && pnpm exec prisma db push --skip-generate --accept-data-loss && pnpm exec tsx prisma/seed.ts && pnpm exec next dev -p 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          TZ: "Asia/Seoul",
          DATABASE_URL: "file:./data/e2e.db",
        },
      },
});

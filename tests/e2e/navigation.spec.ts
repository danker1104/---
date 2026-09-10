import { test, expect } from "@playwright/test";

// 각 교사 화면이 서버에서 정상 렌더되는지 확인하는 스모크 (라우팅 + SSR + DB 접근).
const PAGES: Array<{ path: string; text: string | RegExp }> = [
  { path: "/teacher/attendance", text: "일일 출결 체크" },
  { path: "/teacher/imports", text: /Excel 파일/ },
  { path: "/teacher/slots", text: "야자" },
  { path: "/teacher/calendar", text: "등록/갱신" },
  { path: "/teacher/reports", text: "리포트" },
  { path: "/teacher/logs", text: "운영 기록" },
];

for (const p of PAGES) {
  test(`${p.path} 렌더링`, async ({ page }) => {
    const res = await page.goto(p.path);
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByText(p.text).first()).toBeVisible();
  });
}

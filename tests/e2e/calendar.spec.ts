import { test, expect } from "@playwright/test";

// T-3.4 UI: 예외일을 등록하면 목록에 남고(새로고침 후에도) 성공 메시지가 뜬다.
test("캘린더 예외일 등록 후 지속", async ({ page }) => {
  await page.goto("/teacher/calendar");

  await page.locator('input[name="date"]').fill("2030-12-25");
  await page.getByRole("button", { name: "등록/갱신" }).click();

  await expect(page.getByText("등록되었습니다.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("2030-12-25").first()).toBeVisible();
});

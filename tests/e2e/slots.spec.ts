import { test, expect } from "@playwright/test";

// T-3.1 UI: 슬롯 시간을 저장하면 성공 메시지가 표시된다.
test("야자 슬롯 시간 저장", async ({ page }) => {
  await page.goto("/teacher/slots");

  const form = page.locator("form").filter({ hasText: "야자" }).first();
  await form.locator('input[name="startTime"]').fill("20:00");
  await form.locator('input[name="endTime"]').fill("22:00");
  await form.getByRole("button", { name: "저장" }).click();

  await expect(page.getByText("저장되었습니다.")).toBeVisible();
});

import { test, expect } from "@playwright/test";

// T-3.4 UI: 예외일을 등록하면 목록에 남고(새로고침 후에도) 성공 메시지가 뜬다.
test("캘린더 예외일 등록 후 지속", async ({ page }) => {
  await page.goto("/teacher/calendar");

  const dateCell = page.getByRole("gridcell").last();
  const dateLabel = await dateCell.getAttribute("aria-label");
  const match = dateLabel?.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/);
  if (!match) throw new Error("달력 날짜 라벨을 읽을 수 없습니다.");
  const selectedDate = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  await dateCell.click();
  await page.getByRole("button", { name: "등록/갱신" }).click();

  await expect(page.getByText("등록되었습니다.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(selectedDate).first()).toBeVisible();
});

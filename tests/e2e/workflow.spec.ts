import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";

// 미래 날짜로 격리 → now < 슬롯 시작 → 입실 시 PRESENT(출석) 판정.
const DATE = "2030-06-03";

function excelBuffer(rows: Array<Array<string>>): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// T-9.1 통합 워크플로: 업로드 → 출결 입실 → 리포트 반영.
test("업로드 → 출결 입실 → 리포트 스모크", async ({ page }) => {
  const buffer = excelBuffer([
    ["학번", "이름", "반", "날짜", "구분"],
    ["20300601", "홍길동", "2학년 1반", DATE, "야자"],
  ]);

  // 1) 명부 업로드
  await page.goto("/teacher/imports");
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await page.getByRole("button", { name: "업로드" }).click();
  await expect(page.getByText("업로드 결과")).toBeVisible();

  // 2) 해당 날짜·슬롯 출결에서 입실 처리 → 출석
  await page.goto(`/teacher/attendance?date=${DATE}&slot=YAJA`);
  await expect(page.getByText("홍길동").first()).toBeVisible();
  await page.getByRole("button", { name: "입실" }).first().click();
  await expect(page.getByText("출석").first()).toBeVisible();

  // 3) 리포트에 반영 (참석률 100)
  await page.goto(`/teacher/reports?from=2030-06-01&to=2030-06-30&slot=YAJA`);
  await expect(page.getByText(/총 대상자: 1건/)).toBeVisible();
  const row = page.getByRole("row", { name: /홍길동/ });
  await expect(row).toContainText("100");
});

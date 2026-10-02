import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineMonthCalendar } from "./InlineMonthCalendar";

describe("InlineMonthCalendar", () => {
  it("달력을 항상 표시하고 날짜를 한 번 눌러 선택한다", () => {
    const onChange = vi.fn();

    render(
      <InlineMonthCalendar
        selectedDates={[]}
        initialMonth="2026-10-01"
        onSelectionChange={onChange}
        holidays={[{ date: "2026-10-05", name: "대체공휴일(개천절)" }]}
      />,
    );

    expect(screen.getByRole("grid", { name: "날짜 선택 달력" })).toBeVisible();
    fireEvent.click(screen.getByRole("gridcell", { name: "2026년 10월 15일 선택" }));
    expect(onChange).toHaveBeenCalledWith(["2026-10-15"]);
    expect(screen.getByRole("gridcell", { name: /2026년 10월 5일.*대체공휴일/ })).toHaveClass("text-red-700");
  });

  it("이전 달과 다음 달로 이동할 수 있다", () => {
    render(
      <InlineMonthCalendar
        selectedDates={[]}
        initialMonth="2026-10-01"
        onSelectionChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText("2026년 9월")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText("2026년 10월")).toBeVisible();
  });

  it("길게 누른 뒤 드래그하면 시작일부터 끝일까지 범위 선택한다", () => {
    vi.useFakeTimers();
    const onSelectionChange = vi.fn();
    render(
      <InlineMonthCalendar
        selectedDates={[]}
        initialMonth="2026-10-01"
        onSelectionChange={onSelectionChange}
      />,
    );

    const start = screen.getByRole("gridcell", { name: "2026년 10월 13일 선택" });
    const end = screen.getByRole("gridcell", { name: "2026년 10월 16일 선택" });
    fireEvent.pointerDown(start, { pointerId: 1, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerEnter(end, { pointerId: 1 });
    fireEvent.pointerUp(end, { pointerId: 1 });

    expect(onSelectionChange).toHaveBeenLastCalledWith([
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    vi.useRealTimers();
  });
});

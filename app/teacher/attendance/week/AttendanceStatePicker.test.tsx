import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttendanceStatePicker } from "./AttendanceStatePicker";

describe("AttendanceStatePicker", () => {
  it("셀을 한 번 누르면 모든 출결 상태를 선택할 수 있다", () => {
    const onSelect = vi.fn();

    render(
      <AttendanceStatePicker
        currentState="PRESENT"
        accessibleLabel="김화원 오자 수요일 출결"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "김화원 오자 수요일 출결: 출석" }));
    expect(screen.getByRole("menu", { name: "출결 상태 선택" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "지각" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "조퇴" })).toBeVisible();
    expect(screen.queryByText("지", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("결", { exact: true })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "인정결석" }));
    expect(onSelect).toHaveBeenCalledWith("EXCUSED");
    expect(screen.queryByRole("menu", { name: "출결 상태 선택" })).not.toBeInTheDocument();
  });

  it("Escape 키로 선택 메뉴를 닫는다", () => {
    render(
      <AttendanceStatePicker
        currentState="UNCHECKED"
        accessibleLabel="이화원 야자 월요일 출결"
        onSelect={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이화원 야자 월요일 출결: 미체크" }));
    fireEvent.keyDown(screen.getByRole("menu", { name: "출결 상태 선택" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("menu", { name: "출결 상태 선택" })).not.toBeInTheDocument();
  });
});

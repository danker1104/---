"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

const NAV: Array<{ href: Route; label: string }> = [
  { href: "/teacher/attendance/week", label: "주간 출결 (엑셀)" },
  { href: "/teacher/attendance", label: "일일 출결" },
  { href: "/teacher/imports", label: "명부 업로드" },
  { href: "/teacher/reports", label: "리포트" },
  { href: "/teacher/slots", label: "슬롯 설정" },
  { href: "/teacher/calendar", label: "캘린더 예외" },
];

export function TeacherHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  // 라우트 변경 시 메뉴 자동 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 바깥 클릭·Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-20 border-b bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div
        ref={ref}
        className="relative mx-auto max-w-5xl px-3 py-2 sm:px-6 sm:py-3"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="teacher-nav"
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
          <Link
            href={"/teacher/attendance/week" as Route}
            className="text-base font-semibold text-slate-900"
          >
            야자·심자 관리
          </Link>
        </div>

        {open && (
          <nav
            id="teacher-nav"
            aria-label="주요 화면"
            className="absolute inset-x-3 top-full z-20 mt-1 overflow-hidden rounded-md border bg-white shadow-lg sm:inset-x-6"
          >
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`block px-4 py-3 text-sm ${
                    active
                      ? "bg-slate-100 font-semibold text-slate-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}

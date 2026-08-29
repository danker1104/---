import Link from "next/link";
import type { Route } from "next";

const NAV: Array<{ href: Route; label: string }> = [
  { href: "/teacher/attendance", label: "출결" },
  { href: "/teacher/imports", label: "명부 업로드" },
  { href: "/teacher/reports", label: "리포트" },
  { href: "/teacher/slots", label: "슬롯 설정" },
  { href: "/teacher/calendar", label: "캘린더 예외" },
];

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-3">
          <Link
            href={"/teacher/attendance" as Route}
            className="text-base font-semibold text-slate-900 sm:text-sm"
          >
            야자·심자 관리
          </Link>
          <nav
            className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 text-sm text-slate-700 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            aria-label="주요 화면"
          >
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 rounded px-3 py-1.5 hover:bg-slate-100 sm:px-2 sm:py-1"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

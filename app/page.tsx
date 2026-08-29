import Link from "next/link";
import type { Route } from "next";

const ROUTES: Array<{ href: Route; label: string; desc: string }> = [
  { href: "/teacher/attendance", label: "/teacher/attendance", desc: "일일 출결 체크" },
  { href: "/teacher/imports", label: "/teacher/imports", desc: "Excel 명부 업로드" },
  { href: "/teacher/reports", label: "/teacher/reports", desc: "주간·월간 리포트, 결과 다운로드" },
  { href: "/teacher/slots", label: "/teacher/slots", desc: "슬롯 시간·지각 기준" },
  { href: "/teacher/calendar", label: "/teacher/calendar", desc: "캘린더 예외 관리" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold">야자·심자 관리 시스템</h1>
      <p className="mt-2 text-sm text-slate-600">
        MVP 초기 부트스트랩 화면입니다. 교사 출결·명부·리포트 화면을
        아래에서 열 수 있습니다.
      </p>

      <section className="mt-8 rounded-md border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">현재 상태</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Next.js 15 App Router 부팅 확인</li>
          <li>Tailwind CSS 로드 확인</li>
          <li>도메인 유틸 단위 테스트 통과 (KST · 지각/조퇴 · 참석률)</li>
          <li>Prisma SQLite 스키마 적용, 기본 슬롯 시드 완료</li>
        </ul>
      </section>

      <section className="mt-6 rounded-md border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">화면 이동</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {ROUTES.map((r) => (
            <li key={r.href} className="flex flex-wrap items-center gap-2">
              <Link
                href={r.href}
                className="rounded bg-slate-100 px-1 font-mono text-slate-800 hover:bg-slate-200"
              >
                {r.label}
              </Link>
              <span className="text-slate-500">— {r.desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

import { prisma } from "@/lib/db";
import { formatKstDate } from "@/lib/date";
import { CalendarManager, type ExceptionRow } from "./CalendarManager";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const rows = await prisma.calendarException.findMany({
    orderBy: { date: "desc" },
  });
  const list: ExceptionRow[] = rows.map((r) => ({
    id: r.id,
    date: formatKstDate(r.date),
    reason: r.reason,
    memo: r.memo,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">캘린더 예외 관리</h1>
      <p className="text-sm text-slate-600">
        휴일·시험일 등을 등록하면 이후 Excel 업로드에서 해당 날짜 행은 대상자로 생성되지 않습니다.
        이미 대상자가 있는 날짜를 등록하면 감사 로그에 기록되고 경고가 표시됩니다.
      </p>
      <CalendarManager rows={list} />
    </div>
  );
}

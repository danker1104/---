import { ImportsForm } from "./ImportsForm";

export const dynamic = "force-dynamic";

export default function ImportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Excel 명부 업로드</h1>
      <p className="text-sm text-slate-600">
        Excel 파일을 업로드하면 학생·날짜·슬롯별 출결 대상자가 생성됩니다.
        기존 출결 기록은 자동 삭제되지 않으며, 동일 학생·날짜·슬롯은 중복 생성되지 않습니다.
      </p>
      <ImportsForm />
    </div>
  );
}

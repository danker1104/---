"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getStudentDetailAction, updateStudentDetailAction } from "./actions";

// 전화번호 입력 시 한국 번호 형식으로 하이픈을 자동 삽입한다(010→010-1234-5678, 02→서울).
// 11자리를 넘겨 입력하면 이후 숫자는 4자리씩 이어 붙여 최대 50자까지 작성할 수 있다.
function formatPhone(raw: string): string {
  const all = raw.replace(/\D/g, "").slice(0, 40);
  const d = all.slice(0, 11);
  let base: string;
  if (d.startsWith("02")) {
    if (d.length <= 2) base = d;
    else if (d.length <= 5) base = `${d.slice(0, 2)}-${d.slice(2)}`;
    else if (d.length <= 9) base = `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    else base = `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  } else if (d.length <= 3) {
    base = d;
  } else if (d.length <= 7) {
    base = `${d.slice(0, 3)}-${d.slice(3)}`;
  } else {
    base = `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
  }
  const tail = all.slice(11);
  return tail ? `${base}-${(tail.match(/.{1,4}/g) ?? []).join("-")}` : base;
}

interface Props {
  studentNo: string;
  name: string;
  classroom: string;
  onClose: () => void;
}

export function StudentDetailDialog({ studentNo, name, classroom, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState("");
  // 전화번호: 직접 '-'를 입력하면 수동, 모두 지우면 자동으로 되돌린다.
  // 빠른 입력에도 흔들리지 않도록 직전 값/모드를 ref로 관리한다.
  const phoneRef = useRef<{ value: string; manual: boolean }>({ value: "", manual: false });
  const [submittedAt, setSubmittedAt] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getStudentDetailAction(studentNo)
      .then((d) => {
        if (!alive || !d) return;
        setContact(d.contact);
        phoneRef.current = { value: d.contact, manual: false };
        setSubmittedAt(d.surveySubmittedAt);
        setUpdatedAt(d.surveyUpdatedAt);
      })
      .catch(() => {
        if (alive) setError("정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [studentNo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    setError(null);
    startSaving(async () => {
      const res = await updateStudentDetailAction({
        studentNo,
        contact,
        surveySubmittedAt: submittedAt,
        surveyUpdatedAt: updatedAt,
      });
      if (!res.ok) {
        setError(res.message ?? "저장에 실패했습니다.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  // '-'를 직접 입력하면 수동 모드로 전환하고, 값을 모두 지우면 다시 자동 포맷으로 되돌린다.
  function handleContactChange(input: string) {
    const prev = phoneRef.current;
    const digits = (s: string) => s.replace(/\D/g, "");
    const dashes = (s: string) => (s.match(/-/g) ?? []).length;
    let value: string;
    let manual: boolean;
    if (input === "") {
      value = "";
      manual = false;
    } else if (prev.manual) {
      value = input;
      manual = true;
    } else if (digits(input) === digits(prev.value) && dashes(input) > dashes(prev.value)) {
      value = input;
      manual = true;
    } else {
      value = formatPhone(input);
      manual = false;
    }
    phoneRef.current = { value, manual };
    setContact(value);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} 학생 상세`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{name}</h2>
            <p className="text-xs text-slate-500">
              <span className="font-mono">{studentNo}</span> · {classroom}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">연락처</span>
              <input
                type="text"
                inputMode="tel"
                maxLength={50}
                value={contact}
                onChange={(e) => handleContactChange(e.target.value)}
                placeholder="예: 010-1234-5678"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">제출시간</span>
              <input
                type="text"
                value={submittedAt}
                onChange={(e) => setSubmittedAt(e.target.value)}
                placeholder="예: 2026-08-27 13:22:55"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">수정시간</span>
              <input
                type="text"
                value={updatedAt}
                onChange={(e) => setUpdatedAt(e.target.value)}
                placeholder="예: 2026-08-27 13:40:00"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>

            <p className="text-xs text-slate-400">
              연락처·제출·수정시간은 교사용 내부 조회에만 쓰이며 결과 Excel·CSV에는 포함되지 않습니다.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-md border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

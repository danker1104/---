import { TeacherHeader } from "./TeacherHeader";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TeacherHeader />
      <main className="mx-auto max-w-5xl px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 sm:pb-[max(2rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}

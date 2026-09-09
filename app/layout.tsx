import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "야자·심자 관리",
  description: "교사용 야자·심자 출결 관리 (MVP)",
  applicationName: "야자·심자 관리",
  // 학번·날짜 숫자를 iOS Safari가 전화번호로 자동 링크하지 않도록 한다.
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    title: "야자·심자 관리",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

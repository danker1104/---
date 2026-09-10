import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

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
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        <PwaRegister />
      </body>
    </html>
  );
}

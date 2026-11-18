import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "업무나침반 · 팀 업무 진행·업무일지·보고서",
  description:
    "단계별 업무 진행 보드, 두 달 보기 공유 업무일정, 회의록과 미참석자 확인, 업무일지와 결재, 개인·연간 보고서 인쇄까지 한 곳에서 관리하는 팀 업무 플랫폼입니다.",
  applicationName: "업무나침반",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#18786f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

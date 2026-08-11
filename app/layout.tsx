import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "연도/팀 업무 진행 보드",
  description: "여러 연도와 팀이 함께 쓰는 암호 기반 업무 진행 보드입니다.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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

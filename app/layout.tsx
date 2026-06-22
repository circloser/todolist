import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "팀 진행 체크리스트",
  description: "팀이 함께 보는 업무 단계별 진행 보드입니다.",
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

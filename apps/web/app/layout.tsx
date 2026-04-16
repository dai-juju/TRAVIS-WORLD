import type { ReactNode } from "react";
import "./globals.css";

// TRAVIS 루트 메타데이터. M1.4에서 OG 이미지·타이틀 세분화 예정.
export const metadata = {
  title: "TRAVIS",
  description: "Shape your market",
};

/**
 * 앱 전역 RootLayout.
 * - 다크 테마를 기본값으로 적용 (M1.1 Step 3 UI 결정사항, 옵션 B).
 * - 라이트 테마 지원은 M1.4 이후 운영 피드백 반영 시점에 추가.
 * - "use client" 금지 — 서버 컴포넌트 유지.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>{children}</body>
    </html>
  );
}

import type { ReactNode } from "react";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CanvasStoreProvider } from "@/lib/providers/CanvasStoreProvider";

/**
 * TRAVIS 루트 메타데이터. M1.4 에서 OG 이미지·타이틀 세분화 예정.
 * M1.4 Step 1 — "Shape your market" 슬로건 포함.
 */
export const metadata = {
  title: "TRAVIS — Shape your market",
  description: "암호화폐 트레이더를 위한 다이나믹 UI 플랫폼",
};

/**
 * 앱 전역 RootLayout (M1.4 Step 1 갱신).
 *
 * 구조 설명:
 *   - <html lang="ko" className="dark"> → 다크 테마 기본 (M1.1 결정 + M1.4 Command Deck 톤)
 *   - <TooltipProvider>               → shadcn Tooltip 공통 공급자 (Step 3~5 카드에서 사용)
 *   - <CanvasStoreProvider>           → Zustand 캔버스 스토어 (M1.4 Step 1 신규)
 *
 * Provider 순서 규칙:
 *   Tooltip 은 UI primitive, Canvas 는 application state 라 중첩 순서는
 *   어느 쪽이 바깥이어도 무방. 의미적으로 "앱 상태가 바깥, UI 가 안쪽" 으로 배치.
 *
 * 서버 컴포넌트 유지:
 *   layout.tsx 자체는 RSC. Provider 들은 내부적으로 "use client" 이므로
 *   자동 client boundary 로 처리됨 (Next.js 16 App Router 동작).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>
        <CanvasStoreProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </CanvasStoreProvider>
      </body>
    </html>
  );
}

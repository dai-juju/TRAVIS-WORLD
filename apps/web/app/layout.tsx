import type { ReactNode } from "react";
import { DM_Serif_Display, JetBrains_Mono, Archivo } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CanvasStoreProvider } from "@/lib/providers/CanvasStoreProvider";
import { ChatStoreProvider } from "@/lib/providers/ChatStoreProvider";
import { ToastStoreProvider } from "@/lib/providers/ToastStoreProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { UndoToast } from "@/components/canvas/UndoToast";

/**
 * 폰트 3종 (M1.4 Step 3-1a, 2026-04-21).
 *
 * next/font/google 는 빌드 시 Google Fonts 파일을 self-host 로 다운로드해
 * 런타임 Google Fonts 요청을 제거한다 → CLS 감소 + 프라이버시.
 *
 *   - DM Serif Display (--font-serif): 카드 title · 가격 huge display.
 *     UI-3 레퍼런스의 신문 저널 헤드 톤. regular + italic 2종만 로드.
 *   - JetBrains Mono    (--font-mono) : mono metric · 가격 tabular-nums.
 *     variable font 라 weight 옵션 생략.
 *   - Archivo           (--font-sans) : body · UI 라벨 · 버튼 기본 폰트.
 *     variable font 라 weight 옵션 생략.
 *
 * display: "swap" 은 FOUT 허용(빈 화면 대신 시스템 폰트 먼저 렌더). 저사양
 * Intel UHD 620 + 8GB RAM 환경에서 FOIT 로 인한 LCP 지연을 피하기 위함.
 */
const serif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const sans = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "TRAVIS — Shape your market",
  description: "암호화폐 트레이더를 위한 다이나믹 UI 플랫폼",
};

/**
 * 앱 전역 RootLayout (M1.4 Step 3-1a 갱신).
 *
 * 이전 Step 1 의 `className="dark"` 강제 다크 주입을 해제했다. M1.4 Step 3-1b
 * 에서 도입될 next-themes ThemeProvider 가 사용자 선택에 따라 `class="dark"`
 * 또는 `class="light"` 를 <html> 에 토글한다.
 *
 * suppressHydrationWarning:
 *   next-themes 는 초기 마운트 순간 localStorage 값으로 class 를 교정하는데
 *   이 시점에 SSR 결과(class 없음)와 클라이언트 결과(class="dark") 가 달라져
 *   React hydration warning 이 발생한다. 이는 next-themes 공식 문서에서도
 *   이 정확한 이유로 이 prop 을 반드시 붙이라고 명시한 요구사항이다.
 *
 * Provider 순서 규칙:
 *   Tooltip 은 UI primitive, Canvas 는 application state.
 *   의미적으로 "앱 상태가 바깥, UI 가 안쪽" 으로 배치.
 *
 * 서버 컴포넌트 유지:
 *   layout.tsx 자체는 RSC. Provider 들은 내부적으로 "use client" 이므로
 *   자동 client boundary 로 처리됨 (Next.js 16 App Router 동작).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <ToastStoreProvider>
            <CanvasStoreProvider>
              <ChatStoreProvider>
                <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
              </ChatStoreProvider>
            </CanvasStoreProvider>
            {/* 전역 토스트 레이어 — ToastStoreProvider 내부에 두어 동일 store 인스턴스 구독.
             * Step 4-1 (2026-04-22) 로 ThemeProvider 바로 아래가 아닌 ToastStoreProvider
             * 안으로 이동. canvasStore 가 스토어별 Provider 경계를 두는 원칙과 일치. */}
            <UndoToast />
          </ToastStoreProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

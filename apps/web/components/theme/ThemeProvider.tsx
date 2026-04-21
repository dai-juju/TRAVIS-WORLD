"use client";
/**
 * ThemeProvider — next-themes 공식 래퍼 (M1.4 Step 3-1b, 2026-04-21).
 *
 * 역할:
 *   - <html class="dark"|"light"> 토글을 next-themes 에 위임
 *   - SSR hydration mismatch 방지 (layout.tsx 의 suppressHydrationWarning 과 한 쌍)
 *   - 트레이더 명시 선택 유지 (enableSystem=false — OS 다크 감지 비활성화)
 *
 * 왜 별도 wrapper 인가:
 *   1. next-themes 는 "use client" 컴포넌트. RSC layout.tsx 에서 직접 쓰면
 *      client 경계 선언이 산재돼 지저분해진다 — 이 wrapper 가 그 경계 역할.
 *   2. TRAVIS 고유 옵션(enableSystem=false, defaultTheme='light',
 *      disableTransitionOnChange) 을 한 곳에 고정해 layout.tsx 를 단순화.
 *   3. 별도 스토어(Zustand) 를 만들지 않음 — next-themes 가 이미 localStorage
 *      영속화 + SSR-safe hydration 을 내장한다. 이중 구현은 상태 drift 원인.
 */

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      // 트레이더가 명시적으로 선택하도록 유도 — OS 자동 추적 비활성화.
      // 새벽 세션 시작 시 OS 다크로 전환되면서 캔버스 톤이 휙 바뀌는 것을 방지.
      enableSystem={false}
      // 토글 시 전환 애니메이션 비활성화 — UI-3 sharp-edge 철학과 합치.
      // 색상 플래시 없이 즉시 전환되어 트레이더 컨텍스트 끊김 최소화.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

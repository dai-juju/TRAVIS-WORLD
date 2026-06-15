"use client";
/**
 * ThemeToggle — 좌측 상단 플로팅 테마 전환 버튼 (M1.4 Step 3-1b, 2026-04-21).
 *
 * 위치 결정 근거:
 *   사용자 명시 요구 = 좌측 상단. crypto-trader 자문에서는 트레이더 관행상
 *   우측 상단(Binance / TradingView / Coinglass) 이 빠른 발견성에 유리하다고
 *   관찰됐으나, CLAUDE.md "제품 판단은 사용자 의견 존중" 원칙에 따라 좌측
 *   상단으로 확정. 사용자 피드백에 따라 M1.5+ 에서 재결정 가능.
 *
 * 스타일:
 *   UI-3 hairline 테두리 + mono 9px 라벨 + lucide Sun/Moon 아이콘.
 *   position: absolute + z-40 — 캔버스 <main relative> 기준 좌상단 (M2 테마 C
 *   Step 0 에서 fixed→absolute 전환: 패널 Push 시 캔버스 영역을 따라 추종).
 *
 * Hydration 안전:
 *   next-themes 는 초기 마운트 시점에 localStorage 값으로 class 를 교정하므로
 *   SSR 결과와 첫 클라이언트 렌더 사이에 순간적 mismatch 가 있을 수 있다.
 *   useEffect 로 mounted 플래그를 관리해 마운트 전에는 placeholder 를 렌더
 *   → hydration 완료 후 실제 버튼 노출. 이는 next-themes 공식 가이드의 정석 패턴.
 */

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useIsMounted } from "@/lib/hooks/useIsMounted";

export function ThemeToggle() {
  const mounted = useIsMounted();
  const { theme, setTheme, resolvedTheme } = useTheme();

  // 마운트 전(SSR + 첫 클라이언트 렌더): 크기만 차지하는 placeholder.
  // next-themes 가 이미 class 속성은 설정한 상태라 시각적 끌림은 없고, layout
  // shift 만 방지. useIsMounted 는 React 19 의 set-state-in-effect 규칙과
  // 충돌하지 않는 useSyncExternalStore 기반 패턴(lib/hooks/useIsMounted 참조).
  if (!mounted) {
    return <div aria-hidden className="absolute left-4 top-4 z-40 h-9 w-[88px]" />;
  }

  const isDark = (resolvedTheme ?? theme) === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="absolute left-4 top-4 z-40 flex items-center gap-2 border border-foreground bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isDark ? (
        <Sun className="size-3.5" aria-hidden />
      ) : (
        <Moon className="size-3.5" aria-hidden />
      )}
      <span>{isDark ? "LIGHT" : "DARK"}</span>
    </button>
  );
}

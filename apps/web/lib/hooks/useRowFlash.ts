// apps/web/lib/hooks/useRowFlash.ts
//
// 리스트 행 flash 훅 (M2 테마 A Step 4a, 2026-06-11 — [10-1] 회수 기둥2).
//
// 역할:
//   추적 값(예: last_price, 정렬 기준 metric)이 바뀔 때 행 요소에 0.6초
//   배경 flash 클래스를 붙였다 떼어 "살아있는 느낌" 을 만든다.
//   TickerCard 의 검증된 패턴(TickerCard.tsx — ref + classList, setState 우회로
//   React 19 규칙 준수)을 행 단위로 일반화한 것.
//
// 설계 (저사양 UHD 620 절제):
//   - 애니메이션은 배경색만 (`flash-row-up/down` — 기존 flash-up 의 padding
//     점프는 행 높이를 흔들어 리스트에 부적합 → 전용 클래스).
//   - 신규 진입 행은 flash 없음 (prev 가 없으면 비교 skip — 첫 화면 전체 번쩍 방지).
//   - `prefers-reduced-motion: reduce` 면 전체 skip (모션 민감 사용자 배려,
//     CSS media query 와 이중 방어).

import { useEffect, useRef, type RefObject } from "react";

/** SSR/구형 브라우저 graceful — matchMedia 부재 시 모션 허용으로 간주. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 행 요소 ref 를 반환한다. `value` 가 직전 렌더 대비 증가하면 `flash-row-up`,
 * 감소하면 `flash-row-down` 을 0.6초간 부여.
 *
 * @param value 추적할 숫자 (null/undefined 는 비교 불가 — flash 안 함)
 */
export function useRowFlash<T extends HTMLElement>(
  value: number | null | undefined,
): RefObject<T | null> {
  const elRef = useRef<T>(null);
  const prevRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = elRef.current;
    const current = typeof value === "number" && Number.isFinite(value) ? value : null;
    const prev = prevRef.current;
    prevRef.current = current;

    if (!el || current === null || prev === null || current === prev) return;
    if (prefersReducedMotion()) return;

    const cls = current > prev ? "flash-row-up" : "flash-row-down";
    // 연속 갱신 시 이전 flash 제거 후 재시작 (클래스 잔존 방지).
    el.classList.remove("flash-row-up", "flash-row-down");
    // reflow 강제로 동일 클래스 재부여 시에도 애니메이션 재시작.
    void el.offsetWidth;
    el.classList.add(cls);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      el.classList.remove(cls);
    }, 600);
  }, [value]);

  // unmount cleanup — 타이머 잔존 방지.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return elRef;
}

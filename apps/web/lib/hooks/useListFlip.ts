// apps/web/lib/hooks/useListFlip.ts
//
// 리스트 순위 FLIP 모션 훅 (M2 테마 A Step 4b, 2026-06-11 — [10-1] 회수 기둥2).
//
// 사용법:
//   const tbodyRef = useListFlip(orderKey);   // orderKey = 표시 행 pk 순서 직렬화
//   <tbody ref={tbodyRef}> ... <tr data-flip-key={pk}> ...
//
// 동작: orderKey 가 바뀐 렌더 직후(useLayoutEffect, paint 전) 각 행의 offsetTop
//   을 측정 → 직전 위치와 비교(computeFlipDeltas) → 이동 행을 transform 으로
//   이전 위치에 되돌린 뒤 다음 프레임에 0 으로 슬라이드.
//
// 저사양(UHD 620) 절제:
//   - transform 만 애니메이션 (GPU 합성 경로, layout/paint 미유발).
//   - 행 수 ≤ limit(기본 20) → 측정 비용 flush 당 offsetTop ≤20회.
//   - prefers-reduced-motion 사용자는 전체 skip (CSS 와 이중 방어).
//   - jank 관측 시 이 훅 호출부만 제거하면 4a(flash)와 독립적으로 revert 가능.
//
// ⚠️ 알려진 한계 (frontend 자문 2026-06-11): `<tr>`(display: table-row) 의
//   transform 은 WebKit(Safari) 에서 무시될 수 있고 border-collapse 환경에서
//   브라우저별 렌더 차이가 있다. 미동작 시 모션만 사라지고 위치는 즉시
//   바뀌므로 기능 손실 없는 graceful degrade — Chrome(주 타깃) 라이브 실측이
//   배포 게이트. WebKit 대응(grid 행 전환)은 deferred.

import { useLayoutEffect, useRef, type RefObject } from "react";
import { computeFlipDeltas } from "@/lib/cards/flip";

/** SSR/구형 브라우저 graceful — matchMedia 부재 시 모션 허용으로 간주. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param orderKey 표시 행 순서의 직렬화 키 (예: displayed.map(pk).join("|")).
 *   이 값이 바뀔 때만 측정·애니메이션 실행 — 값 갱신만으로는 동작 안 함.
 */
export function useListFlip(orderKey: string): RefObject<HTMLTableSectionElement | null> {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const prevTopsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody) return;

    const rowEls = Array.from(
      tbody.querySelectorAll<HTMLTableRowElement>("[data-flip-key]"),
    );
    const currentTops = new Map<string, number>();
    for (const el of rowEls) {
      const key = el.dataset.flipKey;
      if (key) currentTops.set(key, el.offsetTop);
    }

    // reduced-motion 이면 위치 기록만 갱신하고 애니메이션 skip.
    if (!prefersReducedMotion()) {
      const deltas = computeFlipDeltas(prevTopsRef.current, currentTops);
      if (deltas.size > 0) {
        // Invert — transition(.flip-row) 을 떼고 이전 위치로 되돌림.
        //   transition 은 인라인이 아니라 .flip-row CSS 클래스가 담당 —
        //   인라인 미정리 잔존 방지 (code-reviewer W1, 2026-06-11).
        for (const el of rowEls) {
          const key = el.dataset.flipKey;
          const delta = key ? deltas.get(key) : undefined;
          if (delta === undefined) continue;
          el.classList.remove("flip-row");
          el.style.transform = `translateY(${delta}px)`;
        }
        // ★ 강제 reflow 1회 — Invert 스타일을 브라우저에 확정 커밋.
        //   단일 rAF 로 Play 를 미루면 브라우저가 두 스타일 변경을 같은 프레임에
        //   배칭해 transition 이 발동하지 않는 고전 함정 (frontend 자문 Critical,
        //   2026-06-11). 저사양에선 double-rAF 보다 이 방식이 결정적.
        void tbody.offsetHeight;
        // Play — transition 클래스 켜고 원위치로 슬라이드.
        for (const el of rowEls) {
          const key = el.dataset.flipKey;
          if (key === undefined || !deltas.has(key)) continue;
          el.classList.add("flip-row");
          el.style.transform = "";
        }
      }
    }

    prevTopsRef.current = currentTops;
  }, [orderKey]);

  return tbodyRef;
}

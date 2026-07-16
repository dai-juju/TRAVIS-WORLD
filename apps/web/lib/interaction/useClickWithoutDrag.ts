"use client";
/**
 * useClickWithoutDrag — "끌었으면 클릭 아님" 가드 (M3-step1, 2026-07-16).
 *
 * 캔버스 위 카드는 React Flow 드래그 대상이라, 클릭 표면에는 `nodrag` 클래스로
 * 드래그를 끄더라도 브라우저 텍스트 선택·미세한 손 떨림이 남는다. pointerdown →
 * pointerup 이동 거리가 임계(4px) 미만일 때만 클릭으로 인정해 오발화(카드를
 * 만지다 원치 않는 spawn)를 막는다 — crypto-trader 자문 "오클릭 = 최대 마찰"
 * + 사용자 채택(2026-07-16) 의 구현체.
 *
 * 사용: handler 가 undefined 면 핸들러 객체도 undefined — 클릭 불가 요소에
 * 리스너를 아예 붙이지 않는다 (spread 시 no-op).
 */
import { useCallback, useRef } from "react";
import type { PointerEvent } from "react";

/** 이 거리(px) 이상 움직였으면 드래그/선택 의도로 판정 — 클릭 미발화. */
const MOVE_THRESHOLD_PX = 4;

export type ClickGuardHandlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
};

export function useClickWithoutDrag(
  handler: (() => void) | undefined,
): ClickGuardHandlers | undefined {
  const downPos = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: PointerEvent) => {
    // 주 버튼(좌클릭/터치)만 — 우클릭·휠클릭은 클릭 후보에서 제외.
    if (e.button !== 0) return;
    downPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const down = downPos.current;
      downPos.current = null;
      if (!down || !handler) return;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (dist < MOVE_THRESHOLD_PX) handler();
    },
    [handler],
  );

  if (!handler) return undefined;
  return { onPointerDown, onPointerUp };
}

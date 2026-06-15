"use client";
/**
 * ShellPanel — 좌/우 슬라이드 패널 래퍼 (M2 테마 C Step 0).
 *
 * 저사양(UHD 620) stutter 차단 핵심 — 2겹 구조:
 *   ┌ <aside> 바깥: 폭을 transition 없이 w-0 ↔ wN 으로 *즉시* 변경.
 *   │   → ReactFlow 컨테이너(flex-1) reflow 가 토글당 단 1회만 발생.
 *   │     (폭에 transition 을 걸면 240ms 동안 매 프레임 ResizeObserver →
 *   │      ReactFlow 재투영 → 저사양 stutter. 그래서 폭은 즉시 변경.)
 *   └ <div> 안쪽: 고정 폭 + transform:translateX 로 슬라이드.
 *       → transform 은 컴포지터(GPU) 레이어 — layout reflow 0. 부드러운 슬라이드.
 *
 * 결과 체감: "캔버스는 한 번에 자리를 내주고, 패널은 스르륵 들어온다."
 * (열림=슬라이드 인 / 닫힘=캔버스 즉시 확장, 패널은 overflow 로 클립되어 사라짐)
 *
 * Step 0 은 골격만 — children 은 placeholder. 실내용은 Step 2(저장 뷰)/Step 3(로그).
 */
import type { ReactNode } from "react";

/** 패널 폭은 store 가 아닌 CSS 상수로 (Tailwind 토큰 일관성 + 직렬화 대상 최소화). */
const PANEL_WIDTH: Record<"left" | "right", string> = {
  left: "w-64", // My Views — 저장 뷰 목록
  right: "w-72", // Session Log — 채팅/AI 로그 (목록이 좀 더 넓음)
};

export function ShellPanel({
  side,
  open,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  children: ReactNode;
}) {
  const widthClass = PANEL_WIDTH[side];
  // 닫힘 시 패널이 빠지는 방향 (좌패널은 왼쪽으로, 우패널은 오른쪽으로).
  const slideHidden =
    side === "left" ? "-translate-x-full" : "translate-x-full";
  const borderSide = side === "left" ? "border-r" : "border-l";

  return (
    <aside
      aria-hidden={!open}
      // 폭: transition 없이 즉시 변경 → 캔버스 reflow 1회. shrink-0 으로 flex 압축 방지.
      className={`z-30 h-full shrink-0 overflow-hidden ${open ? widthClass : "w-0"}`}
    >
      <div
        // 고정 폭 + translateX 슬라이드 (GPU 합성). 200ms 는 저사양에서도 가벼움.
        className={`h-full ${widthClass} ${borderSide} border-foreground/15 bg-background transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : slideHidden
        }`}
      >
        {children}
      </div>
    </aside>
  );
}

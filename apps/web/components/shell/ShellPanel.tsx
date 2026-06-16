"use client";
/**
 * ShellPanel — 좌/우 슬라이드 패널 래퍼 (M2 테마 C Step 0).
 *
 * 저사양(UHD 620) stutter 차단 핵심 — 2겹 + "폭 변경 즉시(단, 닫힘은 지연)":
 *   ┌ <aside> 바깥: 폭을 transition *duration 0* 으로 변경 → 캔버스(flex-1)
 *   │   reflow 가 토글당 단 1회만. (폭에 duration 을 주면 매 프레임 ResizeObserver
 *   │   → ReactFlow 재투영 → 저사양 stutter. 그래서 폭은 항상 *즉시* 바뀜.)
 *   │   ★ 단 닫힘 시에는 width 변경에 `delay-200` 을 줘, 안쪽 슬라이드 아웃이
 *   │   끝난 뒤에 폭이 collapse 되게 한다 (아래 대칭 모션 참조).
 *   └ <div> 안쪽: 고정 폭 + transform:translateX 슬라이드 (GPU 합성, reflow 0).
 *
 * 대칭 모션 (열림 ↔ 닫힘 거울):
 *   - 열림: [폭 즉시 확보(reflow 1회)] → [패널이 빈자리로 슬라이드 인].
 *   - 닫힘: [패널이 먼저 슬라이드 아웃] → [200ms 뒤 폭 collapse(reflow 1회)].
 *   둘 다 "패널이 움직이는 모션"이 보여 부드럽고, 캔버스 reflow 는 각 1회뿐.
 *   (사용자 피드백 2026-06-15: 닫힘이 "뚝" 끊겨 → 지연 collapse 로 대칭화.
 *    폭 애니메이션=매프레임 reflow 를 피하면서 부드러운 닫힘 확보 = `[10-41]` 외.)
 *
 * Step 0 은 골격만 — children 은 placeholder. 실내용은 Step 2(저장 뷰).
 */
import type { ReactNode } from "react";

/** 패널 폭은 store 가 아닌 CSS 상수로 (Tailwind 토큰 일관성 + 직렬화 대상 최소화). */
const PANEL_WIDTH: Record<"left" | "right", string> = {
  left: "w-64", // My Views — 저장 뷰 목록
  right: "w-72", // (예약) 우측 엣지 패널용 — 현재 미사용 (Session Log 폐기 2026-06-15)
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
      // inert={!open} ([10-40] 회수, 2026-06-16): 닫힘 패널은 화면 밖으로 밀려날
      //   뿐(translate-x-full) DOM 에 살아 있다. overflow-hidden 은 포커스를 막지
      //   못하므로, 패널 안에 인터랙티브 요소(Sign in 링크 / Log out 버튼 / 저장
      //   뷰 목록)가 들어온 순간 "aria-hidden 인데 Tab 으로 도달되는" 모순이 된다.
      //   inert 는 시각·포커스·보조기술을 한꺼번에 비활성화 (React 19 boolean prop
      //   정식 지원, 모던 브라우저 2023+ 베이스라인).
      inert={!open}
      // 폭: duration-0(즉시 변경) → 캔버스 reflow 1회. shrink-0 으로 flex 압축 방지.
      //   닫힘일 때만 delay-200 → 안쪽 슬라이드 아웃(200ms)이 끝난 뒤 폭이 collapse.
      //   (열림은 delay 0 = 즉시 폭 확보 후 슬라이드 인.)
      className={`z-30 h-full shrink-0 overflow-hidden transition-[width] duration-0 ${
        open ? widthClass : "w-0 delay-200"
      }`}
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

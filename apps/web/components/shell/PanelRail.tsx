"use client";
/**
 * PanelRail — 가장자리 항상-노출 토글 손잡이 (M2 테마 C Step 0).
 *
 * 왜 코너 아이콘이 아니라 가장자리 세로 rail 인가 (nextjs-frontend 자문):
 *   - 좌상단=ThemeToggle / 좌하단=ReactFlow Controls 가 코너를 점유 → 코너 토글 충돌.
 *   - ReactFlow 는 panOnDrag(빈 공간 드래그=팬). 캔버스 *안쪽* 버튼은 팬 제스처와
 *     충돌. rail 은 캔버스 바깥 가장자리 strip 이라 인터랙션 영역과 물리 분리.
 *
 * 왜 항상 노출 + 라벨인가 (crypto-trader 자문):
 *   기본값이 "닫힘" 이라, 라벨 없는 손잡이면 트레이더가 "저장 뷰가 여기 있다" 를
 *   영영 못 발견할 위험. 세로 라벨("My Views")로 발견성을 디자인으로 확보.
 *
 * footer 슬롯 (M2 테마 C Step 2 / Sub-step 0):
 *   rail 하단에 계정 점(RailAccount) 등 보조 요소를 형제로 배치하기 위한 슬롯.
 *   ★ 중첩 인터랙티브 금지 — 토글이 button 이므로 그 안에 또 다른 클릭 요소를
 *   넣으면 a11y 위반/클릭 충돌. 그래서 rail 루트를 div 컨테이너로 두고 토글
 *   버튼과 footer 를 형제로 분리한다.
 *
 * GPU 비용 0 — 정적 DOM 요소, hover 색 변화만.
 */
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PanelRail({
  side,
  label,
  open,
  onToggle,
  footer,
}: {
  side: "left" | "right";
  label: string;
  open: boolean;
  onToggle: () => void;
  /** rail 하단 보조 슬롯 (예: 좌측 RailAccount). 미지정 시 토글만. */
  footer?: ReactNode;
}) {
  // ⚠️ side="right" 분기는 현재 미사용 예약 — 우측 "Session Log" 패널 폐기
  //   (2026-06-15) 후에도 ShellPanel 과 함께 좌/우 범용 프리미티브로 보존
  //   (향후 엣지 패널/메모 카드 `[10-43]` 재사용 여지).
  const borderSide = side === "left" ? "border-r" : "border-l";
  // 화살표는 "이 버튼을 누르면 일어날 일" 방향을 가리킨다.
  //   좌 rail: 닫힘→오른쪽(열림 방향) / 열림→왼쪽(닫힘 방향)
  //   우 rail: 닫힘→왼쪽 / 열림→오른쪽
  const Icon =
    side === "left"
      ? open
        ? ChevronLeft
        : ChevronRight
      : open
        ? ChevronRight
        : ChevronLeft;

  return (
    <div
      className={`z-40 flex h-full w-7 shrink-0 flex-col ${borderSide} border-foreground/15 bg-background`}
    >
      {/* 토글 버튼 — rail 대부분을 차지 (flex-1). 클릭=패널 개폐. */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? `Collapse ${label} panel` : `Expand ${label} panel`}
        aria-expanded={open}
        title={label}
        className="flex flex-1 flex-col items-center gap-3 pt-4 text-foreground/75 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span className="select-none font-mono text-[10px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">
          {label}
        </span>
      </button>

      {/* 하단 보조 슬롯 (계정 점 등) — 토글과 형제. */}
      {footer ? (
        <div className="flex shrink-0 justify-center pb-3">{footer}</div>
      ) : null}
    </div>
  );
}

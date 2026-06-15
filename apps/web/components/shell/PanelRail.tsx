"use client";
/**
 * PanelRail — 가장자리 항상-노출 토글 손잡이 (M2 테마 C Step 0).
 *
 * 왜 코너 아이콘이 아니라 가장자리 세로 rail 인가 (nextjs-frontend 자문):
 *   - 좌상단=ThemeToggle / 우상단=UserMenu / 좌하단=ReactFlow Controls 가 이미
 *     3개 코너를 점유 → 코너 토글은 충돌.
 *   - ReactFlow 는 panOnDrag(빈 공간 드래그=팬). 캔버스 *안쪽* 버튼은 팬 제스처와
 *     충돌. rail 은 캔버스 바깥 가장자리 strip 이라 인터랙션 영역과 물리 분리.
 *
 * 왜 항상 노출 + 라벨인가 (crypto-trader 자문):
 *   기본값이 "둘 다 닫힘" 이라, 라벨 없는 손잡이면 트레이더가 "저장 뷰가 여기
 *   있다" 를 영영 못 발견할 위험. 세로 라벨("My Views"/"Session Log")로 발견성을
 *   디자인으로 확보 (둘 다 닫힘 결정을 유지하면서).
 *
 * GPU 비용 0 — 정적 DOM 요소 하나, hover 색 변화만.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PanelRail({
  side,
  label,
  open,
  onToggle,
}: {
  side: "left" | "right";
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
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
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? `Collapse ${label} panel` : `Expand ${label} panel`}
      aria-expanded={open}
      title={label}
      className={`z-40 flex h-full w-7 shrink-0 flex-col items-center gap-3 ${borderSide} border-foreground/15 bg-background pt-4 text-foreground/75 transition-colors hover:bg-secondary hover:text-foreground`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="select-none font-mono text-[10px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">
        {label}
      </span>
    </button>
  );
}

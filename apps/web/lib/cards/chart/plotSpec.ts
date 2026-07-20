// apps/web/lib/cards/chart/plotSpec.ts
//
// AI 계약 → "어느 컬럼을 어떻게 플롯하나" 파생 ([10-121] M3-step3b, 2026-07-20).
//
// 4b dynamicColumns 의 차트판 — 표가 "컬럼 = AI filters/sort 참조에서 파생"이듯,
// 차트는 "플롯 시리즈 = AI (filters side, style.breakdown) 참조에서 파생"한다.
// 코드 큐레이션 0: 무엇을 보여줄지는 전부 AI 계약 + descriptor 선언에서 온다.

import type { ChartDescriptor } from "../chartDescriptors";

/** 한 플롯 시리즈의 사양 — 순서가 곧 시리즈/범례/툴팁 순서 (labels 1:1 계약). */
export interface PlotSpec {
  /** 플롯할 실컬럼. */
  field: string;
  /** components 모드 라벨 (단일 모드는 심볼 라벨을 쓰므로 undefined). */
  label?: string;
  /** 시장 영향 방향 → 캔버스/범례 색 (components 모드만). */
  direction?: "up" | "down";
  /** true = 표시층 부호 반전(0 아래 대향). 값 불변 — 툴팁은 원값으로 되돌린다. */
  invert?: boolean;
}

/**
 * (descriptor, AI 계약) → PlotSpec[]. 진리표:
 *
 *   breakdown 미선언           → [valueField]  (기존 7종 — 거동 완전 불변)
 *   side 필터 있음             → [valueField]  (subset 축이 이미 좁힘 — RPC pushdown
 *                                  으로 total ≡ 그 side 합. breakdown 무시 = 스키마
 *                                  describe 의 "Ignored when a filter..." 와 등치)
 *   오버레이(다중 심볼)        → [valueField]  (2심볼×2성분 = 4시리즈 판독 불가 —
 *                                  total 폴백. bars→stepped 자동 전환과 동형의
 *                                  form 픽셀 정책이지 데이터 하드코딩이 아니다)
 *   mode="components"          → components[]  (AI 명시 ?? descriptor 도메인 기본)
 *   mode="total"               → [valueField]
 */
export function resolvePlotSpecs(
  descriptor: ChartDescriptor,
  opts: {
    sideFilter: string | undefined;
    styleBreakdown: "total" | "components" | undefined;
    overlay: boolean;
  },
): PlotSpec[] {
  const single: PlotSpec[] = [{ field: descriptor.valueField }];
  const b = descriptor.breakdown;
  if (!b) return single;
  if (opts.sideFilter) return single;
  if (opts.overlay) return single;
  const mode = opts.styleBreakdown ?? b.default;
  if (mode !== "components") return single;
  return b.components.map((c) => ({
    field: c.field,
    label: c.label,
    direction: c.direction,
    invert: c.invert,
  }));
}

/** components 모드 판정 — 시리즈가 성분 다중일 때만 true (파생값, 별도 상태 없음). */
export function isComponentsMode(specs: readonly PlotSpec[]): boolean {
  return specs.length > 1;
}

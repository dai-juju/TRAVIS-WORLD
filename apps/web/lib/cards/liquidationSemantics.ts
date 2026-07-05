// apps/web/lib/cards/liquidationSemantics.ts
//
// 청산 도메인 시맨틱 단일 진실 (ff#2 재개 Step 4, 2026-07-05 — code-reviewer W1).
//
// 배경: side 라벨/방향색과 notional 농도 스케일이 feedDescriptors(피드)와
//   tableDescriptors(표)에 손 복제돼 "동일 스케일" 주석만으로는 드리프트를 못 막았다
//   (미러 오기 함정). 이건 form-픽셀이 아니라 **청산 도메인 의미**(CLAUDE.md 중심축:
//   "데이터별 표시 의미는 시맨틱 레이어에서 파생")라 한 곳으로 승격 — 두 form 이 import.
//
// 도메인 결정 (ff#2 Step 1 사용자 확정 + canonical-metrics.md §7.2):
//   side 는 "청산 주문"의 방향이라 직관과 반대 — SELL=롱 청산 / BUY=숏 청산.
//   색 = 시장 영향 방향: 롱 청산=하락 압력(down=vermilion) / 숏 청산=상승 압력(up=teal).
//   텍스트 라벨 병기 원칙 — 색만으로 방향 전달 금지 ([3-48] 오독 방지).

import type { MetricTone } from "@/lib/cards/indicatorDescriptors";

/** notional 농도 포화점 (USD) — 이 값 이상이면 풀 농도. first-pass, crypto-trader 라이브 튜닝 대상. */
export const LIQ_NOTIONAL_SATURATION_USD = 5_000_000;

/** side → 배지/셀 텍스트. 미지의 side(공급자 드리프트)는 중립 "LIQ" graceful. */
export function liqSideLabel(side: unknown): string {
  return side === "SELL" ? "LONG LIQ" : side === "BUY" ? "SHORT LIQ" : "LIQ";
}

/** side → 시장 영향 방향 tone. */
export function liqSideTone(side: unknown): MetricTone {
  return side === "SELL" ? "down" : side === "BUY" ? "up" : "neutral";
}

/** notional → 크기 농도 0..1 (null/비수치 = 0 → form 바닥 불투명도로 흐리게). */
export function liqNotionalIntensity(notional: unknown): number {
  return typeof notional === "number" && Number.isFinite(notional)
    ? Math.min(1, notional / LIQ_NOTIONAL_SATURATION_USD)
    : 0;
}

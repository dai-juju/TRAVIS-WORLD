// apps/web/lib/cards/recordCardFormat.ts
//
// 단일-record form(BigValue/Detail)의 form-side 픽셀 매핑 — 순수 함수 (Stage 1b Step 2).
// tableCardFormat/chartFormat 과 같은 층: descriptor 는 의미 신호(tone=방향)만 반환하고,
// 그 신호를 실제 CSS 값으로 번역하는 책임은 form 이 소유한다 (tone/intensity 직교).

import type { MetricTone } from "@/lib/cards/marketSemantics";
import type { RecordRow } from "@/lib/cards/recordDescriptors";

/** tone → CSS 색 변수 (옛 IndicatorCard.toneColor verbatim — neutral 은 흑백). */
export function toneColor(tone: MetricTone): string {
  if (tone === "up") return "var(--up)";
  if (tone === "down") return "var(--down)";
  return "var(--foreground)";
}

/**
 * 제네릭 row 에서 숫자 필드 안전 추출 — flash 비교(raw 값 변동) 입력용.
 * 비숫자/누락은 null (flash 없음으로 graceful).
 */
export function rawNumber(row: RecordRow, key: string | undefined): number | null {
  if (!key) return null;
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** exchange · marketType · symbol 기본 subtitle (옛 두 카드 verbatim 공용화). */
export function defaultRecordSubtitle(d: {
  exchange?: string;
  marketType?: string;
  symbol?: string;
}): string {
  const parts: string[] = [];
  if (d.exchange) parts.push(d.exchange);
  if (d.marketType) parts.push(d.marketType);
  if (d.symbol) parts.push(d.symbol);
  return parts.join(" · ");
}

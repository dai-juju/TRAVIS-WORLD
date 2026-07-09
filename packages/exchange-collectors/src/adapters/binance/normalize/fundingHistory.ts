// ============================================================
// Binance 펀딩 정산 이벤트 raw → HistoryFuturesFundingInsert 변환 (사이클 2 Step 6, 2026-07-09).
//
// 기존 6 metric normalize(historyFutures.ts)와의 차이:
//   - interval 주입 없음 — 펀딩은 interval 버킷 지표가 아니라 **정산 이벤트**
//     (crypto-domain 자문 2026-07-09: 실제 정산 간격은 fundingTime 델타로만 확정,
//      cap/floor 도달 시 8h/4h → 1h 동적 전환 가능 — Binance 2025-05-02 발효).
//   - 자연 키 4축 (exchange, market_type, symbol, funding_time). 정산 1회 = 1행.
//   - marketType 파라미터 — USDM(fapi)/COINM(dapi) 이 동일 raw 구조 공유.
//
// ★ funding_time 폐기 규약 (recorded_at 규약의 funding 판):
//   funding_time 은 자연 키 축 + DB NOT NULL(DEFAULT 없음). fundingTime 누락/이상 시
//   row 폐기(null 반환) — 오염 키 생성 자체가 불가능하게. funding_rate 도 NOT NULL
//   이라 파싱 실패 시 동일 폐기. 반환 타입이 required 라 컴파일러가 강제
//   (_historyHelpers.HistoryRow 패턴 미러, feedback_optional_type_not_discard_defense).
//
// Sanity guard (위생 #5, crypto-domain 자문 2026-07-09):
//   |fundingRate| > 0.03 (±3%) → console.warn (값은 저장 — cap/floor 부근 실존 가능).
//
// raw 스펙 근거 주석: types.ts BinanceFundingRateEvent (공식 문서 2026-07-09 조회).
// ============================================================

import type { HistoryFuturesFundingInsert } from "@travis/data-service";
import type { BinanceFundingRateEvent } from "../types";
import { epochMsToIso, num } from "./_historyHelpers";

/** 펀딩 정산 row 의 market_type — futures 2종만 (spot 은 펀딩 자체가 없음). */
export type FundingMarketType = "futures_usdm" | "futures_coinm";

/** |rate| 경고 임계 (raw decimal). 3% — 통상 cap 부근. 값은 저장, 경고만. */
const FUNDING_RATE_WARN_ABS = 0.03;

/**
 * 정산 이벤트 1건 normalize. fundingTime/fundingRate 이상 시 null (row 폐기).
 * markPrice 는 optional — COINM 문서 미등재라 없으면 null (graceful).
 */
export function normalizeFundingRateEvent(
  raw: BinanceFundingRateEvent,
  marketType: FundingMarketType,
): HistoryFuturesFundingInsert | null {
  const fundingTime = epochMsToIso(raw.fundingTime);
  if (fundingTime === null) return null;
  const rate = num(raw.fundingRate);
  if (rate === null) return null; // NOT NULL 컬럼 — 파싱 실패 row 는 폐기
  if (Math.abs(rate) > FUNDING_RATE_WARN_ABS) {
    console.warn(
      `[normalizeFundingRateEvent] ${raw.symbol} fundingRate=${rate} (|rate|>${FUNDING_RATE_WARN_ABS}) — cap/floor 부근 극단값 의심 (저장은 함)`,
    );
  }
  return {
    exchange: "binance",
    market_type: marketType,
    symbol: raw.symbol,
    funding_time: fundingTime,
    funding_rate: rate,
    mark_price: num(raw.markPrice),
  };
}

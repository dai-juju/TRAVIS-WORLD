// ============================================================
// Binance USDM history fetcher 6종 (M1.8.5 Step 3, 2026-05-31).
//
// 책임:
//   history_futures_indicator 시계열 backfill 의 단일 symbol fetcher.
//   각 fetcher 는 (symbol, period, limit) → 해당 metric 의 normalized row 배열.
//
// 현재 시점 fetcher (BinanceUsdmAdapter) 와의 차이:
//   - now-fetcher 는 symbols[] 전체를 batchPerSymbol 로 순회 (50ms throttle).
//   - history-fetcher 는 **단일 symbol** 의 array 응답만 반환. per-symbol/per-interval
//     순회 + rate limit(150 req/min, D-Q1) 은 Step 4 backfill loop 책임.
//   → 본 파일은 "1 호출 = 1 metric × 1 symbol × 1 interval × N row" 단위로만 단순.
//
// 공통 제약 (crypto-domain-expert 자문 2026-05-31):
//   - 6 endpoint 전부 weight 0 / IP 1000 req/5min / limit 최대 500 (default 30) / 최근 30일.
//   - 위생 #8: 각 endpoint 공식 docs URL 인라인 (아래 각 함수).
//
// normalize 는 normalize/historyFutures.ts 위임 — recorded_at 폐기 규약(null) 정합.
//   fetcher 는 normalize 결과의 null(폐기 row) 을 단일 type-guard 로 필터.
//
// task-record: docs/task-record/M1.8.5-step3-fetchers.md
// ============================================================

import type { FetchResult } from "../IExchangeAdapter.js";
import type { HistoryFuturesIndicatorInsert } from "@travis/data-service";
import { binanceFetch } from "./client.js";
import {
  normalizeUsdmBasisHist,
  normalizeUsdmGlobalLongShortHist,
  normalizeUsdmOpenInterestHist,
  normalizeUsdmTakerLongShortHist,
  normalizeUsdmTopLongShortAccountHist,
  normalizeUsdmTopLongShortPositionHist,
} from "./normalize/historyFutures.js";
import type {
  BinanceHistoryPeriod,
  BinanceUsdmBasis,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterestHist,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "./types.js";

const BASE_URL = "https://fapi.binance.com";

/** normalize 결과의 null(폐기 row) 제거용 제네릭 type-guard (HistoryRow narrow 보존). */
function notNull<T>(row: T | null): row is T {
  return row !== null;
}

/**
 * Open Interest 시계열 — /futures/data/openInterestHist.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics (2026-05-31 조회)
 */
export async function fetchOpenInterestHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmOpenInterestHist[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/openInterestHist",
    query: { symbol, period, limit },
  });
  if (!res.success) return res;
  return {
    success: true,
    data: res.data.map((r) => normalizeUsdmOpenInterestHist(r, period)).filter(notNull),
  };
}

/**
 * Top Trader Long/Short Ratio (Accounts) 시계열 — /futures/data/topLongShortAccountRatio.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio (2026-05-31 조회)
 */
export async function fetchTopLongShortAccountHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmTopLongShortAccount[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/topLongShortAccountRatio",
    query: { symbol, period, limit },
  });
  if (!res.success) return res;
  return {
    success: true,
    data: res.data.map((r) => normalizeUsdmTopLongShortAccountHist(r, period)).filter(notNull),
  };
}

/**
 * Top Trader Long/Short Ratio (Positions) 시계열 — /futures/data/topLongShortPositionRatio.
 * ⚠️ Accounts 와 응답 필드명 완전 동일, 의미 다름 (포지션 노출 vs 머리수) — DB 컬럼 분리.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio (2026-05-31 조회)
 */
export async function fetchTopLongShortPositionHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmTopLongShortPosition[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/topLongShortPositionRatio",
    query: { symbol, period, limit },
  });
  if (!res.success) return res;
  return {
    success: true,
    data: res.data.map((r) => normalizeUsdmTopLongShortPositionHist(r, period)).filter(notNull),
  };
}

/**
 * Global Long/Short Ratio (All Traders) 시계열 — /futures/data/globalLongShortAccountRatio.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Long-Short-Ratio (2026-05-31 조회)
 */
export async function fetchGlobalLongShortHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmGlobalLongShortAccount[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/globalLongShortAccountRatio",
    query: { symbol, period, limit },
  });
  if (!res.success) return res;
  return {
    success: true,
    data: res.data.map((r) => normalizeUsdmGlobalLongShortHist(r, period)).filter(notNull),
  };
}

/**
 * Taker Buy/Sell Volume 시계열 — /futures/data/takerlongshortRatio.
 * ★ 응답에 symbol 필드 없음 → fetcher 가 normalize 에 symbol 주입.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Taker-BuySell-Volume (2026-05-31 조회)
 */
export async function fetchTakerLongShortHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmTakerLongShort[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/takerlongshortRatio",
    query: { symbol, period, limit },
  });
  if (!res.success) return res;
  return {
    success: true,
    data: res.data.map((r) => normalizeUsdmTakerLongShortHist(r, symbol, period)).filter(notNull),
  };
}

/**
 * Basis 시계열 — /futures/data/basis.
 * ★ pair 파라미터 필수 (symbol 아님), contractType=PERPETUAL 만 TRAVIS 사용.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Basis (2026-05-31 조회)
 */
export async function fetchBasisHistory(
  pair: string,
  contractType: "PERPETUAL",
  period: BinanceHistoryPeriod,
  limit: number,
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmBasis[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/basis",
    query: { pair, contractType, period, limit },
  });
  if (!res.success) return res;
  return {
    success: true,
    data: res.data.map((r) => normalizeUsdmBasisHist(r, period)).filter(notNull),
  };
}

// ============================================================
// @travis/exchange-collectors 공개 배럴 (M1.9 Step 1, 2026-06-02).
//
// 거래소 REST 수집 인프라 — apps/worker(production now-수집) +
// apps/collector-history(forward-fill) 가 공유.
//
// verbatimModuleSyntax: true 하에서 타입/값을 분리해 re-export.
// 앱 consumer 는 이 배럴만 import (내부 하위 모듈 직접 import 금지).
// ============================================================

// ─── 공용 수집 결과 타입 ──────────────────────────
export type { FetchResult } from "./adapters/IExchangeAdapter";

// ─── Binance HTTP 클라이언트 (rate-limit 싱글톤) ──
export {
  binanceFetch,
  batchPerSymbol,
  getRateLimitState,
} from "./adapters/binance/client";
export type {
  BinanceRequestOptions,
  BatchPerSymbolResult,
} from "./adapters/binance/client";

// ─── Binance 공유 raw 응답 타입 (history + now 양쪽 사용) ──
export type {
  BinanceHistoryPeriod,
  BinanceUsdmBasis,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterestHist,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "./adapters/binance/types";

// ─── Binance COINM history raw 응답 타입 6종 (M1.9 Step 2-C) ──
export type {
  BinanceCoinmBasis,
  BinanceCoinmGlobalLongShortAccount,
  BinanceCoinmOpenInterestHist,
  BinanceCoinmTakerBuySellVol,
  BinanceCoinmTopLongShortAccount,
  BinanceCoinmTopLongShortPosition,
} from "./adapters/binance/types";

// ─── USDM history fetcher 6종 + window 타입 ────────
export {
  fetchBasisHistory,
  fetchGlobalLongShortHistory,
  fetchOpenInterestHistory,
  fetchTakerLongShortHistory,
  fetchTopLongShortAccountHistory,
  fetchTopLongShortPositionHistory,
} from "./adapters/binance/historyFetchers";
export type { HistoryFetchWindow } from "./adapters/binance/historyFetchers";

// ─── COINM history fetcher 6종 (M1.9 Step 2-C, dapi) ──
export {
  coinmSymbolToPair,
  fetchCoinmBasisHistory,
  fetchCoinmGlobalLongShortHistory,
  fetchCoinmOpenInterestHistory,
  fetchCoinmTakerHistory,
  fetchCoinmTopLongShortAccountHistory,
  fetchCoinmTopLongShortPositionHistory,
} from "./adapters/binance/coinmHistoryFetchers";

// ─── USDM history normalize 6종 ────────────────────
export {
  normalizeUsdmBasisHist,
  normalizeUsdmGlobalLongShortHist,
  normalizeUsdmOpenInterestHist,
  normalizeUsdmTakerLongShortHist,
  normalizeUsdmTopLongShortAccountHist,
  normalizeUsdmTopLongShortPositionHist,
} from "./adapters/binance/normalize/historyFutures";

// ─── COINM history normalize 6종 (M1.9 Step 2-C) ──
export {
  normalizeCoinmBasisHist,
  normalizeCoinmGlobalLongShortHist,
  normalizeCoinmOpenInterestHist,
  normalizeCoinmTakerHist,
  normalizeCoinmTopLongShortAccountHist,
  normalizeCoinmTopLongShortPositionHist,
} from "./adapters/binance/normalize/coinmHistoryFutures";

// ─── upsert 재시도 래퍼 ───────────────────────────
export { retryOnTransient, isTransientError } from "./core/_upsertRetry";
export type { RetryOpts } from "./core/_upsertRetry";

// ─── backfill 루프 코어 ───────────────────────────
export {
  executeHistoryBackfill,
  getMetricFetchers,
  HISTORY_INTERVALS,
  INTERVAL_TO_MS,
  ROWS_PER_METRIC_PER_SYMBOL_14D,
} from "./core/historyBackfillCore";
export type {
  ExecuteBackfillDeps,
  BackfillResult,
} from "./core/historyBackfillCore";

// ─── forward-fill 증분 윈도우 (M1.9 Step 2-B) ─────
export {
  computeForwardFillStartMs,
  FORWARD_FILL_SAFETY_BARS,
} from "./core/forwardFillWindow";

// ─── per-metric throttle ([8-31]ⓒ, 2026-06-05) ─────
export { PerMetricThrottle } from "./core/perMetricThrottle";

// ─── abort 협조 sleep ([8-31]ⓑ, 2026-06-05) ─────
export { abortableSleep } from "./core/abortableSleep";

// ─── /futures/data 전역 token-bucket ([8-31]ⓐ, 2026-06-05) ─────
export {
  FuturesDataRateLimiter,
  TokenBucket,
  getFuturesDataRateLimiter,
  _resetFuturesDataRateLimiterForTest,
  bucketForPath,
  isFuturesDataPath,
  STATS_BUCKET_PER_MIN,
  BASIS_BUCKET_PER_MIN,
} from "./core/futuresDataRateLimiter";
export type {
  FuturesDataBucket,
  RateLimiterClock,
} from "./core/futuresDataRateLimiter";

// ─── basis 미지원(-4104) 학습 캐시 ([8-33], 2026-06-05) ─────
export {
  isUnsupportedMetric,
  markUnsupportedMetric,
  isUnsupportedContractTypeError,
  _resetUnsupportedMetricCacheForTest,
} from "./core/unsupportedMetricCache";

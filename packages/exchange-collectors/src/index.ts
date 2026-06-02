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

// ─── history fetcher 6종 + window 타입 ────────────
export {
  fetchBasisHistory,
  fetchGlobalLongShortHistory,
  fetchOpenInterestHistory,
  fetchTakerLongShortHistory,
  fetchTopLongShortAccountHistory,
  fetchTopLongShortPositionHistory,
} from "./adapters/binance/historyFetchers";
export type { HistoryFetchWindow } from "./adapters/binance/historyFetchers";

// ─── history normalize 6종 ────────────────────────
export {
  normalizeUsdmBasisHist,
  normalizeUsdmGlobalLongShortHist,
  normalizeUsdmOpenInterestHist,
  normalizeUsdmTakerLongShortHist,
  normalizeUsdmTopLongShortAccountHist,
  normalizeUsdmTopLongShortPositionHist,
} from "./adapters/binance/normalize/historyFutures";

// ─── upsert 재시도 래퍼 ───────────────────────────
export { retryOnTransient, isTransientError } from "./core/_upsertRetry";
export type { RetryOpts } from "./core/_upsertRetry";

// ─── backfill 루프 코어 ───────────────────────────
export {
  executeHistoryBackfill,
  HISTORY_INTERVALS,
  ROWS_PER_METRIC_PER_SYMBOL_14D,
} from "./core/historyBackfillCore";
export type {
  ExecuteBackfillDeps,
  BackfillResult,
} from "./core/historyBackfillCore";

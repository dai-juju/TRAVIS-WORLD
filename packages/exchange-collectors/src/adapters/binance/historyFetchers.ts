// ============================================================
// Binance USDM history fetcher 6종 (M1.8.5 Step 3 신설 / Step 4 페이지네이션 + 방어 확장).
//
// 책임:
//   history_futures_indicator 시계열 backfill 의 단일 symbol fetcher.
//   각 fetcher 는 (symbol, period, limit, window?) → 해당 metric 의 normalized row 배열.
//
// 현재 시점 fetcher (BinanceUsdmAdapter) 와의 차이:
//   - now-fetcher 는 symbols[] 전체를 batchPerSymbol 로 순회 (50ms throttle).
//   - history-fetcher 는 **단일 symbol** 의 array 응답만 반환. per-symbol/per-interval
//     순회 + rate limit + 페이지 윈도잉은 backfill loop 책임.
//
// 페이지네이션 (Step 4, D-Q2): limit 최대 500. 5m 14일=4032행 → 9 페이지.
//   startTime/endTime (epoch ms) 로 윈도잉 — Binance 는 [startTime, endTime] 구간 시간 오름차순 반환.
//
// ★ 방어 (M1.8.5 Step 4 hotfix): mapPage 가 Array.isArray 가드 — Binance 가 rate-limit 등으로
//   배열 아닌 응답(에러 envelope)을 2xx 로 줄 때 .map() crash 방지. (1차 방어는 client.ts 의
//   isBinanceErrorEnvelope, 본 가드는 2차 belt-and-suspenders + 비정상 shape 로깅.)
//
// normalize 는 normalize/historyFutures.ts 위임 — recorded_at 폐기 규약(null) 정합.
//
// M1.9 Step 1 (2026-06-02): apps/worker → packages/exchange-collectors 이동 (로직 변경 0).
// task-record: docs/task-record/M1.8.5-step3-fetchers.md + M1.8.5-step4-deploy.md
// ============================================================

import type { FetchResult } from "../IExchangeAdapter";
import type { HistoryFuturesIndicatorInsert } from "@travis/data-service";
import { binanceFetch } from "./client";
import {
  normalizeUsdmBasisHist,
  normalizeUsdmGlobalLongShortHist,
  normalizeUsdmOpenInterestHist,
  normalizeUsdmTakerLongShortHist,
  normalizeUsdmTopLongShortAccountHist,
  normalizeUsdmTopLongShortPositionHist,
} from "./normalize/historyFutures";
import type {
  BinanceHistoryPeriod,
  BinanceUsdmBasis,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterestHist,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "./types";

const BASE_URL = "https://fapi.binance.com";

/** normalize 결과의 null(폐기 row) 제거용 제네릭 type-guard (HistoryRow narrow 보존). */
function notNull<T>(row: T | null): row is T {
  return row !== null;
}

/** 페이지 윈도잉 공통 옵션 (Step 4). 미지정 시 Binance 최신 limit 개 반환. */
export interface HistoryFetchWindow {
  startTime?: number; // epoch ms
  endTime?: number; // epoch ms
}

/**
 * raw 배열 응답 → normalized row 배열 (공통). [8-21] W2 해소 + Step 4 Array.isArray 방어.
 * - 실패(res.success=false) 전파.
 * - ★ 배열 아닌 응답(rate-limit 에러 envelope 등)은 success:false 로 격하 (호출자 .map crash 방지)
 *   + 본문 일부 로깅 (진단). 호출자(backfillOneMetric)는 page fail 로 graceful 처리.
 */
function mapPage<TRaw>(
  res: FetchResult<TRaw[]>,
  normalize: (raw: TRaw) => HistoryFuturesIndicatorInsert | null,
): FetchResult<HistoryFuturesIndicatorInsert[]> {
  if (!res.success) return res;
  if (!Array.isArray(res.data)) {
    return {
      success: false,
      error: `non-array response (rate-limit/error envelope?): ${JSON.stringify(res.data).slice(0, 120)}`,
    };
  }
  return { success: true, data: res.data.map(normalize).filter(notNull) };
}

/**
 * Open Interest 시계열 — /futures/data/openInterestHist.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics (2026-05-31 조회)
 */
export async function fetchOpenInterestHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmOpenInterestHist[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/openInterestHist",
    query: { symbol, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeUsdmOpenInterestHist(r, period));
}

/**
 * Top Trader Long/Short Ratio (Accounts) 시계열 — /futures/data/topLongShortAccountRatio.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio (2026-05-31 조회)
 */
export async function fetchTopLongShortAccountHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmTopLongShortAccount[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/topLongShortAccountRatio",
    query: { symbol, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeUsdmTopLongShortAccountHist(r, period));
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
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmTopLongShortPosition[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/topLongShortPositionRatio",
    query: { symbol, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeUsdmTopLongShortPositionHist(r, period));
}

/**
 * Global Long/Short Ratio (All Traders) 시계열 — /futures/data/globalLongShortAccountRatio.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Long-Short-Ratio (2026-05-31 조회)
 */
export async function fetchGlobalLongShortHistory(
  symbol: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmGlobalLongShortAccount[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/globalLongShortAccountRatio",
    query: { symbol, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeUsdmGlobalLongShortHist(r, period));
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
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmTakerLongShort[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/takerlongshortRatio",
    query: { symbol, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeUsdmTakerLongShortHist(r, symbol, period));
}

/**
 * Basis 시계열 — /futures/data/basis.
 * ★ pair 파라미터 필수 (symbol 아님), contractType=PERPETUAL 만 TRAVIS 사용.
 *   USDM PERPETUAL 은 pair === symbol (예: BTCUSDT).
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Basis (2026-05-31 조회)
 */
export async function fetchBasisHistory(
  pair: string,
  contractType: "PERPETUAL",
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceUsdmBasis[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/basis",
    query: { pair, contractType, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeUsdmBasisHist(r, period));
}

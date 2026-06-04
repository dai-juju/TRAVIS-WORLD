// ============================================================
// Binance COINM history fetcher 6종 (M1.9 Step 2-C 신설, 2026-06-04).
//
// 책임:
//   COINM(/futures/data/*, dapi) 시계열 backfill 의 단일 pair fetcher.
//   USDM(historyFetchers.ts) 와 동형 시그니처 — (pair, period, limit, window?) →
//   normalized row 배열. per-symbol/interval 순회·rate limit·페이지 윈도잉은
//   backfill loop(2-D) 책임.
//
// USDM 대비 분기 (crypto-domain-expert 자문 2026-06-04 + ★라이브 dapi 실측 2026-06-04 — 절대 미러링 금지):
//   1. BASE_URL = https://dapi.binance.com (fapi 아님).
//   2. ★ 파라미터 키 = 6개 전부 `pair`(BTCUSD). request·response 모두 pair.
//      (자문 초안은 topLongShortAccountRatio 만 `symbol` 키라 했으나 ★라이브 실측 결과
//       symbol 전송 시 -1130 "parameter 'pair' is invalid" → 정정. 6개 동일 pair.)
//   3. OI / Taker / Basis 는 contractType="PERPETUAL" 필수. LSR 3종은 불요.
//   4. Taker endpoint = /takerBuySellVol (USDM 은 /takerlongshortRatio), 응답 ratio 없음.
//
// scope: PERPETUAL(_PERP) 만. 호출자는 `BTCUSD` (= symbol.split("_")[0]) 를 pair 로 전달.
//   _PERP → pair 변환 + 분기물(BNBUSD_260626) 제외 필터는 backfill loop(2-D) 책임 — 본 파일은
//   순수 pair 단위 fetch 만 담당 (단일 책임).
//
// 방어/페이지네이션은 USDM 과 동일 (mapPage Array.isArray 가드 + startTime/endTime 윈도잉).
//
// task-record: docs/task-record/M1.9-step2c-coinm.md (메인 작성)
// ============================================================

import type { FetchResult } from "../IExchangeAdapter";
import type { HistoryFuturesIndicatorInsert } from "@travis/data-service";
import { binanceFetch } from "./client";
import {
  normalizeCoinmBasisHist,
  normalizeCoinmGlobalLongShortHist,
  normalizeCoinmOpenInterestHist,
  normalizeCoinmTakerHist,
  normalizeCoinmTopLongShortAccountHist,
  normalizeCoinmTopLongShortPositionHist,
} from "./normalize/coinmHistoryFutures";
import type {
  BinanceCoinmBasis,
  BinanceCoinmGlobalLongShortAccount,
  BinanceCoinmOpenInterestHist,
  BinanceCoinmTakerBuySellVol,
  BinanceCoinmTopLongShortAccount,
  BinanceCoinmTopLongShortPosition,
  BinanceHistoryPeriod,
} from "./types";
import type { HistoryFetchWindow } from "./historyFetchers";

// ★ dapi 호스트 (fapi 아님). /futures/data/* path 는 dapi 에도 존재.
const BASE_URL = "https://dapi.binance.com";

// COINM history 는 PERPETUAL 만 다룬다. fetcher 시그니처를 좁혀 호출 실수 방지.
const PERPETUAL = "PERPETUAL" as const;

/**
 * COINM 심볼(BTCUSD_PERP) → dapi pair(BTCUSD). (backfill loop 가 fetcher 호출 전 변환 — 2-C 설계.)
 * scope=PERPETUAL 전용이라 "_" 앞부분이 곧 pair. 분기물(BNBUSD_260626)은 loop 의 symbolFilter 가 사전 제외.
 */
export function coinmSymbolToPair(symbol: string): string {
  return symbol.split("_")[0] ?? symbol;
}

/** normalize 결과의 null(폐기 row) 제거용 제네릭 type-guard. */
function notNull<T>(row: T | null): row is T {
  return row !== null;
}

/**
 * raw 배열 응답 → normalized row 배열 (USDM mapPage 와 동일 방어).
 * - 실패(res.success=false) 전파.
 * - 배열 아닌 응답(rate-limit 에러 envelope 등) → success:false 격하 (.map crash 방지) + 진단 로깅.
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
 * Open Interest 시계열 (COINM) — /futures/data/openInterestHist.
 * ★ pair + contractType=PERPETUAL 필수. sumOpenInterest = contract 수.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Open-Interest-Statistics (2026-06-04 조회)
 */
export async function fetchCoinmOpenInterestHistory(
  pair: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceCoinmOpenInterestHist[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/openInterestHist",
    query: {
      pair,
      contractType: PERPETUAL,
      period,
      limit,
      startTime: window.startTime,
      endTime: window.endTime,
    },
  });
  return mapPage(res, (r) => normalizeCoinmOpenInterestHist(r, period));
}

/**
 * Top Trader Long/Short Ratio (Accounts) 시계열 (COINM) — /futures/data/topLongShortAccountRatio.
 * ★ pair 키 + contractType 불요. response 는 pair 필드 → normalize 가 symbol ← raw.pair.
 *   (자문 초안의 "symbol 키" 는 라이브 -1130 으로 반증됨 — 나머지 5개와 동일 pair.)
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio-Accounts (2026-06-04 조회 + 라이브 실측)
 */
export async function fetchCoinmTopLongShortAccountHistory(
  pair: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceCoinmTopLongShortAccount[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/topLongShortAccountRatio",
    query: { pair, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeCoinmTopLongShortAccountHist(r, period));
}

/**
 * Top Trader Long/Short Ratio (Positions) 시계열 (COINM) — /futures/data/topLongShortPositionRatio.
 * ★ pair 키. 응답 필드 = longPosition/shortPosition (USDM 과 다름). contractType 불요.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio-Positions (2026-06-04 조회)
 */
export async function fetchCoinmTopLongShortPositionHistory(
  pair: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceCoinmTopLongShortPosition[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/topLongShortPositionRatio",
    query: { pair, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeCoinmTopLongShortPositionHist(r, period));
}

/**
 * Global Long/Short Ratio (All Traders) 시계열 (COINM) — /futures/data/globalLongShortAccountRatio.
 * ★ pair 키. contractType 불요.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Long-Short-Ratio (2026-06-04 조회)
 */
export async function fetchCoinmGlobalLongShortHistory(
  pair: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceCoinmGlobalLongShortAccount[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/globalLongShortAccountRatio",
    query: { pair, period, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapPage(res, (r) => normalizeCoinmGlobalLongShortHist(r, period));
}

/**
 * Taker Buy/Sell Volume 시계열 (COINM) — /futures/data/takerBuySellVol.
 * ★ USDM(/takerlongshortRatio)와 endpoint·필드 완전 상이. pair + contractType=PERPETUAL 필수.
 *   응답에 pair 필드 + buySellRatio 없음 → normalize 가 ratio 직접 계산 + symbol ← raw.pair.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Taker-Buy-Sell-Volume (2026-06-04 조회)
 */
export async function fetchCoinmTakerHistory(
  pair: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceCoinmTakerBuySellVol[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/takerBuySellVol", // ★ USDM 과 endpoint 다름
    query: {
      pair,
      contractType: PERPETUAL,
      period,
      limit,
      startTime: window.startTime,
      endTime: window.endTime,
    },
  });
  return mapPage(res, (r) => normalizeCoinmTakerHist(r, period));
}

/**
 * Basis 시계열 (COINM) — /futures/data/basis.
 * ★ pair + contractType=PERPETUAL 필수 (USDM 동일 구조).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Basis (2026-06-04 조회)
 */
export async function fetchCoinmBasisHistory(
  pair: string,
  period: BinanceHistoryPeriod,
  limit: number,
  window: HistoryFetchWindow = {},
): Promise<FetchResult<HistoryFuturesIndicatorInsert[]>> {
  const res = await binanceFetch<BinanceCoinmBasis[]>({
    baseUrl: BASE_URL,
    path: "/futures/data/basis",
    query: {
      pair,
      contractType: PERPETUAL,
      period,
      limit,
      startTime: window.startTime,
      endTime: window.endTime,
    },
  });
  return mapPage(res, (r) => normalizeCoinmBasisHist(r, period));
}

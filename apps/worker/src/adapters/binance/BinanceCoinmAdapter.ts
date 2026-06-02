// ============================================================
// Binance Coin-M Futures REST 어댑터 (M1.3 Step 3d + 3e).
//
// USDM과 거의 동일한 구조지만 차이점:
//   - base URL: https://dapi.binance.com
//   - ticker에 quote_volume 없고 base_volume만
//   - 심볼 형식: "BTCUSD_PERP", "BTCUSD_240628"
//   - 심볼 상태 필드가 `contractStatus` (USDM·spot은 `status`)
//   - topLongShortRatio 등 일부 엔드포인트는 USDM과 동일 path지만
//     base URL이 /futures/data가 아닌 /dapi/v1과 /futures/data 양쪽 존재.
//
// 배치 가능 (3d): exchangeInfo, ticker/24hr, premiumIndex
// per-symbol (3e): openInterest, topLongShortAccount, takerLongShort
//   (globalLongShortAccountRatio와 positionRatio는 COINM에는 존재하지 않음)
// ============================================================

import type { FetchResult } from "../IExchangeAdapter.js";
import type {
  NowFuturesIndicatorInsert,
  NowFuturesTickerInsert,
  SymbolInsert,
} from "@travis/data-service";
import { logPartialFailures } from "../_common.js";
import { batchPerSymbol, binanceFetch } from "@travis/exchange-collectors";
import {
  normalizeCoinmOpenInterest,
  normalizeCoinmPremium,
  normalizeCoinmSymbol,
  normalizeCoinmTaker,
  normalizeCoinmTicker,
  normalizeUsdmTopLongShortAccount,
} from "./normalize.js";
import type {
  BinanceCoinmExchangeInfo,
  BinanceCoinmOpenInterest,
  BinanceCoinmPremiumIndex,
  BinanceCoinmTakerBuySellVol,
  BinanceCoinmTicker,
  BinanceUsdmTopLongShortAccount,
} from "./types.js";

const BASE_URL = "https://dapi.binance.com";

export class BinanceCoinmAdapter {
  readonly exchangeId = "binance";
  readonly marketType = "futures_coinm" as const;
  readonly baseRestUrl = BASE_URL;

  // ─── 배치 가능 ───────────────────────────────

  async fetchExchangeInfo(): Promise<FetchResult<SymbolInsert[]>> {
    const res = await binanceFetch<BinanceCoinmExchangeInfo>({
      baseUrl: BASE_URL,
      path: "/dapi/v1/exchangeInfo",
    });
    if (!res.success) return res;
    return { success: true, data: res.data.symbols.map(normalizeCoinmSymbol) };
  }

  async fetchTicker24hr(): Promise<FetchResult<NowFuturesTickerInsert[]>> {
    const res = await binanceFetch<BinanceCoinmTicker[]>({
      baseUrl: BASE_URL,
      path: "/dapi/v1/ticker/24hr",
    });
    if (!res.success) return res;
    return { success: true, data: res.data.map(normalizeCoinmTicker) };
  }

  async fetchPremiumIndex(): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const res = await binanceFetch<BinanceCoinmPremiumIndex[]>({
      baseUrl: BASE_URL,
      path: "/dapi/v1/premiumIndex",
    });
    if (!res.success) return res;
    return { success: true, data: res.data.map(normalizeCoinmPremium) };
  }

  // ─── per-symbol (3e) ─────────────────────────

  async fetchOpenInterestBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      return binanceFetch<BinanceCoinmOpenInterest>({
        baseUrl: BASE_URL,
        path: "/dapi/v1/openInterest",
        query: { symbol },
      });
    });
    logPartialFailures("COINM openInterest", result.failed);
    return { success: true, data: result.success.map(normalizeCoinmOpenInterest) };
  }

  /**
   * COINM은 /futures/data 엔드포인트에서 **pair 파라미터** 기반으로 조회.
   * 심볼명 "BTCUSD_PERP"의 pair는 "BTCUSD". 심볼 자체로 조회도 가능한
   * 엔드포인트도 있으나 공식 문서가 pair 기반을 권장.
   *
   * 반환 정규화는 USDM 함수(normalizeUsdmTopLongShortAccount)를 재사용하되
   * market_type 필드를 futures_coinm으로 오버라이드.
   */
  async fetchTopLongShortAccountBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const pair = symbol.split("_")[0] ?? symbol;
      const r = await binanceFetch<BinanceUsdmTopLongShortAccount[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/topLongShortAccountRatio",
        query: { pair, period: "5m", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      // pair 응답에서는 symbol 필드가 pair 형식으로 오므로 원본 심볼로 오버라이드
      return { success: true, data: { ...first, symbol } };
    });
    logPartialFailures("COINM topLongShortAccount", result.failed);
    return {
      success: true,
      data: result.success.map((d) => ({
        ...normalizeUsdmTopLongShortAccount(d),
        market_type: "futures_coinm" as const,
      })),
    };
  }

  /**
   * COINM Taker: **USDM과 응답 스키마가 다름**(code-reviewer C-1).
   *   - USDM: /futures/data/takerlongshortRatio, 응답 {buySellRatio, buyVol, sellVol}
   *   - COINM: /futures/data/takerBuySellVol, 응답 {takerBuyVol, takerSellVol, ...}
   * 전용 타입 `BinanceCoinmTakerBuySellVol` + 전용 normalize 사용.
   */
  async fetchTakerLongShortBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const pair = symbol.split("_")[0] ?? symbol;
      const r = await binanceFetch<BinanceCoinmTakerBuySellVol[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/takerBuySellVol",
        query: { pair, period: "5m", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      return { success: true, data: { raw: first, symbol } };
    });
    logPartialFailures("COINM taker", result.failed);
    return {
      success: true,
      data: result.success.map(({ raw, symbol }) => normalizeCoinmTaker(raw, symbol)),
    };
  }
}

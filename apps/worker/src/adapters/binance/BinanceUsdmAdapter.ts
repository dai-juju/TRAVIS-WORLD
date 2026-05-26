// ============================================================
// Binance USDT-M Futures REST 어댑터 (M1.3 Step 3c + 3e, M1.8 §8.2a-2 확장 2026-05-26).
//
// 배치 가능:
//   - fetchExchangeInfo(): /fapi/v1/exchangeInfo
//   - fetchTicker24hr(): /fapi/v1/ticker/24hr (전체)
//   - fetchPremiumIndex(): /fapi/v1/premiumIndex (전체, mark+funding+estimated 한 번에)
//   - fetchFundingInfo(): /fapi/v1/fundingInfo (★ M1.8 §8.2a-2 신설 — 4h/8h interval Map source)
//
// per-symbol (API가 배치 미지원):
//   - fetchOpenInterestBatch(symbols): /fapi/v1/openInterest × N
//   - fetchTopLongShortAccountBatch(symbols): /futures/data/topLongShortAccountRatio × N
//   - fetchTopLongShortPositionBatch(symbols): /futures/data/topLongShortPositionRatio × N
//   - fetchGlobalLongShortBatch(symbols): /futures/data/globalLongShortAccountRatio × N
//   - fetchTakerLongShortBatch(symbols): /futures/data/takerlongshortRatio × N
//   - fetchBasisBatch(symbols): /futures/data/basis × N (★ M1.8 §8.2a-2 신설 — pair 파라미터 필수)
//
// 중요:
//   - per-symbol 메서드는 batchPerSymbol 헬퍼로 50ms 간격 순회.
//   - 각 반환값은 now_futures_indicator의 **특정 도메인 컬럼만 채운
//     NowFuturesIndicatorInsert 배열**. Step 2 W2 hazard 회피를 위해
//     호출자는 도메인별로 따로 upsertNowFuturesIndicatorPartial 호출할 것.
//   - ★ premiumIndex 매핑 시 fundingIntervalHours 인자 필요 (D15) — fetchPremiumIndex 의
//     `fundingInfoMap?` 옵션 인자가 Map<symbol, 4|8> 받아 normalize 시 주입. miss 시 8 default.
// ============================================================

import type { FetchResult } from "../IExchangeAdapter.js";
import type {
  NowFuturesIndicatorInsert,
  NowFuturesTickerInsert,
  SymbolInsert,
} from "@travis/data-service";
import { logPartialFailures } from "../_common.js";
import { batchPerSymbol, binanceFetch } from "./client.js";
import {
  normalizeUsdmBasis,
  normalizeUsdmGlobalLongShort,
  normalizeUsdmOpenInterest,
  normalizeUsdmPremium,
  normalizeUsdmSymbol,
  normalizeUsdmTaker,
  normalizeUsdmTicker,
  normalizeUsdmTopLongShortAccount,
  normalizeUsdmTopLongShortPosition,
} from "./normalize.js";
import type {
  BinanceUsdmBasis,
  BinanceUsdmExchangeInfo,
  BinanceUsdmFundingInfo,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterest,
  BinanceUsdmPremiumIndex,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTicker,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "./types.js";

const BASE_URL = "https://fapi.binance.com";

export class BinanceUsdmAdapter {
  readonly exchangeId = "binance";
  readonly marketType = "futures_usdm" as const;
  readonly baseRestUrl = BASE_URL;

  // ─── 배치 가능 엔드포인트 ──────────────────────

  async fetchExchangeInfo(): Promise<FetchResult<SymbolInsert[]>> {
    const res = await binanceFetch<BinanceUsdmExchangeInfo>({
      baseUrl: BASE_URL,
      path: "/fapi/v1/exchangeInfo",
    });
    if (!res.success) return res;
    return { success: true, data: res.data.symbols.map(normalizeUsdmSymbol) };
  }

  async fetchTicker24hr(): Promise<FetchResult<NowFuturesTickerInsert[]>> {
    const res = await binanceFetch<BinanceUsdmTicker[]>({
      baseUrl: BASE_URL,
      path: "/fapi/v1/ticker/24hr",
    });
    if (!res.success) return res;
    return { success: true, data: res.data.map(normalizeUsdmTicker) };
  }

  /**
   * premiumIndex 전체 배치 — mark_price, index_price, estimated_settle_price,
   * last_settled_funding_rate (★ M1.8 §8.1 RENAME), interest_rate, next_funding_time,
   * last_settled_funding_time (★ M1.8 §8.2a-2 D15 역산) 을 한 방에 수집.
   *
   * @param fundingInfoMap fundingInfoTask 결과 — symbol → fundingIntervalHours (4 or 8).
   *                       미존재 심볼은 8 default fallback (Binance fundingInfo 정책).
   *                       제공 안 되면 전 심볼 8 default.
   */
  async fetchPremiumIndex(
    fundingInfoMap?: ReadonlyMap<string, number>,
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const res = await binanceFetch<BinanceUsdmPremiumIndex[]>({
      baseUrl: BASE_URL,
      path: "/fapi/v1/premiumIndex",
    });
    if (!res.success) return res;
    return {
      success: true,
      data: res.data.map((raw) =>
        normalizeUsdmPremium(raw, fundingInfoMap?.get(raw.symbol) ?? 8),
      ),
    };
  }

  /**
   * fundingInfo 전체 호출 — symbol → fundingIntervalHours (4 or 8) Map source.
   * M1.8 §8.2a-2 신설 (2026-05-26, D9 + D13).
   *
   * ★ default 8h 코인은 응답에 없음 (negative-space 정의). 호출자가 Map miss 시 8 fallback.
   * ★ PHAROSUSDT 같은 4h funding 코인 식별. 24h reload 주기로 fundingInfoTask 가 호출.
   *
   * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-Info (2026-05-26 조회)
   */
  async fetchFundingInfo(): Promise<FetchResult<BinanceUsdmFundingInfo[]>> {
    return binanceFetch<BinanceUsdmFundingInfo[]>({
      baseUrl: BASE_URL,
      path: "/fapi/v1/fundingInfo",
    });
  }

  // ─── per-symbol 엔드포인트 (API 자체 한계, M1.3 Step 3e) ─
  // 각 메서드는 단일 도메인 컬럼 셋만 채우므로 호출자는 반환값을
  // upsertNowFuturesIndicatorPartial로 바로 쏘면 됨 (mixed-batch 금지).

  async fetchOpenInterestBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      return binanceFetch<BinanceUsdmOpenInterest>({
        baseUrl: BASE_URL,
        path: "/fapi/v1/openInterest",
        query: { symbol },
      });
    });
    logPartialFailures("USDM openInterest", result.failed);
    return { success: true, data: result.success.map(normalizeUsdmOpenInterest) };
  }

  async fetchTopLongShortAccountBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const r = await binanceFetch<BinanceUsdmTopLongShortAccount[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/topLongShortAccountRatio",
        query: { symbol, period: "5m", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      return { success: true, data: first };
    });
    logPartialFailures("USDM topLongShortAccount", result.failed);
    return {
      success: true,
      data: result.success.map(normalizeUsdmTopLongShortAccount),
    };
  }

  async fetchTopLongShortPositionBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const r = await binanceFetch<BinanceUsdmTopLongShortPosition[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/topLongShortPositionRatio",
        query: { symbol, period: "5m", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      return { success: true, data: first };
    });
    logPartialFailures("USDM topLongShortPosition", result.failed);
    return {
      success: true,
      data: result.success.map(normalizeUsdmTopLongShortPosition),
    };
  }

  async fetchGlobalLongShortBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const r = await binanceFetch<BinanceUsdmGlobalLongShortAccount[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/globalLongShortAccountRatio",
        query: { symbol, period: "5m", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      return { success: true, data: first };
    });
    logPartialFailures("USDM globalLongShort", result.failed);
    return {
      success: true,
      data: result.success.map(normalizeUsdmGlobalLongShort),
    };
  }

  /**
   * Taker 응답엔 symbol 필드가 없으므로 fetcher 반환 시 `{raw, symbol}`로 묶어
   * normalize 시점에 symbol을 주입. 이로써 batchPerSymbol 공통 헬퍼 재사용.
   */
  async fetchTakerLongShortBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const r = await binanceFetch<BinanceUsdmTakerLongShort[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/takerlongshortRatio",
        query: { symbol, period: "5m", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      return { success: true, data: { raw: first, symbol } };
    });
    logPartialFailures("USDM taker", result.failed);
    return {
      success: true,
      data: result.success.map(({ raw, symbol }) => normalizeUsdmTaker(raw, symbol)),
    };
  }

  /**
   * Basis per-symbol — /futures/data/basis (★ pair 파라미터 필수, symbol 아님).
   * M1.8 §8.2a-2 신설 (2026-05-26, D19).
   *
   * ★ contractType=PERPETUAL 만 TRAVIS 사용 (무기한 선물).
   * ★ period=1h 고정 (PERPETUAL basis 트렌드용, D19). limit=1 (최신 1개).
   * ★ weight=0 이지만 /futures/data/* IP quota 공유 (1000 req/5min).
   *
   * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Basis (2026-05-26 조회)
   */
  async fetchBasisBatch(
    symbols: string[],
  ): Promise<FetchResult<NowFuturesIndicatorInsert[]>> {
    const result = await batchPerSymbol(symbols, async (symbol) => {
      const r = await binanceFetch<BinanceUsdmBasis[]>({
        baseUrl: BASE_URL,
        path: "/futures/data/basis",
        query: { pair: symbol, contractType: "PERPETUAL", period: "1h", limit: 1 },
      });
      if (!r.success) return r;
      const first = r.data[0];
      if (!first) return { success: false, error: "empty array" };
      return { success: true, data: first };
    });
    logPartialFailures("USDM basis", result.failed);
    return { success: true, data: result.success.map(normalizeUsdmBasis) };
  }
}

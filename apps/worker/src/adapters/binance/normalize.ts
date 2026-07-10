// ============================================================
// Binance raw 응답 → dataService Insert 타입 변환 (M1.3 Step 3).
//
// 변환 규칙:
//  - 문자열 숫자(Binance)는 parseFloat으로 number 변환. NaN이면 null.
//  - Binance의 camelCase → DB의 snake_case 매핑.
//  - exchange·market_type은 호출자(adapter)가 결정해 주입.
//  - 사전계산 컬럼(price_chg_*, volume_chg_*, oi_chg_*)은 모두 null —
//    Step 4의 폴링 루프에서 롤링 윈도우로 채운다.
// ============================================================

import type {
  HistoryFuturesKlineInsert,
  HistorySpotKlineInsert,
  NowFuturesIndicatorInsert,
  NowFuturesTickerInsert,
  NowSpotTickerInsert,
  SymbolInsert,
} from "@travis/data-service";
import type {
  BinanceCoinmOpenInterest,
  BinanceCoinmPremiumIndex,
  BinanceCoinmSymbolInfo,
  BinanceCoinmTakerBuySellVol,
  BinanceCoinmTicker,
  BinanceSpotSymbolInfo,
  BinanceSpotTicker,
  BinanceSymbolFilter,
  BinanceUsdmBasis,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterest,
  BinanceUsdmPremiumIndex,
  BinanceUsdmSymbolInfo,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTicker,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "./types.js";

// ─── 문자열 숫자 파싱 유틸 ────────────────────────

/**
 * Binance의 "가격 문자열" → number | null.
 * 빈 문자열·"0"이 의미 있는 경우가 많으므로 0은 허용, NaN만 null.
 */
function num(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** filters 배열에서 특정 filterType 엔트리 찾기. */
function findFilter<T extends BinanceSymbolFilter>(
  filters: BinanceSymbolFilter[],
  type: T["filterType"],
): T | undefined {
  return filters.find((f) => f.filterType === type) as T | undefined;
}

/** epoch ms → ISO string (Binance onboardDate 등 timestamptz 컬럼용). */
function epochToIso(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || ms <= 0) return null;
  return new Date(ms).toISOString();
}

// ─── Spot normalize ──────────────────────────────

export function normalizeSpotSymbol(raw: BinanceSpotSymbolInfo): SymbolInsert {
  const priceFilter = findFilter<{ filterType: "PRICE_FILTER"; tickSize: string }>(
    raw.filters,
    "PRICE_FILTER",
  );
  const lotSize = findFilter<{ filterType: "LOT_SIZE"; stepSize: string }>(
    raw.filters,
    "LOT_SIZE",
  );
  // Spot은 NOTIONAL(신) 또는 MIN_NOTIONAL(레거시) 둘 중 하나로 옴.
  const notional =
    findFilter<{ filterType: "NOTIONAL"; minNotional: string }>(raw.filters, "NOTIONAL") ??
    findFilter<{ filterType: "MIN_NOTIONAL"; minNotional: string }>(
      raw.filters,
      "MIN_NOTIONAL",
    );

  return {
    exchange: "binance",
    market_type: "spot",
    symbol: raw.symbol,
    base_asset: raw.baseAsset,
    quote_asset: raw.quoteAsset,
    status: raw.status,
    contract_type: null, // spot은 계약 개념 없음
    onboard_date: null, // spot exchangeInfo는 onboardDate 미제공
    delivery_date: null,
    price_precision: raw.quotePrecision ?? raw.baseAssetPrecision ?? null,
    quantity_precision: raw.baseAssetPrecision ?? null,
    tick_size: num(priceFilter?.tickSize),
    step_size: num(lotSize?.stepSize),
    min_notional: num(notional?.minNotional),
  };
}

export function normalizeSpotTicker(raw: BinanceSpotTicker): NowSpotTickerInsert {
  return {
    exchange: "binance",
    market_type: "spot",
    symbol: raw.symbol,
    last_price: num(raw.lastPrice),
    price_change: num(raw.priceChange),
    price_change_pct: num(raw.priceChangePercent),
    weighted_avg_price: num(raw.weightedAvgPrice),
    prev_close_price: num(raw.prevClosePrice),
    open_price: num(raw.openPrice),
    high_price: num(raw.highPrice),
    low_price: num(raw.lowPrice),
    volume: num(raw.volume),
    quote_volume: num(raw.quoteVolume),
    bid_price: num(raw.bidPrice),
    bid_qty: num(raw.bidQty),
    ask_price: num(raw.askPrice),
    ask_qty: num(raw.askQty),
    trade_count: raw.count ?? null,
    open_time: raw.openTime ?? null,
    close_time: raw.closeTime ?? null,
    // 사전계산은 Step 4에서
    price_chg_5m: null,
    price_chg_15m: null,
    price_chg_1h: null,
    price_chg_4h: null,
    volume_chg_5m: null,
    volume_chg_15m: null,
    volume_chg_1h: null,
    volume_ratio: null,
  };
}

// ─── USDM normalize ──────────────────────────────

export function normalizeUsdmSymbol(raw: BinanceUsdmSymbolInfo): SymbolInsert {
  const priceFilter = findFilter<{ filterType: "PRICE_FILTER"; tickSize: string }>(
    raw.filters,
    "PRICE_FILTER",
  );
  const lotSize = findFilter<{ filterType: "LOT_SIZE"; stepSize: string }>(
    raw.filters,
    "LOT_SIZE",
  );
  // USDM은 MIN_NOTIONAL만 사용 (NOTIONAL 신버전 미적용).
  const notional = findFilter<{ filterType: "MIN_NOTIONAL"; minNotional: string }>(
    raw.filters,
    "MIN_NOTIONAL",
  );

  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    base_asset: raw.baseAsset,
    quote_asset: raw.quoteAsset,
    status: raw.status,
    contract_type: raw.contractType || null,
    onboard_date: epochToIso(raw.onboardDate),
    delivery_date: epochToIso(raw.deliveryDate),
    price_precision: raw.pricePrecision ?? null,
    quantity_precision: raw.quantityPrecision ?? null,
    tick_size: num(priceFilter?.tickSize),
    step_size: num(lotSize?.stepSize),
    min_notional: num(notional?.minNotional),
  };
}

export function normalizeUsdmTicker(raw: BinanceUsdmTicker): NowFuturesTickerInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    last_price: num(raw.lastPrice),
    price_change: num(raw.priceChange),
    price_change_pct: num(raw.priceChangePercent),
    weighted_avg_price: num(raw.weightedAvgPrice),
    open_price: num(raw.openPrice),
    high_price: num(raw.highPrice),
    low_price: num(raw.lowPrice),
    volume: num(raw.volume),
    quote_volume: num(raw.quoteVolume),
    base_volume: null, // USDM에는 base_volume 없음
    trade_count: raw.count ?? null,
    open_time: raw.openTime ?? null,
    close_time: raw.closeTime ?? null,
    price_chg_5m: null,
    price_chg_15m: null,
    price_chg_1h: null,
    price_chg_4h: null,
    volume_chg_5m: null,
    volume_chg_15m: null,
    volume_chg_1h: null,
    volume_ratio: null,
  };
}

/**
 * USDM premiumIndex → now_futures_indicator의 premium 도메인 컬럼만.
 * **다른 컬럼(OI·LSR·taker)은 이 객체에 포함 X** — Step 2의 mixed-batch
 * hazard 회피. 호출자는 premium 배치와 다른 도메인 배치를 별도 호출.
 *
 * ★ N1 hotfix (사이클 2 Step 6 후속, 2026-07-10 — 위생 #9 site=DB):
 *   last_settled_funding_rate / last_settled_funding_time 는 **여기서 채우지 않는다**.
 *   사유: premiumIndex.lastFundingRate 는 realized(정산 확정값)가 아니라 predicted 와
 *   같은 소스의 스냅샷 — 정산 사이에 계속 변동한다(문서의 "Latest funding rate" 문구는
 *   오해 소지). 실측(2026-07-10 BTCUSDT 00:00 UTC 정산): 공식 realized
 *   (/fapi/v1/fundingRate, WebFetch) = 0.00009058 vs premiumIndex 스냅샷 = 0.00006198.
 *   → indicator 카드가 "Funding (last settled)" 를 틀리게 표시 = 사이트=DB 위반.
 *   정산 확정값은 collector-history 의 fundingHistoryTask 가 /fapi/v1/fundingRate(공식
 *   realized)로 history_futures_funding 에 적재하고, 그 최신 (rate, time) 을 **한 쌍으로**
 *   now_futures_indicator.last_settled_* 에 반영한다 (time 만 여기서 역산하면 정산 직후
 *   rate 는 구값·time 은 신값인 mismatched pair 가 발생 → 반드시 같은 정산 이벤트에서).
 *   docs: docs/task-record/M2-cycle2-genericchart.md §4h (Step 6) + N1 hotfix.
 *
 * mark/index/estimated/interest_rate/next_funding_time 는 유지 (premiumIndex 정공 필드).
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Mark-Price (2026-05-26 조회)
 */
export function normalizeUsdmPremium(
  raw: BinanceUsdmPremiumIndex,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    mark_price: num(raw.markPrice),
    index_price: num(raw.indexPrice),
    estimated_settle_price: num(raw.estimatedSettlePrice),
    interest_rate: num(raw.interestRate),
    next_funding_time: raw.nextFundingTime ?? null,
  };
}

/** USDM OI 단건 → indicator의 OI 컬럼만. */
export function normalizeUsdmOpenInterest(
  raw: BinanceUsdmOpenInterest,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    open_interest: num(raw.openInterest),
  };
}

/**
 * /futures/data/basis 응답 → indicator의 basis 도메인 컬럼만.
 * M1.8 §8.2a-2 신설 (2026-05-26).
 *
 * 매핑 규칙 (D16, deferred [8-2]):
 *   - basis        ← USD 절대값 (futuresPrice - indexPrice)
 *   - basis_rate   ← decimal (basis / indexPrice, 사이트 표시 시 *100 후 %)
 *   - annualized_basis_rate ← PERPETUAL 환경 "" 빈 문자열 → null (Binance 의도적 비움,
 *                            WebFetch spike 2026-05-26 확정). M2 canonical-metrics.md
 *                            정의 합의 후 카드 노출 재검토.
 *
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Basis (2026-05-26 조회)
 */
export function normalizeUsdmBasis(
  raw: BinanceUsdmBasis,
): NowFuturesIndicatorInsert {
  // 위생 #5 (extreme value sanity guard): basisRate 절대값 > 5% 의심 (PERPETUAL 보통 ±0.5% 이내)
  const basisRateNum = num(raw.basisRate);
  if (basisRateNum !== null && Math.abs(basisRateNum) > 0.05) {
    console.warn(
      `[normalizeUsdmBasis] ${raw.pair} basisRate=${basisRateNum} > 5% — 의심 (정상 PERPETUAL 범위 외)`,
    );
  }
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.pair, // ★ Binance basis 응답은 pair 필드 사용 (symbol 아님)
    basis: num(raw.basis),
    basis_rate: basisRateNum,
    annualized_basis_rate: num(raw.annualizedBasisRate), // "" → null 자동 변환 (num 헬퍼)
  };
}

/** USDM top-trader account LSR 단건 → indicator의 top_ls_ratio_accounts 도메인. */
export function normalizeUsdmTopLongShortAccount(
  raw: BinanceUsdmTopLongShortAccount,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    top_ls_ratio_accounts: num(raw.longShortRatio),
    top_long_account: num(raw.longAccount),
    top_short_account: num(raw.shortAccount),
  };
}

/** USDM top-trader position LSR 단건. */
export function normalizeUsdmTopLongShortPosition(
  raw: BinanceUsdmTopLongShortPosition,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    top_ls_ratio_positions: num(raw.longShortRatio),
    top_long_position: num(raw.longAccount),
    top_short_position: num(raw.shortAccount),
  };
}

/** USDM global LSR 단건. */
export function normalizeUsdmGlobalLongShort(
  raw: BinanceUsdmGlobalLongShortAccount,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    global_ls_ratio: num(raw.longShortRatio),
    global_long_account: num(raw.longAccount),
    global_short_account: num(raw.shortAccount),
  };
}

/**
 * USDM taker buy/sell ratio 단건.
 * takerlongshortRatio 엔드포인트는 symbol이 응답에 없음 → 호출자가 주입.
 */
export function normalizeUsdmTaker(
  raw: BinanceUsdmTakerLongShort,
  symbol: string,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol,
    taker_buy_sell_ratio: num(raw.buySellRatio),
    taker_buy_vol: num(raw.buyVol),
    taker_sell_vol: num(raw.sellVol),
  };
}

// ─── COINM normalize ──────────────────────────────

export function normalizeCoinmSymbol(raw: BinanceCoinmSymbolInfo): SymbolInsert {
  const priceFilter = findFilter<{ filterType: "PRICE_FILTER"; tickSize: string }>(
    raw.filters,
    "PRICE_FILTER",
  );
  const lotSize = findFilter<{ filterType: "LOT_SIZE"; stepSize: string }>(
    raw.filters,
    "LOT_SIZE",
  );
  const notional = findFilter<{ filterType: "MIN_NOTIONAL"; minNotional: string }>(
    raw.filters,
    "MIN_NOTIONAL",
  );

  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: raw.symbol,
    base_asset: raw.baseAsset,
    quote_asset: raw.quoteAsset,
    status: raw.contractStatus, // COINM은 contractStatus 필드
    contract_type: raw.contractType || null,
    onboard_date: epochToIso(raw.onboardDate),
    delivery_date: epochToIso(raw.deliveryDate),
    price_precision: raw.pricePrecision ?? null,
    quantity_precision: raw.quantityPrecision ?? null,
    tick_size: num(priceFilter?.tickSize),
    step_size: num(lotSize?.stepSize),
    min_notional: num(notional?.minNotional),
  };
}

export function normalizeCoinmTicker(raw: BinanceCoinmTicker): NowFuturesTickerInsert {
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: raw.symbol,
    last_price: num(raw.lastPrice),
    price_change: num(raw.priceChange),
    price_change_pct: num(raw.priceChangePercent),
    weighted_avg_price: num(raw.weightedAvgPrice),
    open_price: num(raw.openPrice),
    high_price: num(raw.highPrice),
    low_price: num(raw.lowPrice),
    volume: num(raw.volume), // 계약 수
    quote_volume: null, // COINM은 quote_volume 없음
    base_volume: num(raw.baseVolume), // COINM 전용
    trade_count: raw.count ?? null,
    open_time: raw.openTime ?? null,
    close_time: raw.closeTime ?? null,
    price_chg_5m: null,
    price_chg_15m: null,
    price_chg_1h: null,
    price_chg_4h: null,
    volume_chg_5m: null,
    volume_chg_15m: null,
    volume_chg_1h: null,
    volume_ratio: null,
  };
}

export function normalizeCoinmPremium(
  raw: BinanceCoinmPremiumIndex,
): NowFuturesIndicatorInsert {
  // ★ N1 hotfix (2026-07-10) — normalizeUsdmPremium 과 동일: last_settled_funding_rate /
  //   last_settled_funding_time 는 여기서 채우지 않는다 (predicted 스냅샷 오염 회피).
  //   COINM 정산 확정값도 collector-history 의 fundingHistoryTask(/dapi/v1/fundingRate)가
  //   history_futures_funding 에 적재 후 last_settled_* 로 반영. 상세=normalizeUsdmPremium 주석.
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: raw.symbol,
    mark_price: num(raw.markPrice),
    index_price: num(raw.indexPrice),
    estimated_settle_price: num(raw.estimatedSettlePrice),
    interest_rate: num(raw.interestRate),
    next_funding_time: raw.nextFundingTime ?? null,
  };
}

export function normalizeCoinmOpenInterest(
  raw: BinanceCoinmOpenInterest,
): NowFuturesIndicatorInsert {
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: raw.symbol,
    open_interest: num(raw.openInterest),
  };
}

/**
 * COINM takerBuySellVol 전용 normalize.
 * USDM과 필드 이름이 달라 전용 변환 로직 필요(C-1 code-reviewer 반영).
 * ratio는 서버 미제공 → takerBuyVol/takerSellVol로 직접 계산 (0 나눗셈 guard).
 * takerBuyVolValue/takerSellVolValue(명목가 기준)는 현재 indicator 스키마에
 * 대응 컬럼이 없어 버림 — 확장 루프에서 필요 시 컬럼 추가.
 */
export function normalizeCoinmTaker(
  raw: BinanceCoinmTakerBuySellVol,
  symbol: string,
): NowFuturesIndicatorInsert {
  const buy = num(raw.takerBuyVol);
  const sell = num(raw.takerSellVol);
  const ratio = buy !== null && sell !== null && sell > 0 ? buy / sell : null;
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol,
    taker_buy_vol: buy,
    taker_sell_vol: sell,
    taker_buy_sell_ratio: ratio,
  };
}

// ─── kline normalize (Step 4 미리 준비 — 사용은 나중) ─

/**
 * Binance kline 배열 응답은 **값 배열** 형태:
 *   [openTime, open, high, low, close, volume, closeTime, quoteVolume,
 *    trades, takerBuyBaseVol, takerBuyQuoteVol, ignore]
 *
 * Step 4에서 kline 폴링 도입 시 재사용할 수 있도록 지금 선언.
 */
export type BinanceKlineRow = [
  number, // 0 openTime
  string, // 1 open
  string, // 2 high
  string, // 3 low
  string, // 4 close
  string, // 5 volume
  number, // 6 closeTime
  string, // 7 quoteVolume
  number, // 8 trades
  string, // 9 takerBuyBaseVol
  string, // 10 takerBuyQuoteVol
  string, // 11 ignore
];

export function normalizeSpotKline(
  raw: BinanceKlineRow,
  symbol: string,
  interval: string,
): HistorySpotKlineInsert {
  return {
    exchange: "binance",
    market_type: "spot",
    symbol,
    interval,
    open_time: raw[0],
    close_time: raw[6],
    open_price: num(raw[1]) ?? 0,
    high_price: num(raw[2]) ?? 0,
    low_price: num(raw[3]) ?? 0,
    close_price: num(raw[4]) ?? 0,
    volume: num(raw[5]) ?? 0,
    quote_volume: num(raw[7]) ?? 0,
    trade_count: raw[8] ?? null,
    taker_buy_base_vol: num(raw[9]),
    taker_buy_quote_vol: num(raw[10]),
  };
}

export function normalizeFuturesKline(
  raw: BinanceKlineRow,
  symbol: string,
  marketType: "futures_usdm" | "futures_coinm",
  interval: string,
): HistoryFuturesKlineInsert {
  return {
    exchange: "binance",
    market_type: marketType,
    symbol,
    interval,
    open_time: raw[0],
    close_time: raw[6],
    open_price: num(raw[1]) ?? 0,
    high_price: num(raw[2]) ?? 0,
    low_price: num(raw[3]) ?? 0,
    close_price: num(raw[4]) ?? 0,
    volume: num(raw[5]) ?? 0,
    quote_volume: marketType === "futures_usdm" ? (num(raw[7]) ?? null) : null,
    base_volume: marketType === "futures_coinm" ? (num(raw[7]) ?? null) : null,
    trade_count: raw[8] ?? null,
    taker_buy_base_vol: num(raw[9]),
    taker_buy_quote_vol: num(raw[10]),
  };
}

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
 */
export function normalizeUsdmPremium(
  raw: BinanceUsdmPremiumIndex,
): NowFuturesIndicatorInsert {
  // M1.8 §8.1 ✅ 2026-05-25 RENAME:
  // - premiumIndex.lastFundingRate (REST) = realized last settled funding rate
  //   (docs verbatim "Latest funding rate", 정산 직후 4h/8h 동안 고정)
  //   → last_settled_funding_rate 컬럼으로 저장 (M1.8 §8.2a-2 본 작업)
  // - WS markPriceUpdate.r = predicted next funding rate (1초 변동) → markPriceWsHandler 가 저장
  // ★ 두 metric 은 시간축이 다른 별개 컬럼. M1.8 §8.0 자문 결과
  // (docs/task-record/M1.8-step0-pre-infra.md §3 Q2) 참조.
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    mark_price: num(raw.markPrice),
    index_price: num(raw.indexPrice),
    estimated_settle_price: num(raw.estimatedSettlePrice),
    last_settled_funding_rate: num(raw.lastFundingRate),
    interest_rate: num(raw.interestRate),
    next_funding_time: raw.nextFundingTime ?? null,
    // last_settled_funding_time 은 미포함 (8.2a-1 quick fix scope 외).
    // M1.8 §8.2a-2 본 작업에서 premiumIndex 응답 spike 후 정확한 매핑 결정 —
    // nextFundingTime - intervalMs 역산 또는 별도 필드 활용. 잘못된 nextFundingTime
    // 직접 매핑 금지 (의미 정반대 — 미래 vs 과거).
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
  // M1.8 §8.1 ✅ 2026-05-25 RENAME — normalizeUsdmPremium 동일 정합.
  // premiumIndex.lastFundingRate = realized last settled funding rate.
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: raw.symbol,
    mark_price: num(raw.markPrice),
    index_price: num(raw.indexPrice),
    estimated_settle_price: num(raw.estimatedSettlePrice),
    last_settled_funding_rate: num(raw.lastFundingRate),
    interest_rate: num(raw.interestRate),
    next_funding_time: raw.nextFundingTime ?? null,
    // last_settled_funding_time 은 미포함 — normalizeUsdmPremium 와 동일 사유 (8.2a-1 scope 외).
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

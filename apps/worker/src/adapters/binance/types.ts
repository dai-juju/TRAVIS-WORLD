// ============================================================
// Binance REST API raw 응답 타입 선언 (M1.3 Step 3).
//
// 출처:
//  - Spot:  https://developers.binance.com/docs/binance-spot-api-docs
//  - USDM:  https://developers.binance.com/docs/derivatives/usds-margined-futures
//  - COINM: https://developers.binance.com/docs/derivatives/coin-margined-futures
//
// 정책:
//  - Binance는 가격·거래량 등 정밀도 민감 필드를 **문자열**로 반환.
//    number 필드(time·count 등)와 섞이지 않도록 타입 선언에 명시.
//  - Zod 런타임 검증은 하지 않는다(성능 이유). 경계는 normalize.ts에서
//    parseFloat/Number로 통일하되 NaN 체크로 graceful 처리.
//  - 필드 이름은 Binance 원문 그대로 (camelCase). DB는 snake_case —
//    변환은 normalize.ts의 책임.
// ============================================================

// ─── Spot ──────────────────────────────────────────

/** /api/v3/exchangeInfo → symbols[] 원소 (spot) */
export interface BinanceSpotSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quotePrecision: number;
  quoteAssetPrecision: number;
  filters: BinanceSymbolFilter[];
  permissions?: string[];
}

/** filters[] 원소 — filterType에 따라 keys가 달라지는 discriminated union */
export type BinanceSymbolFilter =
  | { filterType: "PRICE_FILTER"; tickSize: string; minPrice?: string; maxPrice?: string }
  | { filterType: "LOT_SIZE"; stepSize: string; minQty?: string; maxQty?: string }
  | { filterType: "MARKET_LOT_SIZE"; stepSize: string; minQty?: string; maxQty?: string }
  | { filterType: "NOTIONAL"; minNotional: string; maxNotional?: string; applyMinToMarket?: boolean }
  | { filterType: "MIN_NOTIONAL"; minNotional: string; applyToMarket?: boolean }
  | { filterType: string; [k: string]: unknown }; // 그 외 (PERCENT_PRICE 등 무시)

/** /api/v3/exchangeInfo 전체 응답 */
export interface BinanceSpotExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: BinanceSpotSymbolInfo[];
}

/** /api/v3/ticker/24hr 전체 배치 응답 (array) */
export interface BinanceSpotTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
}

// ─── USDM (/fapi/v1) ──────────────────────────────

/** /fapi/v1/exchangeInfo의 symbols[] 원소 */
export interface BinanceUsdmSymbolInfo {
  symbol: string;
  pair: string;
  contractType: string; // "PERPETUAL", "CURRENT_QUARTER", "NEXT_QUARTER", "" (delisted)
  deliveryDate: number;
  onboardDate: number;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: BinanceSymbolFilter[];
}

export interface BinanceUsdmExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: BinanceUsdmSymbolInfo[];
}

/** /fapi/v1/ticker/24hr (USDM) */
export interface BinanceUsdmTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
  firstId?: number;
  lastId?: number;
}

/** /fapi/v1/premiumIndex 전체 배치 — markPrice + fundingRate + estimated */
export interface BinanceUsdmPremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  interestRate: string;
  nextFundingTime: number;
  time: number;
}

/** /fapi/v1/openInterest (symbol 단건) */
export interface BinanceUsdmOpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}

/** /futures/data/topLongShortAccountRatio (symbol 단건, limit=1) */
export interface BinanceUsdmTopLongShortAccount {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

/** /futures/data/topLongShortPositionRatio (symbol 단건, limit=1) */
export interface BinanceUsdmTopLongShortPosition {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

/** /futures/data/globalLongShortAccountRatio (symbol 단건, limit=1) */
export interface BinanceUsdmGlobalLongShortAccount {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

/** /futures/data/takerlongshortRatio (symbol 단건, limit=1) */
export interface BinanceUsdmTakerLongShort {
  buySellRatio: string;
  buyVol: string;
  sellVol: string;
  timestamp: number;
}

/**
 * /futures/data/basis (pair 단건, contractType + period + limit 필수)
 * — M1.8 §8.2a-2 신설 (2026-05-26).
 * ★ pair 필수 (symbol 아님), contractType=PERPETUAL 만 TRAVIS 사용.
 * ★ annualizedBasisRate 는 PERPETUAL 환경에서 빈 문자열 "" 로 반환 — normalize 에서 null 변환.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Basis (2026-05-26 조회)
 */
export interface BinanceUsdmBasis {
  indexPrice: string;
  contractType: string; // "PERPETUAL" (TRAVIS 한정)
  basisRate: string; // decimal — 카드 표시 시 *100 후 % 부착
  futuresPrice: string;
  annualizedBasisRate: string; // PERPETUAL 에서는 "" 반환 (정상) — normalize null 변환
  basis: string; // USD 절대값 (futuresPrice - indexPrice)
  pair: string;
  timestamp: number;
}

/**
 * /fapi/v1/fundingInfo (단일 호출, 전체 응답 array)
 * — M1.8 §8.2a-2 신설 (2026-05-26).
 * ★ default 8h 코인은 응답에 없음 (negative-space 정의) — 호출자가 Map miss 시 8 fallback.
 * ★ PHAROSUSDT 같은 4h funding 코인 식별 source.
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-Info (2026-05-26 조회)
 */
export interface BinanceUsdmFundingInfo {
  symbol: string;
  adjustedFundingRateCap: string; // 예: "0.02000000" — 펀딩비 상한
  adjustedFundingRateFloor: string; // 예: "-0.02000000" — 펀딩비 하한
  fundingIntervalHours: number; // 4 또는 8
  disclaimer: boolean;
  updateTime: number; // 마지막 갱신 시각 (epoch ms)
}

// ─── USDM history (/futures/data/*Hist, M1.8.5 Step 3 신설 2026-05-31) ─
// 시계열 backfill 전용. 9 interval (5m~1d) × 6 metric.
// 공통 제약 (crypto-domain-expert 자문 2026-05-31): weight 0 / IP 1000 req/5min /
//   limit 최대 500 (default 30) / 데이터 최근 30일.
// 5 endpoint (topLongShortAccount/Position, globalLongShort, taker, basis) 는
//   배열 원소 shape 이 현재 시점 타입과 동일 → 기존 타입 재사용 (limit>1 로 array 수신).
//   openInterestHist 만 응답 shape 이 스냅샷 /fapi/v1/openInterest 와 달라 신규 선언.

/**
 * history backfill 의 period 파라미터 (= interval 컬럼 값).
 * 6 fetcher + Step 4 backfill loop 공유.
 */
export type BinanceHistoryPeriod =
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "12h"
  | "1d";

/**
 * /futures/data/openInterestHist (symbol 단건, period + limit 필수, array 응답).
 * ★ 스냅샷 /fapi/v1/openInterest ({ openInterest, time }) 와 필드명 다름.
 *   - sumOpenInterest      = base asset 수량 (USDM) — DB open_interest 매핑
 *   - sumOpenInterestValue = USD 명목가 (현재 schema 미저장)
 *   - CMCCirculatingSupply = 유통량 (현재 schema 미저장, 일부 응답 누락 가능 → optional)
 * docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics (2026-05-31 조회)
 */
export interface BinanceUsdmOpenInterestHist {
  symbol: string;
  sumOpenInterest: string; // base asset 수량
  sumOpenInterestValue: string; // USD 명목가
  CMCCirculatingSupply?: string; // 일부 응답 누락 가능
  timestamp: number; // epoch ms (interval 경계 정렬)
}

// ─── COINM (/dapi/v1) ──────────────────────────────
// 핵심 차이점:
//  - quote_volume 없음, base_volume만 있음 (계약 단위 → base asset 수량)
//  - 심볼 형식: "BTCUSD_PERP", "BTCUSD_240628" 등
//  - 나머지 구조는 USDM과 거의 동일
// ─────────────────────────────────────────────────

export interface BinanceCoinmSymbolInfo {
  symbol: string;
  pair: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  contractStatus: string; // COINM은 status 대신 contractStatus
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: BinanceSymbolFilter[];
}

export interface BinanceCoinmExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: BinanceCoinmSymbolInfo[];
}

/** /dapi/v1/ticker/24hr (COINM) — baseVolume 존재, quoteVolume 존재 여부 버전별 */
export interface BinanceCoinmTicker {
  symbol: string;
  pair?: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string; // 계약 수
  baseVolume: string; // base asset 수량
  openTime: number;
  closeTime: number;
  count: number;
}

export interface BinanceCoinmPremiumIndex {
  symbol: string;
  pair?: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  interestRate: string;
  nextFundingTime: number;
  time: number;
}

export interface BinanceCoinmOpenInterest {
  symbol: string;
  pair?: string;
  openInterest: string;
  contractType?: string;
  time: number;
}

/**
 * /futures/data/takerBuySellVol (COINM) 응답 — USDM의
 * takerlongshortRatio와 **필드 이름·구성이 완전히 다르다**.
 *   USDM : { buySellRatio, buyVol, sellVol, timestamp }
 *   COINM: { takerBuyVol, takerSellVol, takerBuyVolValue, takerSellVolValue, timestamp }
 * (Binance 공식: COINM은 ratio를 서버에서 계산해 주지 않음 → normalize에서 계산.)
 */
export interface BinanceCoinmTakerBuySellVol {
  pair: string;
  contractType: string;
  takerBuyVol: string;
  takerSellVol: string;
  takerBuyVolValue: string;
  takerSellVolValue: string;
  timestamp: number;
}

// ============================================================
// Binance REST API raw 응답 타입 (공유 — M1.9 Step 1, 2026-06-02 추출).
//
// 배경:
//   M1.9 Step 1 에서 apps/worker → packages/exchange-collectors 인프라 추출 시,
//   아래 타입들은 **history fetcher(본 패키지) 와 현재 시점(now) 어댑터(apps/worker)
//   양쪽이 공유** 하므로 collectors 로 이동. apps/worker 의 types.ts 는 이 파일을
//   re-export 하여 now-어댑터의 import 경로(`./types.js`)를 무변경 유지.
//
//   순수 now-전용 타입(Spot/Coinm ticker, exchangeInfo, premiumIndex, fundingInfo,
//   OpenInterest 스냅샷 등)은 apps/worker/src/adapters/binance/types.ts 에 잔류.
//
// 출처:
//  - USDM:  https://developers.binance.com/docs/derivatives/usds-margined-futures
//
// 정책:
//  - Binance는 가격·거래량 등 정밀도 민감 필드를 **문자열**로 반환.
//  - 필드 이름은 Binance 원문 그대로 (camelCase). DB는 snake_case — 변환은 normalize 책임.
// ============================================================

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

// ─── 펀딩 정산 이벤트 (/fapi/v1/fundingRate · /dapi/v1/fundingRate, 사이클 2 Step 6) ─

/**
 * realized(settled) funding rate 이벤트 — 정산 1회당 1 원소, 시간 오름차순 배열 응답.
 * USDM/COINM 공유 (필드 구조 동일, markPrice 만 차이).
 *
 * Binance USDM realized funding rate history ref:
 * https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History
 * - rate limit: SHARES 500/5min/IP with /fapi/v1/fundingInfo (★ /futures/data 1000 풀과 별개)
 * - limit max 1000 / default 100 / 시간 미지정 시 최근 200개 / ascending
 * - symbol **optional** — 생략 시 전 심볼 전역 시간순 (backfill 배치 경로)
 * COINM: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Get-Funding-Rate-History-of-Perpetual-Futures
 * - weight 1 (일반 IP 풀), symbol **required**, delivery 심볼은 빈 배열
 * - ★ markPrice 필드 문서 미등재 → optional (라이브 smoke 로 실존 확인, 없어도 graceful)
 * 조회: 2026-07-09
 */
export interface BinanceFundingRateEvent {
  symbol: string;
  fundingTime: number; // 정산 시각 (epoch ms)
  fundingRate: string; // realized rate (raw decimal 문자열)
  markPrice?: string; // 정산 시점 mark price — USDM 제공 / COINM 미보장
}

// ─── USDM history (/futures/data/*Hist, M1.8.5 Step 3 신설 2026-05-31) ─
// 시계열 backfill 전용. 9 interval (5m~1d) × 6 metric.
// 공통 제약 (crypto-domain-expert 자문 2026-05-31): weight 0 / IP 1000 req/5min /
//   limit 최대 500 (default 30) / 데이터 최근 30일.

/**
 * history backfill 의 period 파라미터 (= interval 컬럼 값).
 * 6 fetcher + backfill loop 공유.
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

// ─── COINM history (/futures/data/*, dapi.binance.com, M1.9 Step 2-C 신설 2026-06-04) ─
// ★ USDM 와 분기 5가지 (crypto-domain-expert 자문 2026-06-04, 절대 미러링 금지):
//   1. base URL = https://dapi.binance.com (fapi 아님)
//   2. 파라미터 pair vs symbol 비대칭 — topLongShortAccountRatio 만 request 키가 symbol(값=BTCUSD),
//      나머지 5개는 pair. response 는 6개 모두 pair 필드.
//   3. Taker endpoint(/takerBuySellVol) + 필드(takerBuyVol/takerSellVol) 완전 상이, buySellRatio 없음.
//   4. OI 단위 반전 — sumOpenInterest = contract 수(USDM 은 base asset 수량).
//   5. Top Position 응답 필드명 = longPosition/shortPosition (USDM 은 longAccount/shortAccount).
// scope: PERPETUAL(_PERP) 만. 공통 제약 USDM 동일 (weight 0 / IP 1000 req/5min / limit 500 / 최근 30일).

/**
 * /futures/data/openInterestHist (COINM, pair + contractType=PERPETUAL + period + limit).
 * ★ 단위 반전 (USDM 대비):
 *   - sumOpenInterest      = **contract 수** (1 contract = $100) — DB open_interest 매핑
 *   - sumOpenInterestValue = base asset 수량(BTC) (현재 schema 미저장)
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Open-Interest-Statistics (2026-06-04 조회)
 */
export interface BinanceCoinmOpenInterestHist {
  // ★ 실응답엔 symbol 필드 없음 (라이브 dapi 확인 2026-06-04): {contractType,sumOpenInterest,sumOpenInterestValue,pair,timestamp}.
  //   → symbol 은 normalize 가 pair+"_PERP" 로 재구성 (유일 경로).
  pair: string; // BTCUSD
  contractType: string; // "PERPETUAL"
  sumOpenInterest: string; // ★ contract 수 (USDM 과 의미 반전)
  sumOpenInterestValue: string; // base asset 수량 (BTC)
  timestamp: number;
}

/**
 * /futures/data/topLongShortAccountRatio (COINM, pair 파라미터 — 라이브 실측 2026-06-04).
 * (자문 초안의 "symbol 키" 는 -1130 으로 반증. 6개 metric 동일 pair.) response 는 pair 필드.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio-Accounts (2026-06-04 조회)
 */
export interface BinanceCoinmTopLongShortAccount {
  pair: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

/**
 * /futures/data/topLongShortPositionRatio (COINM, pair 파라미터).
 * ★ 응답 필드 = longPosition/shortPosition (USDM 의 longAccount/shortAccount 와 다름).
 *   DB 는 ratio(top_ls_ratio_positions) 만 저장이라 분해 필드 영향 적으나 raw 타입 분리 필요.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio-Positions (2026-06-04 조회)
 */
export interface BinanceCoinmTopLongShortPosition {
  pair: string;
  longShortRatio: string;
  longPosition: string;
  shortPosition: string;
  timestamp: number;
}

/**
 * /futures/data/globalLongShortAccountRatio (COINM, pair 파라미터).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Long-Short-Ratio (2026-06-04 조회)
 */
export interface BinanceCoinmGlobalLongShortAccount {
  pair: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

/**
 * /futures/data/takerBuySellVol (COINM, pair + contractType=PERPETUAL).
 * ★ USDM(takerlongshortRatio)와 endpoint·필드 완전 상이.
 *   - takerBuyVol/takerSellVol = contract 수, buySellRatio **없음** → normalize 가 직접 계산.
 *   - takerBuyVolValue/takerSellVolValue = base asset 명목가 (현재 schema 미저장).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Taker-Buy-Sell-Volume (2026-06-04 조회)
 */
export interface BinanceCoinmTakerBuySellVol {
  pair: string;
  contractType: string; // "PERPETUAL"
  takerBuyVol: string; // contract 수
  takerSellVol: string;
  takerBuyVolValue: string; // base asset 명목가
  takerSellVolValue: string;
  timestamp: number;
}

/**
 * /futures/data/basis (COINM, pair + contractType=PERPETUAL).
 * 필드 구성은 USDM 과 동일 (basisRate/annualizedBasisRate/basis/pair...).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Basis (2026-06-04 조회)
 */
export interface BinanceCoinmBasis {
  indexPrice: string;
  contractType: string; // "PERPETUAL"
  basisRate: string;
  futuresPrice: string;
  annualizedBasisRate: string; // PERPETUAL 에서 "" 반환 가능 → normalize null 변환
  basis: string;
  pair: string;
  timestamp: number;
}

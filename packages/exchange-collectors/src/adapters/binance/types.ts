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

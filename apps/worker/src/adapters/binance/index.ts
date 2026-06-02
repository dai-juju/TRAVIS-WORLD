// Binance 어댑터 배럴 (M1.3 Step 3).
//
// 워커 main이나 smoke 스크립트는 이 배럴을 통해 3개 adapter에 접근.
// types.ts·normalize.ts의 내부 유틸은 re-export 하지 않는다 — 어댑터 외부
// 코드는 raw Binance 응답 구조를 몰라야 하고, DB Insert 타입만 다룬다.

export { BinanceSpotAdapter } from "./BinanceSpotAdapter.js";
export { BinanceUsdmAdapter } from "./BinanceUsdmAdapter.js";
export { BinanceCoinmAdapter } from "./BinanceCoinmAdapter.js";
// client(rate-limit) 는 M1.9 Step 1 에서 packages/exchange-collectors 로 이동.
// 공용 타입은 collectors 배럴에서 직접 import 할 것.
export type {
  BatchPerSymbolResult,
  BinanceRequestOptions,
} from "@travis/exchange-collectors";

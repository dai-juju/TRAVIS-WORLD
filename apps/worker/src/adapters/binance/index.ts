// Binance 어댑터 배럴 (M1.3 Step 3).
//
// 워커 main이나 smoke 스크립트는 이 배럴을 통해 3개 adapter에 접근.
// types.ts·normalize.ts의 내부 유틸은 re-export 하지 않는다 — 어댑터 외부
// 코드는 raw Binance 응답 구조를 몰라야 하고, DB Insert 타입만 다룬다.

export { BinanceSpotAdapter } from "./BinanceSpotAdapter.js";
export { BinanceUsdmAdapter } from "./BinanceUsdmAdapter.js";
export { BinanceCoinmAdapter } from "./BinanceCoinmAdapter.js";
export type { BatchPerSymbolResult, BinanceRequestOptions } from "./client.js";

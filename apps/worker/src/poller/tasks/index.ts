// Task 배럴 (M1.3 Step 5c 이후).
//
// Step 5 전환 이력:
//   - Step 5b: ticker 2개(SPOT/FUTURES) → tickerWsHandler 로 이관
//   - Step 5c: premium → markPriceWsHandler 로 이관
// 여기 남는 REST 폴링: perSymbolTask 한 개 (OI/LSR/Taker — Binance WS 스트림 없음).

export { createPerSymbolTask, type PerSymbolTaskDeps } from "./perSymbolTask.js";
export { retryOnTransient, isTransientError } from "./_upsertRetry.js";

// Task 배럴 (M1.3 Step 5c 이후).
//
// Step 5 전환 이력:
//   - Step 5b: ticker 2개(SPOT/FUTURES) → tickerWsHandler 로 이관
//   - Step 5c: premium → markPriceWsHandler 로 이관
//   - M1.6 Step 4 hotfix B (2026-04-28): ticker24hrBatchTask 신규 — WS miniTicker
//     로 임시 롤백하면서 빠진 24h 변화율 6 필드 보완용 1분 폴링.
// REST 폴링 task 2개:
//   - perSymbolTask: OI/LSR/Taker (Binance WS 스트림 없음)
//   - ticker24hrBatchTask: 24h 변화율 (WS miniTicker 미포함 6 필드, hotfix B 한시)

export { createPerSymbolTask, type PerSymbolTaskDeps } from "./perSymbolTask.js";
export {
  createTicker24hrBatchTask,
  type Ticker24hrBatchTaskDeps,
} from "./ticker24hrBatchTask.js";
export { retryOnTransient, isTransientError } from "./_upsertRetry.js";

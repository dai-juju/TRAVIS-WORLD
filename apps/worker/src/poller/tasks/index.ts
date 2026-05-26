// Task 배럴 (M1.3 Step 5c + M1.6 Step 4 hotfix B + M1.8 §8.2a-2 2026-05-26 확장).
//
// Step 5 전환 이력:
//   - Step 5b: ticker 2개(SPOT/FUTURES) → tickerWsHandler 로 이관
//   - Step 5c: premium → markPriceWsHandler 로 이관 (predicted_funding_rate WS source)
//   - M1.6 Step 4 hotfix B (2026-04-28): ticker24hrBatchTask 신규 — WS miniTicker
//     로 임시 롤백하면서 빠진 24h 변화율 6 필드 보완용 1분 폴링.
//   - M1.8 §8.2a-2 (2026-05-26): fundingInfoTask + premiumIndexTask 신규 — funding
//     interval 4h/8h cache + last_settled_funding_rate / interest_rate / last_settled_funding_time 채움.
//     perSymbolTask 에 basis fetcher 추가 (별도 hotfix 또는 본 sub-substep C).
//
// REST 폴링 task (M1.8 §8.2a-2 시점 4개):
//   - perSymbolTask: OI/LSR Acc/LSR Pos/Global LSR/Taker/Basis (Binance WS 스트림 없음)
//   - ticker24hrBatchTask: 24h 변화율 (WS miniTicker 미포함 6 필드, hotfix B 한시)
//   - fundingInfoTask: 24h funding interval cache + symbols dual-write
//   - premiumIndexTask: 30분 last_settled_funding_* + interest_rate

export { createPerSymbolTask, type PerSymbolTaskDeps } from "./perSymbolTask.js";
export {
  createTicker24hrBatchTask,
  type Ticker24hrBatchTaskDeps,
} from "./ticker24hrBatchTask.js";
export {
  createFundingInfoTask,
  type FundingInfoTaskDeps,
  getFundingIntervalHours,
  getFundingIntervalMap,
} from "./fundingInfoTask.js";
export {
  createPremiumIndexTask,
  type PremiumIndexTaskDeps,
} from "./premiumIndexTask.js";
export { retryOnTransient, isTransientError } from "./_upsertRetry.js";

// Task 배럴 (M1.3 Step 5c + M1.6 Step 4 hotfix B + M1.8 §8.2a-2 + §8.3b-1 2026-05-27 확장).
//
// Step 5 전환 이력:
//   - Step 5b: ticker 2개(SPOT/FUTURES) → tickerWsHandler 로 이관
//   - Step 5c: premium → markPriceWsHandler 로 이관 (predicted_funding_rate WS source)
//   - M1.6 Step 4 hotfix B (2026-04-28): ticker24hrBatchTask 신규 — WS miniTicker
//     로 임시 롤백하면서 빠진 24h 변화율 6 필드 보완용 1분 폴링.
//   - M1.8 §8.2a-2 (2026-05-26): fundingInfoTask + premiumIndexTask 신규 — funding
//     interval 4h/8h cache + last_settled_funding_rate / interest_rate / last_settled_funding_time 채움.
//     perSymbolTask 에 basis fetcher 추가 (별도 hotfix 또는 본 sub-substep C).
//   - M1.8 §8.3b-1 (2026-05-27): historyBackfillTask 신규 — 14일 lookback × 9 interval ×
//     5 metric × USDM TRADING 심볼 backfill. **dry-run mode 만 기본 활성화** (실 호출 X) —
//     사용자 결정 D20/D21/D22 (8.3c) 전까지는 5분당 1회 시뮬레이션 로깅만.
//
// REST 폴링 task (M1.9 Step 1 시점 4개 — historyBackfillTask 는 collector-history 로 이관):
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
// M2 테마 A 후속 [10-22] (2026-06-11): symbols 마스터 24h 동기화 — 위생 #3 이행.
export {
  createSyncSymbolsTask,
  runSyncSymbols,
  type SyncSymbolsTaskDeps,
} from "./syncSymbolsTask.js";
// M1.9 Step 1 (2026-06-02): historyBackfillTask(dryRun 데드코드) 삭제 — forward-fill 은
//   apps/collector-history 별도 배포 단위로 이동. backfill 코어/재시도 래퍼는
//   packages/exchange-collectors 로 추출됨 (@travis/exchange-collectors 에서 직접 import).
export {
  retryOnTransient,
  isTransientError,
} from "@travis/exchange-collectors";

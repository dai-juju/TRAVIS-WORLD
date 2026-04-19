// Task 배럴 (M1.3 Step 4 Substep 4c).
// Step 4 현재 task 3개. kline은 per-symbol의 물리 한계 때문에
// Step 5 WebSocket(!kline@arr 스트림)으로 이관.

export { createTickerTask, type TickerTaskDeps } from "./tickerTask.js";
export { createPremiumTask, type PremiumTaskDeps } from "./premiumTask.js";
export { createPerSymbolTask, type PerSymbolTaskDeps } from "./perSymbolTask.js";

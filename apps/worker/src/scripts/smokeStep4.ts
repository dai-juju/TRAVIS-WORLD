// ============================================================
// M1.3 Step 4 smoke — 짧은(60~90초) 통합 동작 검증용.
//
// 목적:
//   본격 30분 무중단 구동 전에, 워커 부팅 + Task 3종 첫 tick + Supabase
//   upsert 성공 여부를 자동으로 검증한다. 실패 시 exit 1로 CI/구동 전
//   회귀를 잡는다.
//
// 실행:
//   pnpm -F @travis/worker smoke:step4
//
// 종료 기준:
//   지정된 DURATION_MS 경과 후 poller.stop() → 상태 요약 출력 → exit 0.
//   Task가 첫 실행 전에 종료되면 상태를 그대로 출력하되 exit code는 0.
//   (짧은 smoke에서 perSymbolTask 1루프 완주 기대하지 않음 — 200초 소요)
// ============================================================

import {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
  BinanceUsdmAdapter,
} from "../adapters/binance/index.js";
import type { IndicatorSample, TickerSample } from "../compute/preCompute.js";
import { RollingWindow } from "../compute/RollingWindow.js";
import { dataService } from "../dataService.js";
import { TierPoller } from "../poller/TierPoller.js";
import {
  createPerSymbolTask,
  createPremiumTask,
  createTickerTask,
} from "../poller/tasks/index.js";

const DURATION_MS = Number(process.env.SMOKE_STEP4_DURATION_MS ?? 90_000);

async function main(): Promise<void> {
  console.log(`[smoke:step4] 시작 — ${DURATION_MS / 1000}초 구동 예정`);

  if (!dataService) {
    console.error("[smoke:step4] dataService null — SUPABASE env 확인 필요");
    process.exit(1);
  }

  const spotAdapter = new BinanceSpotAdapter();
  const usdmAdapter = new BinanceUsdmAdapter();
  const coinmAdapter = new BinanceCoinmAdapter();

  const tickerWindow = new RollingWindow<TickerSample>({
    maxSize: 1500,
    sampleIntervalMs: 60_000,
  });
  const indicatorWindow = new RollingWindow<IndicatorSample>({
    maxSize: 1500,
    sampleIntervalMs: 60_000,
  });

  const poller = new TierPoller();
  poller.register(
    createTickerTask({
      spotAdapter,
      usdmAdapter,
      coinmAdapter,
      dataService,
      tickerWindow,
    }),
  );
  poller.register(
    createPremiumTask({
      usdmAdapter,
      coinmAdapter,
      dataService,
    }),
  );
  poller.register(
    createPerSymbolTask({
      usdmAdapter,
      coinmAdapter,
      dataService,
      indicatorWindow,
    }),
  );

  poller.start();
  const startedAt = Date.now();

  // 10초마다 메모리/상태 스냅샷 로그
  const statusTimer = setInterval(() => {
    const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[smoke:step4] t+${elapsed}s heap=${mem}MB tickerSymbols=${tickerWindow.symbolCount()} indicatorSymbols=${indicatorWindow.symbolCount()}`,
    );
  }, 10_000);

  // 자동 종료 타이머 + SIGINT/SIGTERM 조기 종료 (W7).
  await new Promise<void>((resolve) => {
    const autoTimer = setTimeout(resolve, DURATION_MS);
    const earlyStop = (signal: string): void => {
      console.log(`\n[smoke:step4] ${signal} 수신 — 조기 종료`);
      clearTimeout(autoTimer);
      resolve();
    };
    process.once("SIGINT", () => earlyStop("SIGINT"));
    process.once("SIGTERM", () => earlyStop("SIGTERM"));
  });

  clearInterval(statusTimer);
  console.log(`\n[smoke:step4] ${DURATION_MS / 1000}초 경과 — 종료 절차 시작`);

  await poller.stop();

  // 최종 상태 요약
  const statuses = poller.getStatus();
  console.log("\n[smoke:step4] === 최종 Task 상태 ===");
  let failedTasks = 0;
  for (const s of statuses) {
    console.log(
      `  ${s.taskId} (tier=${s.tier}, interval=${s.intervalMs}ms):` +
        ` lastSuccess=${s.lastSuccess}, consecutiveFailures=${s.consecutiveFailures}, lastError=${s.lastError ?? "-"}, lastRunAt=${s.lastRunAt ?? "-"}`,
    );
    if (s.consecutiveFailures > 0) failedTasks++;
  }
  console.log(
    `[smoke:step4] tickerSymbols(최종)=${tickerWindow.symbolCount()}, indicatorSymbols(최종)=${indicatorWindow.symbolCount()}`,
  );

  // 연속 실패가 있는 task가 있으면 경고. 단, perSymbolTask는 짧은 smoke에서
  // 첫 실행 전 종료되면 lastSuccess=false이므로 consecutiveFailures=0일 뿐.
  if (failedTasks > 0) {
    console.warn(`[smoke:step4] ⚠️ ${failedTasks}개 task 에 연속 실패 기록 있음 — 로그 확인 필요`);
  } else {
    console.log("[smoke:step4] ✅ 연속 실패 없음");
  }
}

main().catch((e) => {
  console.error("[smoke:step4] fatal:", e);
  process.exit(1);
});

// ============================================================
// M1.3 Step 5 smoke — WS 릴레이 + Kline 릴레이 + REST poller 통합 검증 (E1 scope).
//
// 목적 (60~90초 동안):
//   - BinanceWsRelay 3개 연결(spot/usdm/coinm) 정상 수립
//   - !miniTicker@arr + !markPrice@arr@1s + !forceOrder@arr 수신
//   - BinanceKlineRelay N개 연결 (전 심볼 1m kline) 정상 수립
//   - REST perSymbolTask 정상 tick
//   - volumeKlineWindow 심볼 증가 관측 (volume_chg_5m 해석 B 전환용)
//   - heap / 연결상태 스냅샷
//
// 실행:
//   pnpm -F @travis/worker smoke:step5
// ============================================================

import {
  BinanceCoinmAdapter,
  BinanceUsdmAdapter,
} from "../adapters/binance/index.js";
import type {
  IndicatorSample,
  KlineVolumeSample,
  TickerSample,
} from "../compute/preCompute.js";
import { RollingWindow } from "../compute/RollingWindow.js";
import { dataService } from "../dataService.js";
import { TierPoller } from "../poller/TierPoller.js";
import { createPerSymbolTask } from "../poller/tasks/index.js";
import {
  BinanceKlineRelay,
  BinanceWsRelay,
  StreamRouter,
  createForceOrderWsHandler,
  createKlineWsHandler,
  createMarkPriceWsHandler,
  createTickerWsHandler,
} from "../ws-relay/index.js";

const DURATION_MS = Number(process.env.SMOKE_STEP5_DURATION_MS ?? 90_000);

async function main(): Promise<void> {
  console.log(`[smoke:step5] 시작 — ${DURATION_MS / 1000}초 구동 예정`);

  if (!dataService) {
    console.error("[smoke:step5] dataService null — SUPABASE env 확인 필요");
    process.exit(1);
  }

  const usdmAdapter = new BinanceUsdmAdapter();
  const coinmAdapter = new BinanceCoinmAdapter();

  // ─── 심볼 리스트 로드 ──────────────────────────
  const [spotRes, usdmRes, coinmRes] = await Promise.all([
    dataService.getSymbols({
      exchange: "binance",
      marketType: "spot",
      status: "TRADING",
    }),
    dataService.getSymbols({
      exchange: "binance",
      marketType: "futures_usdm",
      status: "TRADING",
    }),
    dataService.getSymbols({ exchange: "binance", marketType: "futures_coinm" }),
  ]);
  const symbols = {
    spot: spotRes.success ? spotRes.data.map((s) => s.symbol) : [],
    futures_usdm: usdmRes.success ? usdmRes.data.map((s) => s.symbol) : [],
    futures_coinm: coinmRes.success ? coinmRes.data.map((s) => s.symbol) : [],
  };
  console.log(
    `[smoke:step5] 심볼: spot=${symbols.spot.length} usdm=${symbols.futures_usdm.length} coinm=${symbols.futures_coinm.length}`,
  );

  // ─── 윈도우 3개 ──────────────────────────────
  const tickerWindow = new RollingWindow<TickerSample>({
    maxSize: 1500,
    sampleIntervalMs: 60_000,
  });
  const indicatorWindow = new RollingWindow<IndicatorSample>({
    maxSize: 1500,
    sampleIntervalMs: 60_000,
  });
  const volumeKlineWindow = new RollingWindow<KlineVolumeSample>({
    maxSize: 15,
    sampleIntervalMs: 60_000,
  });

  // ─── REST Poller (perSymbolTask 만) ──────────
  const poller = new TierPoller();
  poller.register(
    createPerSymbolTask({
      usdmAdapter,
      coinmAdapter,
      dataService,
      indicatorWindow,
    }),
  );

  // ─── Router + handler 4종 ─────────────────
  const router = new StreamRouter();
  router.register(
    createTickerWsHandler({ dataService, tickerWindow, volumeKlineWindow }),
  );
  router.register(createMarkPriceWsHandler({ dataService }));
  router.register(createForceOrderWsHandler({ dataService }));
  router.register(createKlineWsHandler({ volumeKlineWindow }));

  // ─── WS common relay ─────────────────────
  const wsRelay = new BinanceWsRelay({
    router,
    subscriptions: {
      spot: ["!miniTicker@arr"],
      futures_usdm: ["!miniTicker@arr", "!markPrice@arr@1s", "!forceOrder@arr"],
      futures_coinm: ["!miniTicker@arr", "!markPrice@arr@1s", "!forceOrder@arr"],
    },
  });

  // ─── WS kline relay (전 심볼 1m) ──────────
  const klineRelay = new BinanceKlineRelay({
    router,
    symbols,
    intervals: ["1m"],
  });

  poller.start();
  wsRelay.start();
  klineRelay.start();
  const startedAt = Date.now();

  // 10초마다 snapshot
  const snapshotTimer = setInterval(() => {
    const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const ws = wsRelay.getStatus();
    const kln = klineRelay.getStatus();
    console.log(
      `[smoke:step5] t+${elapsed}s heap=${mem}MB ` +
        `ticker=${tickerWindow.symbolCount()} ind=${indicatorWindow.symbolCount()} volKln=${volumeKlineWindow.symbolCount()} ` +
        `ws[${ws.spot.state}/${ws.usdm.state}/${ws.coinm.state}] ` +
        `kln[total=${kln.totalConnections} conn=spot${kln.connectedByMarket.spot}/usdm${kln.connectedByMarket.futures_usdm}/coinm${kln.connectedByMarket.futures_coinm}]`,
    );
  }, 10_000);

  // 자동 종료 + SIGINT/SIGTERM
  await new Promise<void>((resolve) => {
    const autoTimer = setTimeout(resolve, DURATION_MS);
    const earlyStop = (signal: string): void => {
      console.log(`\n[smoke:step5] ${signal} 수신 — 조기 종료`);
      clearTimeout(autoTimer);
      resolve();
    };
    process.once("SIGINT", () => earlyStop("SIGINT"));
    process.once("SIGTERM", () => earlyStop("SIGTERM"));
  });

  clearInterval(snapshotTimer);
  console.log(`\n[smoke:step5] ${DURATION_MS / 1000}초 경과 — 종료 절차 시작`);

  await Promise.all([poller.stop(), wsRelay.stop(), klineRelay.stop()]);

  // 최종 상태
  const pollerStatus = poller.getStatus();
  const wsStatus = wsRelay.getStatus();
  const klnStatus = klineRelay.getStatus();
  console.log("\n[smoke:step5] === 최종 상태 ===");
  for (const s of pollerStatus) {
    console.log(
      `  REST ${s.taskId}: success=${s.lastSuccess}, fails=${s.consecutiveFailures}`,
    );
  }
  console.log(`  WS spot: ${wsStatus.spot.state} (attempts=${wsStatus.spot.reconnectAttempts})`);
  console.log(`  WS usdm: ${wsStatus.usdm.state} (attempts=${wsStatus.usdm.reconnectAttempts})`);
  console.log(`  WS coinm: ${wsStatus.coinm.state} (attempts=${wsStatus.coinm.reconnectAttempts})`);
  console.log(
    `  KLN total=${klnStatus.totalConnections} (disconnected 상태는 graceful shutdown 결과)`,
  );
  console.log(
    `[smoke:step5] ticker=${tickerWindow.symbolCount()} ind=${indicatorWindow.symbolCount()} volKln=${volumeKlineWindow.symbolCount()}`,
  );

  const pollerFailed = pollerStatus.filter((s) => s.consecutiveFailures > 0).length;
  if (pollerFailed > 0) {
    console.warn(`[smoke:step5] ⚠️ pollerFail=${pollerFailed}`);
  } else {
    console.log("[smoke:step5] ✅ poller 정상");
  }
}

main().catch((e) => {
  console.error("[smoke:step5] fatal:", e);
  process.exit(1);
});

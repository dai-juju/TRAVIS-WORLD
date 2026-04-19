// TRAVIS 워커 진입점 (M1.3 Step 4 Substep 4d).
//
// 역할:
//   - Binance 3개 어댑터 + dataService 싱글톤 연결
//   - 롤링 윈도우 2개(ticker용, indicator용) 생성
//   - TierPoller 생성 + 3개 Task 등록 + start
//   - SIGINT/SIGTERM 수신 시 graceful shutdown (진행 중 tick 완료 대기)
//
// 절대 crash 금지(CLAUDE.md): main catch에서 exit 1 하지 않고 로그만 남긴다.
// 단, 초기 부팅 실패(adapters 생성 등)는 워커가 돌아갈 수 없으니 exit 1 허용.
//
// Step 5 예정: WS 릴레이(BinanceWsRelay) 추가 + kline @arr 스트림 수신.

import {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
  BinanceUsdmAdapter,
} from "./adapters/binance/index.js";
import { RollingWindow } from "./compute/RollingWindow.js";
import type { IndicatorSample, TickerSample } from "./compute/preCompute.js";
import { dataService } from "./dataService.js";
import { TierPoller } from "./poller/TierPoller.js";
import {
  createPerSymbolTask,
  createPremiumTask,
  createTickerTask,
} from "./poller/tasks/index.js";

// ─── 설정 상수 (Plan 결정사항) ─────────────────────

const ROLLING_WINDOW_MAX_SIZE = 1500; // 25시간치 (1분 간격 샘플링 기준)
const ROLLING_WINDOW_SAMPLE_INTERVAL_MS = 60_000; // 1분 1샘플
const STATUS_LOG_INTERVAL_MS = 300_000; // 5분마다 상태 로그

// ─── 부팅 ───────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log("[worker] TRAVIS 워커 부팅...");

  // dataService 연결 검증.
  if (!dataService) {
    console.error("[worker] dataService 가 null — SUPABASE env 확인. 종료.");
    process.exit(1);
  }

  // 어댑터 3개 생성 (stateless, 싱글톤으로 공유).
  const spotAdapter = new BinanceSpotAdapter();
  const usdmAdapter = new BinanceUsdmAdapter();
  const coinmAdapter = new BinanceCoinmAdapter();

  // 롤링 윈도우 2개: ticker용 (price/volume), indicator용 (OI).
  // key format: `${market_type}:${symbol}`
  const tickerWindow = new RollingWindow<TickerSample>({
    maxSize: ROLLING_WINDOW_MAX_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });
  const indicatorWindow = new RollingWindow<IndicatorSample>({
    maxSize: ROLLING_WINDOW_MAX_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });

  // Poller 생성 + Task 등록.
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

  // ─── 주기적 상태 로그 (모니터링용) ─────────────
  const statusTimer = setInterval(() => {
    const statuses = poller.getStatus();
    const mem = process.memoryUsage();
    const memMb = Math.round(mem.heapUsed / 1024 / 1024);
    console.log(
      `[worker] status (heap=${memMb}MB, tickerWin symbols=${tickerWindow.symbolCount()}, indicatorWin symbols=${indicatorWindow.symbolCount()}):`,
    );
    for (const s of statuses) {
      console.log(
        `  - ${s.taskId} (${s.intervalMs}ms, tier=${s.tier}): success=${s.lastSuccess}, fails=${s.consecutiveFailures}, lastErr=${s.lastError ?? "-"}`,
      );
    }
  }, STATUS_LOG_INTERVAL_MS);

  // ─── graceful shutdown ────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[worker] ${signal} 수신 — graceful shutdown 시작`);
    clearInterval(statusTimer);
    try {
      await poller.stop();
    } catch (e) {
      console.error("[worker] poller.stop 실패:", e);
    }
    console.log("[worker] 종료 완료");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  // unhandledRejection 가드 — Poller 내부는 이미 catch하지만 main 루프 방어.
  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandledRejection:", reason);
  });

  console.log("[worker] 정상 부팅 완료 — Ctrl+C로 종료");
}

bootstrap().catch((err) => {
  // 부팅 실패는 워커가 돌아갈 수 없으므로 exit. 이후 런타임 에러는
  // Poller 내부에서 graceful 처리(crash 없음).
  console.error("[worker] 부팅 실패:", err);
  process.exit(1);
});

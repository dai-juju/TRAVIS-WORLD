// TRAVIS 워커 진입점 (M1.3 Step 5e 이후).
//
// 역할:
//   - REST 어댑터 2개 (perSymbolTask 전용) + WsRelay(common) + KlineRelay(1m kline)
//   - 롤링 윈도우 3개: ticker / indicator / volumeKline(1m)
//   - REST poller: perSymbolTask 1개 (OI/LSR/Taker — WS 스트림 없음)
//   - WS relay (common): !miniTicker@arr + !markPrice@arr@1s + !forceOrder@arr
//   - WS kline relay: <symbol>@kline_1m (전 심볼, Combined Stream chunk)
//   - SIGINT/SIGTERM 수신 시 graceful shutdown (poller + ws + kline 전부)
//
// 절대 crash 금지(CLAUDE.md): main catch에서 exit 1 하지 않고 로그만 남긴다.
// 단, 초기 부팅 실패(adapters 생성 등)는 워커가 돌아갈 수 없으니 exit 1 허용.

import {
  BinanceCoinmAdapter,
  BinanceUsdmAdapter,
} from "./adapters/binance/index.js";
import { RollingWindow } from "./compute/RollingWindow.js";
import type {
  IndicatorSample,
  KlineVolumeSample,
  TickerSample,
} from "./compute/preCompute.js";
import { dataService } from "./dataService.js";
import { TierPoller } from "./poller/TierPoller.js";
import { createPerSymbolTask } from "./poller/tasks/index.js";
import { withTimeout } from "./utils/withTimeout.js";
import {
  BinanceKlineRelay,
  BinanceWsRelay,
  StreamRouter,
  createForceOrderWsHandler,
  createKlineWsHandler,
  createMarkPriceWsHandler,
  createTickerWsHandler,
} from "./ws-relay/index.js";

// ─── 설정 상수 ─────────────────────────────────────

const ROLLING_WINDOW_MAX_SIZE = 1500; // 25시간치 (1분 간격 샘플링 기준)
const ROLLING_WINDOW_SAMPLE_INTERVAL_MS = 60_000; // 1분 1샘플
/**
 * volumeKlineWindow 는 "최근 10분치" 면 충분 (5m vs 5m 비교).
 * 메모리 절약 위해 15개로 축소 (15분치, 3~4배 여유).
 */
const VOLUME_KLINE_WINDOW_SIZE = 15;
const STATUS_LOG_INTERVAL_MS = 300_000; // 5분마다 상태 로그

const WS_SUBSCRIPTIONS = {
  spot: ["!miniTicker@arr"] as const,
  futures_usdm: [
    "!miniTicker@arr",
    "!markPrice@arr@1s",
    "!forceOrder@arr",
  ] as const,
  futures_coinm: [
    "!miniTicker@arr",
    "!markPrice@arr@1s",
    "!forceOrder@arr",
  ] as const,
} as const;

// ─── 부팅 ──────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log("[worker] TRAVIS 워커 부팅...");

  if (!dataService) {
    console.error("[worker] dataService 가 null — SUPABASE env 확인. 종료.");
    process.exit(1);
  }

  // REST 어댑터 (perSymbolTask 용)
  const usdmAdapter = new BinanceUsdmAdapter();
  const coinmAdapter = new BinanceCoinmAdapter();

  // ─── 심볼 리스트 조회 (전 심볼 kline WS 구독용) ─────
  const symbols = await loadAllSymbols();
  console.log(
    `[worker] 심볼 로드 완료: spot=${symbols.spot.length} usdm=${symbols.futures_usdm.length} coinm=${symbols.futures_coinm.length}`,
  );

  // ─── 롤링 윈도우 3개 ────────────────────────────
  const tickerWindow = new RollingWindow<TickerSample>({
    maxSize: ROLLING_WINDOW_MAX_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });
  const indicatorWindow = new RollingWindow<IndicatorSample>({
    maxSize: ROLLING_WINDOW_MAX_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });
  // 1m kline volume 전용 — volume_chg_5m 해석 B 계산에만 사용.
  const volumeKlineWindow = new RollingWindow<KlineVolumeSample>({
    maxSize: VOLUME_KLINE_WINDOW_SIZE,
    sampleIntervalMs: ROLLING_WINDOW_SAMPLE_INTERVAL_MS,
  });

  // ─── REST Poller (OI/LSR/Taker 만 남음) ─────────────
  const poller = new TierPoller();
  poller.register(
    createPerSymbolTask({
      usdmAdapter,
      coinmAdapter,
      dataService,
      indicatorWindow,
    }),
  );

  // ─── StreamRouter + handler 4종 등록 ───────────
  const router = new StreamRouter();
  router.register(
    createTickerWsHandler({
      dataService,
      tickerWindow,
      volumeKlineWindow,
    }),
  );
  router.register(createMarkPriceWsHandler({ dataService }));
  router.register(createForceOrderWsHandler({ dataService }));
  router.register(createKlineWsHandler({ volumeKlineWindow }));

  // ─── WS relay (common) ──────────────────────────
  const wsRelay = new BinanceWsRelay({
    router,
    subscriptions: {
      spot: [...WS_SUBSCRIPTIONS.spot],
      futures_usdm: [...WS_SUBSCRIPTIONS.futures_usdm],
      futures_coinm: [...WS_SUBSCRIPTIONS.futures_coinm],
    },
  });

  // ─── WS kline relay (전 심볼 1m) ────────────────
  const klineRelay = new BinanceKlineRelay({
    router,
    symbols,
    intervals: ["1m"], // E1 scope: 1m 만
  });

  // ─── 시작 ───────────────────────────────────────
  poller.start();
  wsRelay.start();
  klineRelay.start();

  // ─── 주기적 상태 로그 ───────────────────────────
  const statusTimer = setInterval(() => {
    const pollerStatuses = poller.getStatus();
    const wsStatus = wsRelay.getStatus();
    const klineStatus = klineRelay.getStatus();
    const mem = process.memoryUsage();
    const memMb = Math.round(mem.heapUsed / 1024 / 1024);
    console.log(
      `[worker] status (heap=${memMb}MB, tickerWin=${tickerWindow.symbolCount()}, indicatorWin=${indicatorWindow.symbolCount()}, volumeKlineWin=${volumeKlineWindow.symbolCount()}):`,
    );
    for (const s of pollerStatuses) {
      console.log(
        `  REST ${s.taskId} (${s.intervalMs}ms, tier=${s.tier}): success=${s.lastSuccess}, fails=${s.consecutiveFailures}, lastErr=${s.lastError ?? "-"}`,
      );
    }
    console.log(
      `  WS  spot: ${wsStatus.spot.state}, attempts=${wsStatus.spot.reconnectAttempts}, lastMsg=${formatAge(wsStatus.spot.lastMessageAt)}`,
    );
    console.log(
      `  WS  usdm: ${wsStatus.usdm.state}, attempts=${wsStatus.usdm.reconnectAttempts}, lastMsg=${formatAge(wsStatus.usdm.lastMessageAt)}`,
    );
    console.log(
      `  WS  coinm: ${wsStatus.coinm.state}, attempts=${wsStatus.coinm.reconnectAttempts}, lastMsg=${formatAge(wsStatus.coinm.lastMessageAt)}`,
    );
    console.log(
      `  KLN total=${klineStatus.totalConnections} connected spot=${klineStatus.connectedByMarket.spot}/usdm=${klineStatus.connectedByMarket.futures_usdm}/coinm=${klineStatus.connectedByMarket.futures_coinm}`,
    );
  }, STATUS_LOG_INTERVAL_MS);

  // ─── graceful shutdown ────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[worker] ${signal} 수신 — graceful shutdown 시작`);
    clearInterval(statusTimer);
    try {
      await Promise.all([poller.stop(), wsRelay.stop(), klineRelay.stop()]);
    } catch (e) {
      console.error("[worker] shutdown 실패:", e);
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

  process.on("unhandledRejection", (reason) => {
    console.error("[worker] unhandledRejection:", reason);
  });

  console.log("[worker] 정상 부팅 완료 — Ctrl+C로 종료");
}

// ─── 심볼 로드 ─────────────────────────────────────

/**
 * symbols 테이블에서 마켓별 TRADING 심볼 리스트 조회.
 * getSymbols 는 PAGE=1,000 pagination 루프로 전 심볼 확보
 * (2026-04-20 실측: SPOT TRADING 1,408 / USDM 608 / COINM 30).
 *
 * 각 쿼리는 withTimeout 으로 60초 가드 — Supabase 간헐 장애 시 무한 hang 방지.
 * Promise.allSettled 로 부분 실패 허용 — 한 마켓이 timeout 나도 다른 마켓은 진행.
 * 실패한 마켓은 빈 리스트 → KlineRelay 는 0개 연결로 graceful 동작.
 */
async function loadAllSymbols(): Promise<{
  spot: string[];
  futures_usdm: string[];
  futures_coinm: string[];
}> {
  if (!dataService) {
    return { spot: [], futures_usdm: [], futures_coinm: [] };
  }
  const SYMBOL_QUERY_TIMEOUT_MS = 60_000;
  const [spotRes, usdmRes, coinmRes] = await Promise.allSettled([
    withTimeout(
      dataService.getSymbols({
        exchange: "binance",
        marketType: "spot",
        status: "TRADING",
      }),
      SYMBOL_QUERY_TIMEOUT_MS,
      "getSymbols(spot)",
    ),
    withTimeout(
      dataService.getSymbols({
        exchange: "binance",
        marketType: "futures_usdm",
        status: "TRADING",
      }),
      SYMBOL_QUERY_TIMEOUT_MS,
      "getSymbols(futures_usdm)",
    ),
    withTimeout(
      dataService.getSymbols({
        exchange: "binance",
        marketType: "futures_coinm",
        // COINM 은 TRADING 30 + DELIVERING 8 (2026-04-20 MCP 실측).
        // DELIVERING 은 Binance WS 에 push 되지 않으므로 kline 구독 대상에서 제외.
        status: "TRADING",
      }),
      SYMBOL_QUERY_TIMEOUT_MS,
      "getSymbols(futures_coinm)",
    ),
  ]);

  // PromiseSettledResult + Result<SymbolRow[]> 2중 wrap 언래핑.
  // timeout/network 예외는 rejected, Supabase 쿼리 실패는 fulfilled+success:false.
  // 타입 명시로 의도 가시화 — typeof 우회 대신 구조적 alias 사용.
  type SymbolQueryOutcome = (typeof spotRes);
  const pick = (res: SymbolQueryOutcome, label: string): string[] => {
    if (res.status === "rejected") {
      const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.error(`[worker] ${label} 심볼 조회 실패(timeout/network): ${reason}`);
      return [];
    }
    if (!res.value.success) {
      console.error(`[worker] ${label} 심볼 조회 실패: ${res.value.error}`);
      return [];
    }
    return res.value.data.map((s) => s.symbol);
  };

  return {
    spot: pick(spotRes, "spot"),
    futures_usdm: pick(usdmRes, "usdm"),
    futures_coinm: pick(coinmRes, "coinm"),
  };
}

// ─── 헬퍼 ─────────────────────────────────────────

function formatAge(ts: number | null): string {
  if (ts === null) return "-";
  const age = Math.round((Date.now() - ts) / 1000);
  return `${age}s`;
}

// ─── 진입 ─────────────────────────────────────────

bootstrap().catch((err) => {
  console.error("[worker] 부팅 실패:", err);
  process.exit(1);
});

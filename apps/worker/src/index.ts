// TRAVIS 워커 진입점 (M1.3 Step 5e ~ M1.6 Step 3.5 hotfix 2026-04-27).
//
// 역할:
//   - REST 어댑터 2개 (perSymbolTask 전용) + WsRelay(common) + KlineRelay(1m kline)
//   - 롤링 윈도우 3개: ticker / indicator / volumeKline(1m)
//   - REST poller: perSymbolTask 1개 (OI/LSR/Taker — WS 스트림 없음)
//   - WS relay (common): !ticker@arr + !markPrice@arr@1s + !forceOrder@arr
//   - WS kline relay: <symbol>@kline_1m (전 심볼, Combined Stream chunk)
//   - SIGINT/SIGTERM 수신 시 graceful shutdown (poller + ws + kline 전부)
//
// M1.6 Step 3.5 hotfix (2026-04-27): `!miniTicker@arr` → `!ticker@arr` 전환.
// 사유: mini 페이로드는 priceChangePercent (24h 변화율) 미포함 → DB 영구 stale.
// 사용자 발견 후 사이트=DB 일치 도메인 원칙 명문화 + full ticker 17 필드 적재.
//
// 절대 crash 금지(CLAUDE.md): main catch에서 exit 1 하지 않고 로그만 남긴다.
// 단, 초기 부팅 실패(adapters 생성 등)는 워커가 돌아갈 수 없으니 exit 1 허용.

import {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
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
import {
  createFundingInfoTask,
  createHistoryBackfillTask,
  createPerSymbolTask,
  createPremiumIndexTask,
  createTicker24hrBatchTask,
} from "./poller/tasks/index.js";
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
/**
 * symbols 재로드 주기 (M1.4 Step 4.7, 2026-04-22).
 * 상장폐지/신규상장이 드물어 24h 간격이면 충분 (Binance 는 보통 24h 사전공지 후 SETTLING 전환).
 * 더 공격적 동기화 원하면 1h 등으로 줄일 수 있지만 DB 부하/REST rate limit 트레이드오프.
 */
const SYMBOL_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// M1.6 Step 4 hotfix B (2026-04-28): `!ticker@arr` → `!miniTicker@arr` 임시 롤백.
// 사유: Windows 개발 환경에서 USDM 608 + SPOT 1408 심볼 × 17필드 풀티커 조합 시
//   handleOpen 후 메시지 0건 도착 → 120s stale → 무한 재연결 → DB 영구 stale.
//   perMessageDeflate=false 만으로는 해소 안 됨 (검증 SQL 결과 stall 시간이
//   Hotfix C 적용 후에도 자연 증가). 페이로드 크기 자체가 환경 한계 트리거.
//   COINM 30 심볼은 mini 든 full 이든 정상 작동 → payload-size selective failure 확정.
// 트레이드오프: priceChangePercent / priceChange / weightedAvgPrice / count /
//   openTime / closeTime 6 필드는 mini 페이로드에 없음 → REST batch 폴링
//   (ticker24hrBatchTask) 으로 1분 1회 보완. 1초 일치 → 1분 stale 후퇴.
// 한시 조치: Hetzner 24/7 이전 직후 `!ticker@arr` + perMessageDeflate=false 재시도.
//   정상 작동 확인되면 즉시 full ticker 복귀 (M1.7 직전 deferred 재회수).
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

  // REST 어댑터
  // - usdm/coinm: perSymbolTask (OI/LSR/Taker)
  // - spot/usdm/coinm: ticker24hrBatchTask (24h 변화율 보완, M1.6 Step 4 hotfix B)
  const spotAdapter = new BinanceSpotAdapter();
  const usdmAdapter = new BinanceUsdmAdapter();
  const coinmAdapter = new BinanceCoinmAdapter();

  // ─── 심볼 리스트 조회 (전 심볼 kline WS 구독용) ─────
  const symbols = await loadAllSymbols();
  console.log(
    `[worker] 심볼 로드 완료: spot=${symbols.spot.length} usdm=${symbols.futures_usdm.length} coinm=${symbols.futures_coinm.length}`,
  );

  /**
   * TRADING 심볼 allowlist (M1.4 Step 4.7).
   *
   * tickerWsHandler 가 `!ticker@arr` 수신 시 이 Set 을 체크해 SETTLING/CLOSE
   * 등 상장폐지 심볼은 upsert 하지 않는다. (M1.6 Step 3.5 hotfix 2026-04-27) 참조(Set 객체) 는 유지하고 내용만
   * swap 하는 방식으로 24h 주기 재로드에서 갱신 — 핸들러는 매번 최신 값 조회.
   */
  const tradingSymbolsByMarket = {
    spot: new Set(symbols.spot),
    futures_usdm: new Set(symbols.futures_usdm),
    futures_coinm: new Set(symbols.futures_coinm),
  };

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

  // ─── REST Poller ─────────────
  // M1.8 §8.3b-1 (2026-05-27) — 5 task 등록 (기존 4 + 신규 1 historyBackfill dry-run):
  //   1. perSymbolTask: OI/LSR Acc/LSR Pos/Global LSR/Taker/Basis (USDM 6 fetcher 직선 ~11분 cycle)
  //   2. ticker24hrBatchTask: 24h 변화율 (M1.6 Step 4 hotfix B 한시, 1분 주기)
  //   3. fundingInfoTask: 24h funding interval 4h/8h cache + symbols dual-write (D9)
  //   4. premiumIndexTask: 30분 last_settled_funding_* + interest_rate + last_settled_funding_time (D18)
  //   5. historyBackfillTask: 5분당 1회 dry-run 시뮬레이션 (M1.8 §8.3b-1 신설, 실 호출 X) —
  //      27,360 REST + 20.5M row + ~2.28h 분량을 운영 진입 전 정량 검증.
  //      실 backfill 진입 (8.3c) 은 사용자 D20/D21/D22 결정 후. 본 등록은 dryRun:true 안전 우회.
  //
  // 등록 순서 의미:
  //   fundingInfoTask 가 채운 Map 을 premiumIndexTask 가 lookup. 첫 cycle 동안은 Map 비어있어
  //   premiumIndexTask 가 default 8h 적용 → fundingInfo 첫 호출 후 자연 동기화.
  //   같은 cycle 안에서 두 task 가 순서대로 실행되지는 않음 (TierPoller 가 각 task 독립
  //   intervalMs 로 스케줄). 그러나 worker 부팅 직후 fundingInfo 가 먼저 1회 실행되도록
  //   register 순서를 의도적으로 fundingInfo → premiumIndex 로 배치.
  //   historyBackfillTask 는 dry-run 이라 다른 task 와 의존성 없음 (마지막 등록).
  const poller = new TierPoller();
  poller.register(
    createPerSymbolTask({
      usdmAdapter,
      coinmAdapter,
      dataService,
      indicatorWindow,
    }),
  );
  poller.register(
    createTicker24hrBatchTask({
      spotAdapter,
      usdmAdapter,
      coinmAdapter,
      dataService,
      // M1.8 §8.4 (2026-05-26) — TRADING allowlist 주입.
      // 사유: ticker24hrBatchTask 의 fetchTicker24hr 가 BREAK 심볼도 전체 응답 반환.
      // partial upsert 가 BREAK row INSERT → row 만 존재 + last_price/volume 등 NULL.
      // tickerWsHandler 는 이미 TRADING 필터 (M1.4 Step 4.7) — 동일 패턴 미러링.
      tradingSymbolsByMarket,
    }),
  );
  // M1.8 §8.2a-2 신설 — fundingInfo Map source (Map 채움)
  poller.register(
    createFundingInfoTask({
      usdmAdapter,
      dataService,
    }),
  );
  // M1.8 §8.2a-2 신설 — premiumIndex polling (Map 의존, miss 시 8h default)
  // M1.8 §8.4-d (2026-05-26) — TRADING allowlist 주입 (BREAK row 누적 차단)
  poller.register(
    createPremiumIndexTask({
      usdmAdapter,
      dataService,
      tradingSymbolsByMarket,
    }),
  );
  // M1.8 §8.3b-1 신설 — historyBackfillTask dry-run mode.
  // 안전 우회: dryRun=true 명시 → 실 API 호출 0건 / DB INSERT 0건 / 시뮬레이션 로깅만.
  //   - 5분당 1회 호출 수 / row 수 / 시간 / 용량 / 메모리 추정 출력.
  //   - 실 backfill 진입 (8.3c) 은 사용자 D20/D21/D22 결정 + history fetcher 5종 신설 후.
  // tradingSymbolsByMarket 공유: 24h 주기 재로드 시 자동 최신 allowlist 적용 (§8.4-d 패턴).
  poller.register(
    createHistoryBackfillTask({
      usdmAdapter,
      dataService,
      tradingSymbolsByMarket,
      dryRun: true,
    }),
  );

  // ─── StreamRouter + handler 4종 등록 ───────────
  const router = new StreamRouter();
  router.register(
    createTickerWsHandler({
      dataService,
      tickerWindow,
      volumeKlineWindow,
      tradingSymbolsByMarket,
    }),
  );
  // M1.8 §8.4-d (2026-05-26) — markPriceWsHandler 에 TRADING allowlist 주입.
  // BREAK 심볼이 markPrice push 받아 indicator 에 누적되는 stale 함정 차단 (8.4-a 패턴).
  router.register(
    createMarkPriceWsHandler({ dataService, tradingSymbolsByMarket }),
  );
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

  // ─── 주기적 symbols 재로드 (Step 4.7) ──────────
  // 24h 마다 symbols 테이블에서 TRADING 상태를 다시 가져와 allowlist Set 교체.
  // Binance 에서 SETTLING 으로 전환된 심볼을 감지해 tickerWsHandler 가 upsert
  // 중단하도록 유도. 에러는 로그만 남기고 기존 Set 유지 (graceful).
  const symbolRefreshTimer = setInterval(() => {
    loadAllSymbols()
      .then((fresh) => {
        tradingSymbolsByMarket.spot = new Set(fresh.spot);
        tradingSymbolsByMarket.futures_usdm = new Set(fresh.futures_usdm);
        tradingSymbolsByMarket.futures_coinm = new Set(fresh.futures_coinm);
        console.log(
          `[worker] symbols refresh: spot=${fresh.spot.length} usdm=${fresh.futures_usdm.length} coinm=${fresh.futures_coinm.length}`,
        );
      })
      .catch((e) => {
        console.error("[worker] symbols refresh 실패 (기존 allowlist 유지):", e);
      });
  }, SYMBOL_REFRESH_INTERVAL_MS);

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
    clearInterval(symbolRefreshTimer);
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

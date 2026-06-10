// TRAVIS 워커 진입점 (M1.3 Step 5e ~ M2 테마 A Step 2.5, 2026-06-10).
//
// 역할:
//   - REST 어댑터 2개 (perSymbolTask 전용) + WsRelay(COINM @arr) + ChunkedRelay
//     (USDM·spot per-symbol) + KlineRelay(1m kline)
//   - 롤링 윈도우 3개: ticker / indicator / volumeKline(1m)
//   - REST poller: perSymbolTask 1개 (OI/LSR/Taker — WS 스트림 없음)
//   - SIGINT/SIGTERM 수신 시 graceful shutdown (poller + ws 3종 전부)
//
// WS 구독 정책 (M2 테마 A Step 2.5 — [10-11] @arr stall 근본 수정, 2026-06-10):
//   - spot          : `<symbol>@ticker` chunked (full 21필드) — @arr stall 회피
//   - futures_usdm  : `<symbol>@ticker`(full 17필드) + `<symbol>@markPrice@1s`
//                     + `<symbol>@forceOrder` chunked — @arr stall 회피 + full 승격
//   - futures_coinm : `!miniTicker@arr` + `!markPrice@arr@1s` + `!forceOrder@arr`
//                     현행 유지 (30심볼 소형 @arr 무사고 — 변경 0)
//   상세 사유는 아래 WS_SUBSCRIPTIONS / CHUNKED_STREAM_SUFFIXES 주석 참조.
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
import { TierPoller } from "@travis/shared";
import {
  createFundingInfoTask,
  createPerSymbolTask,
  createPremiumIndexTask,
  createTicker24hrBatchTask,
} from "./poller/tasks/index.js";
import { withTimeout } from "./utils/withTimeout.js";
import {
  BinanceChunkedRelay,
  BinanceKlineRelay,
  BinanceWsRelay,
  StreamCoalescer,
  StreamRouter,
  buildPerSymbolStreams,
  createForceOrderWsHandler,
  createKlineWsHandler,
  createMarkPriceWsHandler,
  createTickerWsHandler,
  type CoalescerRule,
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

// ─── WS 구독 스트림 (M2 테마 A Step 2.5 — [10-11] @arr stall 근본 수정, 2026-06-10) ──
//
// 히스토리:
//   M1.6 Step 4 hotfix B (2026-04-28): Windows 개발 환경 payload-size selective
//     failure 로 전 마켓 mini 임시 롤백 → M1.8 §8.4-e (2026-05-28) spot 만 full 복귀.
//   M2 테마 A Step 2.5 (2026-06-10): production(Hetzner Linux)에서도 `@arr`
//     큰 프레임 stall 확정 — USDM markPrice/funding frozen + 청산 43일 정지 +
//     spot/usdm 매 2.5분 sawtooth 재연결 (재시작 복구 불가, 구조적).
//     docs/task-record/M2-themeA-incident-arr-stream-stall.md 참조.
//
// 현 구조 (근본 수정):
//   USDM·spot 의 @arr 소비 스트림 전부를 BinanceChunkedRelay(per-symbol,
//   250 streams/conn — 무사고 kline relay 패턴) + StreamCoalescer(1초 재조립)
//   로 이전. COINM 만 본 @arr relay 에 잔류 (30심볼 = 프레임 작아 무사고).
//
//   - spot          : (chunked 로 이전 — 본 relay 구독 0)
//   - futures_usdm  : (chunked 로 이전 — 본 relay 구독 0)
//   - futures_coinm : `!miniTicker@arr` + `!markPrice@arr@1s` + `!forceOrder@arr` 유지
//
//   구독 0개 마켓은 BinanceWsRelay.start() 가 연결 자체를 생략 (기존 동작).
const WS_SUBSCRIPTIONS = {
  spot: [] as const,
  futures_usdm: [] as const,
  futures_coinm: [
    "!miniTicker@arr",
    "!markPrice@arr@1s",
    "!forceOrder@arr",
  ] as const,
} as const;

// ─── chunked per-symbol 스트림 suffix (M2 테마 A Step 2.5) ──────────────────
//
// 심볼당 suffix 인접 배치(buildPerSymbolStreams) → 모든 chunk 에 markPrice@1s
// (1초 고정 push)가 섞여 연결 생존 신호 보장. sparse 한 forceOrder(청산 없으면
// 무음 — 공식 문서 확인 2026-06-10)가 watchdog 오발동을 일으키지 않는 구조.
//
//   - USDM: @ticker(full 17필드 — [3-50] full 승격) + @markPrice@1s + @forceOrder
//           608 심볼 × 3 = 1,824 streams → 8 연결
//   - spot: @ticker(full 21필드) — 1,408 심볼 → 6 연결
//   - COINM: chunked 미사용 (@arr 잔류)
//
// 페이로드 규모: @arr 시절과 동일한 데이터를 작은 프레임 여러 개로 받는 것 —
// 총 트래픽/파싱량 동급, 연결 수만 +14 (Binance 300 conn/5min 한도 대비 여유).
const CHUNKED_STREAM_SUFFIXES = {
  spot: ["@ticker"] as const,
  futures_usdm: ["@ticker", "@markPrice@1s", "@forceOrder"] as const,
  futures_coinm: [] as const,
} as const;

// per-symbol 단건 → 기존 @arr 핸들러 계약 재조립 규칙 (streamCoalescer.ts 헤더 참조).
// synthetic 이름은 기존 핸들러 canHandle 과 일치해야 함 (tickerWsHandler 등).
// 타입 명시 (code-reviewer W1): mode 오타·키 누락을 컴파일 타임에 차단.
const COALESCER_RULES: readonly CoalescerRule[] = [
  { suffix: "@markPrice@1s", synthetic: "!markPrice@arr@1s", mode: "batch" },
  { suffix: "@ticker", synthetic: "!ticker@arr", mode: "batch" },
  // forceOrder 는 기존 핸들러 계약도 단건 객체 → passthrough
  { suffix: "@forceOrder", synthetic: "!forceOrder@arr", mode: "passthrough" },
];

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
  // M1.9 Step 1 (2026-06-02) — 4 task 등록 (historyBackfillTask 는 apps/collector-history 로 이관):
  //   1. perSymbolTask: OI/LSR Acc/LSR Pos/Global LSR/Taker/Basis (USDM 6 fetcher 직선 ~11분 cycle)
  //   2. ticker24hrBatchTask: 24h 변화율 (M1.6 Step 4 hotfix B 한시, 1분 주기)
  //   3. fundingInfoTask: 24h funding interval 4h/8h cache + symbols dual-write (D9)
  //   4. premiumIndexTask: 30분 last_settled_funding_* + interest_rate + last_settled_funding_time (D18)
  //
  // history forward-fill 은 별도 IP 가 필요(같은 IP backfill+perSymbol 합산 시 -1003 ban 실측,
  //   2026-05-31)하여 production worker 에서 분리 — apps/collector-history(M1.9) 또는
  //   별도 IP one-shot 스크립트(scripts/runHistoryBackfill.ts)로 수행.
  //
  // 등록 순서 의미:
  //   fundingInfoTask 가 채운 Map 을 premiumIndexTask 가 lookup. 첫 cycle 동안은 Map 비어있어
  //   premiumIndexTask 가 default 8h 적용 → fundingInfo 첫 호출 후 자연 동기화.
  //   같은 cycle 안에서 두 task 가 순서대로 실행되지는 않음 (TierPoller 가 각 task 독립
  //   intervalMs 로 스케줄). 그러나 worker 부팅 직후 fundingInfo 가 먼저 1회 실행되도록
  //   register 순서를 의도적으로 fundingInfo → premiumIndex 로 배치.
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

  // ─── WS chunked relay (USDM·spot per-symbol — [10-11] @arr stall 근본 수정) ──
  // 심볼 리스트는 부트 시점 스냅샷 (klineRelay 와 동일 정책 — 신규상장 반영은
  // 워커 재시작 시. 상장폐지는 tradingSymbolsByMarket allowlist 가 upsert 차단).
  const streamCoalescer = new StreamCoalescer({
    router,
    rules: COALESCER_RULES,
  });
  const chunkedRelay = new BinanceChunkedRelay({
    sink: streamCoalescer,
    streamsByMarket: {
      spot: buildPerSymbolStreams(symbols.spot, CHUNKED_STREAM_SUFFIXES.spot),
      futures_usdm: buildPerSymbolStreams(
        symbols.futures_usdm,
        CHUNKED_STREAM_SUFFIXES.futures_usdm,
      ),
      futures_coinm: [], // COINM 은 @arr 잔류 (변경 0)
    },
  });

  // ─── 시작 ───────────────────────────────────────
  poller.start();
  wsRelay.start();
  klineRelay.start();
  streamCoalescer.start(); // relay 보다 먼저 — 첫 메시지부터 버퍼링 가능하도록
  chunkedRelay.start();

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
    // chunked relay (Step 2.5) — maxSilence 가 수초 이상 지속되면 stall 신호.
    const chunkedStatus = chunkedRelay.getStatus();
    console.log(
      `  CHK total=${chunkedStatus.totalConnections} connected spot=${chunkedStatus.connectedByMarket.spot}/usdm=${chunkedStatus.connectedByMarket.futures_usdm}, maxSilence=${chunkedStatus.maxSilenceMs === null ? "-" : `${Math.round(chunkedStatus.maxSilenceMs / 1000)}s`}`,
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
      await Promise.all([
        poller.stop(),
        wsRelay.stop(),
        klineRelay.stop(),
        chunkedRelay.stop(),
      ]);
      // relay 정지 후 마지막 — 잔여 버퍼 최종 flush (유실 방지)
      streamCoalescer.stop();
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

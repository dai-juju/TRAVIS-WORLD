// ============================================================
// TRAVIS history forward-fill 수집기 진입점 (M1.9 Step 1 골격, 2026-06-02).
//
// 역할 (M1.9 Step 2-B 본구현):
//   - TierPoller bootstrap + forward-fill task 3개 register (interval 그룹별: 단기/중기/장기)
//   - SIGINT/SIGTERM graceful shutdown (poller stop)
//   - 24h 심볼 allowlist 재로드 타이머 (Supabase read-only)
//     ⚠️ 2-B: forward-fill 의 executeHistoryBackfill 이 getSymbols 를 자체 호출하므로 본 로드는
//        현재 카운트 로그 용도. boot 부 loadUsdmSymbols → loadTradingSymbols(marketType) 일반화는 2-D(S5).
//
// 배포 단위 분리 근거 (M1.9):
//   production worker 와 같은 IP 로 backfill 시 Binance /futures/data IP quota 초과
//   → -1003 ban 실측(2026-05-31). 이 수집기는 별도 Hetzner 서버(별도 IP)에서 돌아 충돌 회피.
//
// 확장 골격 (YAGNI):
//   미래 task 는 poller.register(createXxxTask(...)) 한 줄 추가만으로 확장 (TierPoller 무수정).
//
// 절대 crash 금지(CLAUDE.md): main catch 에서 로그만 남긴다. 단 초기 부팅 실패(dataService null)
//   는 돌아갈 수 없으니 exit 1 허용.
// ============================================================

import { TierPoller, type MarketType } from "@travis/shared";
import { dataService } from "./dataService.js";
import {
  createForwardFillTasks,
  type ForwardFillMarket,
} from "./poller/forwardFillTask.js";
import {
  createFundingHistoryTasks,
  type FundingHistoryMarket,
} from "./poller/fundingHistoryTask.js";

// ─── 설정 상수 ─────────────────────────────────────

const STATUS_LOG_INTERVAL_MS = 300_000; // 5분마다 상태 로그
const SYMBOL_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h 심볼 재로드
const SYMBOL_QUERY_TIMEOUT_MS = 60_000;

/** 옵션 env — forward-fill rate (req/min). 미설정 시 forwardFillTask 기본값. */
const FORWARD_FILL_REQ_PER_MIN = process.env.FORWARD_FILL_REQ_PER_MIN
  ? Number(process.env.FORWARD_FILL_REQ_PER_MIN)
  : undefined;

/**
 * 수집 market (롤아웃 순차, ROADMAP §M1.9 #3): 기본 USDM 만.
 * FORWARD_FILL_COINM=1 시 COINM 추가 — USDM forward-fill 2~3일 검증 후 켠다.
 */
const FORWARD_FILL_MARKETS: ForwardFillMarket[] =
  process.env.FORWARD_FILL_COINM === "1"
    ? ["futures_usdm", "futures_coinm"]
    : ["futures_usdm"];

/**
 * 펀딩 정산 수집 (사이클 2 Step 6, 2026-07-09) — market 목록은 forward-fill 과 동행
 * (FORWARD_FILL_COINM 재사용, 새 env 불필요 — 현 서버는 usdm+coinm). 사용자 결정:
 * COINM 포함. FUNDING_HISTORY=0 은 kill-switch (기본 켜짐 — 첫 cycle = 60일 backfill).
 */
const FUNDING_HISTORY_ENABLED = process.env.FUNDING_HISTORY !== "0";
const FUNDING_HISTORY_MARKETS: FundingHistoryMarket[] =
  process.env.FORWARD_FILL_COINM === "1"
    ? ["futures_usdm", "futures_coinm"]
    : ["futures_usdm"];

// ─── 부팅 ──────────────────────────────────────────

async function bootstrap(): Promise<void> {
  console.log("[collector-history] TRAVIS forward-fill 수집기 부팅...");

  if (!dataService) {
    console.error(
      "[collector-history] dataService 가 null — SUPABASE env 확인. 종료.",
    );
    process.exit(1);
  }

  // 부팅 시 market 별 심볼 카운트 로그 (forward-fill core 가 자체 getSymbols — 본 로드는 가시성용).
  for (const market of FORWARD_FILL_MARKETS) {
    const syms = await loadTradingSymbols(market);
    console.log(`[collector-history] 심볼 로드: ${market}=${syms.length}`);
  }

  // ─── 협조적 취소 컨트롤러 ([8-31]ⓑ) ────────────────
  // SIGTERM/SIGINT 수신 시 abort() → 진행 중 forward-fill cycle 이 페이지/throttle/fetch
  //   경계마다 즉시 graceful 중단 → systemd TimeoutStopSec 초과(SIGKILL) 회피.
  const shutdownController = new AbortController();

  // ─── TierPoller + forward-fill task (market × interval 그룹) ────
  const poller = new TierPoller();
  for (const task of createForwardFillTasks({
    dataService,
    reqPerMin: FORWARD_FILL_REQ_PER_MIN,
    markets: FORWARD_FILL_MARKETS,
    signal: shutdownController.signal,
  })) {
    poller.register(task);
  }
  console.log(
    `[collector-history] forward-fill markets=[${FORWARD_FILL_MARKETS.join(", ")}] tasks=${poller.getStatus().length}`,
  );

  // ─── 펀딩 정산 이벤트 task (사이클 2 Step 6) ────
  // history_futures_funding — anchor 증분, 최초 가동 첫 cycle = 60일 backfill.
  if (FUNDING_HISTORY_ENABLED) {
    for (const task of createFundingHistoryTasks({
      dataService,
      markets: FUNDING_HISTORY_MARKETS,
      signal: shutdownController.signal,
    })) {
      poller.register(task);
    }
    console.log(
      `[collector-history] funding-history markets=[${FUNDING_HISTORY_MARKETS.join(", ")}] 등록 (총 tasks=${poller.getStatus().length})`,
    );
  } else {
    console.log("[collector-history] funding-history 비활성 (FUNDING_HISTORY=0)");
  }

  poller.start();

  // ─── 주기적 심볼 재로드 (read-only Supabase) ────
  // 상장폐지/신규상장 24h 이하 반영. 에러는 로그만 (graceful).
  const symbolRefreshTimer = setInterval(() => {
    for (const market of FORWARD_FILL_MARKETS) {
      loadTradingSymbols(market)
        .then((fresh) => {
          console.log(
            `[collector-history] symbols refresh: ${market}=${fresh.length}`,
          );
        })
        .catch((e) => {
          console.error(
            "[collector-history] symbols refresh 실패 (graceful):",
            e,
          );
        });
    }
  }, SYMBOL_REFRESH_INTERVAL_MS);

  // ─── 주기적 상태 로그 ───────────────────────────
  const statusTimer = setInterval(() => {
    const statuses = poller.getStatus();
    const mem = process.memoryUsage();
    const memMb = Math.round(mem.heapUsed / 1024 / 1024);
    console.log(`[collector-history] status (heap=${memMb}MB):`);
    for (const s of statuses) {
      console.log(
        `  REST ${s.taskId} (${s.intervalMs}ms, tier=${s.tier}): success=${s.lastSuccess}, fails=${s.consecutiveFailures}, lastErr=${s.lastError ?? "-"}`,
      );
    }
  }, STATUS_LOG_INTERVAL_MS);

  // ─── graceful shutdown ────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[collector-history] ${signal} 수신 — graceful shutdown 시작`);
    // ★ [8-31]ⓑ: abort 를 가장 먼저 발사 — poller.stop() 이 진행 중 execute(cycle)를 await 하기
    //   전에 cycle 내부(페이지/throttle/fetch)가 즉시 끊기도록. 이래야 stop() 의 inFlight 대기가
    //   수초 내에 풀려 systemd TimeoutStopSec(30s) 안에 종료된다.
    shutdownController.abort();
    clearInterval(statusTimer);
    clearInterval(symbolRefreshTimer);
    try {
      await poller.stop();
    } catch (e) {
      console.error("[collector-history] shutdown 실패:", e);
    }
    console.log("[collector-history] 종료 완료");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[collector-history] unhandledRejection:", reason);
  });

  console.log("[collector-history] 정상 부팅 완료 — Ctrl+C로 종료");
}

// ─── 심볼 로드 (read-only) ─────────────────────────

/**
 * symbols 테이블에서 marketType TRADING 심볼 리스트 조회 (S5 일반화 — 기존 loadUsdmSymbols).
 * withTimeout 가드 + 실패 시 빈 리스트 (graceful). forward-fill core 가 자체 getSymbols 하므로
 * 본 로드는 부팅/재로드 가시성(카운트 로그)용.
 */
async function loadTradingSymbols(marketType: MarketType): Promise<string[]> {
  if (!dataService) return [];
  const res = await withTimeout(
    dataService.getSymbols({
      exchange: "binance",
      marketType,
      status: "TRADING",
    }),
    SYMBOL_QUERY_TIMEOUT_MS,
    `getSymbols(${marketType})`,
  ).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[collector-history] 심볼 조회 실패(timeout/network): ${msg}`);
    return null;
  });
  if (!res || !res.success) {
    if (res && !res.success) {
      console.error(`[collector-history] 심볼 조회 실패: ${res.error}`);
    }
    return [];
  }
  return res.data.map((s) => s.symbol);
}

/** Promise 에 timeout 가드 — Supabase 간헐 hang 방지 (worker withTimeout 동일 패턴, 인라인). */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

// ─── 진입 ─────────────────────────────────────────

bootstrap().catch((err) => {
  console.error("[collector-history] 부팅 실패:", err);
  process.exit(1);
});

// ============================================================
// historyBackfillTask — USDM 6 metric × 9 interval × N symbols backfill
// (M1.8 §8.3a dry-run 신설 / M1.8.5 Step 4 실 호출 path, 2026-05-31)
//
// 책임:
//   history_futures_indicator 의 시계열 영역을 14일 lookback 으로 채우기.
//
//   dryRun: true  → simulateDryRun (실 호출 X, 분량 시뮬레이션만)
//   dryRun: false → runRealBackfill (M1.8.5 Step 4) — 실 REST + upsert
//
// 실 backfill 설계 (D-Q1/D-Q2/D-Q3/D25 결정 반영):
//   - rate limit: 150 req/min (D-Q1) = 400ms 간격 throttle. /futures/data/* 1000 req/5min
//     quota 마진 25%+ (production polling 과 IP 공유). client.ts 의 90% sticky throttle 이 2차 방어.
//   - 페이지 윈도잉 (D-Q2): limit 500. startTime cursor 전진. 5m 14일=4032행 → 9 페이지.
//   - per-page upsert (D-Q3): 한 페이지(≤500행)=한 metric=동일 key 집합 → mixed-batch 불변 정합.
//     ON CONFLICT 자연 키 머지로 6 metric 이 같은 (symbol,interval,recorded_at) 에 누적.
//   - fire-and-forget (D25=C): state machine idle→running→done. 완료 후 재실행 X.
//     freshness skip — 이미 14일치 ≥ 20M row 면 worker 재시작 시 6h 재실행 차단.
//   - graceful: 페이지/심볼 실패는 log + 계속. 예외는 phase=idle 로 되돌려 다음 tick 재시도
//     (upsert 멱등이라 재실행 안전).
//
// 분량 (1회 backfill, USDM TRADING ~608 symbols, 6 metric, 페이지 포함):
//   - 호출 수: ~57~72K REST (페이지 분할 포함)
//   - row 수: ~25M row / Supabase ~2.5GB / ~5.7~6.1h @ 150 req/min
//
// 참조 docs:
//   - docs/task-record/M1.8.5-step4-deploy.md / M1.8.5-RESUME-PLAN.md §2 Step 4
//   - docs/canonical-metrics.md §3.1.1
//   - 6 endpoint 공식 URL: apps/worker/src/adapters/binance/historyFetchers.ts 각 함수 주석
// ============================================================

import type { FetchResult } from "../../adapters/IExchangeAdapter.js";
import type { HistoryFuturesIndicatorInsert, IDataService } from "@travis/data-service";
import type { PollTask } from "../../adapters/IPoller.js";
import { getRateLimitState } from "../../adapters/binance/client.js";
import {
  fetchBasisHistory,
  fetchGlobalLongShortHistory,
  fetchOpenInterestHistory,
  fetchTakerLongShortHistory,
  fetchTopLongShortAccountHistory,
  fetchTopLongShortPositionHistory,
  type HistoryFetchWindow,
} from "../../adapters/binance/historyFetchers.js";
import type { BinanceHistoryPeriod } from "../../adapters/binance/types.js";
import { retryOnTransient } from "./_upsertRetry.js";

/**
 * 본 task 의 cycle 주기 (= execute 완료 후 최소 휴식).
 * 실 backfill 은 1회 6h 수행 후 done — TierPoller 의 inFlight 가드로 중복 실행 없음.
 * 5분 cycle 은 (a) dry-run 시뮬레이션 빈도, (b) done 이후 freshness 재확인 빈도.
 */
const INTERVAL_MS = 5 * 60 * 1000; // 5분

/** 9 interval (사용자 요구 #3). */
const HISTORY_INTERVALS: BinanceHistoryPeriod[] = [
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
];

/** interval → ms (페이지 cursor 전진용). */
const INTERVAL_TO_MS: Record<BinanceHistoryPeriod, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

/** 14일 lookback (D3 - 사용자 결정 확정). */
const LOOKBACK_DAYS = 14;
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/** Binance /futures/data/* limit 최대 (자문 + live smoke 실측). */
const PAGE_LIMIT = 500;

// Binance /futures/data/* rate limit (crypto-domain-expert 2026-05-31 공식 docs 확정):
//   https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics
//   - weight 0 → X-MBX-USED-WEIGHT-1M 에 기여 0 (별개 IP 카운터). client.ts 90% sticky
//     throttle 은 weight 기반이라 이 카운터를 못 막음 — 방어선은 (a) 본 throttle,
//     (b) 429 Retry-After graceful 재시도 (client.ts L126), (c) [8-20] 별도 IP/worker (M2+).
//   - IP rate limit 1000 req/5min (endpoint별 독립 여부는 docs 미명시 — 합산 보수 가정).
//   - production perSymbolTask 와 동일 IP 공유 (perSymbolTask endpoint당 ~600 req/5min).
//   - ⚠️ Step 4 첫 배포 실측 (2026-05-31): perSymbolTask 단독 baseline 에서도 418 간헐 발생 +
//     backfill 동시 가동 시 rate-limit 압력 증가 관측 → 보수적 **50 req/min** 으로 하향
//     (100→50). client.ts 의 -1003/429/418 graceful 재시도가 2차 방어. 분량 ~19~24h
//     (fire-and-forget 무관). quota 여유 확인 후 상향 가능. 정공 격리는 [8-20] 별도 IP (M2+).
const TARGET_REQ_PER_MIN = 50;
const MIN_REQ_INTERVAL_MS = Math.ceil(60_000 / TARGET_REQ_PER_MIN); // 1200ms

/** freshness skip 임계 — 14일치 이 이상이면 이미 backfill 완료로 간주 (재실행 차단). */
const FRESHNESS_SKIP_THRESHOLD = 20_000_000;

/** progress journal 출력 간격. */
const JOURNAL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Interval 별 14일 row 수 (페이지 상한 + dry-run 시뮬레이션용).
 * = ⌊(14 × 24 × 60) / interval_minutes⌋.
 */
const ROWS_PER_METRIC_PER_SYMBOL_14D: Record<BinanceHistoryPeriod, number> = {
  "5m": 4032,
  "15m": 1344,
  "30m": 672,
  "1h": 336,
  "2h": 168,
  "4h": 84,
  "6h": 56,
  "12h": 28,
  "1d": 14,
};

/** 6 metric fetcher (per-symbol 단건, window 윈도잉). 전부 동일 반환 타입. */
interface MetricFetcher {
  name: string;
  fetch: (
    symbol: string,
    period: BinanceHistoryPeriod,
    limit: number,
    window: HistoryFetchWindow,
  ) => Promise<FetchResult<HistoryFuturesIndicatorInsert[]>>;
}

const METRIC_FETCHERS: MetricFetcher[] = [
  { name: "openInterest", fetch: (s, p, l, w) => fetchOpenInterestHistory(s, p, l, w) },
  { name: "topLSAccount", fetch: (s, p, l, w) => fetchTopLongShortAccountHistory(s, p, l, w) },
  { name: "topLSPosition", fetch: (s, p, l, w) => fetchTopLongShortPositionHistory(s, p, l, w) },
  { name: "globalLS", fetch: (s, p, l, w) => fetchGlobalLongShortHistory(s, p, l, w) },
  { name: "takerLS", fetch: (s, p, l, w) => fetchTakerLongShortHistory(s, p, l, w) },
  { name: "basis", fetch: (s, p, l, w) => fetchBasisHistory(s, "PERPETUAL", p, l, w) },
];

// ─── 모듈 상태 (fire-and-forget single-flight) ─────
type BackfillPhase = "idle" | "running" | "done";
let backfillPhase: BackfillPhase = "idle";

/** rate limit — 마지막 REST 호출 시각 (모든 fetch 가 공유). */
let lastRestCallAt = 0;

export interface HistoryBackfillTaskDeps {
  dataService: IDataService;
  /**
   * TRADING allowlist Set (BinanceWsRelay 와 공유, M1.4 Step 4.7 + M1.8 §8.4-d 패턴).
   * backfill 이 SETTLING/CLOSE 심볼 호출 차단.
   */
  tradingSymbolsByMarket?: {
    futures_usdm?: Set<string>;
  };
  /**
   * dry-run mode (기본 true) — 실 API 호출 X + DB INSERT X.
   * M1.8.5 Step 4 부터 bootstrap 이 false 로 전환 (D25=C fire-and-forget).
   */
  dryRun?: boolean;
}

export function createHistoryBackfillTask(deps: HistoryBackfillTaskDeps): PollTask {
  return {
    id: "binance-history-backfill",
    tier: "low",
    intervalMs: INTERVAL_MS,
    execute: () => runHistoryBackfillTask(deps),
  };
}

async function runHistoryBackfillTask(deps: HistoryBackfillTaskDeps): Promise<void> {
  const dryRun = deps.dryRun ?? true;
  if (dryRun) {
    return simulateDryRun(deps);
  }
  return runRealBackfill(deps);
}

// ─── 실 backfill (M1.8.5 Step 4) ────────────────────

async function runRealBackfill(deps: HistoryBackfillTaskDeps): Promise<void> {
  // single-flight — 이미 진행 중/완료면 무동작 (TierPoller inFlight 가드 + 방어).
  if (backfillPhase === "running") {
    console.log("[historyBackfill] 이미 진행 중 — 이번 tick skip");
    return;
  }
  if (backfillPhase === "done") {
    return; // 완료 후 무음 (worker 생존 동안 재실행 X)
  }

  // freshness skip — 이미 14일치 충분히 쌓였으면 재실행 차단 (재시작 시 6h 재실행 방지).
  // ⚠️ 잠정 (code-reviewer C2): row-count 임계는 partial-run(크래시가 임계 근처에서 발생)을
  //   "완료"로 오판할 수 있다. 본 마일스톤은 (a) Step 5 per-interval 검증 쿼리가 미완성을
  //   잡고, (b) 배포 전략(D-Q5: 동일 worker vs 별도 one-shot worker [8-20])이 quota 자문 후
  //   확정되면 completion-marker 로 대체 예정. 임계는 완료 기대치(~25M)의 보수적 80%.
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const countRes = await deps.dataService.countHistoryFuturesIndicatorSince(sinceIso);
  if (countRes.success && countRes.data >= FRESHNESS_SKIP_THRESHOLD) {
    console.log(
      `[historyBackfill] 이미 ${countRes.data.toLocaleString()} row (≥ ${FRESHNESS_SKIP_THRESHOLD.toLocaleString()}) 존재 — backfill skip, done`,
    );
    backfillPhase = "done";
    return;
  }

  backfillPhase = "running";
  const startedAt = Date.now();
  console.log(
    `[historyBackfill] 🚀 실 backfill 시작 (lookback ${LOOKBACK_DAYS}일, ${TARGET_REQ_PER_MIN} req/min, 6 metric × ${HISTORY_INTERVALS.length} interval)`,
  );

  try {
    // TRADING USDM 심볼 조회.
    const symbolsRes = await deps.dataService.getSymbols({
      exchange: "binance",
      marketType: "futures_usdm",
      status: "TRADING",
    });
    if (!symbolsRes.success) {
      console.error(`[historyBackfill] symbols 조회 실패: ${symbolsRes.error} — phase=idle 재시도 여지`);
      backfillPhase = "idle";
      return;
    }
    let symbols = symbolsRes.data.map((s) => s.symbol);
    const allowlist = deps.tradingSymbolsByMarket?.futures_usdm;
    if (allowlist) {
      symbols = symbols.filter((s) => allowlist.has(s));
    }

    const endMs = Date.now();
    const startMs = endMs - LOOKBACK_MS;

    let totalRows = 0;
    let failedPages = 0;
    let lastJournalAt = Date.now();

    for (const interval of HISTORY_INTERVALS) {
      for (let si = 0; si < symbols.length; si++) {
        const symbol = symbols[si] as string;
        for (const metric of METRIC_FETCHERS) {
          const { rows, failed } = await backfillOneMetric(
            deps,
            metric,
            symbol,
            interval,
            startMs,
            endMs,
          );
          totalRows += rows;
          failedPages += failed;
        }

        // progress journal (5분당).
        if (Date.now() - lastJournalAt >= JOURNAL_INTERVAL_MS) {
          const rl = getRateLimitState();
          const weight = rl.futures ? `${rl.futures.usedWeight}` : "?";
          console.log(
            `[historyBackfill] 진행: interval=${interval} ${si + 1}/${symbols.length} symbol · 누적 rows=${totalRows.toLocaleString()} · 실패 페이지=${failedPages} · weight=${weight}${rl.isCritical ? " ⚠️critical" : ""}`,
          );
          lastJournalAt = Date.now();
        }
      }
      console.log(
        `[historyBackfill] interval ${interval} 완료 (누적 rows=${totalRows.toLocaleString()})`,
      );
    }

    const mins = ((Date.now() - startedAt) / 60_000).toFixed(1);
    console.log(
      `[historyBackfill] ✅ backfill 완료 — ${totalRows.toLocaleString()} row / ${mins}분 / 실패 페이지 ${failedPages}`,
    );
    backfillPhase = "done";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[historyBackfill] 예외 — phase=idle 다음 tick 재시도 (upsert 멱등): ${msg}`);
    backfillPhase = "idle";
  }
}

/**
 * 단일 (symbol, interval, metric) 의 14일 윈도우를 페이지 윈도잉으로 backfill.
 * 페이지마다 upsert (≤500행 = 동일 key 집합 = mixed-batch 안전).
 * cursor 는 startMs 부터 전진. 페이지 < 500 또는 cursor 미전진 시 종료.
 */
async function backfillOneMetric(
  deps: HistoryBackfillTaskDeps,
  metric: MetricFetcher,
  symbol: string,
  interval: BinanceHistoryPeriod,
  startMs: number,
  endMs: number,
): Promise<{ rows: number; failed: number }> {
  const intervalMs = INTERVAL_TO_MS[interval];
  // 안전 상한 — 14일 기대 페이지 수 + 2 (윈도잉 무한 루프 방어).
  const maxPages = Math.ceil(ROWS_PER_METRIC_PER_SYMBOL_14D[interval] / PAGE_LIMIT) + 2;

  let cursor = startMs;
  let rows = 0;
  let failed = 0;

  for (let page = 0; page < maxPages && cursor < endMs; page++) {
    await throttleRest();
    const res = await metric.fetch(symbol, interval, PAGE_LIMIT, {
      startTime: cursor,
      endTime: endMs,
    });
    if (!res.success) {
      console.warn(
        `[historyBackfill] ${symbol} ${interval} ${metric.name} page fail: ${res.error}`,
      );
      failed += 1;
      break; // 이 (symbol,interval,metric) 부분 실패 — 다음으로 (graceful)
    }
    const data = res.data;
    if (data.length === 0) break;

    // 1회성 backfill 이라 done 후 페이지 유실 = 영구 결손 → transient 실패 재시도
    // (backend-infra rec 3). ON CONFLICT 멱등이라 재시도 안전.
    const up = await retryOnTransient(
      () => deps.dataService.upsertHistoryFuturesIndicator(data),
      { label: `historyBackfill ${symbol} ${interval} ${metric.name}` },
    );
    if (!up.success) {
      console.warn(
        `[historyBackfill] ${symbol} ${interval} ${metric.name} upsert fail (retry 소진): ${up.error}`,
      );
      failed += 1;
    } else {
      rows += data.length;
    }

    // 다음 cursor = 페이지 최대 recorded_at + intervalMs.
    // ⚠️ data.length < PAGE_LIMIT 를 "마지막 페이지" 로 단정하지 않음 (code-reviewer C1):
    //   sparse 구간/신규 상장 심볼은 한 페이지가 < 500 이어도 이후 구간에 데이터가
    //   더 있을 수 있다. 종료는 empty-page(위) + cursor 전진 정체 + cursor>=endMs +
    //   maxPages 4중으로만 — length < limit 단정 금지 (시계열 윈도잉 공통 함정).
    let maxTs = cursor;
    for (const r of data) {
      const ts = Date.parse(r.recorded_at ?? "");
      if (Number.isFinite(ts) && ts > maxTs) maxTs = ts;
    }
    const next = maxTs + intervalMs;
    if (next <= cursor) break; // 전진 실패 방어 (무한 루프 차단)
    cursor = next;
  }

  return { rows, failed };
}

/** 150 req/min 유지 — 직전 호출 후 400ms 미만이면 차액만큼 sleep. */
async function throttleRest(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRestCallAt;
  if (elapsed < MIN_REQ_INTERVAL_MS) {
    await sleep(MIN_REQ_INTERVAL_MS - elapsed);
  }
  lastRestCallAt = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── dry-run 시뮬레이션 (dryRun: true 일 때만) ──────

/**
 * Dry-run 시뮬레이션 — 실 호출 X. 분량 추정만 로깅.
 * (페이지 분할 미반영 — 실 호출 수는 본 추정보다 큼. 정밀 분량은 실 backfill journal 참조.)
 */
async function simulateDryRun(deps: HistoryBackfillTaskDeps): Promise<void> {
  const startedAt = Date.now();

  const symbolsRes = await deps.dataService.getSymbols({
    exchange: "binance",
    marketType: "futures_usdm",
    status: "TRADING",
  });
  if (!symbolsRes.success) {
    console.error(`[historyBackfill:dry-run] symbols 조회 실패: ${symbolsRes.error}`);
    return;
  }

  const usdmSymbols = symbolsRes.data.map((s) => s.symbol);
  let symbolCount = usdmSymbols.length;
  if (deps.tradingSymbolsByMarket?.futures_usdm) {
    const allowlist = deps.tradingSymbolsByMarket.futures_usdm;
    symbolCount = usdmSymbols.filter((s) => allowlist.has(s)).length;
  }

  const metricCount = METRIC_FETCHERS.length; // 6
  const callsPerSymbol = metricCount * HISTORY_INTERVALS.length; // 페이지 미반영 하한
  const totalCalls = symbolCount * callsPerSymbol;

  const rowsPerSymbolAllIntervals = HISTORY_INTERVALS.reduce(
    (sum, interval) => sum + ROWS_PER_METRIC_PER_SYMBOL_14D[interval],
    0,
  );
  const totalRows = symbolCount * metricCount * rowsPerSymbolAllIntervals;
  const estimatedSeconds = (totalCalls / TARGET_REQ_PER_MIN) * 60;
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `[historyBackfill:dry-run] 시뮬레이션 (${elapsedMs} ms):\n` +
      `  - TRADING USDM 심볼: ${symbolCount}개 (lookback=${LOOKBACK_DAYS}일, 6 metric)\n` +
      `  - 호출 수 (페이지 미반영 하한): ${totalCalls.toLocaleString()} REST (실 호출은 5m/15m/30m 페이지 분할로 더 큼)\n` +
      `  - Row 수: ${totalRows.toLocaleString()} row\n` +
      `  - 시간 하한: ${(estimatedSeconds / 3600).toFixed(2)} h @ ${TARGET_REQ_PER_MIN} req/min\n` +
      `  ⚠️ dryRun: true — 실 호출 X. 실 backfill 은 dryRun:false (M1.8.5 Step 4).`,
  );
}

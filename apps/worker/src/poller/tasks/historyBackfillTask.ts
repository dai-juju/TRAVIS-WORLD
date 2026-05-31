// ============================================================
// historyBackfillTask — USDM history backfill worker task
// (M1.8 §8.3a dry-run / M1.8.5 Step 4 실 호출 + core 분리, 2026-05-31)
//
// ⚠️ 본 worker task 는 현재 **dryRun:true 로 차단** (index.ts).
//    실측 (2026-05-31): production perSymbolTask 와 동일 IP 동시 가동 시 Binance
//    /futures/data IP quota 초과 → -1003 IP ban (production 수집도 동시 차단 + escalation 위험).
//    → 같은-IP backfill 폐기. 실제 적재는 **별도 IP one-shot 스크립트**
//      (apps/worker/src/scripts/runHistoryBackfill.ts, 집 IP 150 req/min) 또는 [8-20] 별도 worker.
//    루프 로직은 historyBackfillCore.executeHistoryBackfill 로 분리 — 스크립트와 공유.
//
//    dryRun:true  → simulateDryRun (분량 시뮬레이션, Binance 호출 X)
//    dryRun:false → runRealBackfill (state machine + freshness skip + core 호출, 50 req/min)
//                   — M2 별도 worker/IP 진입 시 재활성 가능.
//
// task-record: docs/task-record/M1.8.5-step4-deploy.md
// ============================================================

import type { IDataService } from "@travis/data-service";
import type { PollTask } from "../../adapters/IPoller.js";
import {
  executeHistoryBackfill,
  HISTORY_INTERVALS,
  ROWS_PER_METRIC_PER_SYMBOL_14D,
} from "./historyBackfillCore.js";

/** cycle 주기 (= execute 완료 후 최소 휴식). dry-run 시뮬레이션/freshness 재확인 빈도. */
const INTERVAL_MS = 5 * 60 * 1000;

const LOOKBACK_DAYS = 14;
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/** worker task 의 rate (production IP 공유 보수값). 로컬 스크립트는 150. */
const WORKER_REQ_PER_MIN = 50;

/** freshness skip 임계 — 14일치 이 이상이면 backfill 완료로 간주 (C2 잠정, [8-25]). */
const FRESHNESS_SKIP_THRESHOLD = 20_000_000;

/** 6 metric (dry-run 분량 추정용). 실제 fetcher 목록은 core 의 METRIC_FETCHERS. */
const METRIC_COUNT = 6;

type BackfillPhase = "idle" | "running" | "done";
let backfillPhase: BackfillPhase = "idle";

export interface HistoryBackfillTaskDeps {
  dataService: IDataService;
  tradingSymbolsByMarket?: { futures_usdm?: Set<string> };
  /** dry-run mode (기본 true). 현재 production 에서는 true 고정 (같은 IP ban 회피). */
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
  if (dryRun) return simulateDryRun(deps);
  return runRealBackfill(deps);
}

async function runRealBackfill(deps: HistoryBackfillTaskDeps): Promise<void> {
  if (backfillPhase === "running") {
    console.log("[historyBackfill] 이미 진행 중 — 이번 tick skip");
    return;
  }
  if (backfillPhase === "done") return;

  // freshness skip — 이미 14일치 충분히 쌓였으면 재실행 차단.
  // ⚠️ 잠정 (code-reviewer C2): row-count 임계는 partial-run 오판 가능 → Step 5 per-interval 검증 +
  //    [8-25] completion-marker 후속. 별도 IP 스크립트 경로에서는 freshness 무관 (1회 실행).
  const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const countRes = await deps.dataService.countHistoryFuturesIndicatorSince(sinceIso);
  if (countRes.success && countRes.data >= FRESHNESS_SKIP_THRESHOLD) {
    console.log(
      `[historyBackfill] 이미 ${countRes.data.toLocaleString()} row (≥ ${FRESHNESS_SKIP_THRESHOLD.toLocaleString()}) — backfill skip, done`,
    );
    backfillPhase = "done";
    return;
  }

  backfillPhase = "running";
  console.log(
    `[historyBackfill] 🚀 실 backfill 시작 (lookback ${LOOKBACK_DAYS}일, ${WORKER_REQ_PER_MIN} req/min, 6 metric × ${HISTORY_INTERVALS.length} interval)`,
  );
  try {
    const result = await executeHistoryBackfill({
      dataService: deps.dataService,
      tradingSymbolsByMarket: deps.tradingSymbolsByMarket,
      reqPerMin: WORKER_REQ_PER_MIN,
      lookbackDays: LOOKBACK_DAYS,
    });
    console.log(
      `[historyBackfill] ✅ 완료 — ${result.totalRows.toLocaleString()} row / ${result.elapsedMin.toFixed(1)}분 / 실패 페이지 ${result.failedPages}`,
    );
    backfillPhase = "done";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[historyBackfill] 예외 — phase=idle 다음 tick 재시도 (upsert 멱등): ${msg}`);
    backfillPhase = "idle";
  }
}

/** Dry-run 시뮬레이션 — 분량 추정만 (페이지 미반영 하한). */
async function simulateDryRun(deps: HistoryBackfillTaskDeps): Promise<void> {
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
  const totalCalls = symbolCount * METRIC_COUNT * HISTORY_INTERVALS.length;
  const rowsPerSymbol = HISTORY_INTERVALS.reduce(
    (sum, iv) => sum + ROWS_PER_METRIC_PER_SYMBOL_14D[iv],
    0,
  );
  const totalRows = symbolCount * METRIC_COUNT * rowsPerSymbol;
  console.log(
    `[historyBackfill:dry-run] ${symbolCount} 심볼 · 호출 하한 ${totalCalls.toLocaleString()} REST · row ${totalRows.toLocaleString()} ` +
      `(페이지 미반영). ⚠️ dryRun:true — Binance 호출 X. 실 적재는 별도 IP 스크립트 (scripts/runHistoryBackfill.ts).`,
  );
}

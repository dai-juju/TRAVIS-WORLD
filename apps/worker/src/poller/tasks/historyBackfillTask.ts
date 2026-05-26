// ============================================================
// historyBackfillTask — USDM 5 metric × 9 interval × N symbols backfill (M1.8 §8.3, 2026-05-26)
//
// 책임:
//   history_futures_indicator 의 시계열 영역을 14일 lookback 으로 채우기.
//   본 substep (8.3a) 의 scope = **dry-run mode 만**:
//     - 실 API 호출 X
//     - 실 DB INSERT X
//     - 호출 수 + 예상 row 수 + 메모리 추정 + 시간 예상만 로깅
//
//   실 backfill 진입 (8.3c, 사용자 결정 후) 시점에 추가 작업 필요:
//     - BinanceUsdmAdapter 에 history fetcher 5종 신설
//       (fetchOpenInterestHistory / fetchTopLongShortAccountHistory /
//        fetchTopLongShortPositionHistory / fetchGlobalLongShortHistory /
//        fetchTakerLongShortHistory)
//     - normalize 함수 5종 (recorded_at + 5 metric 컬럼 매핑)
//     - history_futures_indicator schema 의 interval 컬럼 결정 (D22 - 사용자 결정)
//     - 본격 backfill loop (interval rotation)
//
// 분량 (1회 backfill, USDM TRADING 608 symbols 기준):
//   - 호출 수: 608 × 5 metric × 9 interval = 27,360 REST
//   - row 수: 약 20.5M row (14일 × interval 별 step 수)
//   - IP quota: /futures/data/* 1000 req/5min — 27,360/1000 × 5min ≈ 2시간 17분
//   - Supabase 용량: ~2GB (Pro Tier 25%)
//
// 참조 docs:
//   - https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics
//   - 동일 패턴: topLongShortAccountRatio / topLongShortPositionRatio /
//     globalLongShortAccountRatio / takerlongshortRatio
//   - 조회: 2026-05-26
//   - task-record: docs/task-record/M1.8-step3-history-backfill.md
//   - canonical: docs/canonical-metrics.md §3.1
// ============================================================

import type { IDataService } from "@travis/data-service";
import type { BinanceUsdmAdapter } from "../../adapters/binance/index.js";
import type { PollTask } from "../../adapters/IPoller.js";

/**
 * 본 task 의 cycle 주기.
 * Dry-run mode 에서는 매 5분 한 번 시뮬레이션 출력 (의미 있는 운영 정보 노출 빈도).
 * 실 backfill 진입 후에는 24h cycle 또는 별도 cron 으로 전환.
 */
const INTERVAL_MS = 5 * 60 * 1000; // 5분

/** 9 interval (사용자 요구 #3). */
const HISTORY_INTERVALS = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"] as const;
type HistoryInterval = (typeof HISTORY_INTERVALS)[number];

/** 5 metric (Basis 영역은 D21 - 사용자 결정 후 6번째로 추가 가능). */
const HISTORY_METRICS = [
  "openInterestHist",
  "topLongShortAccountRatio",
  "topLongShortPositionRatio",
  "globalLongShortAccountRatio",
  "takerlongshortRatio",
] as const;

/** 14일 lookback (D3 - 사용자 결정 확정). */
const LOOKBACK_DAYS = 14;

/**
 * Interval 별 14일 row 수 (분량 시뮬레이션용).
 * 정확한 step 수 = ⌊(14 × 24 × 60) / interval_minutes⌋.
 */
const ROWS_PER_METRIC_PER_SYMBOL_14D: Record<HistoryInterval, number> = {
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

export interface HistoryBackfillTaskDeps {
  usdmAdapter: BinanceUsdmAdapter;
  dataService: IDataService;
  /**
   * TRADING allowlist Set (BinanceWsRelay 와 공유, M1.4 Step 4.7 + M1.8 §8.4-d 패턴).
   * 본 task 가 backfill 진입 시 SETTLING/CLOSE 심볼 호출 차단.
   * 본 substep (8.3a, dry-run mode) 에서는 시뮬레이션 정확도용.
   */
  tradingSymbolsByMarket?: {
    futures_usdm?: Set<string>;
  };
  /**
   * dry-run mode (기본 true) — 실 API 호출 X + DB INSERT X.
   * 시뮬레이션 결과 (호출 수 / row 수 / 시간 예상 / 용량 예상) 만 로깅.
   *
   * 본 substep (8.3a) 의 scope. 실 backfill 진입 (8.3c) 시 명시적으로 false 로 전환 +
   * D22 (schema interval 컬럼) + D20 (cron 시점) + D21 (Basis 포함) 결정 후 진입.
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

  // 실 backfill path — 본 substep (8.3a) 의 scope 외.
  // 8.3c (사용자 결정 후) 진입 시점에 신설.
  console.warn(
    "[historyBackfillTask] ⚠️ 실 backfill mode 호출됨 — 본 substep (8.3a) 의 scope 외. " +
      "BinanceUsdmAdapter 의 history fetcher 5종 + normalize + loop 신설 필요. " +
      "dryRun=true 로 전환하거나 8.3c task 분해 (D20/D21/D22 결정 포함) 후 재가동.",
  );
}

/**
 * Dry-run 시뮬레이션 — 실 호출 X.
 * 호출 수 + 예상 row 수 + 메모리 추정 + 시간 예상만 로깅.
 *
 * 본 함수는 worker 가 매 5분 (INTERVAL_MS) 호출 — 동일 시뮬레이션 결과 반복 출력.
 * 실 backfill 진입 (8.3c) 시점에 본 함수 자체를 삭제 + 실 호출 loop 으로 교체.
 */
async function simulateDryRun(deps: HistoryBackfillTaskDeps): Promise<void> {
  const startedAt = Date.now();

  // 1) TRADING USDM 심볼 수 조회 (실 DB read — 시뮬레이션 정확도 확보용).
  const symbolsRes = await deps.dataService.getSymbols({
    exchange: "binance",
    marketType: "futures_usdm",
    status: "TRADING",
  });
  if (!symbolsRes.success) {
    console.error(`[historyBackfillTask:dry-run] symbols 조회 실패: ${symbolsRes.error}`);
    return;
  }

  const usdmSymbols = symbolsRes.data.map((s) => s.symbol);
  let symbolCount = usdmSymbols.length;

  // TRADING allowlist 추가 필터 (M1.8 §8.4-d 패턴 - 옵션).
  if (deps.tradingSymbolsByMarket?.futures_usdm) {
    const allowlist = deps.tradingSymbolsByMarket.futures_usdm;
    symbolCount = usdmSymbols.filter((s) => allowlist.has(s)).length;
  }

  // 2) 호출 수 시뮬레이션.
  const callsPerSymbol = HISTORY_METRICS.length * HISTORY_INTERVALS.length; // 5 × 9 = 45
  const totalCalls = symbolCount * callsPerSymbol;

  // 3) Row 수 시뮬레이션.
  const rowsPerSymbolAllIntervals = HISTORY_INTERVALS.reduce(
    (sum, interval) => sum + ROWS_PER_METRIC_PER_SYMBOL_14D[interval],
    0,
  ); // 6,734
  const totalRows = symbolCount * HISTORY_METRICS.length * rowsPerSymbolAllIntervals;

  // 4) IP quota / 시간 예상.
  //    /futures/data/* 공통 1000 req / 5min IP quota.
  const callsPerMinute = 1000 / 5; // 200 req/min
  const estimatedSeconds = (totalCalls / callsPerMinute) * 60;
  const estimatedHours = estimatedSeconds / 3600;

  // 5) Supabase 용량 추정.
  //    row 당 평균 ~100 byte (id + recorded_at + 5 numeric + PK 3 + 인덱스).
  const estimatedBytes = totalRows * 100;
  const estimatedMB = estimatedBytes / (1024 * 1024);
  const estimatedGB = estimatedMB / 1024;

  // 6) 메모리 footprint (worker).
  //    stream 방식 — 한 호출 응답 (~50 row) 만 메모리 유지 → 무시 가능 (<10 MB).
  const estimatedMemoryMB = 10;

  const elapsedMs = Date.now() - startedAt;

  console.log(
    `[historyBackfillTask:dry-run] 시뮬레이션 완료 (${elapsedMs} ms):\n` +
      `  - TRADING USDM 심볼 수: ${symbolCount}개 (lookback=${LOOKBACK_DAYS}일)\n` +
      `  - 호출 수 (1회 backfill): ${totalCalls.toLocaleString()} REST\n` +
      `    (= ${symbolCount} symbols × ${HISTORY_METRICS.length} metric × ${HISTORY_INTERVALS.length} interval)\n` +
      `  - Row 수 (1회 backfill): ${totalRows.toLocaleString()} row\n` +
      `    (= ${symbolCount} × ${HISTORY_METRICS.length} × ${rowsPerSymbolAllIntervals.toLocaleString()})\n` +
      `  - 시간 예상: ${estimatedHours.toFixed(2)} h (${Math.round(estimatedSeconds)} 초, ${callsPerMinute} req/min @ /futures/data/* quota)\n` +
      `  - Supabase 용량: ${estimatedGB.toFixed(2)} GB (${estimatedMB.toFixed(0)} MB, ${totalRows.toLocaleString()} × ~100 byte)\n` +
      `  - Worker 메모리 footprint: 약 ${estimatedMemoryMB} MB (stream 방식)\n` +
      `\n` +
      `  ⚠️  본 task 는 dry-run mode 입니다. 실 backfill 진입 시 8.3c task 분해 + D20/D21/D22 결정 필요.\n` +
      `      - D20: 실 backfill 시점 (즉시 / 야간 cron / 마일스톤 후 별도)\n` +
      `      - D21: Basis 포함 여부 (분량 ~30% 증가)\n` +
      `      - D22: history_futures_indicator schema 의 interval 컬럼 추가 여부\n`,
  );
}

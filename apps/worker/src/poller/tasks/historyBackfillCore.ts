// ============================================================
// historyBackfillCore — backfill 루프 코어 (M1.8.5 Step 4, 2026-05-31)
//
// worker task(historyBackfillTask) 와 로컬 one-shot 스크립트(scripts/runHistoryBackfill)
// 가 **동일 로직을 재사용** 하도록 분리 (DRY). rate(reqPerMin)만 파라미터로 다름:
//   - worker task: 50 req/min (production IP 공유 — 단 실측 ban 으로 dryRun:true 차단됨)
//   - 로컬 스크립트: 150 req/min (집 IP 전용, production IP 무영향 → quota 통째 사용)
//
// 설계 (Step 4 결정 + hotfix 반영):
//   - 9 interval × ~608 symbol × 6 metric, 페이지 윈도잉(limit 500, startTime cursor 전진).
//   - per-page upsert (≤500행 = 동일 key 집합 = mixed-batch 안전, ON CONFLICT 자연키 머지).
//   - retryOnTransient (1회성 backfill 페이지 유실 = 영구 결손 방어).
//   - rate throttle (호출 간 60000/reqPerMin ms). client.ts 가 -1003/429/418 graceful 재시도.
//   - graceful: 페이지 실패는 log + 계속. throw 누출 0 (FetchResult/Result 기반).
//
// task-record: docs/task-record/M1.8.5-step4-deploy.md
// ============================================================

import type { FetchResult } from "../../adapters/IExchangeAdapter.js";
import type { HistoryFuturesIndicatorInsert, IDataService } from "@travis/data-service";
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

/** 9 interval (사용자 요구 #3). */
export const HISTORY_INTERVALS: BinanceHistoryPeriod[] = [
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

/** Binance /futures/data/* limit 최대 (자문 + live smoke 실측). */
const PAGE_LIMIT = 500;

/** Interval 별 14일 row 수 (페이지 상한). = ⌊(14 × 24 × 60) / interval_minutes⌋. */
export const ROWS_PER_METRIC_PER_SYMBOL_14D: Record<BinanceHistoryPeriod, number> = {
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

const DEFAULT_LOOKBACK_DAYS = 14;
const JOURNAL_INTERVAL_MS = 60 * 1000; // 1분당 진행 로그

export interface ExecuteBackfillDeps {
  dataService: IDataService;
  /** TRADING allowlist (옵션). 미지정 시 getSymbols(status:TRADING) 결과만 사용. */
  tradingSymbolsByMarket?: { futures_usdm?: Set<string> };
  /** rate limit (req/min). worker=50, 로컬 스크립트=150. */
  reqPerMin: number;
  /** lookback 일수 (기본 14). */
  lookbackDays?: number;
  /** 진행 로그 콜백 (기본 console.log). */
  onProgress?: (msg: string) => void;
}

export interface BackfillResult {
  totalRows: number;
  failedPages: number;
  elapsedMin: number;
  symbolCount: number;
}

/**
 * backfill 1회 실행 — 9 interval × symbol × 6 metric 전체 순회.
 * state machine/freshness skip 은 호출자(worker task) 책임. 본 함수는 순수 루프.
 */
export async function executeHistoryBackfill(
  deps: ExecuteBackfillDeps,
): Promise<BackfillResult> {
  const log = deps.onProgress ?? ((m: string) => console.log(m));
  const lookbackMs = (deps.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000;
  const minIntervalMs = Math.ceil(60_000 / deps.reqPerMin);
  const startedAt = Date.now();

  // rate throttle (로컬 상태 — 호출 간 minIntervalMs 유지).
  let lastRestCallAt = 0;
  const throttle = async (): Promise<void> => {
    const elapsed = Date.now() - lastRestCallAt;
    if (elapsed < minIntervalMs) await sleep(minIntervalMs - elapsed);
    lastRestCallAt = Date.now();
  };

  // TRADING USDM 심볼.
  const symbolsRes = await deps.dataService.getSymbols({
    exchange: "binance",
    marketType: "futures_usdm",
    status: "TRADING",
  });
  if (!symbolsRes.success) {
    throw new Error(`symbols 조회 실패: ${symbolsRes.error}`);
  }
  let symbols = symbolsRes.data.map((s) => s.symbol);
  const allowlist = deps.tradingSymbolsByMarket?.futures_usdm;
  if (allowlist) symbols = symbols.filter((s) => allowlist.has(s));

  const endMs = Date.now();
  const startMs = endMs - lookbackMs;

  let totalRows = 0;
  let failedPages = 0;
  let lastJournalAt = Date.now();

  for (const interval of HISTORY_INTERVALS) {
    for (let si = 0; si < symbols.length; si++) {
      const symbol = symbols[si] as string;
      for (const metric of METRIC_FETCHERS) {
        const { rows, failed } = await backfillOneMetric(
          deps.dataService,
          metric,
          symbol,
          interval,
          startMs,
          endMs,
          throttle,
        );
        totalRows += rows;
        failedPages += failed;
      }
      if (Date.now() - lastJournalAt >= JOURNAL_INTERVAL_MS) {
        log(
          `[historyBackfill] 진행: interval=${interval} ${si + 1}/${symbols.length} symbol · 누적 rows=${totalRows.toLocaleString()} · 실패 페이지=${failedPages}`,
        );
        lastJournalAt = Date.now();
      }
    }
    log(`[historyBackfill] interval ${interval} 완료 (누적 rows=${totalRows.toLocaleString()})`);
  }

  return {
    totalRows,
    failedPages,
    elapsedMin: (Date.now() - startedAt) / 60_000,
    symbolCount: symbols.length,
  };
}

/**
 * 단일 (symbol, interval, metric) 의 14일 윈도우를 **고정 폭 페이지 윈도잉** 으로 backfill.
 * 페이지마다 upsert (≤500행 = 동일 key 집합 = mixed-batch 안전).
 *
 * ★ 고정 폭 윈도우 (M1.8.5 Step 4 hotfix², 2026-05-31): 각 페이지의 endTime 을
 *   `cursor + PAGE_LIMIT * intervalMs` (= 정확히 500 point 폭) 로 좁힌다.
 *   배경: Binance 의 openInterestHist / LSR 3종 / taker 5 endpoint 는 [startTime, endTime] 범위가
 *   limit 보다 넓으면 그 범위에 걸쳐 ~500개를 **sampling** 해 반환 (듬성). endTime=endMs(14일 전체)
 *   로 두면 1페이지에 14일을 sampling → 심볼당 ~500행만 (basis 만 dense 반환이라 예외였음).
 *   → 윈도우를 500-point 폭으로 좁히면 sampling 엔드포인트도 dense 반환 (심볼당 ~4032행).
 *   cursor 는 윈도우 단위로 단순 전진 → "마지막 페이지" 추정 불필요 (code-reviewer C1 자연 해소).
 */
async function backfillOneMetric(
  dataService: IDataService,
  metric: MetricFetcher,
  symbol: string,
  interval: BinanceHistoryPeriod,
  startMs: number,
  endMs: number,
  throttle: () => Promise<void>,
): Promise<{ rows: number; failed: number }> {
  const intervalMs = INTERVAL_TO_MS[interval];
  const windowMs = PAGE_LIMIT * intervalMs; // 페이지당 시간 폭 = 정확히 500 point
  const maxPages = Math.ceil(ROWS_PER_METRIC_PER_SYMBOL_14D[interval] / PAGE_LIMIT) + 2;

  let cursor = startMs;
  let rows = 0;
  let failed = 0;

  for (let page = 0; page < maxPages && cursor < endMs; page++) {
    const pageEnd = Math.min(cursor + windowMs, endMs);
    await throttle();
    const res = await metric.fetch(symbol, interval, PAGE_LIMIT, {
      startTime: cursor,
      endTime: pageEnd,
    });
    if (!res.success) {
      console.warn(`[historyBackfill] ${symbol} ${interval} ${metric.name} page fail: ${res.error}`);
      failed += 1;
      cursor = pageEnd; // 실패해도 다음 윈도우로 전진 (전체 metric 중단 X)
      continue;
    }
    if (res.data.length > 0) {
      const up = await retryOnTransient(
        () => dataService.upsertHistoryFuturesIndicator(res.data),
        { label: `historyBackfill ${symbol} ${interval} ${metric.name}` },
      );
      if (!up.success) {
        console.warn(`[historyBackfill] ${symbol} ${interval} ${metric.name} upsert fail (retry 소진): ${up.error}`);
        failed += 1;
      } else {
        rows += res.data.length;
      }
    }
    cursor = pageEnd; // 정확히 한 윈도우(=PAGE_LIMIT point)씩 전진 — gap/sampling 무관 dense 보장
  }

  return { rows, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

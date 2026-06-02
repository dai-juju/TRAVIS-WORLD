// ============================================================
// ticker24hrBatchTask — 24h 변화율 보완 폴링 (M1.6 Step 4 hotfix B, 2026-04-28).
//
// 배경:
//   M1.6 Step 4 에서 `!ticker@arr` (full 17 필드) → `!miniTicker@arr` (6 필드)
//   임시 롤백. Windows 개발 환경 payload-size selective failure 회피.
//   mini 페이로드는 priceChangePercent / priceChange / weightedAvgPrice /
//   trade_count / open_time / close_time 6 필드 미포함 → 이 task 가
//   REST `/ticker/24hr` batch 엔드포인트를 1분 1회 폴링해 보완.
//
// IP weight 분석 (공식 docs 2026-04-28 조회):
//   - SPOT  /api/v3/ticker/24hr  (no symbol param) — weight 80
//   - USDM  /fapi/v1/ticker/24hr (no symbol param) — weight 40
//   - COINM /dapi/v1/ticker/24hr (no symbol param) — weight 40
//   분당 1회 = 80 + 40 + 40 = 160/min
//   분당 cap: SPOT 6000, USDM 2400 → 사용률 ~1.3% / ~1.7% (여유 충분).
//
// 컬럼 분리 불변 (race 회피):
//   - WS miniTicker (1초 주기)  → c/o/h/l/v/q 6 필드만 채움
//   - 이 task (1분 주기)         → P/p/w/n/O/C 6 필드만 채움
//   두 경로가 update 하는 컬럼 집합이 disjoint 라야 backwards-overwrite 없음.
//   → upsertNowSpot/FuturesTickerPartial (defaultToNull: false) 필수.
//
// Mixed-batch 불변 (MEMORY: feedback_mixed_batch_invariant):
//   배치 내 모든 row 가 동일한 key 집합 — PK 3개 + P/p/w/n/O/C 6 = 9개 균일.
//
// 동시 upsert deadlock 회피 (MEMORY: feedback_concurrent_upsert_deadlock):
//   SPOT (now_spot_ticker) 와 USDM/COINM (now_futures_ticker) 는 다른 테이블
//   → Promise.all OK. 단 USDM 과 COINM 은 같은 테이블 → 순차 await.
//
// 한시 조치:
//   Hetzner 24/7 이전 후 `!ticker@arr` (full) + perMessageDeflate=false 재시도.
//   정상 작동 확인 시 이 task 제거하고 WS 1초 일치로 복귀.
//   → docs/deferred-task.md [3-46] 추적.
// ============================================================

import type {
  IDataService,
  NowFuturesTickerInsert,
  NowSpotTickerInsert,
} from "@travis/data-service";
import type {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
  BinanceUsdmAdapter,
} from "../../adapters/binance/index.js";
import type { PollTask } from "@travis/shared";
import type { MarketType } from "../../ws-relay/types.js";
import { retryOnTransient } from "@travis/exchange-collectors";

/** 1분 1회 폴링 — 24h metric 이라 1분 stale 도메인 acceptable. */
const INTERVAL_MS = 60_000;

export interface Ticker24hrBatchTaskDeps {
  spotAdapter: BinanceSpotAdapter;
  usdmAdapter: BinanceUsdmAdapter;
  coinmAdapter: BinanceCoinmAdapter;
  dataService: IDataService;
  /**
   * M1.8 §8.4 신설 (2026-05-26) — TRADING 심볼 allowlist (tickerWsHandler 와 동일 패턴).
   * 미주입 시 기존 동작 (전체 fetchTicker24hr 응답 upsert) 유지 (graceful).
   * SPOT now_spot_ticker 60% NULL stale 의 근본 원인 — BREAK 심볼이 ticker24hrBatchTask
   * partial upsert 로 INSERT 되어 row 만 있고 last_price 등 NULL. 본 filter 가 차단.
   */
  tradingSymbolsByMarket?: Record<MarketType, Set<string>>;
}

export function createTicker24hrBatchTask(
  deps: Ticker24hrBatchTaskDeps,
): PollTask {
  return {
    id: "binance-ticker-24hr-batch",
    tier: "low",
    intervalMs: INTERVAL_MS,
    execute: () => runTicker24hrBatch(deps),
  };
}

async function runTicker24hrBatch(
  deps: Ticker24hrBatchTaskDeps,
): Promise<void> {
  const startedAt = Date.now();

  // SPOT 과 (USDM+COINM) 은 다른 테이블 → Promise.all OK.
  // USDM/COINM 은 같은 now_futures_ticker → 내부에서 순차 await.
  await Promise.all([
    pollSpot(deps),
    pollFuturesSequential(deps),
  ]);

  const elapsedMs = Date.now() - startedAt;
  console.log(`[ticker24hrBatchTask] 완료: ${elapsedMs}ms 소요`);
}

async function pollSpot(deps: Ticker24hrBatchTaskDeps): Promise<void> {
  const res = await deps.spotAdapter.fetchTicker24hr();
  if (!res.success) {
    console.error(`[ticker24hrBatchTask] SPOT fetch 실패: ${res.error}`);
    return;
  }
  // M1.8 §8.4 (2026-05-26) — TRADING allowlist 적용 (tickerWsHandler 패턴 미러링).
  // BREAK 심볼 row INSERT 차단 → SPOT 60% NULL stale 근본 차단.
  const allow = deps.tradingSymbolsByMarket?.spot;
  const partialRows = res.data
    .map(extractSpot24hrFieldsOnly)
    .filter((row) => !allow || allow.has(row.symbol));
  if (partialRows.length === 0) {
    console.warn("[ticker24hrBatchTask] SPOT: 0개 row — upsert 스킵");
    return;
  }
  const up = await retryOnTransient(
    () => deps.dataService.upsertNowSpotTickerPartial(partialRows),
    { label: "ticker24hrBatchTask SPOT" },
  );
  if (!up.success) {
    console.error(`[ticker24hrBatchTask] SPOT upsert 최종 실패: ${up.error}`);
  }
}

async function pollFuturesSequential(
  deps: Ticker24hrBatchTaskDeps,
): Promise<void> {
  // 같은 테이블(now_futures_ticker) → 순차 await + retryOnTransient 필수.
  await pollOneFutures(
    "USDM",
    () => deps.usdmAdapter.fetchTicker24hr(),
    deps.dataService,
    deps.tradingSymbolsByMarket?.futures_usdm,
  );
  await pollOneFutures(
    "COINM",
    () => deps.coinmAdapter.fetchTicker24hr(),
    deps.dataService,
    deps.tradingSymbolsByMarket?.futures_coinm,
  );
}

async function pollOneFutures(
  label: string,
  fetcher: () => Promise<{
    success: true;
    data: NowFuturesTickerInsert[];
  } | {
    success: false;
    error: string;
  }>,
  dataService: IDataService,
  allow: Set<string> | undefined,
): Promise<void> {
  const res = await fetcher();
  if (!res.success) {
    console.error(`[ticker24hrBatchTask] ${label} fetch 실패: ${res.error}`);
    return;
  }
  // M1.8 §8.4 (2026-05-26) — TRADING allowlist 적용 (SPOT 와 동일 정합).
  const partialRows = res.data
    .map(extractFutures24hrFieldsOnly)
    .filter((row) => !allow || allow.has(row.symbol));
  if (partialRows.length === 0) {
    console.warn(`[ticker24hrBatchTask] ${label}: 0개 row — upsert 스킵`);
    return;
  }
  const up = await retryOnTransient(
    () => dataService.upsertNowFuturesTickerPartial(partialRows),
    { label: `ticker24hrBatchTask ${label}` },
  );
  if (!up.success) {
    console.error(
      `[ticker24hrBatchTask] ${label} upsert 최종 실패: ${up.error}`,
    );
  }
}

// ─── 컬럼 분리: 24h 변화율 6 필드 + PK 3 필드만 추출 ─────
//
// WS miniTicker (1초) 가 채우는 c/o/h/l/v/q (last_price/open/high/low/volume/
//   quote_volume) 는 **반드시 제외**. 포함 시 1분 stale 값이 1초 fresh 값을
//   덮어쓰는 backwards-overwrite 발생.
// last_price 는 mini 가 매초 신선하게 update 하므로 절대 만지면 안 됨.

/**
 * SPOT: PK 3 + 24h 변화율 6 필드만 추출.
 * Mixed-batch 불변 — 모든 row 가 동일한 9개 key.
 */
function extractSpot24hrFieldsOnly(
  row: NowSpotTickerInsert,
): NowSpotTickerInsert {
  return {
    // PK 3
    exchange: row.exchange,
    market_type: row.market_type,
    symbol: row.symbol,
    // 24h 변화율 6 필드 (WS mini 미포함)
    price_change: row.price_change,
    price_change_pct: row.price_change_pct,
    weighted_avg_price: row.weighted_avg_price,
    trade_count: row.trade_count,
    open_time: row.open_time,
    close_time: row.close_time,
  };
}

/** USDM/COINM: SPOT 와 동일 9 필드. */
function extractFutures24hrFieldsOnly(
  row: NowFuturesTickerInsert,
): NowFuturesTickerInsert {
  return {
    exchange: row.exchange,
    market_type: row.market_type,
    symbol: row.symbol,
    price_change: row.price_change,
    price_change_pct: row.price_change_pct,
    weighted_avg_price: row.weighted_avg_price,
    trade_count: row.trade_count,
    open_time: row.open_time,
    close_time: row.close_time,
  };
}

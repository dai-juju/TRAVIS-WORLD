// ============================================================
// per-symbol 지표 폴링 Task (M1.3 Step 4 Substep 4c).
//
// 책임:
//   Binance가 배치를 제공하지 않는 3개 지표를 **직선 순회**(50ms throttle)로 수집.
//     - OpenInterest (OI)
//     - TopLongShortAccountRatio (LSR)
//     - TakerBuySellRatio (Taker)
//   USDM + COINM 각각 같은 3종 × 2 = 6번 전체 순회.
//
//   사용자 결정:
//     - Tier 분류 없음 (모든 심볼 공평)
//     - "최대한 짧게" — intervalMs는 execute 완료 후 최소 휴식만 부여.
//
// 실측 (2026-04-19 smokeStep4):
//   USDM 608개 + COINM 38개 × 3도메인(OI/LSR/Taker) 전체 순회에
//   backoff 포함 **331초** 소요. intervalMs를 너무 크게 잡으면
//   "실행 주기 = 331 + intervalMs"가 되어 사용자 철학과 괴리.
//   → intervalMs=10s 로 설정하여 실질 주기 ≈ 341초(5분 40초) 달성.
//
// 설계 불변 (Step 2 W2 hazard 근거):
//   OI/LSR/Taker는 각자 다른 컬럼만 채운 NowFuturesIndicatorInsert[]를 반환.
//   호출자는 **도메인별로 완전히 독립된 배치**로 upsertNowFuturesIndicatorPartial을 호출.
//   같은 배치 내에 여러 도메인 컬럼이 섞이면 NULL 덮어쓰기 사고가 발생한다.
//
// 사전계산:
//   OI 도메인은 indicatorWindow에 push + preComputeIndicator로 oi_chg_* 컬럼 merge.
//   LSR/Taker는 사전계산 컬럼 없음(ROADMAP 현재 최소 스코프) → merge 없이 upsert.
// ============================================================

import type {
  IDataService,
  NowFuturesIndicatorInsert,
} from "@travis/data-service";
import type {
  BinanceCoinmAdapter,
  BinanceUsdmAdapter,
} from "../../adapters/binance/index.js";
import type { FetchResult } from "../../adapters/IExchangeAdapter.js";
import type { PollTask } from "../../adapters/IPoller.js";
import type { RollingWindow } from "../../compute/RollingWindow.js";
import {
  preComputeIndicator,
  type IndicatorSample,
} from "../../compute/preCompute.js";
import { retryOnTransient } from "./_upsertRetry.js";

/**
 * execute 완료 후 최소 휴식 시간. execute 자체가 ~331초 걸리므로
 * 실질 폴링 주기는 `execute 소요 + INTERVAL_MS` 가 된다.
 * 10초로 설정하여 사용자의 "최대한 짧게" 철학 반영.
 */
const INTERVAL_MS = 10_000;
const SYMBOL_CACHE_TTL_MS = 3_600_000; // W8: 1시간. symbols는 드물게 변함.

/** W8: 심볼 리스트 TTL 캐시. 5분 40초 주기로 매번 DB 왕복을 피한다. */
interface SymbolCache {
  usdmSymbols: string[];
  coinmSymbols: string[];
  refreshedAt: number;
}

let symbolCache: SymbolCache | null = null;

export interface PerSymbolTaskDeps {
  usdmAdapter: BinanceUsdmAdapter;
  coinmAdapter: BinanceCoinmAdapter;
  dataService: IDataService;
  indicatorWindow: RollingWindow<IndicatorSample>;
}

export function createPerSymbolTask(deps: PerSymbolTaskDeps): PollTask {
  return {
    id: "binance-per-symbol",
    tier: "low",
    intervalMs: INTERVAL_MS,
    execute: () => runPerSymbolTask(deps),
  };
}

async function runPerSymbolTask(deps: PerSymbolTaskDeps): Promise<void> {
  const startedAt = Date.now();

  const symbols = await loadSymbols(deps);
  if (!symbols) return; // 로드 실패는 loadSymbols 내부에서 로그.

  console.log(
    `[perSymbolTask] 시작: USDM ${symbols.usdmSymbols.length}개, COINM ${symbols.coinmSymbols.length}개`,
  );

  // W6: USDM과 COINM은 서로 다른 baseUrl이라 rate limit이 독립 → 병렬 허용.
  //     도메인별 순차는 유지(같은 마켓 내에서 rate limit 공유).
  await Promise.all([
    // USDM 라인: OI → LSR → Taker 순차 (같은 baseUrl=fapi 공유)
    (async (): Promise<void> => {
      await collectAndUpsert(
        "USDM OI",
        () => deps.usdmAdapter.fetchOpenInterestBatch(symbols.usdmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        true,
      );
      await collectAndUpsert(
        "USDM LSR(account)",
        () => deps.usdmAdapter.fetchTopLongShortAccountBatch(symbols.usdmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
      await collectAndUpsert(
        "USDM Taker",
        () => deps.usdmAdapter.fetchTakerLongShortBatch(symbols.usdmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
      // M1.8 §8.2a-2 (2026-05-26) — D17 USDM 라인 6 fetcher 직선 확장:
      // 신규 3 fetcher (LSR Position / Global LSR / Basis) 추가.
      // 동일 baseUrl=fapi 공유 → 순차 await 유지 (M1.4 Step 4.7 deadlock 회피).
      // Cycle 시간 약 5분 40초 → 약 11분 23초 (자문 D17 예측 12분).
      // IP quota 1000 req/5min /futures/data/* 공통 — Sub-substep D 의 rate-limit
      // dispatcher 가 X-MBX-USED-WEIGHT-1M 모니터링 + 80% backoff.
      await collectAndUpsert(
        "USDM LSR(position)",
        () => deps.usdmAdapter.fetchTopLongShortPositionBatch(symbols.usdmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
      await collectAndUpsert(
        "USDM Global LSR",
        () => deps.usdmAdapter.fetchGlobalLongShortBatch(symbols.usdmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
      await collectAndUpsert(
        "USDM Basis",
        () => deps.usdmAdapter.fetchBasisBatch(symbols.usdmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
    })(),
    // COINM 라인: OI → LSR → Taker 순차 (baseUrl=dapi 공유)
    (async (): Promise<void> => {
      await collectAndUpsert(
        "COINM OI",
        () => deps.coinmAdapter.fetchOpenInterestBatch(symbols.coinmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        true,
      );
      await collectAndUpsert(
        "COINM LSR(account)",
        () => deps.coinmAdapter.fetchTopLongShortAccountBatch(symbols.coinmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
      await collectAndUpsert(
        "COINM Taker",
        () => deps.coinmAdapter.fetchTakerLongShortBatch(symbols.coinmSymbols),
        deps.dataService,
        deps.indicatorWindow,
        false,
      );
    })(),
  ]);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`[perSymbolTask] 완료: ${elapsedSec}초 소요`);
}

/**
 * 심볼 리스트 로더. TTL 1시간 캐시 — symbols가 바뀌는 빈도가 낮아
 * 매 execute마다 DB 왕복 2회를 피한다. 캐시 miss 또는 만료 시만 조회.
 */
async function loadSymbols(deps: PerSymbolTaskDeps): Promise<SymbolCache | null> {
  const now = Date.now();
  if (symbolCache && now - symbolCache.refreshedAt < SYMBOL_CACHE_TTL_MS) {
    return symbolCache;
  }

  const [usdmSymRes, coinmSymRes] = await Promise.all([
    deps.dataService.getSymbols({
      exchange: "binance",
      marketType: "futures_usdm",
      status: "TRADING",
    }),
    deps.dataService.getSymbols({
      exchange: "binance",
      marketType: "futures_coinm",
    }),
  ]);

  if (!usdmSymRes.success) {
    console.error(`[perSymbolTask] usdm symbols 조회 실패: ${usdmSymRes.error}`);
    return null;
  }
  if (!coinmSymRes.success) {
    console.error(`[perSymbolTask] coinm symbols 조회 실패: ${coinmSymRes.error}`);
    return null;
  }

  symbolCache = {
    usdmSymbols: usdmSymRes.data.map((s) => s.symbol),
    coinmSymbols: coinmSymRes.data.map((s) => s.symbol),
    refreshedAt: now,
  };
  return symbolCache;
}

// ─── 도메인 공용 수집·upsert 헬퍼 ────────────────────

async function collectAndUpsert(
  label: string,
  fetcher: () => Promise<FetchResult<NowFuturesIndicatorInsert[]>>,
  dataService: IDataService,
  indicatorWindow: RollingWindow<IndicatorSample>,
  isOiDomain: boolean,
): Promise<void> {
  const res = await fetcher();
  if (!res.success) {
    console.error(`[perSymbolTask] ${label} fetch 실패: ${res.error}`);
    return;
  }

  const rows = isOiDomain ? enrichOiRows(res.data, indicatorWindow) : res.data;
  if (rows.length === 0) {
    console.warn(`[perSymbolTask] ${label}: 0개 row — upsert 스킵`);
    return;
  }

  // transient(deadlock/네트워크) 실패 시 자동 재시도.
  // now_futures_indicator는 premiumTask와도 공유되는 테이블이라 lock 경합 발생 가능.
  const up = await retryOnTransient(
    () => dataService.upsertNowFuturesIndicatorPartial(rows),
    { label: `perSymbolTask ${label}` },
  );
  if (!up.success) {
    console.error(`[perSymbolTask] ${label} upsert 최종 실패: ${up.error}`);
  }
}

/** OI 도메인 전용: indicatorWindow에 push + oi_chg_* 사전계산 merge. */
function enrichOiRows(
  rows: NowFuturesIndicatorInsert[],
  window: RollingWindow<IndicatorSample>,
): NowFuturesIndicatorInsert[] {
  const now = Date.now();
  return rows.map((row) => {
    const oi = typeof row.open_interest === "number" ? row.open_interest : null;
    if (oi === null || !row.symbol || !row.market_type) return row;

    const key = `${row.market_type}:${row.symbol}`;
    const sample: IndicatorSample = { ts: now, openInterest: oi };

    // push 전에 preCompute (과거 값만으로 계산).
    const pre = preComputeIndicator(key, sample, window);
    window.push(key, sample);

    return { ...row, ...pre };
  });
}

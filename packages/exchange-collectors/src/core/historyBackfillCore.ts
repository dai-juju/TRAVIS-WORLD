// ============================================================
// historyBackfillCore — backfill 루프 코어 (M1.8.5 Step 4, 2026-05-31)
//
// worker task / 로컬 one-shot 스크립트 / (M1.9~) forward-fill worker 가
// **동일 로직을 재사용** 하도록 분리 (DRY). rate(reqPerMin)·marketType 만 파라미터로 다름:
//   - 로컬 스크립트: 150 req/min (집 IP 전용, production IP 무영향 → quota 통째 사용)
//   - forward-fill worker: 별도 IP + 별도 req/min
//
// 설계 (Step 4 결정 + hotfix 반영):
//   - 9 interval × symbol × 6 metric, 페이지 윈도잉(limit 500, startTime cursor 전진).
//   - per-page upsert (≤500행 = 동일 key 집합 = mixed-batch 안전, ON CONFLICT 자연키 머지).
//   - retryOnTransient (1회성 backfill 페이지 유실 = 영구 결손 방어).
//   - rate throttle (호출 간 60000/reqPerMin ms). client.ts 가 -1003/429/418 graceful 재시도.
//   - graceful: 페이지 실패는 log + 계속. throw 누출 0 (FetchResult/Result 기반).
//
// M1.9 Step 1 (2026-06-02): apps/worker → packages/exchange-collectors 이동.
//   ★ 1-B: ExecuteBackfillDeps 에 marketType 파라미터 추가 — USDM 하드코딩 제거.
//     기존 호출처는 marketType:"futures_usdm" 명시로 무변경 동작.
//     (COINM fetcher 신규 추가는 Step 2 — 본 Step 은 시그니처만 일반화.)
// M1.9 Step 2-A (2026-06-04): ExecuteBackfillDeps 에 startMsOverride? 추가 (S2 부채 회수).
//   미주입 시 기존 backfill 동작(now - lookbackMs) 유지 = runHistoryBackfill 스크립트 회귀 0.
//   주입 시 forward-fill 증분 — DB 최신 recorded_at 부터만 윈도잉(매 cycle 14일 재수집 방지).
// M1.9 Step 2-D (2026-06-04): getMetricFetchers(marketType) 로 USDM(fapi)/COINM(dapi+pair) 세트 선택
//   + symbolFilter? (COINM _PERP only) + intervals? 부분집합. marketType 별 호출 = mixed-batch 자연 분리.
//
// task-record: docs/task-record/M1.8.5-step4-deploy.md
// ============================================================

import type { FetchResult } from "../adapters/IExchangeAdapter";
import type { HistoryFuturesIndicatorInsert, IDataService } from "@travis/data-service";
import type { MarketType } from "@travis/shared";
import {
  fetchBasisHistory,
  fetchGlobalLongShortHistory,
  fetchOpenInterestHistory,
  fetchTakerLongShortHistory,
  fetchTopLongShortAccountHistory,
  fetchTopLongShortPositionHistory,
  type HistoryFetchWindow,
} from "../adapters/binance/historyFetchers";
import {
  coinmSymbolToPair,
  fetchCoinmBasisHistory,
  fetchCoinmGlobalLongShortHistory,
  fetchCoinmOpenInterestHistory,
  fetchCoinmTakerHistory,
  fetchCoinmTopLongShortAccountHistory,
  fetchCoinmTopLongShortPositionHistory,
} from "../adapters/binance/coinmHistoryFetchers";
import type { BinanceHistoryPeriod } from "../adapters/binance/types";
import { retryOnTransient } from "./_upsertRetry";
import { PerMetricThrottle } from "./perMetricThrottle";
import {
  isUnsupportedContractTypeError,
  isUnsupportedMetric,
  markUnsupportedMetric,
} from "./unsupportedMetricCache";

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

/**
 * interval → ms (페이지 cursor 전진용 + forward-fill 안전 lookback 계산용).
 * M1.9 Step 2-B: export — forwardFillTask 가 봉 폭으로 startMs 안전 lookback 계산.
 */
export const INTERVAL_TO_MS: Record<BinanceHistoryPeriod, number> = {
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

/**
 * basis 전용 최소 호출 간격(ms) — M1.9 Step 3 즉효 fix (2026-06-04) / Step 3 후속 ⓒ 정확화 (2026-06-05).
 *
 * ★ 배경 (crypto-domain-expert 확정): /futures/data 5종(OI·taker·LSR)은 2023-10-19
 *   "1000 req/5min" 별도 카운터 바구니에 들어가지만 **basis 만 그 조정 목록에서 빠져**
 *   일반 fapi weight 풀(2400 req/min)에 걸린다. 그래서 basis 만 -1003 ban 이 났다.
 *   (로그 "current limit ... 2400 requests per minute" 이 증거.)
 * 권고: basis 단독 호출 빈도를 20~30/min 으로 하향 → 25/min = 2400ms floor.
 *   다른 5 metric 은 기존 perTask req/min throttle(공통 floor)만 적용.
 *
 * ⚠️ [8-31]ⓒ (2026-06-05): 이 floor 는 **basis-to-basis 간격**에만 적용돼야 한다.
 *   기존 구현은 단일 lastRestCallAt 을 모든 metric 이 공유해 "직전 호출이 OI/taker 든 뭐든"
 *   basis floor(2400ms)를 적용 → cycle 이 심볼수×(2400-공통floor)ms 만큼 팽창했다.
 *   본 후속에서 metric 자체 floor 는 `Map<metricName, lastCallAt>` 로 그 metric 자신의
 *   직전 호출 시점에만 적용하도록 정정. 공통 floor(순차 호출 간격)는 전역 1개 유지.
 *   ⚠️ 구조적 per-metric token-bucket rate limiter(근본)는 여전히 `[8-31]`ⓐ (다음 Step).
 */
const BASIS_MIN_REQ_INTERVAL_MS = 2400;

/** 6 metric fetcher (per-symbol 단건, window 윈도잉). 전부 동일 반환 타입. */
interface MetricFetcher {
  name: string;
  fetch: (
    symbol: string,
    period: BinanceHistoryPeriod,
    limit: number,
    window: HistoryFetchWindow,
  ) => Promise<FetchResult<HistoryFuturesIndicatorInsert[]>>;
  /**
   * 이 metric 전용 최소 호출 간격(ms, 옵션). 미지정 시 공통 throttle(60000/reqPerMin)만 적용.
   * basis 처럼 별도 카운터(weight 풀)에 걸리는 endpoint 만 추가 floor 를 둔다.
   */
  minReqIntervalMs?: number;
}

/** USDM(fapi) fetcher 세트 — symbol(=BTCUSDT) 그대로 전달. basis 는 PERPETUAL pair===symbol. */
const USDM_FETCHERS: MetricFetcher[] = [
  { name: "openInterest", fetch: (s, p, l, w) => fetchOpenInterestHistory(s, p, l, w) },
  { name: "topLSAccount", fetch: (s, p, l, w) => fetchTopLongShortAccountHistory(s, p, l, w) },
  { name: "topLSPosition", fetch: (s, p, l, w) => fetchTopLongShortPositionHistory(s, p, l, w) },
  { name: "globalLS", fetch: (s, p, l, w) => fetchGlobalLongShortHistory(s, p, l, w) },
  { name: "takerLS", fetch: (s, p, l, w) => fetchTakerLongShortHistory(s, p, l, w) },
  // basis 만 fapi weight 풀(2400/min) 카운터 → 단독 floor 로 빈도 하향 (-1003 회피).
  {
    name: "basis",
    fetch: (s, p, l, w) => fetchBasisHistory(s, "PERPETUAL", p, l, w),
    minReqIntervalMs: BASIS_MIN_REQ_INTERVAL_MS,
  },
];

/**
 * COINM(dapi) fetcher 세트 — symbol(=BTCUSD_PERP) → pair(BTCUSD) 변환 후 전달 (2-C 설계: loop 책임).
 * contractType=PERPETUAL 은 COINM fetcher 내부 고정. (S3 부채 — basis PERPETUAL 하드코딩 분기 해소.)
 */
const COINM_FETCHERS: MetricFetcher[] = [
  { name: "openInterest", fetch: (s, p, l, w) => fetchCoinmOpenInterestHistory(coinmSymbolToPair(s), p, l, w) },
  { name: "topLSAccount", fetch: (s, p, l, w) => fetchCoinmTopLongShortAccountHistory(coinmSymbolToPair(s), p, l, w) },
  { name: "topLSPosition", fetch: (s, p, l, w) => fetchCoinmTopLongShortPositionHistory(coinmSymbolToPair(s), p, l, w) },
  { name: "globalLS", fetch: (s, p, l, w) => fetchCoinmGlobalLongShortHistory(coinmSymbolToPair(s), p, l, w) },
  { name: "takerLS", fetch: (s, p, l, w) => fetchCoinmTakerHistory(coinmSymbolToPair(s), p, l, w) },
  // COINM basis 도 동일 endpoint 계열 → 동일 floor 적용 (USDM 과 대칭).
  {
    name: "basis",
    fetch: (s, p, l, w) => fetchCoinmBasisHistory(coinmSymbolToPair(s), p, l, w),
    minReqIntervalMs: BASIS_MIN_REQ_INTERVAL_MS,
  },
];

/**
 * marketType 별 fetcher 세트 선택. COINM 은 dapi + pair 변환 세트.
 * ⚠️ history indicator 는 futures 전용 — "spot" 등 비-futures 는 USDM 으로 폴백하지만
 *    호출자(forward-fill ForwardFillMarket 타입 / runHistoryBackfill)가 futures marketType 만
 *    넘기도록 막아야 한다 (코어는 방어만, 정책은 호출자 소유).
 */
export function getMetricFetchers(marketType: MarketType): MetricFetcher[] {
  return marketType === "futures_coinm" ? COINM_FETCHERS : USDM_FETCHERS;
}

const DEFAULT_LOOKBACK_DAYS = 14;
const JOURNAL_INTERVAL_MS = 60 * 1000; // 1분당 진행 로그

export interface ExecuteBackfillDeps {
  dataService: IDataService;
  /**
   * 수집 대상 마켓 (1-B, M1.9 Step 1).
   * getSymbols + allowlist 조회 키. 기존 호출처는 "futures_usdm" 명시.
   */
  marketType: MarketType;
  /**
   * TRADING allowlist (옵션). 미지정 시 getSymbols(status:TRADING) 결과만 사용.
   * marketType 키로 조회 — 주입된 marketType 의 Set 만 적용.
   */
  tradingSymbolsByMarket?: Partial<Record<MarketType, Set<string>>>;
  /**
   * 심볼 필터 (옵션, M1.9 Step 2-D). getSymbols 결과를 추가로 좁힌다.
   * 용도: COINM forward-fill 이 PERPETUAL(`_PERP`)만 수집하고 분기물(BNBUSD_260626) 제외.
   * 정책은 호출자(collector forward-fill task) 소유 — 코어는 거래소/마켓 비결합 유지.
   */
  symbolFilter?: (symbol: string) => boolean;
  /**
   * rate limit (req/min). worker=50, 로컬 스크립트=150.
   *
   * ★ 이중 대기 관계 (code-reviewer W2): 이 reqPerMin(PerMetricThrottle 공통 floor)과
   *   /futures/data 전역 token-bucket(STATS_BUCKET_PER_MIN=150 / BASIS_BUCKET_PER_MIN=30,
   *   [8-31]ⓐ)은 **느린 쪽이 실질 한도**다. 한쪽만 올리면 다른 쪽이 조용히 묶어 무력화시키니
   *   (예: reqPerMin 만 300 으로 올려도 token-bucket 150 이 /futures/data 를 150 으로 제한)
   *   둘을 함께 검토할 것. 서로 다른 레이어라 합산이 아니라 min() 으로 작동.
   */
  reqPerMin: number;
  /** lookback 일수 (기본 14). startMsOverride 주입 시 무시됨. */
  lookbackDays?: number;
  /**
   * 수집할 interval 부분집합 (M1.9 Step 2-B). 미지정 시 전체 9 interval(HISTORY_INTERVALS).
   * forward-fill 은 interval 마다 freshness anchor 가 달라 interval 당 1회 호출
   * (`intervals: [interval]` + 그 interval 의 `startMsOverride`)로 분리 수집한다.
   */
  intervals?: BinanceHistoryPeriod[];
  /**
   * ★ 증분 시작점 직접 주입 (epoch ms, M1.9 Step 2 / S2 부채).
   *
   * 미지정(기본): 기존 backfill 동작 — `startMs = now - lookbackDays`. (로컬 one-shot 스크립트 무변경)
   * 지정: `startMs = startMsOverride`. forward-fill 이 DB 최신 recorded_at(`getMaxRecordedAt`)에서
   *   1~2봉 안전 lookback 만큼만 되돌린 지점을 주입 → 매 cycle 14일 전체 재수집 방지(IP quota 보호).
   * ⚠️ startMsOverride ≥ now 면 수집할 윈도우가 없어 0 row 반환 (정상 — 이미 최신).
   */
  startMsOverride?: number;
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

  // rate throttle ([8-31]ⓒ): per-metric 분리. 산식은 PerMetricThrottle(순수, 테스트 가능)이 소유.
  //   - 공통 floor(minIntervalMs = 60000/reqPerMin): 직전 "아무" 호출과의 간격(전체 req/min 상한).
  //   - metric 자체 floor(basis 2400ms): 그 metric **자기 직전 호출**과의 간격만 (basis-to-basis).
  //   ★ 과장 금지(주석 정직성): 이 정확화로 basis 의 부당한 cycle 팽창(interval당 +약9분)이
  //     제거되나 lag 개선은 ~14%(short task 약 3.15h→2.7h)뿐. lag 주범은 "심볼수×metric÷reqPerMin
  //     = cycle 하한"이라는 폴링 구조 자체 — 1~3h lag 은 history 누적 목적상 허용(실시간 5m 은
  //     now_* 카드 담당). 근본 token-bucket 은 [8-31]ⓐ(다음 Step).
  const limiter = new PerMetricThrottle(minIntervalMs);
  const throttle = async (metricName: string, metricFloorMs = 0): Promise<void> => {
    const wait = limiter.reserve(metricName, metricFloorMs, Date.now());
    if (wait > 0) await sleep(wait);
  };

  // 대상 마켓 TRADING 심볼 (1-B: marketType 주입).
  const symbolsRes = await deps.dataService.getSymbols({
    exchange: "binance",
    marketType: deps.marketType,
    status: "TRADING",
  });
  if (!symbolsRes.success) {
    throw new Error(`symbols 조회 실패: ${symbolsRes.error}`);
  }
  let symbols = symbolsRes.data.map((s) => s.symbol);
  const allowlist = deps.tradingSymbolsByMarket?.[deps.marketType];
  if (allowlist) symbols = symbols.filter((s) => allowlist.has(s));
  // 호출자 정책 필터 (예: COINM _PERP only — 분기물 제외). 코어는 술어만 적용.
  if (deps.symbolFilter) symbols = symbols.filter(deps.symbolFilter);

  // marketType 별 fetcher 세트 (USDM=fapi / COINM=dapi+pair 변환).
  const metricFetchers = getMetricFetchers(deps.marketType);

  const endMs = Date.now();
  // 증분 주입(startMsOverride) 우선 — 미주입 시 기존 14일 backfill 동작(now - lookbackMs).
  const startMs = deps.startMsOverride ?? endMs - lookbackMs;

  let totalRows = 0;
  let failedPages = 0;
  let lastJournalAt = Date.now();

  // 미지정 시 전체 9 interval. forward-fill 은 interval 부분집합(보통 단일)을 주입.
  const intervals = deps.intervals ?? HISTORY_INTERVALS;
  for (const interval of intervals) {
    for (let si = 0; si < symbols.length; si++) {
      const symbol = symbols[si] as string;
      for (const metric of metricFetchers) {
        const { rows, failed } = await backfillOneMetric(
          deps.dataService,
          deps.marketType,
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
  marketType: MarketType,
  metric: MetricFetcher,
  symbol: string,
  interval: BinanceHistoryPeriod,
  startMs: number,
  endMs: number,
  throttle: (metricName: string, metricFloorMs?: number) => Promise<void>,
): Promise<{ rows: number; failed: number }> {
  // [8-33]: 이전 cycle 에서 -4104(미지원 contractType)로 학습된 (symbol, metric)은
  //   더 이상 요청하지 않는다 (금속/주식/지수 선물의 basis 가 대표 — 불필요 요청 + 로그 노이즈 제거).
  if (isUnsupportedMetric(marketType, symbol, metric.name)) {
    return { rows: 0, failed: 0 };
  }

  const intervalMs = INTERVAL_TO_MS[interval];
  const windowMs = PAGE_LIMIT * intervalMs; // 페이지당 시간 폭 = 정확히 500 point
  const maxPages = Math.ceil(ROWS_PER_METRIC_PER_SYMBOL_14D[interval] / PAGE_LIMIT) + 2;

  let cursor = startMs;
  let rows = 0;
  let failed = 0;

  for (let page = 0; page < maxPages && cursor < endMs; page++) {
    const pageEnd = Math.min(cursor + windowMs, endMs);
    // 공통 floor(전역) + metric 자체 floor(basis 2400ms, 같은 metric 직전 호출 대비) 적용 ([8-31]ⓒ).
    await throttle(metric.name, metric.minReqIntervalMs);
    const res = await metric.fetch(symbol, interval, PAGE_LIMIT, {
      startTime: cursor,
      endTime: pageEnd,
    });
    if (!res.success) {
      // [8-33]: -4104(미지원 contractType)면 이 (symbol, metric)을 영구 skip 학습 →
      //   다음 cycle 부터 요청 자체를 건너뛴다 (graceful — 이번 페이지는 그냥 종료).
      if (isUnsupportedContractTypeError(res.error)) {
        markUnsupportedMetric(marketType, symbol, metric.name);
        console.warn(
          `[historyBackfill] ${symbol} ${interval} ${metric.name} 미지원 contractType(-4104) → 이후 cycle skip 학습`,
        );
        return { rows, failed }; // 이 metric 의 남은 페이지도 동일 결과 — 더 진행 불필요.
      }
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

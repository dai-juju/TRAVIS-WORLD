// ============================================================
// fundingHistoryTask — 펀딩 정산 이벤트 수집 task (사이클 2 Step 6, 2026-07-09).
//
// 역할:
//   history_futures_funding (정산 이벤트 테이블, interval 축 없음) 을 채운다.
//   anchor(getMaxFundingTime) 부터 증분 수집 — anchor 없으면(최초 가동) 60일
//   lookback = **첫 cycle 이 곧 backfill** (별도 one-shot 불필요, 사용자 결정 60일).
//
// forwardFillTask 와 별개 팩토리인 이유:
//   forward-fill 은 interval 그룹(9종 격자) 전제 — 펀딩은 interval 자체가 없고
//   수집 전략도 다름 (USDM = symbol 생략 **전역 페이지네이션** 배치 경로 / COINM =
//   per-symbol). 끼워넣으면 양쪽 다 왜곡 (Explore 자문 2026-07-09).
//
// rate limit (crypto-domain 자문 2026-07-09 — 기존 6 metric 과 다른 풀):
//   USDM /fapi/v1/fundingRate = fundingInfo 와 공유 500 req/5min/IP →
//   client.ts token-bucket "funding" 버킷(80/min)이 path 로 자동 매칭 (별도 sleep 불필요,
//   버킷이 페이스 조절). COINM /dapi/v1/fundingRate = weight 1 일반 풀 (심볼 30개 수준).
//
// 위생 체크 (CLAUDE.md 데이터 소스 위생):
//   #1/#2 allowlist — USDM 전역 응답에 비-TRADING(상장폐지 등) 심볼 정산이 섞일 수
//        있어 cycle 마다 TRADING Set 을 재조회해 row 필터. COINM 은 TRADING + `_PERP`
//        (분기물 제외 — delivery 심볼은 API 도 빈 배열이지만 요청 자체를 생략).
//   #5 sanity — normalize 가 |rate|>3% warn (값 저장).
//   #8 공식 문서 인용 — fundingRateFetchers.ts / types.ts 헤더.
//
// 멱등: 자연키 4축 onConflict upsert → 안전 lookback(1h) 재수집 무해. 페이지 실패 시
//   cycle 을 끊어도(break) 다음 cycle 이 anchor(=이미 upsert 된 최신 정산)부터 자연 재개.
// crash 금지: execute 전체가 graceful — 실패는 로그 + 다음 cycle.
// ============================================================

import type { IDataService } from "@travis/data-service";
import {
  abortableSleep,
  fetchCoinmFundingRateHistory,
  fetchUsdmFundingRateHistory,
  retryOnTransient,
  FUNDING_PAGE_LIMIT,
} from "@travis/exchange-collectors";
import type { MarketType, PollTask } from "@travis/shared";

/** 본 task 가 지원하는 market — forwardFillTask 의 ForwardFillMarket 과 동일 2종. */
export type FundingHistoryMarket = "futures_usdm" | "futures_coinm";

/** cycle 휴식 (execute 완료 후). 정산은 최빈 1h(동적 안전장치) — 20분이면 lag 상한 충분. */
const REST_MS = 20 * 60 * 1000;

/** anchor 없을 때(최초 가동) lookback — 60일 (사용자 결정 2026-07-09, retention 60일 정합). */
const DEFAULT_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * anchor 재수집 안전 lookback — 1h. 정산 직후 API 반영 지연/경계 누락 방어.
 * 멱등(onConflict)이라 재수집 비용 = 페이지 1개 미만.
 */
const SAFETY_LOOKBACK_MS = 60 * 60 * 1000;

/**
 * cycle 당 최대 페이지 수 (무한루프 안전판). 60일 USDM ≈ 21만 이벤트 ÷ 1000 ≈ 210페이지
 * → 400 이면 여유 2배. 도달 시 warn 후 종료(다음 cycle 이 anchor 부터 이어받음).
 */
const MAX_PAGES_PER_CYCLE = 400;

/** COINM per-symbol 사이 예의상 간격(ms) — weight 1 이라 부담 없음, burst 완화용. */
const COINM_INTER_SYMBOL_MS = 100;

/** forward-fill task 들(0/30/60...s)과 부팅 발화가 겹치지 않게 뒤로 미는 기본 지연. */
const INITIAL_DELAY_BASE_MS = 15_000;
const INITIAL_DELAY_STEP_MS = 30_000;

interface MarketSpec {
  marketType: MarketType;
  label: string;
}

const MARKET_SPECS: Record<FundingHistoryMarket, MarketSpec> = {
  futures_usdm: { marketType: "futures_usdm", label: "usdm" },
  futures_coinm: { marketType: "futures_coinm", label: "coinm" },
};

export interface FundingHistoryTaskDeps {
  dataService: IDataService;
  /** 수집 대상 market. 미지정 시 USDM 만 (index.ts 가 env 로 COINM 추가). */
  markets?: FundingHistoryMarket[];
  /** 협조적 취소 — SIGTERM/SIGINT 시 페이지/심볼 경계에서 즉시 graceful 중단. */
  signal?: AbortSignal;
}

/**
 * 펀딩 정산 수집 task 생성 — market 당 1개 PollTask.
 * market 별 별도 task = 별도 upsert 배치 → mixed-batch 불변 자연 보장
 * (USDM mark_price 보유 / COINM 미보장 — defaultToNull:false 와 한 몸).
 */
export function createFundingHistoryTasks(deps: FundingHistoryTaskDeps): PollTask[] {
  const markets = deps.markets ?? ["futures_usdm"];
  return markets.map((market, i) => {
    const spec = MARKET_SPECS[market];
    return {
      id: `binance-funding-history-${spec.label}`,
      tier: "low",
      intervalMs: REST_MS,
      initialDelayMs: INITIAL_DELAY_BASE_MS + i * INITIAL_DELAY_STEP_MS,
      execute: () => runFundingCycle(deps.dataService, spec, deps.signal),
    };
  });
}

/**
 * 한 market 의 1 cycle — anchor 조회 → (USDM 전역 / COINM per-symbol) 증분 수집.
 * 전 구간 graceful: 실패는 로그 + return (다음 cycle 재개).
 */
async function runFundingCycle(
  dataService: IDataService,
  spec: MarketSpec,
  signal?: AbortSignal,
): Promise<void> {
  const tag = `fundingHistory:${spec.label}`;

  // 1) anchor — 이 market 의 최신 정산 시각. 실패 시 cycle skip (무필터 수집 방지와 동일 규율).
  const anchorRes = await dataService.getMaxFundingTime({
    exchange: "binance",
    marketType: spec.marketType,
  });
  if (!anchorRes.success) {
    console.error(`[${tag}] anchor 조회 실패(skip): ${anchorRes.error}`);
    return;
  }
  const anchorMs = anchorRes.data ? Date.parse(anchorRes.data) : null;
  const startMs =
    anchorMs !== null && Number.isFinite(anchorMs)
      ? anchorMs - SAFETY_LOOKBACK_MS
      : Date.now() - DEFAULT_LOOKBACK_MS;

  // 2) TRADING allowlist (위생 #1/#2) — cycle 마다 재조회 (상장폐지 24h 내 반영은
  //    symbols 마스터의 syncSymbolsTask 책임, 여기선 항상 최신 마스터를 읽기만).
  const symbolsRes = await dataService.getSymbols({
    exchange: "binance",
    marketType: spec.marketType,
    status: "TRADING",
  });
  if (!symbolsRes.success) {
    console.error(`[${tag}] TRADING allowlist 조회 실패(skip): ${symbolsRes.error}`);
    return;
  }
  const trading = new Set(symbolsRes.data.map((s) => s.symbol));

  if (spec.marketType === "futures_coinm") {
    await collectCoinm(dataService, tag, trading, startMs, signal);
  } else {
    await collectUsdmGlobal(dataService, tag, trading, startMs, signal);
  }
}

/**
 * USDM — symbol 생략 전역 페이지네이션 (배치 API 의무의 정공).
 * cursor 전진/종료 판정은 **raw 기준** (FundingRatePage 메타 — normalize 폐기와 무관).
 */
async function collectUsdmGlobal(
  dataService: IDataService,
  tag: string,
  trading: Set<string>,
  startMs: number,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = startMs;
  let totalRows = 0;
  let droppedByAllowlist = 0;

  for (let page = 0; page < MAX_PAGES_PER_CYCLE; page++) {
    if (signal?.aborted) {
      console.log(`[${tag}] abort 감지(페이지 경계) — graceful 중단 (누적 ${totalRows}행)`);
      return;
    }
    const res = await fetchUsdmFundingRateHistory({ startTime: cursor, signal });
    if (!res.success) {
      console.warn(`[${tag}] page fail(cycle 종료, 다음 cycle 이 anchor 부터 재개): ${res.error}`);
      return;
    }
    const { rows, rawCount, firstFundingTimeMs, lastFundingTimeMs } = res.data;
    if (rawCount === 0) break; // 다 따라잡음

    // 위생 #2 — 전역 응답에서 TRADING 심볼만 (상장폐지/비정상 심볼 정산 차단).
    const filtered = rows.filter((r) => trading.has(r.symbol));
    droppedByAllowlist += rows.length - filtered.length;
    if (filtered.length > 0) {
      const up = await retryOnTransient(
        () => dataService.upsertHistoryFuturesFunding(filtered),
        { label: `${tag} upsert page=${page}` },
      );
      if (!up.success) {
        console.warn(`[${tag}] upsert fail(cycle 종료): ${up.error}`);
        return; // anchor 미전진 → 다음 cycle 재시도 (멱등)
      }
      totalRows += filtered.length;
    }

    if (rawCount < FUNDING_PAGE_LIMIT) break; // 마지막 페이지
    if (lastFundingTimeMs === null) {
      // 병리적 페이지 (raw 가득인데 fundingTime 전부 이상) — cursor 전진 불가, 무한루프 방어.
      console.warn(`[${tag}] lastFundingTimeMs=null 병리적 페이지 — cycle 중단`);
      return;
    }
    // ★ cursor 전진 (라이브 smoke 2026-07-09 실측 반영): 같은 정산 시각에 수백 심볼이
    //   동시 등장(00:00 UTC ≈ 687개) → 페이지가 같은 fundingTime 그룹 중간에서 잘릴 수
    //   있다. last+1 전진은 잘린 그룹 나머지를 무음 유실 → last **포함** 재조회(멱등
    //   upsert 라 무해, 오버랩 = 그룹 1개분). 단 "페이지 전체가 동일 시각"(first==last)
    //   이면 포함 재조회가 무한루프 → 그 병리 케이스만 +1 강제(>1000 동시정산 초과분
    //   유실 가능성을 warn 으로 가시화 — 현재 실측 ~687 < 1000 이라 미발생 기대).
    if (firstFundingTimeMs !== null && firstFundingTimeMs === lastFundingTimeMs) {
      console.warn(
        `[${tag}] 동일 fundingTime(${new Date(lastFundingTimeMs).toISOString()}) 이 페이지 가득 — +1 강제 전진 (초과 동시정산 유실 가능)`,
      );
      cursor = lastFundingTimeMs + 1;
    } else {
      cursor = lastFundingTimeMs;
    }
    if (page === MAX_PAGES_PER_CYCLE - 1) {
      console.warn(`[${tag}] MAX_PAGES(${MAX_PAGES_PER_CYCLE}) 도달 — 다음 cycle 이 이어받음`);
    }
  }

  console.log(
    `[${tag}] ✓ rows=${totalRows} allowlist-drop=${droppedByAllowlist} from=${new Date(startMs).toISOString()}`,
  );
}

/**
 * COINM — TRADING ∩ `_PERP` per-symbol 수집 (dapi 는 symbol 필수).
 * 심볼당 60일 ≈ 180 이벤트 = 보통 1페이지. 실패 심볼은 skip 후 다음 심볼 (graceful).
 */
async function collectCoinm(
  dataService: IDataService,
  tag: string,
  trading: Set<string>,
  startMs: number,
  signal?: AbortSignal,
): Promise<void> {
  // 분기물(delivery, 예: BTCUSD_260626)은 펀딩 자체가 없음 — 요청 생략 (forwardFill 선례).
  const symbols = [...trading].filter((s) => s.endsWith("_PERP")).sort();
  let totalRows = 0;
  let failedSymbols = 0;

  for (const symbol of symbols) {
    if (signal?.aborted) {
      console.log(`[${tag}] abort 감지(심볼 경계) — graceful 중단 (누적 ${totalRows}행)`);
      return;
    }
    let cursor = startMs;
    for (let page = 0; page < MAX_PAGES_PER_CYCLE; page++) {
      const res = await fetchCoinmFundingRateHistory(symbol, {
        startTime: cursor,
        signal,
      });
      if (!res.success) {
        console.warn(`[${tag}] ${symbol} page fail(다음 심볼 계속): ${res.error}`);
        failedSymbols += 1;
        break;
      }
      const { rows, rawCount, lastFundingTimeMs } = res.data;
      if (rawCount === 0) break;
      if (rows.length > 0) {
        const up = await retryOnTransient(
          () => dataService.upsertHistoryFuturesFunding(rows),
          { label: `${tag} ${symbol} upsert` },
        );
        if (!up.success) {
          console.warn(`[${tag}] ${symbol} upsert fail(다음 심볼 계속): ${up.error}`);
          failedSymbols += 1;
          break;
        }
        totalRows += rows.length;
      }
      if (rawCount < FUNDING_PAGE_LIMIT) break;
      if (lastFundingTimeMs === null) {
        console.warn(`[${tag}] ${symbol} lastFundingTimeMs=null 병리적 페이지 — 심볼 중단`);
        break;
      }
      cursor = lastFundingTimeMs + 1;
    }
    await abortableSleep(COINM_INTER_SYMBOL_MS, signal);
  }

  console.log(
    `[${tag}] ✓ rows=${totalRows} symbols=${symbols.length} failed=${failedSymbols} from=${new Date(startMs).toISOString()}`,
  );
}

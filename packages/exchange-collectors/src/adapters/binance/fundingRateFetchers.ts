// ============================================================
// Binance 펀딩 정산 이벤트 fetcher 2종 (사이클 2 Step 6, 2026-07-09).
//
// history_futures_funding (정산 이벤트 테이블, interval 축 없음) 의 수집 창구.
// 기존 6 metric fetcher(historyFetchers.ts)와 구조가 다른 이유:
//   - USDM 은 **symbol 생략 = 전 심볼 전역 시간순** 을 지원 (배치 API 의무의 정공) —
//     per-symbol 순회 없이 startTime cursor 전역 페이지네이션으로 60일 backfill ≈ 210콜.
//   - COINM(dapi) 은 symbol 필수 → per-symbol (30 `_PERP` 수준이라 저비용).
//   - period(interval) 파라미터 자체가 없음 — 응답이 정산 이벤트 그대로.
//
// Binance USDM realized funding rate history ref:
// https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History
// - rate limit: SHARES 500/5min/IP with /fapi/v1/fundingInfo (★ /futures/data 1000 풀과 별개
//   → client.ts token-bucket "funding" 버킷이 path 로 자동 매칭, FUNDING_BUCKET_PER_MIN=80)
// - limit max 1000 / default 100 / 시간 미지정 시 최근 200개 / ascending
// - "If the number of data between startTime and endTime is larger than limit,
//    return as startTime + limit" → startTime cursor 전진 페이지네이션
// COINM: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Get-Funding-Rate-History-of-Perpetual-Futures
// - weight 1 (일반 IP 풀 — token-bucket 비대상 의도, 일반 weight sticky throttle 적용)
// - symbol REQUIRED, delivery 심볼은 빈 배열
// 조회: 2026-07-09
// ============================================================

import type { FetchResult } from "../IExchangeAdapter";
import type { HistoryFuturesFundingInsert } from "@travis/data-service";
import { binanceFetch } from "./client";
import {
  normalizeFundingRateEvent,
  type FundingMarketType,
} from "./normalize/fundingHistory";
import type { BinanceFundingRateEvent } from "./types";
import type { HistoryFetchWindow } from "./historyFetchers";

const USDM_BASE_URL = "https://fapi.binance.com";
const COINM_BASE_URL = "https://dapi.binance.com";

/**
 * limit 최대 1000 (공식 문서). 호출자(task)가 "응답 길이 == limit → 다음 페이지 존재"
 * 판정에 같은 상수를 쓰도록 export.
 */
export const FUNDING_PAGE_LIMIT = 1000;

/**
 * token-bucket opt-in 플래그 (historyFetchers.ts 와 동일 관례 — 값 내용은 무의미).
 * /fapi/v1/fundingRate 는 limiterBucketForPath 가 "funding" 버킷(80/min)으로 매칭.
 */
const RATE_LIMITER_GROUP = "collector";

/** normalize null(폐기 row) 제거 type-guard (historyFetchers.notNull 미러). */
function notNull<T>(row: T | null): row is T {
  return row !== null;
}

/**
 * 펀딩 1페이지 결과 — normalized rows + 페이지네이션 메타.
 *
 * ★ 메타를 함께 반환하는 이유 (cursor 무한루프 방어): normalize 는 이상 row 를 폐기하므로
 *   rows 만 보고 cursor 를 전진하면 "raw 는 가득(1000)인데 rows 는 0" 인 병리적 페이지에서
 *   cursor 가 멈춰 무한루프가 된다. 종료 판정(rawCount < limit)과 전진(lastFundingTimeMs)은
 *   **raw 기준**이어야 안전.
 */
export interface FundingRatePage {
  rows: HistoryFuturesFundingInsert[];
  /** raw 응답 원소 수 (폐기 전) — "== limit → 다음 페이지 존재" 판정용. */
  rawCount: number;
  /**
   * raw 첫/마지막 원소의 fundingTime (epoch ms). 빈 페이지면 null.
   *
   * ★ first 가 필요한 이유 (라이브 smoke 2026-07-09 실측): USDM 전역 응답은 같은 정산
   *   시각에 수백 심볼이 동시 등장(00:00 UTC ≈ 687개) — 페이지가 같은 fundingTime 그룹
   *   **중간에서 잘릴 수 있다**. cursor 를 last+1 로 전진하면 잘린 그룹의 나머지 심볼이
   *   무음 유실 → cursor 는 last **포함**(재조회, 멱등 upsert 라 무해)으로 전진하되,
   *   "페이지 전체가 동일 시각"(first==last && rawCount==limit) 병리 케이스만 +1 강제
   *   (없으면 무한루프). first==last 판정에 firstFundingTimeMs 사용.
   */
  firstFundingTimeMs: number | null;
  lastFundingTimeMs: number | null;
}

/**
 * raw 배열 → FundingRatePage (Array.isArray 2차 방어 포함 — historyFetchers.mapPage 미러).
 * 배열 아닌 2xx 응답(rate-limit 에러 envelope 등)은 success:false 격하.
 * ascending 보장(공식 문서)이므로 마지막 원소 = 최신 정산.
 */
function mapFundingPage(
  res: FetchResult<BinanceFundingRateEvent[]>,
  marketType: FundingMarketType,
): FetchResult<FundingRatePage> {
  if (!res.success) return res;
  if (!Array.isArray(res.data)) {
    return {
      success: false,
      error: `non-array response (rate-limit/error envelope?): ${JSON.stringify(res.data).slice(0, 120)}`,
    };
  }
  const raw = res.data;
  const toMs = (e: BinanceFundingRateEvent | undefined): number | null =>
    e && typeof e.fundingTime === "number" && e.fundingTime > 0 ? e.fundingTime : null;
  return {
    success: true,
    data: {
      rows: raw.map((r) => normalizeFundingRateEvent(r, marketType)).filter(notNull),
      rawCount: raw.length,
      firstFundingTimeMs: toMs(raw[0]),
      lastFundingTimeMs: toMs(raw[raw.length - 1]),
    },
  };
}

/**
 * USDM 펀딩 정산 이벤트 — /fapi/v1/fundingRate, **symbol 생략 전역** 페이지네이션 경로.
 * window.startTime 부터 시간 오름차순 limit 개 — 호출자가 마지막 fundingTime+1ms 로
 * cursor 전진. TRADING allowlist 필터는 호출자(task) 책임 (전역 응답에 비상장/폐지
 * 심볼 정산이 섞일 수 있음 — 위생 #2).
 */
export async function fetchUsdmFundingRateHistory(
  window: HistoryFetchWindow = {},
  limit: number = FUNDING_PAGE_LIMIT,
): Promise<FetchResult<FundingRatePage>> {
  const res = await binanceFetch<BinanceFundingRateEvent[]>({
    baseUrl: USDM_BASE_URL,
    path: "/fapi/v1/fundingRate",
    rateLimiterGroup: RATE_LIMITER_GROUP,
    signal: window.signal,
    query: { limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapFundingPage(res, "futures_usdm");
}

/**
 * COINM 펀딩 정산 이벤트 — /dapi/v1/fundingRate, symbol 필수(per-symbol).
 * symbol 은 BTCUSD_PERP 형식 그대로 (dapi 는 pair 아닌 symbol 파라미터 — basis 와 다름).
 * delivery(분기물) 심볼은 빈 배열 반환 — 호출자가 `_PERP` 필터로 사전 차단.
 */
export async function fetchCoinmFundingRateHistory(
  symbol: string,
  window: HistoryFetchWindow = {},
  limit: number = FUNDING_PAGE_LIMIT,
): Promise<FetchResult<FundingRatePage>> {
  const res = await binanceFetch<BinanceFundingRateEvent[]>({
    baseUrl: COINM_BASE_URL,
    path: "/dapi/v1/fundingRate",
    signal: window.signal,
    query: { symbol, limit, startTime: window.startTime, endTime: window.endTime },
  });
  return mapFundingPage(res, "futures_coinm");
}

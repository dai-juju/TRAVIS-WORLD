// ============================================================
// premiumIndexTask — 30분 polling, last_settled_funding_rate / interest_rate /
// last_settled_funding_time / mark_price / index_price 채움 (M1.8 §8.2a-2, 2026-05-26).
//
// 채움 도메인 (D8 + D15 + D18):
//   - last_settled_funding_rate (realized) — premiumIndex.lastFundingRate
//   - last_settled_funding_time (D15 역산) — nextFundingTime - intervalHours * 3600 * 1000
//   - interest_rate — premiumIndex.interestRate
//   - mark_price / index_price / estimated_settle_price — premiumIndex 와 동기화
//     (WS markPriceWsHandler 가 1초 주기로 채우지만 본 task 도 30분 1회 보완 — race 없음 same value)
//   - next_funding_time — WS 와 동기화
//
// 주기 (D18, 자문 권장):
//   - 30분 고정 — last_settled_funding_rate 가 정산 직후 4h/8h 고정 (oversampling 8~16배 충분)
//   - premiumIndex 전체 호출 weight 10, 분당 quota 6000 의 0.005% 사용 — quota 부담 0
//
// 의존:
//   - fundingInfoTask 의 getFundingIntervalMap() — normalize 시 fundingIntervalHours 주입 (D15)
//   - 미존재 심볼은 자동 8h fallback (Binance 공식 정책)
//
// 데이터 위생:
//   - WS handler 와 같은 컬럼 일부 채우지만 timing 다름 (30분 vs 1초). race 가 아니라
//     동일 source 의 다른 sampling rate. WS 가 더 빠르므로 본 task 의 update 는
//     "premiumIndex 전체 sweep" 의 의미.
//   - upsertNowFuturesIndicatorPartial 가 defaultToNull: false 라 OI/LSR/Taker/Basis
//     도메인 컬럼은 영향 0.
//
// docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Mark-Price (2026-05-26 조회)
// ============================================================

import type { IDataService } from "@travis/data-service";
import type { BinanceUsdmAdapter } from "../../adapters/binance/index.js";
import type { PollTask } from "@travis/shared";
import type { MarketType } from "../../ws-relay/types.js";
import { getFundingIntervalMap } from "./fundingInfoTask.js";
import { retryOnTransient } from "@travis/exchange-collectors";

/** 30분 고정 polling — last_settled_funding_rate oversampling 8~16배. */
const INTERVAL_MS = 30 * 60 * 1000;

export interface PremiumIndexTaskDeps {
  usdmAdapter: BinanceUsdmAdapter;
  dataService: IDataService;
  // COINM 은 deferred [8-3] M1.9 또는 M2 초반 — 본 task 는 USDM 우선.
  /**
   * M1.8 §8.4-d 신설 (2026-05-26) — TRADING 심볼 allowlist.
   * fetchPremiumIndex 가 전체 USDM (TRADING + BREAK 등) 응답 → 모두 upsert 되면 BREAK row
   * 가 indicator 에 누적. 8.4-a (ticker24hrBatchTask) + markPriceWsHandler 와 동일 영역.
   */
  tradingSymbolsByMarket?: Record<MarketType, Set<string>>;
}

export function createPremiumIndexTask(deps: PremiumIndexTaskDeps): PollTask {
  return {
    id: "binance-premium-index",
    tier: "low",
    intervalMs: INTERVAL_MS,
    execute: () => runPremiumIndex(deps),
  };
}

async function runPremiumIndex(deps: PremiumIndexTaskDeps): Promise<void> {
  const startedAt = Date.now();

  // fundingInfoTask 가 채운 Map 참조. 미초기화 (worker 부팅 직후 첫 cycle) 면
  // 빈 Map → 모든 심볼 8h default 적용. fundingInfoTask 첫 cycle 완료 후
  // 자연 동기화 (worker bootstrap 에서 두 task 의 execution order 결정).
  const fundingInfoMap = getFundingIntervalMap();

  const res = await deps.usdmAdapter.fetchPremiumIndex(fundingInfoMap);
  if (!res.success) {
    console.error(`[premiumIndexTask] USDM fetch 실패: ${res.error}`);
    return;
  }

  // M1.8 §8.4-d (2026-05-26) — TRADING allowlist 적용 (8.4-a 패턴 미러링).
  // fetchPremiumIndex 가 전체 USDM 응답 → BREAK 심볼 row 도 indicator 에 partial INSERT
  // 되는 함정. 본 filter 가 차단.
  const allow = deps.tradingSymbolsByMarket?.futures_usdm;
  const filteredRows = allow
    ? res.data.filter((row) => row.symbol && allow.has(row.symbol))
    : res.data;

  if (filteredRows.length === 0) {
    console.warn("[premiumIndexTask] USDM: 0개 row — upsert 스킵");
    return;
  }

  const up = await retryOnTransient(
    () => deps.dataService.upsertNowFuturesIndicatorPartial(filteredRows),
    { label: "premiumIndexTask USDM" },
  );
  if (!up.success) {
    console.error(`[premiumIndexTask] USDM upsert 최종 실패: ${up.error}`);
  }

  const elapsedMs = Date.now() - startedAt;
  const skippedCount = res.data.length - filteredRows.length;
  console.log(
    `[premiumIndexTask] 완료: ${filteredRows.length}개 row (skip=${skippedCount}), ` +
      `fundingInfoMap=${fundingInfoMap.size} entries, ${elapsedMs}ms 소요`,
  );
}

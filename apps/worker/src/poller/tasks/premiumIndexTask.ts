// ============================================================
// premiumIndexTask — 30분 polling, interest_rate / mark_price / index_price /
// estimated_settle_price / next_funding_time 채움 (M1.8 §8.2a-2, 2026-05-26).
//
// ★ N1 hotfix (사이클 2 Step 6 후속, 2026-07-10 — 위생 #9 site=DB):
//   last_settled_funding_rate / last_settled_funding_time 는 **본 task 가 더 이상 채우지
//   않는다**. premiumIndex.lastFundingRate 는 realized(정산 확정값)가 아니라 predicted 와
//   같은 소스의 스냅샷이라 정산 사이 계속 변동 → 카드가 틀린 "last settled" 표시(사이트=DB
//   위반, 실측 BTCUSDT 0.00009058 realized vs 0.00006198 스냅샷). 정산 확정값은
//   collector-history 의 fundingHistoryTask 가 history_futures_funding 으로부터 반영.
//   (본 task 가 계속 채우면 30분마다 그 확정값을 스냅샷으로 되덮어 버림 → 제거가 필수.)
//   상세: adapters/binance/normalize.ts normalizeUsdmPremium 주석.
//
// 채움 도메인 (D8 + D18, N1 hotfix 후):
//   - interest_rate — premiumIndex.interestRate
//   - mark_price / index_price / estimated_settle_price — premiumIndex 와 동기화
//     (WS markPriceWsHandler 가 1초 주기로 채우지만 본 task 도 30분 1회 보완 — race 없음 same value)
//   - next_funding_time — WS 와 동기화 (predicted next 정산 시각, last_settled 와 무관)
//
// 주기 (D18, 자문 권장):
//   - 30분 고정 — mark/index 는 WS 가 1초로 채우므로 본 sweep 은 보완용 (oversampling 충분)
//   - premiumIndex 전체 호출 weight 10, 분당 quota 6000 의 0.005% 사용 — quota 부담 0
//
// 데이터 위생:
//   - WS handler 와 같은 컬럼 일부 채우지만 timing 다름 (30분 vs 1초). race 가 아니라
//     동일 source 의 다른 sampling rate. WS 가 더 빠르므로 본 task 의 update 는
//     "premiumIndex 전체 sweep" 의 의미.
//   - upsertNowFuturesIndicatorPartial 가 defaultToNull: false 라 OI/LSR/Taker/Basis /
//     last_settled_*(collector 소관) 등 객체에 없는 컬럼은 영향 0.
//
// docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Mark-Price (2026-05-26 조회)
// ============================================================

import type { IDataService } from "@travis/data-service";
import type { BinanceUsdmAdapter } from "../../adapters/binance/index.js";
import type { PollTask } from "@travis/shared";
import type { MarketType } from "../../ws-relay/types.js";
import { retryOnTransient } from "@travis/exchange-collectors";

/** 30분 고정 polling — mark/index/interest_rate premiumIndex 전체 sweep. */
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

  const res = await deps.usdmAdapter.fetchPremiumIndex();
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
    `[premiumIndexTask] 완료: ${filteredRows.length}개 row (skip=${skippedCount}), ${elapsedMs}ms 소요`,
  );
}

// ============================================================
// Premium Index 폴링 Task (M1.3 Step 4 Substep 4c).
//
// 책임:
//   Binance USDM + COINM의 /premiumIndex 배치 API를 호출하여
//   mark_price / index_price / estimated_settle_price / last_funding_rate /
//   interest_rate / next_funding_time 6개 컬럼을 now_futures_indicator에
//   부분 UPDATE (다른 도메인 컬럼은 건드리지 않음).
//
// 주기: 30초. funding/mark_price는 상대적으로 느리게 변하지만 스캘퍼에게
//       너무 정체되면 의미 감소 → 30s로 균형.
// tier: "high".
//
// mixed-batch 금지 불변:
//   어댑터가 이미 "premium 도메인 컬럼만 포함한 row" 를 반환하므로
//   upsertNowFuturesIndicatorPartial에 그대로 전달하면 OK.
// ============================================================

import type { IDataService } from "@travis/data-service";
import type {
  BinanceCoinmAdapter,
  BinanceUsdmAdapter,
} from "../../adapters/binance/index.js";
import type { PollTask } from "../../adapters/IPoller.js";

const INTERVAL_MS = 30_000;

export interface PremiumTaskDeps {
  usdmAdapter: BinanceUsdmAdapter;
  coinmAdapter: BinanceCoinmAdapter;
  dataService: IDataService;
}

export function createPremiumTask(deps: PremiumTaskDeps): PollTask {
  return {
    id: "binance-premium",
    tier: "high",
    intervalMs: INTERVAL_MS,
    execute: () => runPremiumTask(deps),
  };
}

async function runPremiumTask(deps: PremiumTaskDeps): Promise<void> {
  // USDM/COINM 병렬 fetch (다른 baseUrl).
  const [usdmRes, coinmRes] = await Promise.all([
    deps.usdmAdapter.fetchPremiumIndex(),
    deps.coinmAdapter.fetchPremiumIndex(),
  ]);

  if (usdmRes.success) {
    const r = await deps.dataService.upsertNowFuturesIndicatorPartial(usdmRes.data);
    if (!r.success) console.error(`[premiumTask] usdm upsert 실패: ${r.error}`);
  } else {
    console.error(`[premiumTask] usdm fetch 실패: ${usdmRes.error}`);
  }

  if (coinmRes.success) {
    const r = await deps.dataService.upsertNowFuturesIndicatorPartial(coinmRes.data);
    if (!r.success) console.error(`[premiumTask] coinm upsert 실패: ${r.error}`);
  } else {
    console.error(`[premiumTask] coinm fetch 실패: ${coinmRes.error}`);
  }
}

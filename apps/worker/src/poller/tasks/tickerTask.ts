// ============================================================
// Ticker 폴링 Task (M1.3 Step 4 Substep 4c).
//
// 책임:
//   Binance Spot + USDM + COINM의 /ticker/24hr 배치 API를 동시에 호출하여
//   전 심볼 가격/거래량 + 24h 변동률을 수집. 워커 롤링 윈도우에 저장 후
//   preComputeTicker로 5m/15m/1h/4h 변화율을 계산, 같은 행에 merge하여
//   now_spot_ticker / now_futures_ticker로 upsert.
//
// 주기: 3초 (사용자 결정 "최대한 짧게" — 배치 API라 rate limit 여유).
// tier: "high" (변동성 높음).
//
// RollingWindow key 전략:
//   `${market_type}:${symbol}` — spot/usdm/coinm이 같은 심볼명을 가질 수 있어
//   market_type으로 네임스페이스 분리 (예: "spot:BTCUSDT" vs "futures_usdm:BTCUSDT").
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
import type { PollTask } from "../../adapters/IPoller.js";
import type { RollingWindow } from "../../compute/RollingWindow.js";
import { preComputeTicker, type TickerSample } from "../../compute/preCompute.js";

/** 사용자 결정: 배치 API는 "최대한 짧게" — 3초. */
const INTERVAL_MS = 3_000;

export interface TickerTaskDeps {
  spotAdapter: BinanceSpotAdapter;
  usdmAdapter: BinanceUsdmAdapter;
  coinmAdapter: BinanceCoinmAdapter;
  dataService: IDataService;
  tickerWindow: RollingWindow<TickerSample>;
}

export function createTickerTask(deps: TickerTaskDeps): PollTask {
  return {
    id: "binance-ticker",
    tier: "high",
    intervalMs: INTERVAL_MS,
    execute: () => runTickerTask(deps),
  };
}

async function runTickerTask(deps: TickerTaskDeps): Promise<void> {
  // spot/usdm/coinm 3개 마켓 동시 병렬 fetch (각자 다른 baseUrl).
  // ⚠️ 새 거래소 추가 시 이 블록 + 아래 upsert Promise.all 배열을 편집해야 함.
  //     M2에 OKX/Bybit 오면 이 파일을 fetchers 배열 loop로 재구조화 검토 (W5, IExchangeAdapter 재설계와 연계).
  const [spotRes, usdmRes, coinmRes] = await Promise.all([
    deps.spotAdapter.fetchTicker24hr(),
    deps.usdmAdapter.fetchTicker24hr(),
    deps.coinmAdapter.fetchTicker24hr(),
  ]);

  const now = Date.now();

  // W4: 3개 upsert를 병렬로 (Supabase 왕복 3회 직렬이면 3초 intervalMs 빠듯할 수 있음).
  await Promise.all([
    (async (): Promise<void> => {
      if (!spotRes.success) {
        console.error(`[tickerTask] spot fetch 실패: ${spotRes.error}`);
        return;
      }
      const enriched = enrichSpotTickerRows(spotRes.data, deps.tickerWindow, now);
      const r = await deps.dataService.upsertNowSpotTicker(enriched);
      if (!r.success) console.error(`[tickerTask] spot upsert 실패: ${r.error}`);
    })(),
    (async (): Promise<void> => {
      if (!usdmRes.success) {
        console.error(`[tickerTask] usdm fetch 실패: ${usdmRes.error}`);
        return;
      }
      const enriched = enrichFuturesTickerRows(usdmRes.data, deps.tickerWindow, now);
      const r = await deps.dataService.upsertNowFuturesTicker(enriched);
      if (!r.success) console.error(`[tickerTask] usdm upsert 실패: ${r.error}`);
    })(),
    (async (): Promise<void> => {
      if (!coinmRes.success) {
        console.error(`[tickerTask] coinm fetch 실패: ${coinmRes.error}`);
        return;
      }
      const enriched = enrichFuturesTickerRows(coinmRes.data, deps.tickerWindow, now);
      const r = await deps.dataService.upsertNowFuturesTicker(enriched);
      if (!r.success) console.error(`[tickerTask] coinm upsert 실패: ${r.error}`);
    })(),
  ]);
}

// ─── Spot/Futures 공통 로직 (타입 분리를 위해 2개 함수) ──

function enrichSpotTickerRows(
  rows: NowSpotTickerInsert[],
  window: RollingWindow<TickerSample>,
  ts: number,
): NowSpotTickerInsert[] {
  return rows.map((row) => enrichOne(row, window, ts));
}

function enrichFuturesTickerRows(
  rows: NowFuturesTickerInsert[],
  window: RollingWindow<TickerSample>,
  ts: number,
): NowFuturesTickerInsert[] {
  return rows.map((row) => enrichOne(row, window, ts));
}

/**
 * 공통 enrich: 사전계산 컬럼 merge.
 * - window에서 과거 값을 꺼내 변화율 계산 (push 전).
 * - 이후 현재 sample을 window에 push (다음 tick에서 5분 전으로 쓰임).
 * - last_price/volume이 null이면 사전계산 불가 → 원본 그대로 반환.
 */
function enrichOne<T extends NowSpotTickerInsert | NowFuturesTickerInsert>(
  row: T,
  window: RollingWindow<TickerSample>,
  ts: number,
): T {
  // W3: Number.isFinite 추가 — NaN 같은 비정상값이 RollingWindow에 쌓이는 것 방지.
  const price =
    typeof row.last_price === "number" && Number.isFinite(row.last_price)
      ? row.last_price
      : null;
  const volume =
    typeof row.volume === "number" && Number.isFinite(row.volume) ? row.volume : null;
  if (price === null || volume === null || !row.symbol || !row.market_type) {
    return row;
  }

  const key = `${row.market_type}:${row.symbol}`;
  const sample: TickerSample = { ts, price, volume };

  // 순서 중요: 현재 sample을 push 하기 전에 preCompute (과거 값만으로 계산).
  const pre = preComputeTicker(key, sample, window);
  window.push(key, sample);

  return { ...row, ...pre };
}

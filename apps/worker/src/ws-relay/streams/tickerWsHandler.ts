// ============================================================
// tickerWsHandler — `!miniTicker@arr` 스트림 처리 (M1.3 Step 5b).
//
// 책임:
//   - Binance `!miniTicker@arr` 페이로드(배열) 파싱
//   - 각 심볼마다 NowSpotTickerInsert / NowFuturesTickerInsert 변환
//   - tickerWindow push 전에 preComputeTicker 로 변화율 계산 (순서 불변)
//   - dataService.upsertNowSpotTicker / upsertNowFuturesTicker 호출
//   - retryOnTransient 래퍼로 deadlock/네트워크 transient 자동 재시도
//
// 페이로드 스펙 (Binance 공식):
//   Combined Stream에서 수신: { stream: "!miniTicker@arr", data: [...] }
//   data 배열 각 원소:
//     { e: "24hrMiniTicker", E: 1672531200000, s: "BTCUSDT",
//       c: "close", o: "open", h: "high", l: "low", v: "vol", q: "quote_vol" }
//
// 주의:
//   - 가격/거래량은 문자열로 옴 → parseFloat 필요
//   - `price_change_pct` (24h 변화율) 는 miniTicker에 없음 → null 유지
//     (Step 5 후속에서 preComputeTicker 24h 계산 추가 검토)
// ============================================================

import type {
  IDataService,
  NowFuturesTickerInsert,
  NowSpotTickerInsert,
} from "@travis/data-service";
import type { RollingWindow } from "../../compute/RollingWindow.js";
import {
  preComputeTicker,
  type KlineVolumeSample,
  type TickerSample,
} from "../../compute/preCompute.js";
import { retryOnTransient } from "../../poller/tasks/_upsertRetry.js";
import type { MarketType, StreamHandler } from "../types.js";

/** Binance miniTicker 원시 필드 (raw WS payload) */
interface MiniTickerRaw {
  e?: string; // event type
  E?: number; // event time (ms)
  s?: string; // symbol
  c?: string; // close price (last)
  o?: string; // open
  h?: string; // high
  l?: string; // low
  v?: string; // base volume
  q?: string; // quote volume
}

export interface TickerWsHandlerDeps {
  dataService: IDataService;
  tickerWindow: RollingWindow<TickerSample>;
  /**
   * 1m kline volume 전용 window (Step 5e E1 도입).
   * 제공되면 preComputeTicker 가 volume_chg_5m 해석 B 로 계산.
   * optional — klineWsHandler 가 아직 등록 안 된 초기 부팅 구간에서 fallback.
   */
  volumeKlineWindow?: RollingWindow<KlineVolumeSample>;
}

export function createTickerWsHandler(deps: TickerWsHandlerDeps): StreamHandler {
  return {
    id: "tickerWsHandler",
    canHandle: (streamName: string): boolean => streamName === "!miniTicker@arr",
    handle: async (
      _streamName: string,
      marketType: MarketType,
      data: unknown,
    ): Promise<void> => {
      if (!Array.isArray(data)) {
        console.warn(
          `[tickerWsHandler] ${marketType}: data가 배열이 아님 — 무시`,
        );
        return;
      }
      await handleTickerBatch(deps, marketType, data as MiniTickerRaw[]);
    },
  };
}

async function handleTickerBatch(
  deps: TickerWsHandlerDeps,
  marketType: MarketType,
  rawRows: MiniTickerRaw[],
): Promise<void> {
  const now = Date.now();

  if (marketType === "spot") {
    const rows = rawRows
      .map((r) => normalizeSpotMiniTicker(r))
      .filter((r): r is NowSpotTickerInsert => r !== null);
    const enriched = rows.map((row) =>
      enrichTickerRow(row, deps.tickerWindow, deps.volumeKlineWindow, now),
    );
    if (enriched.length === 0) return;
    const res = await retryOnTransient(
      () => deps.dataService.upsertNowSpotTicker(enriched),
      { label: "tickerWsHandler spot" },
    );
    if (!res.success) {
      console.error(`[tickerWsHandler] spot upsert 최종 실패: ${res.error}`);
    }
    return;
  }

  // futures_usdm | futures_coinm
  const rows = rawRows
    .map((r) => normalizeFuturesMiniTicker(r, marketType))
    .filter((r): r is NowFuturesTickerInsert => r !== null);
  const enriched = rows.map((row) =>
    enrichTickerRow(row, deps.tickerWindow, deps.volumeKlineWindow, now),
  );
  if (enriched.length === 0) return;
  const res = await retryOnTransient(
    () => deps.dataService.upsertNowFuturesTicker(enriched),
    { label: `tickerWsHandler ${marketType}` },
  );
  if (!res.success) {
    console.error(
      `[tickerWsHandler] ${marketType} upsert 최종 실패: ${res.error}`,
    );
  }
}

// ─── normalize ─────────────────────────────────────

/** WS 문자열 가격/수량을 number로 변환. 비정상은 null. */
function parseNum(v: string | undefined): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSpotMiniTicker(r: MiniTickerRaw): NowSpotTickerInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  return {
    exchange: "binance",
    market_type: "spot",
    symbol: r.s,
    last_price: parseNum(r.c),
    open_price: parseNum(r.o),
    high_price: parseNum(r.h),
    low_price: parseNum(r.l),
    volume: parseNum(r.v),
    quote_volume: parseNum(r.q),
    // price_change_pct / bid·ask / trade_count 는 miniTicker에 없음 → 미포함
    //  → partial update 의미로 SQL 컬럼 리스트에서 빠져 기존 값 유지
  };
}

function normalizeFuturesMiniTicker(
  r: MiniTickerRaw,
  marketType: "futures_usdm" | "futures_coinm",
): NowFuturesTickerInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  return {
    exchange: "binance",
    market_type: marketType,
    symbol: r.s,
    last_price: parseNum(r.c),
    open_price: parseNum(r.o),
    high_price: parseNum(r.h),
    low_price: parseNum(r.l),
    volume: parseNum(r.v),
    quote_volume: parseNum(r.q),
  };
}

// ─── 사전계산 merge (Step 4 tickerSpotTask/tickerFuturesTask 에서 이관) ─

/**
 * preComputeTicker: 현재 sample을 tickerWindow에 push 하기 **전에** 과거 값과 비교해
 * 5m/15m/1h/4h 변화율과 volume_ratio 계산. 그 다음 window에 push.
 * 순서 불변 (MEMORY: feedback_precompute_push_order.md) — 뒤집으면 "자기 자신 비교"로 0% 버그.
 */
function enrichTickerRow<T extends NowSpotTickerInsert | NowFuturesTickerInsert>(
  row: T,
  window: RollingWindow<TickerSample>,
  volumeKlineWindow: RollingWindow<KlineVolumeSample> | undefined,
  ts: number,
): T {
  const price = row.last_price;
  const volume = row.volume;
  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    typeof volume !== "number" ||
    !Number.isFinite(volume) ||
    !row.symbol ||
    !row.market_type
  ) {
    return row;
  }

  const key = `${row.market_type}:${row.symbol}`;
  const sample: TickerSample = { ts, price, volume };

  const pre = preComputeTicker(key, sample, window, volumeKlineWindow);
  window.push(key, sample);

  return { ...row, ...pre };
}

// ============================================================
// tickerWsHandler — `!ticker@arr` 스트림 처리 (M1.3 Step 5b → M1.6 Step 3.5 hotfix).
//
// 책임:
//   - Binance `!ticker@arr` 페이로드(배열) 파싱
//   - 각 심볼마다 NowSpotTickerInsert / NowFuturesTickerInsert 변환
//   - tickerWindow push 전에 preComputeTicker 로 변화율 계산 (순서 불변)
//   - dataService.upsertNowSpotTicker / upsertNowFuturesTicker 호출
//   - retryOnTransient 래퍼로 deadlock/네트워크 transient 자동 재시도
//
// ─── M1.6 Step 3.5 hotfix (2026-04-27) ─────────────
// 이전 (M1.3 Step 5b ~ M1.6 Step 3): `!miniTicker@arr` 사용 (6 필드 c/o/h/l/v/q).
// 문제: 24h 변화율 (priceChangePercent / priceChange / weightedAvgPrice / count /
//   openTime / closeTime) 이 mini 페이로드에 없어 DB 의 price_change_pct 가
//   M1.3 Step 4 시점 값으로 **영구 stale**. 사용자가 Binance 사이트 비교로 발견.
// 해결: `!ticker@arr` (full 17 필드) 로 전환 → 매초 priceChangePercent 적재.
//   → **사용자가 보는 Binance 사이트와 동일 값 보장** (CLAUDE.md "유저가 보는
//      웹사이트와 데이터 일치" 도메인 원칙, 2026-04-27 신설).
//
// ─── 페이로드 스펙 ────────────────────────────────
// Combined Stream 수신: { stream: "!ticker@arr", data: [...] }
// data 배열 각 원소 (USDM 17 필드, SPOT 21 필드 — b/B/a/A/x 추가):
//   { e: "24hrTicker", E: 1672531200000, s: "BTCUSDT",
//     p: "priceChange", P: "priceChangePercent",   ★ 핵심
//     w: "weightedAvgPrice", c: "lastPrice", Q: "lastQty",
//     o: "open", h: "high", l: "low", v: "vol", q: "quote_vol",
//     O: openTime, C: closeTime, F: firstTradeId, L: lastTradeId, n: tradeCount }
// SPOT 추가: x: prevClosePrice, b: bidPrice, B: bidQty, a: askPrice, A: askQty
// 본 hotfix scope: 17 필드 공통 매핑 (P/p/w/n/O/C 추가). b/B/a/A/x 는 USDM 일관성
// 위해 별도 commit ([3-40]) — USDM 은 `<symbol>@bookTicker` 별도 stream 필요.
//
// ─── 공식 docs ────────────────────────────────────
//   - USDM:  https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/All-Market-Tickers-Streams
//   - SPOT:  https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams.md#all-market-tickers-stream
//   조회일: 2026-04-27 (crypto-domain-expert 자문)
//
// ─── 주의 ─────────────────────────────────────────
//   - 가격/거래량은 문자열로 옴 → parseFloat 필요
//   - SETTLING/CLOSE 심볼 allowlist 필터 (M1.4 Step 4.7) 그대로 유지
//   - WS payload 크기 mini 대비 ~3배 (12K → 34K 필드/sec). Hetzner 1Gbps 무시 가능.
//     CPU 파싱만 ~3배 증가 — 워커 모니터링 권장 (deferred [3-41]).
//   - P 필드 ±50% sanity guard 권장 (CLAUDE.md 위생 #5) — 별도 commit ([3-42]).
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

/**
 * Binance `!ticker@arr` 원시 필드 (raw WS payload) — full ticker.
 * USDM 17 필드 기준. SPOT 은 b/B/a/A/x 5 필드 추가 (현 hotfix scope 밖, [3-40]).
 */
interface FullTickerRaw {
  e?: string; // event type ("24hrTicker")
  E?: number; // event time (ms)
  s?: string; // symbol
  p?: string; // price change (24h)
  P?: string; // price change percent (24h) ★ 핵심 fix 대상
  w?: string; // weighted average price (24h VWAP)
  c?: string; // last price (close)
  Q?: string; // last quantity
  o?: string; // open price (24h ago)
  h?: string; // high price (24h)
  l?: string; // low price (24h)
  v?: string; // total traded base asset volume (24h)
  q?: string; // total traded quote asset volume (24h)
  O?: number; // statistics open time (ms)
  C?: number; // statistics close time (ms)
  F?: number; // first trade ID
  L?: number; // last trade ID
  n?: number; // total number of trades
  // SPOT 전용 (USDM 미포함, [3-40] 별도 commit 시 활용):
  x?: string; // prevClosePrice
  b?: string; // best bid price
  B?: string; // best bid qty
  a?: string; // best ask price
  A?: string; // best ask qty
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
  /**
   * marketType 별 **TRADING** 심볼 allowlist (M1.4 Step 4.7, 2026-04-22 도입).
   * 상장폐지 진행중/완료 심볼 stale 데이터 누적 방지.
   */
  tradingSymbolsByMarket?: Record<MarketType, Set<string>>;
}

export function createTickerWsHandler(deps: TickerWsHandlerDeps): StreamHandler {
  return {
    id: "tickerWsHandler",
    // M1.6 Step 4 hotfix B (2026-04-28): "!ticker@arr" → "!miniTicker@arr" 임시 롤백.
    // 사유: Windows 개발 환경 payload-size selective failure (608/1408 심볼 stall).
    //   상세: index.ts WS_SUBSCRIPTIONS 주석. Hetzner 이전 후 full 재시도 예정.
    // normalize 함수는 17 필드 매핑 그대로 유지 — mini 페이로드(6필드)가 들어와도
    //   P/p/w/n/O/C 는 undefined → null 로 매핑 → partial update 로 기존값 유지.
    //   ticker24hrBatchTask (REST 1분 폴링) 가 별도 시점에 P/p/w/n/O/C 만 update.
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
      await handleTickerBatch(deps, marketType, data as FullTickerRaw[]);
    },
  };
}

async function handleTickerBatch(
  deps: TickerWsHandlerDeps,
  marketType: MarketType,
  rawRows: FullTickerRaw[],
): Promise<void> {
  const now = Date.now();
  // Step 4.7: TRADING allowlist 적용. 주입 안 되면 기존 동작.
  const allow = deps.tradingSymbolsByMarket?.[marketType];
  const isAllowed = (sym: string): boolean => !allow || allow.has(sym);

  if (marketType === "spot") {
    const rows = rawRows
      .map((r) => normalizeSpotFullTicker(r))
      .filter((r): r is NowSpotTickerInsert => r !== null && isAllowed(r.symbol));
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
    .map((r) => normalizeFuturesFullTicker(r, marketType))
    .filter(
      (r): r is NowFuturesTickerInsert => r !== null && isAllowed(r.symbol),
    );
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

/**
 * SPOT 전체 ticker 정규화 (M1.6 Step 3.5 hotfix, 2026-04-27).
 *
 * mini 대비 추가 적재 6 필드 (모두 schema 컬럼 존재):
 *   - price_change (p)
 *   - price_change_pct (P) ★ 핵심 fix 대상
 *   - weighted_avg_price (w)
 *   - trade_count (n)
 *   - open_time (O) / close_time (C)
 *
 * SPOT 전용 b/B/a/A/x 는 schema 컬럼 있으나 USDM 일관성 위해 별도 commit
 * 으로 deferred ([3-40]). USDM 은 `<symbol>@bookTicker` 별도 stream 필요.
 */
function normalizeSpotFullTicker(r: FullTickerRaw): NowSpotTickerInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  return {
    exchange: "binance",
    market_type: "spot",
    symbol: r.s,
    last_price: parseNum(r.c),
    price_change: parseNum(r.p),
    price_change_pct: parseNum(r.P),
    weighted_avg_price: parseNum(r.w),
    open_price: parseNum(r.o),
    high_price: parseNum(r.h),
    low_price: parseNum(r.l),
    volume: parseNum(r.v),
    quote_volume: parseNum(r.q),
    trade_count: typeof r.n === "number" ? r.n : null,
    open_time: typeof r.O === "number" ? r.O : null,
    close_time: typeof r.C === "number" ? r.C : null,
    // bid_price / bid_qty / ask_price / ask_qty / prev_close_price 는 schema 있으나
    // USDM 일관성 위해 별도 commit ([3-40]). 명시 안 하면 partial update 로 기존값 유지.
  };
}

/**
 * USDM/COINM 전체 ticker 정규화 (M1.6 Step 3.5 hotfix, 2026-04-27).
 *
 * USDM `!ticker@arr` 17 필드 (b/B/a/A/x 미포함). COINM 도 동일 구조.
 * SPOT 과 동일하게 P/p/w/n/O/C 6 필드 추가 적재. base_volume (COINM 만) 은
 * 별도 출처 필요 — 현재 NULL 유지 (REST 폴링 시점에 채움, deferred 추적 대상).
 */
function normalizeFuturesFullTicker(
  r: FullTickerRaw,
  marketType: "futures_usdm" | "futures_coinm",
): NowFuturesTickerInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  return {
    exchange: "binance",
    market_type: marketType,
    symbol: r.s,
    last_price: parseNum(r.c),
    price_change: parseNum(r.p),
    price_change_pct: parseNum(r.P),
    weighted_avg_price: parseNum(r.w),
    open_price: parseNum(r.o),
    high_price: parseNum(r.h),
    low_price: parseNum(r.l),
    volume: parseNum(r.v),
    quote_volume: parseNum(r.q),
    trade_count: typeof r.n === "number" ? r.n : null,
    open_time: typeof r.O === "number" ? r.O : null,
    close_time: typeof r.C === "number" ? r.C : null,
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

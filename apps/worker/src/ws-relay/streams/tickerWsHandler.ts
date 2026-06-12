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
import { retryOnTransient } from "@travis/exchange-collectors";
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
  /**
   * 마켓별 symbol → quote_asset lookup (M2 테마 B [10-2], 2026-06-11).
   * symbols 마스터의 quote_asset 를 ticker row 에 복제 적재 — AI 의
   * "USDT pairs only" 필터 근거 컬럼. allowlist 와 **같은 getSymbols 스냅샷**
   * 에서 생성·교체되므로 allowlist 통과 심볼은 lookup miss 구조적 불가.
   * 미주입(테스트/과도기) 시 null 적재 — key 는 항상 포함 (mixed-batch 불변 보존).
   */
  quoteAssetBySymbol?: Record<MarketType, Map<string, string>>;
}

// quote_asset lookup miss 경고 rate-limit (60초당 1회).
// allowlist ⊆ symbols 라 정상 운영에선 발생하지 않아야 함 — 발생 = 스냅샷 어긋남 신호.
let lastQuoteMissWarnAt = 0;
const QUOTE_MISS_WARN_INTERVAL_MS = 60_000;

function warnQuoteMiss(marketType: string, symbol: string): void {
  const now = Date.now();
  if (now - lastQuoteMissWarnAt < QUOTE_MISS_WARN_INTERVAL_MS) return;
  lastQuoteMissWarnAt = now;
  console.warn(
    `[tickerWsHandler] quote_asset lookup miss (${marketType}:${symbol}) — null 적재. allowlist/quote 맵 스냅샷 어긋남 의심 (60s rate-limited)`,
  );
}

export function createTickerWsHandler(deps: TickerWsHandlerDeps): StreamHandler {
  return {
    id: "tickerWsHandler",
    // ─── M1.8 §8.4-e 종단 게이트 G1 hotfix (2026-05-28): spot 만 `!ticker@arr` (full) 복귀 ───
    // 배경: now_spot_ticker 의 price_change_pct/price_change/weighted_avg_price 가
    //   ~54% NULL. mini 페이로드(6필드)엔 P/p/w/n/O/C 가 없어 normalizeSpotFullTicker
    //   가 매번 null 매핑 → full upsert(defaultToNull 기본 true)가 1초마다 stale 을
    //   null 로 덮어씀. ticker24hrBatchTask(REST 1분) 의 보강을 무력화. 활발 심볼은
    //   매초 WS 수신이라 NULL, 비활성 심볼은 WS 미수신이라 REST 값 보존 → 정확히
    //   관측된 "메이저=NULL / 잡코인=값" 패턴.
    // 수정: spot 구독을 `!ticker@arr` (full 17필드) 로 복귀 → 매초 진짜 P 적재 → 0% NULL.
    //   `[3-50]` 추적 계획(`!ticker@arr` full 복귀)의 spot 부분 실현 — 워커가 Hetzner Linux 24/7 이라 Windows-전용
    //   payload-size selective failure 가 production 에 없음.
    //
    // ─── M2 테마 A Step 2.5 ([10-11] @arr stall 근본 수정, 2026-06-10): USDM full 승격 ───
    // 배경: `@arr`(전 종목 배열) 스트림이 production 연결에서 큰 프레임 stall
    //   (docs/task-record/M2-themeA-incident-arr-stream-stall.md). USDM/spot 은
    //   chunked per-symbol 이전 (BinanceChunkedRelay + StreamCoalescer 가
    //   per-symbol 단건을 모아 synthetic "!ticker@arr" 배열로 재조립해 전달).
    //   per-symbol 프레임은 작아 stall 없음 → USDM 을 mini 에서 full(17필드)로
    //   승격 가능해짐 = `[3-50]` full 복귀 추적 계획의 USDM 부분 실현.
    //   24h 변화율(P/p/w/n/O/C)이 매초 WS 적재 → ticker24hrBatchTask REST 1분
    //   보강 의존 해소 (제거 판단은 배포 검증 후 별도).
    //
    // marketType 분기 라우팅:
    //   - spot           → `!ticker@arr` (full 21필드) — chunked 이전, 기존 normalize 유지
    //   - futures_usdm   → `!ticker@arr` (full 17필드) — 본 승격. mini 매칭 제거
    //   - futures_coinm  → `!miniTicker@arr` 유지 — 30심볼 소형 @arr 무사고, 변경 0
    //   StreamRouter 가 canHandle(streamName, marketType) 로 호출 → marketType 으로
    //   스트림명을 구분. normalize 함수는 mini/full 양쪽 안전 (없는 필드는 null).
    //
    // per-symbol 스트림 공식 ref (crypto-domain-expert 검증, 2026-06-10 조회):
    //   https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Individual-Symbol-Ticker-Streams
    //   payload = `!ticker@arr` 원소와 동일 17필드. push 주기 1000/2000ms 문서
    //   충돌 → 배포 시 smokeArrMigration 으로 실측 (코얼레서 1초 flush 라 무관).
    canHandle: (streamName: string, marketType: MarketType): boolean => {
      if (marketType === "futures_coinm") return streamName === "!miniTicker@arr";
      return streamName === "!ticker@arr"; // spot + futures_usdm (full)
    },
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
  // 테마 B: quote_asset lookup 맵 (미주입 시 undefined → null 적재).
  const quoteMap = deps.quoteAssetBySymbol?.[marketType];

  if (marketType === "spot") {
    const rows = rawRows
      .map((r) => normalizeSpotFullTicker(r, quoteMap))
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
    .map((r) => normalizeFuturesFullTicker(r, marketType, quoteMap))
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
function normalizeSpotFullTicker(
  r: FullTickerRaw,
  quoteMap?: Map<string, string>,
): NowSpotTickerInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  // 테마 B: quote_asset key 는 **항상 포함** (miss 시 값만 null) — 배치 내 row 들의
  // key 집합 동일 불변 보존 (MEMORY: feedback_mixed_batch_invariant).
  const quoteAsset = quoteMap?.get(r.s) ?? null;
  if (quoteMap && quoteAsset === null) warnQuoteMiss("spot", r.s);
  return {
    exchange: "binance",
    market_type: "spot",
    symbol: r.s,
    quote_asset: quoteAsset,
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
  quoteMap?: Map<string, string>,
): NowFuturesTickerInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  // 테마 B: spot 과 동일 — key 항상 포함 (mixed-batch 불변), miss 시 null + warn.
  const quoteAsset = quoteMap?.get(r.s) ?? null;
  if (quoteMap && quoteAsset === null) warnQuoteMiss(marketType, r.s);
  return {
    exchange: "binance",
    market_type: marketType,
    symbol: r.s,
    quote_asset: quoteAsset,
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

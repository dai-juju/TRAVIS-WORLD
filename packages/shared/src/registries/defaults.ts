/**
 * 기본 레지스트리 항목 등록.
 *
 * M1.2: Binance 기반 반실제 dummy 4건.
 * M1.3 Step 3 (2026-04-19): dummy → 실제 레지스트리 강화 (Binance spot+usdm+coinm,
 *   8개 datasource, 1개 component ticker-card).
 * M1.5 Step 4a' (2026-04-23):
 *   - **누락된 AI-facing component 2건 등록** — `coin-list-card`, `kline-chart-card`
 *     이전에는 `apps/web/lib/registerCards.ts` 의 *React* 렌더 매핑에만 있고
 *     `componentRegistry` (AI 가 시스템 프롬프트로 보는 메타데이터) 에는 없어
 *     AI 가 두 컴포넌트의 존재를 모르고 임의 id 를 환각으로 뱉고 있었다.
 *   - **신규 `kline` datasource 추가** — kline-chart-card 의 dataShape 를 만족.
 *     실제 데이터는 TradingView widget 이 가져오지만, 의미적 완결을 위해
 *     registry 에 선언 (AI 는 "symbol + interval 을 요구한다" 는 사실만 알면 됨).
 *   - **description 영문화** — TRAVIS 는 글로벌 English-only 제품이므로
 *     AI-facing metadata 는 전부 영어. 주석은 한국어 유지 (CLAUDE.md 코드 스타일).
 *
 * M1.6 Step 0.1 긴급 수정 (2026-04-24, deferred-task §1 [1-3] 선행 회수):
 *   - **`ticker_spot` / `ticker_futures` → `now_spot_ticker` / `now_futures_ticker`**
 *     로 id 통일. 이전에는 registry id 와 실제 Supabase 테이블명이 달라 프론트
 *     카드(`CoinListCard.tsx:75`, `TickerCard.tsx:93`) 가 `supabase.from(datasource)`
 *     에 넘기는 id 가 존재하지 않는 테이블을 조회 → Realtime CHANNEL_ERROR → UI
 *     에 "! realtime error" 노출. 2024-04-24 사용자 테스트 세션에서 발견.
 *   - **대안 A 임시 적용** — id 자체를 테이블명과 일치시켜 급한 불 진화. 정식
 *     구조 결정(대안 B: `tableName` 필드 분리)은 `[3-7]` M1.6 Step 4 에서
 *     `@zod-schema-architect` 자문 경유 확정 예정. 그 시점에 대안 A 유지 /
 *     대안 B 로 승격 / Zod enum 방어선 추가 일괄 재검토.
 *   - **변경 범위는 2개 id 만** (YAGNI) — premium_index / open_interest /
 *     long_short_ratio / taker_long_short / symbols_meta / liquidation 은 현재
 *     프론트에서 사용처가 없어 이번엔 건드리지 않음. M1.6 Step 4 일괄 처리.
 *
 * 설계 원칙 (feedback_no_query_to_component_hardcoding):
 *   각 컴포넌트·데이터소스의 `description` 필드는 AI 가 **유저 의도 매칭** 에
 *   사용하는 유일한 신호다. "차트/봉/kline 키워드 → kline-chart-card" 같은
 *   하드 매핑은 절대 추가하지 않고, 대신 각 엔트리가 자기 유스케이스를
 *   명확히 선언해 AI 가 description 읽고 추론하게 한다.
 */

import { registerExchange } from "./exchangeRegistry";
import { registerDatasource } from "./datasourceRegistry";
import type { DatasourceEntryInput } from "./datasourceRegistry";
import { registerComponent } from "./componentRegistry";
import { registerInteraction } from "./interactionRegistry";

// ─── 지표 family 값필드 공유 상수 (사이클 4b Step 3, 2026-07-12) ───────────
//
// now_futures_indicator(물리 27컬럼 한 행)를 공유하는 5개 family datasource 와
// 통합 `futures_indicators` 스크리너가 같은 배열을 spread 로 재사용한다.
// ★ 확장 규약: 새 metric 필드는 **여기 한 곳에만** 추가 — family/통합 양쪽에
//   자동 전파되고, "통합 = 5 family union" 등치 불변식(registries.test)이
//   한쪽만 갱신되는 drift 를 시끄럽게 적발한다. [10-102](a) 확장성 조건.

type IndicatorQueryableFields = NonNullable<DatasourceEntryInput["queryableFields"]>;

const PREMIUM_INDEX_FIELDS: IndicatorQueryableFields = [
  { name: "mark_price", type: "number", operators: [">", "<", ">=", "<=", "="],
    description: "Mark price — used for liquidation and unrealized P&L. Smoothed, distinct from last_price", sortable: true },
  { name: "index_price", type: "number", operators: [">", "<", ">=", "<=", "="],
    description: "Spot index price (basket of major spot exchanges)", sortable: true },
  { name: "estimated_settle_price", type: "number", operators: [">", "<", ">=", "<="],
    description: "Estimated settlement price (only meaningful within 1h before delivery for dated contracts; perpetuals hide it)", sortable: true },
  { name: "predicted_funding_rate", type: "number", operators: [">", "<", ">=", "<="],
    description: "Predicted next funding rate (updates every 1s). Positive = longs pay shorts. Decimal (0.0001 = 0.01%) — display layer must `*100` for %", sortable: true },
  { name: "last_settled_funding_rate", type: "number", operators: [">", "<", ">=", "<="],
    description: "Realized funding rate from the last settlement (fixed until next settlement). Decimal — display layer must `*100` for %", sortable: true },
  { name: "last_settled_funding_time", type: "number", operators: [">", "<", "="],
    description: "Timestamp of the last funding settlement (epoch ms)" },
  { name: "interest_rate", type: "number", operators: [">", "<", ">=", "<="],
    description: "Reference interest rate component of funding (typically 0.0001 = 0.01% per interval)", sortable: true },
  { name: "next_funding_time", type: "number", operators: [">", "<", "="],
    description: "Next funding settlement timestamp (epoch ms). Funding settles every 4h or 8h", sortable: true },
];

const BASIS_FIELDS: IndicatorQueryableFields = [
  { name: "basis", type: "number", operators: [">", "<", ">=", "<="],
    description: "Basis in quote currency (futuresPrice − indexPrice, USD absolute)", sortable: true },
  { name: "basis_rate", type: "number", operators: [">", "<", ">=", "<="],
    description: "Basis as a fraction of index price (decimal, 0.0002 = 0.02%) — display layer must `*100` for %", sortable: true },
];

const OPEN_INTEREST_FIELDS: IndicatorQueryableFields = [
  { name: "open_interest", type: "number", operators: [">", "<", ">=", "<="],
    description: "Total open interest. USDM: base-asset units; COINM: contract count (USD comparison needs conversion, [3-48])", sortable: true },
  { name: "oi_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
    description: "5-minute OI change in percent (rolling)", sortable: true },
  { name: "oi_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
    description: "15-minute OI change in percent (rolling)", sortable: true },
  { name: "oi_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
    description: "1-hour OI change in percent (rolling)", sortable: true },
  { name: "oi_chg_4h", type: "number", operators: [">", "<", ">=", "<="],
    description: "4-hour OI change in percent (rolling)", sortable: true },
];

const LONG_SHORT_RATIO_FIELDS: IndicatorQueryableFields = [
  // Top traders — account count basis
  { name: "top_ls_ratio_accounts", type: "number", operators: [">", "<", ">=", "<="],
    description: "Top-trader long/short ratio by account count. >1 means more accounts long than short", sortable: true },
  { name: "top_long_account", type: "number", operators: [">", "<", ">=", "<="],
    description: "Fraction of top-trader accounts that are net long (0..1)" },
  { name: "top_short_account", type: "number", operators: [">", "<", ">=", "<="],
    description: "Fraction of top-trader accounts that are net short (0..1)" },
  // Top traders — position size basis
  { name: "top_ls_ratio_positions", type: "number", operators: [">", "<", ">=", "<="],
    description: "Top-trader long/short ratio by position size (notional). Different from account-count ratio", sortable: true },
  { name: "top_long_position", type: "number", operators: [">", "<", ">=", "<="],
    description: "Fraction of top-trader notional that is long (0..1)" },
  { name: "top_short_position", type: "number", operators: [">", "<", ">=", "<="],
    description: "Fraction of top-trader notional that is short (0..1)" },
  // All traders (USDM only)
  { name: "global_ls_ratio", type: "number", operators: [">", "<", ">=", "<="],
    description: "All-trader long/short account ratio (USDM only; NULL for COINM)", sortable: true },
  { name: "global_long_account", type: "number", operators: [">", "<", ">=", "<="],
    description: "Fraction of all accounts net long (0..1, USDM only)" },
  { name: "global_short_account", type: "number", operators: [">", "<", ">=", "<="],
    description: "Fraction of all accounts net short (0..1, USDM only)" },
];

const TAKER_FIELDS: IndicatorQueryableFields = [
  { name: "taker_buy_sell_ratio", type: "number", operators: [">", "<", ">=", "<="],
    description: "Taker buy volume / taker sell volume. >1 = aggressive buyers dominate. Distinct from long/short ratio", sortable: true },
  { name: "taker_buy_vol", type: "number", operators: [">", "<", ">=", "<="],
    description: "Taker buy volume in the period (typically 5m bucket)", sortable: true },
  { name: "taker_sell_vol", type: "number", operators: [">", "<", ">=", "<="],
    description: "Taker sell volume in the period", sortable: true },
];

/** 4개 레지스트리에 기본 항목을 등록한다. */
export function registerDefaults(): void {
  // ─── 거래소: Binance (spot + USDM + COINM) ──────────
  registerExchange({
    id: "binance",
    name: "Binance",
    marketTypes: ["spot", "futures_usdm", "futures_coinm"],
    baseRestUrl: "https://api.binance.com",
    baseWsUrl: "wss://stream.binance.com:9443",
    batchSupport: true,
  });

  // ─── 데이터소스: 현물 티커 ──────────────────────────
  // M1.6 Step 4 확장 (2026-04-28, [3-32] 회수): 4 → 19 필드
  //   M1.6 Step 3.5 hotfix 의 6개 새 컬럼 (price_change, weighted_avg_price,
  //   trade_count, open_time, close_time, prev_close_price) + open/high/low_price
  //   + 사전 계산 변화율 (price_chg_5m~4h, volume_chg_5m~1h, volume_ratio).
  // crypto-domain-expert 자문 (2026-04-28).
  registerDatasource({
    id: "now_spot_ticker",
    table: "now_spot_ticker",
    name: "Spot 24h Ticker",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    // shape (Stage 2): 한 심볼 스냅샷 = record(big-value/detail 카드) / 여러 심볼 = set(table-card).
    servableShapes: ["record", "set"],
    // 경로 A (M2 경로 A Step 4, 2026-06-23) — WS 직결 토픽 형식 선언 + 활성화(Phase B).
    //   워커(방송)·프론트(구독) 양쪽이 buildLiveTopic 으로 같은 토픽을 조립(단일 진실).
    //   prefix 에 market_type 미포함 → selectorKeys 의 market_type 세그먼트가
    //   spot/futures 를 구분(같은 prefix 공유해도 토픽 충돌 없음).
    //   ★ Phase B 플립(2026-06-24): transport "ws_direct" — 가격이 DB(경로 B)를 안 거치고
    //   워커 WS 서버에서 프론트로 직접 방송. 경로 B 의 500ms throttle("박동") 제거가 목적.
    //   배포 순서 불변식: 워커 재배포(방송 능력)가 이 플립(프론트 구독)보다 반드시 먼저.
    transport: "ws_direct",
    liveTopicSpec: {
      prefix: "binance:ticker",
      selectorKeys: ["market_type", "symbol"],
    },
    description:
      "Spot market 24h rolling ticker. Source: Binance `!ticker@arr` WS (1s push) " +
      "+ REST initial snapshot. Site parity: https://www.binance.com/en/markets/spot. " +
      "Use for single-symbol live price cards and for filtered/sorted list cards " +
      "over spot markets. Includes ALL pairs Binance API returns — USDT/USDC/FDUSD/" +
      "BTC/ETH/BNB stablecoin/crypto quotes AND regional fiat quotes (IDR/JPY/TRY/" +
      "BRL/etc.). The user may filter by quote_asset in their query (e.g. 'show " +
      "USDT pairs only', 'exclude fiat'). Note: raw quote_volume across mixed quote " +
      "currencies is not directly comparable (IDR raw values dwarf USDT due to " +
      "currency unit differences); when sorting by volume across mixed quotes, " +
      "consider filtering quote_asset first or wait for quote_volume_usd column " +
      "(deferred [3-54], M1.7 Step 7 / M2). Does NOT contain coin metadata (use " +
      "`symbols_meta`) or market-cap data (not collected).",
    queryableFields: [
      // ─── 견적통화 (M2 테마 B [10-2], 2026-06-11) ───
      //   단일 진실 = symbols.quote_asset 의 복제 컬럼 (worker tickerWsHandler 매 upsert 채움).
      //   string 유지 (enum 금지) — Binance 가 새 quote 통화를 추가해도 registry 수정 없이 자동 수용.
      //   ⚠️ not_in 은 FilterClauseSchema 에 없음 — 여기 넣으면 AI emit → schema reject 함정.
      { name: "quote_asset", type: "string", operators: ["=", "in", "!="],
        description: "Quote currency of the pair (e.g. USDT, USDC, FDUSD, BTC, BNB, TRY, IDR, EUR, JPY). Use when the user wants pairs of a specific quote currency ('USDT pairs only') or wants to exclude regional fiat quotes" },
      // ─── 가격 (Binance 사이트 'Last Price' 컬럼) ───
      { name: "last_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Latest traded price (last fill, not mark/index)", sortable: true },
      // ─── 24h 변화 (사이트 '24h Change' / '24h Change%') ───
      { name: "price_change", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in absolute terms (USDT)", sortable: true },
      { name: "price_change_pct", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in percent", sortable: true },
      // ─── 시초/고저/가중평균/이전종가 (사이트 'Open' / 'High' / 'Low') ───
      { name: "weighted_avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h volume-weighted average price (VWAP-like)", sortable: true },
      { name: "open_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Price at the start of the 24h window", sortable: true },
      { name: "high_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Highest price during the 24h window", sortable: true },
      { name: "low_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Lowest price during the 24h window", sortable: true },
      { name: "prev_close_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Price immediately before the 24h window started", sortable: true },
      // ─── 거래량 (사이트 '24h Volume(BTC)' / '24h Volume(USDT)') ───
      { name: "volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h base-asset volume (e.g. BTC for BTCUSDT)", sortable: true },
      { name: "quote_volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h quote-asset volume (e.g. USDT for BTCUSDT). Use for 'top by liquidity' screens", sortable: true },
      // ─── 체결 수 (사이트 '24h Trades') ───
      { name: "trade_count", type: "number", operators: [">", "<", ">=", "<="],
        description: "Number of trades in the 24h window", sortable: true },
      // ─── 윈도우 timestamp ───
      { name: "open_time", type: "number", operators: [">", "<", "="],
        description: "Start of the 24h window (epoch ms)" },
      { name: "close_time", type: "number", operators: [">", "<", "="],
        description: "End of the 24h window (epoch ms)" },
      // ─── 사전 계산 변화율 (TRAVIS 자체 계산, M1.3 Step 5+) ───
      { name: "price_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute price change in percent (rolling, computed by TRAVIS worker)", sortable: true },
      { name: "price_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute price change in percent (rolling)", sortable: true },
      { name: "price_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour price change in percent (rolling)", sortable: true },
      { name: "price_chg_4h", type: "number", operators: [">", "<", ">=", "<="],
        description: "4-hour price change in percent (rolling)", sortable: true },
      { name: "volume_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute volume change in percent (1m kline 5-bucket sum vs prior 5)", sortable: true },
      { name: "volume_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute volume change in percent (rolling)", sortable: true },
      { name: "volume_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour volume change in percent (rolling)", sortable: true },
      { name: "volume_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "Current volume / moving-average volume (relative-volume)", sortable: true },
      // bid_price/ask_price (b/B/a/A) — [3-40] deferred (worker 미적재).
    ],
  });

  // ─── 데이터소스: 선물 티커 (USDM + COINM 통합) ──────
  // M1.6 Step 4 확장 (2026-04-28, [3-32] 회수): 5 → 20 필드 (market_type override 포함).
  //   USDM/COINM 24hr ticker 에 bid/ask 미포함 (context7 검증 2026-04-28) —
  //   별도 `<symbol>@bookTicker` stream 필요, [3-40] deferred.
  // crypto-domain-expert 자문 (2026-04-28).
  registerDatasource({
    id: "now_futures_ticker",
    table: "now_futures_ticker",
    name: "Futures 24h Ticker",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    servableShapes: ["record", "set"],
    // 경로 A (M2 경로 A Step 4, 2026-06-23) — now_spot_ticker 와 동일 형식.
    //   USDM·COINM 모두 같은 prefix, market_type 세그먼트로 구분(spot 과도 충돌 없음).
    //   ★ Phase B 플립(2026-06-24): spot 과 함께 "ws_direct" 동시 전환(비대칭 금지 —
    //   transport.test.ts 의 ticker 2종 단언이 한쪽만 켜는 실수를 회귀 가드).
    transport: "ws_direct",
    liveTopicSpec: {
      prefix: "binance:ticker",
      selectorKeys: ["market_type", "symbol"],
    },
    description:
      "USDT-M and COIN-M perpetual futures 24h ticker. Source: Binance " +
      "`!ticker@arr` WS (1s push) + REST snapshot. Site parity: " +
      "https://www.binance.com/en/futures/markets. The `market_type` field " +
      "distinguishes futures_usdm vs futures_coinm. Use for derivatives price " +
      "cards and filtered lists over perpetual markets. " +
      "Note: this datasource does NOT contain coin metadata (use `symbols_meta`) " +
      "or bid/ask quotes (use a bookTicker stream — currently unavailable).",
    queryableFields: [
      // market_type override — commonField 의 spot 포함 enum 이 아닌, 선물 2종만.
      { name: "market_type", type: "enum", operators: ["=", "in"],
        enumValues: ["futures_usdm", "futures_coinm"],
        description: "Distinguishes USDT-margined ('futures_usdm') from coin-margined ('futures_coinm') perpetuals" },
      // ─── 견적통화 (M2 테마 B [10-2], 2026-06-11) — spot 과 동일 패턴 ───
      { name: "quote_asset", type: "string", operators: ["=", "in", "!="],
        description: "Quote currency — USDM is mostly USDT with some USDC pairs; COINM is USD. Use to narrow to USDT- or USDC-quoted perpetuals" },
      // 가격 (last/change/wap/open/high/low) ─ SPOT 과 동일 의미
      { name: "last_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Latest traded price (distinct from mark price)", sortable: true },
      { name: "price_change", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in absolute terms", sortable: true },
      { name: "price_change_pct", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in percent", sortable: true },
      { name: "weighted_avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h volume-weighted average price", sortable: true },
      { name: "open_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Price at start of the 24h window", sortable: true },
      { name: "high_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Highest price during the 24h window", sortable: true },
      { name: "low_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Lowest price during the 24h window", sortable: true },
      // 거래량 (USDM/COINM 단위 다름 — 단위 변환은 [3-48] deferred)
      { name: "volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h volume — USDM: base-asset units; COINM: number of contracts (USD comparison needs conversion, [3-48])", sortable: true },
      { name: "quote_volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h quote volume in USDT (USDM only; COINM returns NULL)", sortable: true },
      { name: "base_volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h base-asset volume (COINM only; USDM returns NULL)", sortable: true },
      // 체결 수 + 윈도우
      { name: "trade_count", type: "number", operators: [">", "<", ">=", "<="],
        description: "Number of trades in the 24h window", sortable: true },
      { name: "open_time", type: "number", operators: [">", "<", "="],
        description: "Start of the 24h window (epoch ms)" },
      { name: "close_time", type: "number", operators: [">", "<", "="],
        description: "End of the 24h window (epoch ms)" },
      // 사전 계산 변화율 (SPOT 과 동일 구조)
      { name: "price_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute price change in percent (rolling)", sortable: true },
      { name: "price_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute price change in percent (rolling)", sortable: true },
      { name: "price_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour price change in percent (rolling)", sortable: true },
      { name: "price_chg_4h", type: "number", operators: [">", "<", ">=", "<="],
        description: "4-hour price change in percent (rolling)", sortable: true },
      { name: "volume_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute volume change in percent", sortable: true },
      { name: "volume_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute volume change in percent", sortable: true },
      { name: "volume_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour volume change in percent", sortable: true },
      { name: "volume_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "Current volume / moving-average volume", sortable: true },
    ],
  });

  // ─── 데이터소스: premiumIndex (펀딩레이트 + 마크가) ─
  // M1.6 Step 4 확장 (2026-04-28): 3 → 6 필드. crypto-domain-expert 자문.
  // M2 테마 A Step 2 재정합 (2026-06-09, [10-7] 동반 + registry↔DB drift 회수):
  //   M1.8 §8.1 에서 DB 가 `last_funding_rate` → `predicted_funding_rate` 로 RENAME
  //   되고 `last_settled_funding_rate` / `last_settled_funding_time` 가 신설됐는데
  //   registry 는 옛 이름을 그대로 들고 있던 drift 를 수정. canonical-metrics.md §2.1
  //   "Predicted vs Realized 2분리" 와 정합 (crypto-domain-expert 자문 2026-06-09).
  //   ⚠️ basis 3종은 별도 `basis` datasource 로 분리 (사이트 위젯 경계 다름).
  registerDatasource({
    id: "premium_index",
    table: "now_futures_indicator",
    name: "Futures Premium Index (Funding + Mark)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    // shape (Stage 2): record(big-value/detail 카드) / set(table-card). history 노출 시 'series' 가산 예정.
    servableShapes: ["record", "set"],
    // 경로 A fast-follow #1 Step 5 (2026-06-26) — ★ transport 플립: 마크/펀딩이 DB(경로 B)를
    //   안 거치고 워커 WS 서버에서 프론트로 직접 방송(경로 A). 경로 B 의 500ms throttle
    //   ("박동") 제거가 목적. ticker(2026-06-24) 와 동일 패턴.
    //   ★ 배포 순서 불변식: 워커 재배포(방송 능력, B-1)가 이 플립(프론트 구독)보다 먼저.
    transport: "ws_direct",
    // markPrice WS 는 7컬럼만 부분 방송 → "partial" 병합 필수: REST 폴러가 채운
    //   last_settled_funding_rate / interest_rate(8h 고정)를 1초 markPrice push 가
    //   덮어 지우지 않도록 prev seed 위에 덮어쓰기 (Step 2 mergeRow).
    mergeMode: "partial",
    // 워커(방송)·프론트(구독)가 buildLiveTopic 으로 같은 토픽을 조립(단일 진실).
    //   prefix 가 네임스페이스 통째 = 다른 datasource 와 충돌 없음. selectorKeys 의
    //   market_type 세그먼트가 USDM/COINM 구분. (Step 3 추가, Step 5 에서 transport 와 정합.)
    liveTopicSpec: {
      prefix: "binance:premium_index",
      selectorKeys: ["market_type", "symbol"],
    },
    description:
      "Perpetual futures mark price, index price, next funding time, and " +
      "funding rate (both predicted-next and last-settled). Source: Binance " +
      "`!markPrice@arr@1s` WS (predicted) + `/fapi/v1/premiumIndex` REST (settled). " +
      "Site parity: https://www.binance.com/en/futures/funding-history/perpetual/real-time-funding-rate. " +
      "Funding settles every 4h or 8h depending on the symbol (discrete event). " +
      // 역참조 (사이클 2 Step 6 적재와 함께 추가 — Step 3 예고 이행): 유스케이스
      // 포인터 = 하드매핑 아님 (now 6종 동형, zod 판정).
      "For past settled funding over time, use `funding_history`.",
    // 사이클 4b Step 3: 값필드는 공유 상수(파일 상단) — futures_indicators 와 단일 진실.
    queryableFields: PREMIUM_INDEX_FIELDS,
  });

  // ─── 데이터소스: Basis (선물-현물 괴리) ─────────────
  // M2 테마 A Step 2 신설 (2026-06-09, crypto-domain-expert 자문):
  //   basis 는 funding/mark 와 사이트 위젯 경계가 다른 별개 패널이라 premium_index 에
  //   합치지 않고 별도 논리 datasource 로 분리 (물리 테이블은 now_futures_indicator 공유).
  //   annualized_basis_rate 는 PERPETUAL 환경에서 Binance 가 빈 문자열로 비워 → DB 컬럼만
  //   존재하고 queryableField 로는 노출 안 함 (canonical-metrics.md §2.5, 값 자체 부재).
  registerDatasource({
    id: "basis",
    table: "now_futures_indicator",
    name: "Futures Basis (Futures − Index)",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    servableShapes: ["record", "set"],
    description:
      "Perpetual futures basis — the gap between futures price and the spot " +
      "index. Source: Binance `/futures/data/basis` (contractType=PERPETUAL) REST " +
      "polling. Stored in `now_futures_indicator`. Positive basis = futures trading " +
      "above spot (contango); negative = below (backwardation). Distinct from funding. " +
      "For how basis evolved over time, use `basis_history`.",
    queryableFields: BASIS_FIELDS,
  });

  // ─── 데이터소스: Open Interest (미결제약정) ─────────
  // M1.6 Step 4 확장 (2026-04-28): 1 → 5 필드 — oi_chg_5m/15m/1h/4h 추가.
  //   워커는 이미 계산하고 있었으나 registry 미등록으로 AI 가 모르고 있던 결함.
  //   crypto-domain-expert 자문 (2026-04-28).
  // 단위 변환 deferred [3-48]: USDM = base-asset units, COINM = contract count.
  registerDatasource({
    id: "open_interest",
    table: "now_futures_indicator",
    name: "Futures Open Interest",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    servableShapes: ["record", "set"],
    description:
      "Aggregate futures open interest (OI). Source: Binance `/fapi/v1/openInterest` " +
      "REST polling (~5min). Site parity: https://www.binance.com/en/futures/funding-history/perpetual/open-interest-statistics. " +
      "Used for trend reversal and liquidation-risk scanning. Stored in " +
      "`now_futures_indicator`. For how open interest changed over time, " +
      "use `open_interest_history`.",
    queryableFields: OPEN_INTEREST_FIELDS,
  });

  // ─── 데이터소스: Long/Short Ratio ───────────────────
  // M1.6 Step 4 확장 (2026-04-28): 2 → 9 필드 — top trader (account/position 양 축)
  //   + global account 분리. crypto-domain-expert 자문 (2026-04-28).
  // 트레이더 관점: LSR > 1 ≠ 강세. 흔히 contrarian 지표 (개미 다수 = 반대 방향).
  registerDatasource({
    id: "long_short_ratio",
    table: "now_futures_indicator",
    name: "Long/Short Account Ratio",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    servableShapes: ["record", "set"],
    description:
      "Long/short account and position ratios. Source: Binance " +
      "`/futures/data/topLongShortAccountRatio` + `globalLongShortAccountRatio` " +
      "REST polling. Site parity: https://www.binance.com/en/futures/funding-history/perpetual/long-short-ratio. " +
      "Top-trader vs global metrics distinguish 'whale' vs 'crowd' sentiment. " +
      "For historical trends over time use `top_ls_ratio_accounts_history`, " +
      "`top_ls_ratio_positions_history`, or `global_ls_ratio_history`.",
    queryableFields: LONG_SHORT_RATIO_FIELDS,
  });

  // ─── 데이터소스: Taker Long/Short Volume Ratio ──────
  // M1.6 Step 4 확장 (2026-04-28): 1 → 3 필드 — taker_buy_vol / taker_sell_vol 절대값 추가.
  //   crypto-domain-expert 자문 (2026-04-28).
  // 트레이더 관점: LSR 은 '포지션', taker 비율은 '체결' — 다른 신호.
  registerDatasource({
    id: "taker_long_short",
    table: "now_futures_indicator",
    name: "Taker Buy/Sell Volume Ratio",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    servableShapes: ["record", "set"],
    description:
      "Taker-side aggressive buy vs sell volume. Source: Binance " +
      "`/futures/data/takerlongshortRatio` REST polling (5m bucket). " +
      "Site parity: https://www.binance.com/en/futures/funding-history/perpetual/taker-buy-sell-volume. " +
      "Immediate read of aggressive side dominance; commonly used by scalpers " +
      "as momentum signal. For how the ratio evolved over time, use " +
      "`taker_long_short_history`.",
    queryableFields: TAKER_FIELDS,
  });

  // ─── 데이터소스: 통합 선물 지표 스크리너 (사이클 4b Step 3, 2026-07-12) ────
  //
  // [10-102](a): 5개 family datasource 가 물리 한 행(now_futures_indicator 27컬럼)
  // 을 공유하는데 queryableFields 가 family 별로 disjoint 라 "Low LSR × rising OI"
  // 같은 크로스 metric 필터를 AI 가 emit 할 수 없었다(superRefine 화이트리스트가
  // 유일 게이트 — pushdown/클라 평가/DB 는 필드-agnostic). 이 통합 datasource 는
  // 같은 테이블을 보는 여섯 번째 렌즈 — 전 family 필드를 union 으로 노출(공유
  // 상수 spread, 파일 상단 확장 규약 참조). record 는 미서빙: 단일 심볼 위젯은
  // family datasource + big-value/detail 카드 소관(위젯 경계 분류는 그대로 가치 있음).
  registerDatasource({
    id: "futures_indicators",
    // 채널 공유: channelManager 는 물리 테이블 기준이라 기존 5종과 Realtime
    // 채널을 자동 공유(신규 채널 0, Supabase quota 불변).
    table: "now_futures_indicator",
    name: "Futures Indicators Screener (All Families)",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    servableShapes: ["set"],
    description:
      "Combined per-symbol view of ALL perpetual futures indicator families " +
      "in one row — funding/mark, basis, open interest, long/short ratios, " +
      "and taker flow. Use when a query filters, ranks, or sorts across MORE " +
      "THAN ONE family at once (e.g. low long/short ratio together with " +
      "rising open interest). For a single family, prefer the dedicated " +
      "datasource (premium_index, basis, open_interest, long_short_ratio, " +
      "taker_long_short).",
    queryableFields: [
      ...PREMIUM_INDEX_FIELDS,
      ...BASIS_FIELDS,
      ...OPEN_INTEREST_FIELDS,
      ...LONG_SHORT_RATIO_FIELDS,
      ...TAKER_FIELDS,
    ],
  });

  // ─── 데이터소스: 지표 시계열 6종 (Composable 사이클 2 Step 3, 2026-07-08) ──────
  //
  // history_futures_indicator(6M 행, interval 9종)를 series shape 로 서빙하는 논리
  // datasource 들. now 스냅샷(open_interest 등)과 **별도 id** — 물리 테이블이 다르고
  // (과거 시계열 vs 현재 1행), now 테이블엔 시계열이 없어 기존 id 에 series 를 얹으면
  // 허위 광고가 되기 때문 (zod 자문 2026-07-08, id 네이밍 (A) 확정).
  //
  // ★ 분할 규약 = "자연스럽게 한 라인으로 그려지는 metric 하나당 id 하나" — 차트는
  //   한 카드 = 한 라인이고 metric 선택자가 카드 config 에 없어 id 가 곧 metric 선택.
  //   LSR 은 독립 3라인이라 3분할(now 의 long_short_ratio 1개와 의도된 비대칭).
  //
  // ★ 값 컬럼(open_interest 등)은 queryableFields 에 넣지 않는다 — seriesFetch 가
  //   값-필터를 pushdown 하지 않아, 노출하면 AI 의 "OI > X" 필터가 스키마를 통과한 뒤
  //   조용히 무시되는 silent-wrong 이 됨. 값은 chart descriptor(표시 전용 계약)로만.
  //
  // ★ transport 미설정(default realtime) — history 는 transport(경로 A/B) 와 무관한
  //   **주기 pull**(useDataServiceSeries)이라 이 필드를 읽지 않음.
  //
  // 공통 queryableFields 3종 (6개 전부 동일) — seriesFetch 가 실제 존중하는 축만.
  const HISTORY_SERIES_FIELDS = [
    // 선물 전용 — spot 포함 commonField 상속은 부정직 (override).
    { name: "market_type", type: "enum" as const, operators: ["=", "in"] as const,
      enumValues: ["futures_usdm", "futures_coinm"],
      description: "USDT-margined vs coin-margined perpetual" },
    // 필수 selector — seriesFetch 는 한 번에 interval 1개 (그래서 ["="], "in" 아님).
    { name: "interval", type: "enum" as const, operators: ["="] as const,
      enumValues: ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"],
      description: "Time bucket of each data point" },
    // 시간축 — ISO-8601 문자열 (timestamptz → PostgREST 문자열 반환, liquidation
    //   trade_time 교훈: number 선언 시 필터가 문자열 비교로 silent 무력화).
    { name: "recorded_at", type: "string" as const,
      operators: [">", ">=", "<", "<=", "="] as const,
      description: "Data point timestamp (ISO-8601). Chronological range/sort",
      sortable: true },
  ];
  /**
   * history 시계열 엔트리 공통 골격 — id/name/description 만 metric 별로 다름.
   * ★ operators 만 spread 하는 비대칭 = mutate 방어가 아니라 as const(readonly 튜플)
   *   → mutable 타입 위드닝. 공유 참조는 registerDatasource 의 Zod safeParse 가
   *   저장 시점에 전 필드를 재클론하므로 cross-entry mutate 자체가 불가 (reviewer S1).
   */
  const historySeriesEntry = (id: string, name: string, description: string) => ({
    id,
    table: "history_futures_indicator",
    name,
    category: "_history" as const,
    refreshTier: "low" as const, // forward-fill 이 interval(5m+) 주기로만 갱신
    exchangeId: "binance",
    servableShapes: ["series"] as ["series"],
    description,
    queryableFields: HISTORY_SERIES_FIELDS.map((f) => ({ ...f, operators: [...f.operators] })),
  });

  registerDatasource(historySeriesEntry(
    "open_interest_history",
    "Open Interest History",
    // ★ keyword hint 에 form 단어("chart") 금지 — 데이터 창구 설명은 시간축/도메인
    //   단어만 (Form↔Data 직교, reviewer W2). "chart" 는 Step 5 컴포넌트 description 소관.
    "Historical time series of aggregate open interest per symbol at a chosen " +
      "interval, for trend/evolution views over the recent window. Use when the " +
      "user wants how open interest changed OVER TIME (keywords: history, trend, " +
      "over time). For the current single snapshot value, use `open_interest`.",
  ));
  registerDatasource(historySeriesEntry(
    "top_ls_ratio_accounts_history",
    "Top Trader Long/Short Ratio (Accounts) History",
    "Historical time series of the top-trader long/short ratio by account count, " +
      "per symbol at a chosen interval. Use for charts of how whale account " +
      "positioning shifted over time. For the current snapshot, use `long_short_ratio`.",
  ));
  registerDatasource(historySeriesEntry(
    "top_ls_ratio_positions_history",
    "Top Trader Long/Short Ratio (Positions) History",
    "Historical time series of the top-trader long/short ratio by position size " +
      "(notional), per symbol at a chosen interval. Use for charts of how whale " +
      "position sizing shifted over time. For the current snapshot, use `long_short_ratio`.",
  ));
  registerDatasource(historySeriesEntry(
    "global_ls_ratio_history",
    "Global Long/Short Ratio History",
    "Historical time series of the all-trader long/short account ratio (USDM only; " +
      "COINM has no data — gaps are expected), per symbol at a chosen interval. " +
      "Use for charts of crowd positioning over time. For the current snapshot, " +
      "use `long_short_ratio`.",
  ));
  registerDatasource(historySeriesEntry(
    "taker_long_short_history",
    "Taker Buy/Sell Ratio History",
    "Historical time series of the taker buy/sell volume ratio (aggressive-side " +
      "dominance), per symbol at a chosen interval. Use for charts of how execution " +
      "pressure evolved over time. For the current snapshot, use `taker_long_short`.",
  ));
  registerDatasource(historySeriesEntry(
    "basis_history",
    "Futures Basis History",
    "Historical time series of the perpetual futures basis rate (futures vs spot " +
      "index gap, PERPETUAL only), per symbol at a chosen interval. Above zero = " +
      "contango, below = backwardation. Use for charts of how the basis evolved " +
      "over time. For the current snapshot, use `basis`.",
  ));

  // ─── 데이터소스: 펀딩 정산 이벤트 히스토리 (사이클 2 Step 6, 2026-07-09) ─────
  // ★ historySeriesEntry 골격 미사용 — 물리 테이블이 다르고(정산 이벤트 전용
  //   history_futures_funding, 자연키 4축) **interval 축 자체가 없다** (crypto-domain
  //   canonical: 실제 정산 간격은 funding_time 델타로만 확정 — 8h/4h + cap/floor 도달
  //   시 동적 1h. interval 버킷 재구성은 가짜 포인트 = site=DB 위반이라 기각).
  //   realized(settled)만 — 과거 predicted 는 관측 불가(Binance 미제공, backfill 불능).
  //   시간축 = funding_time. 값 컬럼(funding_rate) queryableFields 미노출 원칙 동일.
  registerDatasource({
    id: "funding_history",
    table: "history_futures_funding",
    name: "Funding Rate History (Settled)",
    category: "_history",
    refreshTier: "low", // 정산은 최빈 1h(동적) — collector 20분 폴링 증분
    exchangeId: "binance",
    servableShapes: ["series"],
    description:
      "Historical REALIZED (settled) funding rate events per symbol — one data " +
      "point per actual funding settlement (typically every 8h or 4h; can " +
      "temporarily become 1h when the rate hits its cap/floor). There is NO " +
      "interval to choose: the time axis is the settlement times themselves. " +
      "Positive = longs paid shorts. Use when the user wants past funding, " +
      "funding history, or how funding evolved over time. For the CURRENT " +
      "predicted/last funding snapshot, use `premium_index`.",
    queryableFields: [
      // 선물 전용 — spot 포함 commonField 상속은 부정직 (history 6종과 동일 override).
      { name: "market_type", type: "enum", operators: ["=", "in"],
        enumValues: ["futures_usdm", "futures_coinm"],
        description: "USDT-margined vs coin-margined perpetual" },
      // 시간축 — ISO-8601 문자열 (timestamptz → PostgREST 문자열, liquidation 교훈).
      { name: "funding_time", type: "string",
        operators: [">", ">=", "<", "<=", "="],
        description: "Funding settlement timestamp (ISO-8601). Chronological range/sort",
        sortable: true },
    ],
  });

  // ─── 데이터소스: 청산 규모 시간버킷 집계 ([10-84] M3-step3a, 2026-07-19) ─────
  // ★ 기존 `liquidation`(events/set, transport ws_direct) 과 **별도 id**:
  //   ① registry 는 id 당 queryableFields 가 하나 — 한 엔트리에 events 와 집계
  //      series 를 겸하면 order_status/avg_price 가 버킷 행에도 필터 가능한 것처럼
  //      AI 에게 노출된다(버킷엔 없는 컬럼 = 400 또는 silent 무시).
  //   ② `notional` 의 의미가 뒤집힌다 — events 에선 "이 건의 USD 가치"(필터 대상),
  //      버킷에선 "이 5분의 합계"(플롯 대상). 같은 이름 다른 의미 = 계약 오염.
  //   ③ 경로 혼합 금지 — `liquidation` 은 경로 A(ws_direct) 엔트리다. 여기에 경로 B
  //      RPC pull 을 얹으면 한 엔트리가 두 운반을 동시 선언하게 된다.
  //   funding_history 가 같은 이유로 별도 id 를 쓴 선례.
  // ★ table 없음 — fetchKind:"rpc". 원천 테이블은 history_futures_liquidation 이나
  //   DB 함수가 집계해 서빙하므로 "테이블 직접 select" 대상이 아니다.
  registerDatasource({
    id: "liquidation_volume_history",
    name: "Liquidation Volume History (Sampled)",
    category: "_history",
    // 원천이 WS 사건이라 최신 버킷이 계속 자란다 (차트는 주기 pull).
    refreshTier: "realtime",
    exchangeId: "binance",
    servableShapes: ["series"],
    fetchKind: "rpc",
    rpcSpec: {
      functionName: "liquidation_volume_series",
      argNames: {
        exchange: "p_exchange",
        marketType: "p_market_type",
        symbol: "p_symbol",
        interval: "p_bucket",
        side: "p_side",
        from: "p_from",
        to: "p_to",
        limit: "p_limit",
      },
    },
    // symbol 생략 = "전 시장 집계" (결핍 아님). aiCardConfig superRefine (3) 과
    //   ChartCard 스코프 가드가 **둘 다 이 필드를 읽는다**.
    optionalScopeFields: ["symbol"],
    description:
      "Liquidation volume aggregated into time buckets — long, short and total " +
      "USD notional per bucket. Give a symbol for one pair, or OMIT the symbol " +
      "to aggregate the WHOLE market for that market_type. Use when the user " +
      "wants how liquidations evolved over time, when liquidations spiked, or " +
      "long vs short liquidation pressure. IMPORTANT: Binance pushes at most ONE " +
      "(the largest) liquidation per symbol per second, so these totals " +
      "UNDER-REPORT actual liquidation volume — they are a lower bound. Never " +
      "present them as complete or total liquidations, and say the numbers are " +
      "sampled in the card subtitle. SELL-side events are LONG positions being " +
      "force-closed; BUY-side are SHORTs. For individual liquidation events as " +
      "they happen, use `liquidation` instead.",
    queryableFields: [
      // 선물 전용 override — spot 에는 청산이 없다 (funding_history 와 동형).
      { name: "market_type", type: "enum", operators: ["=", "in"],
        enumValues: ["futures_usdm", "futures_coinm"],
        description: "USDT-margined vs coin-margined perpetual" },
      // symbol override — commonField 의 `contains` 를 뺀다. RPC 는 등치 인자만
      //   받으므로 LIKE 를 노출하면 스키마 통과 후 조용히 무시된다(silent-wrong).
      { name: "symbol", type: "string", operators: ["=", "in"],
        description:
          "Trading pair symbol. OMIT to aggregate the whole market" },
      // 버킷 크기 — 요청 시점 계산이라 history 6종(수집 주기 종속)보다 넓게 연다.
      //   무엇을 볼지는 AI 가 유저 쿼리에서 정한다 (큐레이션 금지).
      { name: "interval", type: "enum", operators: ["="],
        enumValues: ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"],
        description: "Time bucket each data point aggregates" },
      // 시간축 — ISO-8601 문자열 (number 금지: timestamptz → 문자열, liquidation 교훈).
      // ★ `=` 미노출 (M3-step3b, 2026-07-20): RPC 시그니처는 범위(p_from/p_to)만
      //   받는다 — 등치를 광고하면 스키마 통과 후 조용히 무시(silent-wrong).
      //   `symbol contains` 제거와 동일 원칙 (광고 = 실제로 눌러줄 수 있는 것만).
      { name: "bucket_time", type: "string",
        operators: [">", ">=", "<", "<="],
        description: "Bucket start timestamp (ISO-8601). Chronological range filters",
        sortable: true },
      // 한쪽만 보기 — RPC 가 실제 pushdown 하므로 노출이 정당하다
      //   (history 6종의 값-컬럼 금지 사유는 "fetch 층이 못 누름"이었다).
      { name: "side", type: "enum", operators: ["="],
        enumValues: ["BUY", "SELL"],
        description:
          "Restrict to one side. SELL = LONG positions force-closed, " +
          "BUY = SHORT positions force-closed. Omit to include both",
      },
      // ★ 집계 값 컬럼(long_notional/short_notional/total_notional/event_count/
      //   null_notional_count)은 **의도적 미노출** — RPC 가 HAVING 을 걸지 않아
      //   "long_notional > 1000000" 류 필터가 스키마를 통과한 뒤 조용히 무시된다.
      //   history 6종 값 컬럼 미노출과 동일 사유.
    ],
  });

  // ─── 데이터소스: 심볼 마스터 ─────────────────────────
  // M1.6 Step 4 확장 (2026-04-28): 3 → 8 필드 — contract_type / onboard_date /
  //   delivery_date / price_precision / quantity_precision 추가.
  //   crypto-domain-expert 자문 (2026-04-28).
  // M1.4 Step 4.7 사고 (SETTLING 심볼이 +391% 로 등장) 의 핵심 필드 status.
  registerDatasource({
    id: "symbols_meta",
    table: "symbols",
    name: "Symbol Metadata",
    category: "exchange",
    refreshTier: "low",
    exchangeId: "binance",
    // 현재 어떤 form 도 미소비 — 완결성 태깅 (미래 심볼 카탈로그 표 등 대비).
    servableShapes: ["record", "set"],
    description:
      "Tradable symbol catalog and exchange filters (tick_size, step_size, " +
      "min_notional). Source: Binance `/api/v3/exchangeInfo` (spot) + " +
      "`/fapi/v1/exchangeInfo` (USDM) + `/dapi/v1/exchangeInfo` (COINM). " +
      "Site parity: exchange 'Markets' tabs. Stored in the `symbols` table. " +
      "Note: this datasource does NOT contain price/volume/OI data — use " +
      "`now_spot_ticker` / `now_futures_ticker` / `open_interest` for those.",
    queryableFields: [
      { name: "base_asset", type: "string", operators: ["=", "in", "contains"],
        description: "Base asset code (e.g. 'BTC' for BTCUSDT). Use to find all markets for a coin" },
      { name: "quote_asset", type: "string", operators: ["=", "in", "contains"],
        description: "Quote asset code (e.g. 'USDT', 'USD', 'BTC')" },
      { name: "status", type: "enum", operators: ["=", "in"],
        enumValues: ["TRADING", "HALT", "BREAK", "SETTLING", "CLOSE", "PENDING_TRADING"],
        description: "Trading lifecycle status. Only 'TRADING' is normal — others are pre-launch, halted, or delisted" },
      // [10-22] (2026-06-11): TRADIFI_PERPETUAL 추가 — DB 에 28종 실존 (tokenized
      //   stock perp, 예: SKHYNIXUSDT). registry enum 누락 drift 수정.
      { name: "contract_type", type: "enum", operators: ["=", "in"],
        enumValues: ["PERPETUAL", "CURRENT_QUARTER", "NEXT_QUARTER", "TRADIFI_PERPETUAL"],
        description: "Futures contract type (NULL for spot). PERPETUAL has no expiry; quarterly contracts deliver; TRADIFI_PERPETUAL are tokenized-stock perpetuals" },
      { name: "onboard_date", type: "number", operators: [">", "<", ">=", "<="],
        description: "Listing date (epoch ms). Use to filter recently-listed coins", sortable: true },
      { name: "delivery_date", type: "number", operators: [">", "<", ">=", "<="],
        description: "Delivery date for dated futures (far-future for perpetuals)" },
      { name: "price_precision", type: "number", operators: ["=", ">", "<"],
        description: "Decimal places for price (e.g. 2 means $123.45)" },
      { name: "quantity_precision", type: "number", operators: ["=", ">", "<"],
        description: "Decimal places for quantity" },
    ],
  });

  // ─── 데이터소스: Liquidation ───────────────────────
  // M1.6 Step 4 확장 (2026-04-28): 3 → 9 필드 — price / avg_price / last_filled_qty /
  //   accumulated_qty / order_status / recorded_at 추가.
  //   crypto-domain-expert 자문 (2026-04-28).
  // 트레이더 관점: BUY 청산 = 숏 강제청산 (가격 위로 튐). SELL 청산 = 롱 강제청산 (가격 아래로).
  //   직관과 반대 방향이라 토스트/카드 표기 시 주의.
  registerDatasource({
    id: "liquidation",
    table: "history_futures_liquidation",
    name: "Liquidation Event Log",
    category: "_history",
    refreshTier: "realtime",
    exchangeId: "binance",
    // shape (Stage 2): 사건 스트림 = events(feed-card) / 과거 사건 표 = set(table-card).
    // ★ 시간버킷 집계 series 는 여기 가산하지 않고 **별도 id** `liquidation_volume_history`
    //   로 분리했다 ([10-84] 회수, M3-step3a 2026-07-19) — queryableFields 가 id 당
    //   하나라 events 필터(order_status/avg_price)가 버킷 행에 오노출되고,
    //   `notional` 의미가 "이 건의 값"↔"이 버킷의 합"으로 뒤집히며,
    //   경로 A(ws_direct)와 경로 B(RPC pull)를 한 엔트리가 겸하게 되기 때문.
    servableShapes: ["events", "set"],
    // 경로 A fast-follow #2 — ★ Phase B 플립 (2026-07-06): transport ws_direct.
    //   feed-card(피드)는 이 토픽을 직결 구독(경로 A — Supabase 미경유 저지연 tape).
    //   table-card(표)는 테이블 훅(초기 SELECT + Realtime INSERT)로 같은 데이터의
    //   set 모양을 소비 — transport 와 무관(경로 B). 두 form 공존.
    //   "둘 다"(사용자 결정): selectorKeys["market_type"](전체 tape)
    //   + optionalSelectorKeys["symbol"](심볼별) — buildLiveTopics fan-out.
    //   배포 순서 불변식 충족: 워커 재배포(방송 능력, b946eb4 가동)가 본 플립보다 선행.
    transport: "ws_direct",
    liveTopicSpec: {
      prefix: "binance:liquidation",
      selectorKeys: ["market_type"],
      optionalSelectorKeys: ["symbol"],
    },
    // [10-72] (2026-07-05) under-report 명시: Binance 는 심볼당 초당 최대 1건만
    //   push(sampled) → "총 청산액" 표방 금지가 도메인 위생. AI 가 이 특성을 읽고
    //   subtitle 에 자연어로 고지(사용자 결정 — 카드 하드 뱃지 대신 registry-driven).
    description:
      "Forced liquidation events on perpetual futures (USDM and COINM; spot " +
      "has no liquidations). Source: Binance `!forceOrder@arr` WS. Covers the " +
      "whole market as an event tape, or a single symbol when one is specified. " +
      "IMPORTANT: Binance emits at most ONE event per symbol per second — this " +
      "is a sampled stream that under-reports true liquidation totals. Never " +
      "present these events as complete/total liquidation volume; card " +
      "subtitles should disclose the sampled nature (e.g. 'sampled stream'). " +
      "Although `_history` category, supports real-time queries for " +
      "'last N minutes' liquidation patterns.",
    queryableFields: [
      { name: "side", type: "enum", operators: ["=", "in"],
        enumValues: ["BUY", "SELL"],
        description: "Liquidation side. BUY = a SHORT position was force-closed (price went up). SELL = a LONG position was force-closed (price went down)" },
      { name: "price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Liquidation price", sortable: true },
      { name: "avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Average fill price across the liquidation", sortable: true },
      // [10-72] USD 명목가 — 워커 enrich (USDM z×ap / COINM z×contractSize).
      //   임계값 필터("liquidations over $100k")·biggest 정렬의 canonical 타깃.
      { name: "notional", type: "number", operators: [">", "<", ">=", "<="],
        description: "USD notional value of the liquidation (works across USDM and COINM). Preferred field for size thresholds (e.g. 'over $100k') and 'biggest liquidations' sorting. NULL for events recorded before 2026-07",
        sortable: true },
      { name: "quantity", type: "number", operators: [">", "<", ">=", "<="],
        description: "Liquidation order size (USDM: base-asset units, COINM: contracts). For USD size prefer `notional`", sortable: true },
      { name: "last_filled_qty", type: "number", operators: [">", "<", ">=", "<="],
        description: "Quantity filled in the last partial fill" },
      { name: "accumulated_qty", type: "number", operators: [">", "<", ">=", "<="],
        description: "Cumulative filled quantity" },
      { name: "order_status", type: "enum", operators: ["=", "in"],
        enumValues: ["FILLED", "PARTIALLY_FILLED"],
        description: "Order final state" },
      // ★ wire 포맷 = ISO-8601 문자열 (timestamptz 를 PostgREST/Realtime 이 문자열로
      //   반환). 옛 "number(epoch ms)" 선언은 실제와 모순 — number 필터가 문자열 비교로
      //   조용히 무력화되는 결함이었음 (ff#2 Step 4 code-reviewer C1(b) 정정, 2026-07-05).
      //   ISO 는 사전순 비교 = 시간순이라 정렬·필터·서버 pushdown 모두 일관.
      { name: "trade_time", type: "string", operators: [">", ">=", "<", "<=", "="],
        description: "Liquidation timestamp as ISO-8601 string (e.g. 2026-07-05T12:00:00Z). Range filters compare chronologically; only use when the user gives explicit absolute times", sortable: true },
      { name: "recorded_at", type: "string", operators: [">", ">=", "<", "<=", "="],
        description: "When TRAVIS recorded the row (ISO-8601 DB-side timestamp)", sortable: true },
    ],
  });

  // ─── 데이터소스: Kline (OHLC candlestick) ──────────
  // M1.5 Step 4a' 신규 — kline-chart-card 의 dataShape 를 만족시키기 위한
  //   의미적 등록. 실제 데이터는 TradingView 위젯이 외부에서 가져온다
  //   (chart 렌더링 경로와 데이터 경로 양쪽을 TV 가 담당).
  //   AI 에게는 "symbol + interval 을 요구하는 candlestick chart data source"
  //   로만 노출되면 충분.
  registerDatasource({
    id: "kline",
    name: "Candlestick OHLC (Klines)",
    category: "exchange",
    refreshTier: "realtime",
    exchangeId: "binance",
    // shape 는 진실(OHLC 시계열=series). 배달은 외부(TradingView 자체 fetch, 우리
    //   데이터 레이어 미서빙 — table 부재가 그 축). 렌더 권한은 shape 가 아니라
    //   dataShapes 멤버십에서 나오므로 GenericChart 가 이걸 오판할 구조 없음.
    servableShapes: ["series"],
    description:
      "Open/High/Low/Close candlestick (kline) data for a single symbol " +
      "at a chosen timeframe interval (e.g. 1m, 5m, 15m, 1h, 4h, 1d). " +
      "Rendered via embedded TradingView chart widget; the widget fetches " +
      "its own data, so card configs only need to specify symbol and interval.",
    queryableFields: [
      {
        name: "interval",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
        description: "Candle timeframe",
      },
    ],
  });

  // ─── 컴포넌트: BigValueCard (모양-제네릭 대표값 강조) ──────────
  // Composable Stage 1b (2026-07-14) — 옛 ticker-card(티커 전용)를 수렴한 record 소비
  //   form. "가격 카드"가 아니라 어떤 record datasource 든 대표값(role=primary) 하나를
  //   크게 강조 — "BTC open interest as a big number"(PRD §2 비전 문장)가 코드 0줄로
  //   가능해짐. 표시 role 은 recordDescriptors 팩 소유 (Form↔Data 직교).
  registerComponent({
    id: "big-value-card",
    name: "Big Value Card",
    description:
      "Single-symbol headline card that shows one leading value large — " +
      "e.g. the live price with its 24h change badge, or one derivatives " +
      "metric (funding rate, open interest, basis, long/short ratio, taker " +
      "flow) as a big number with a couple of supporting lines. Use when " +
      "the user wants the current value of ONE metric for ONE symbol at a " +
      "glance (updateMode: value). For every field of the dataset listed " +
      "out, use the detail-style card; for multi-symbol rankings, use a " +
      "table-style card (keywords they may use: price, at a glance, big number).",
    supportedSizes: ["sm", "md"],
    supportedUpdateModes: ["value"],
    // requiredFields = 옛 ticker-card + indicator-card verbatim 승계 (Stage 1 선례).
    dataShapes: [
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
      {
        datasourceId: "premium_index",
        requiredFields: ["predicted_funding_rate", "mark_price", "next_funding_time"],
      },
      {
        datasourceId: "basis",
        requiredFields: ["basis", "basis_rate"],
      },
      {
        datasourceId: "open_interest",
        requiredFields: ["open_interest", "oi_chg_1h"],
      },
      {
        datasourceId: "long_short_ratio",
        requiredFields: ["top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio"],
      },
      {
        datasourceId: "taker_long_short",
        requiredFields: ["taker_buy_sell_ratio"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "sm",
    // 경로 A 단일 토픽 구독 카드 — 필수 selectorKey(market_type+symbol) 스키마 강제 대상.
    subscribesByTopic: true,
    // shape: 한 심볼의 여러 필드 스냅샷 소비. ★ scalar 아님 — "크게 보여주기"는 데이터
    //   모양이 아니라 role=primary 표현 강조 (사용자 확정 2026-07-14, shapeKind.ts 참조).
    acceptsShapes: ["record"],
  });

  // ─── 컴포넌트: TableCard (모양-제네릭 표) ──────────
  // Composable Expressiveness Stage 1 (2026-06-30) — coin-list-card(티커 전용)와
  //   indicator-list-card(지표 전용)를 하나로 수렴. "표는 어떤 set datasource 든
  //   받는다" (Form↔Data 직교, PRD §2). dataShapes 7종(티커 2 + 지표 5) union →
  //   AI 가 datasource description 으로 의도 추론해 무엇이든 표로 렌더 (하드매핑 X).
  registerComponent({
    id: "table-card",
    name: "Table Card",
    description:
      "Generic multi-symbol table that renders many symbols at once as " +
      "sortable rows, for any supported snapshot dataset — live price tickers, " +
      "perpetual-futures indicators (funding, basis, open interest, " +
      "long/short ratios, taker buy/sell), or recorded liquidation events. " +
      "Rows join and leave reactively as " +
      "underlying rows match or unmatch the filter/sort/limit criteria " +
      "(updateMode: content). Columns, units, and ordering adapt to the chosen " +
      "data source. Use for leaderboards, screeners, rankings, or " +
      "'top N by <metric>' over many symbols — e.g. top gainers, highest " +
      "funding, largest open interest, biggest recorded liquidations " +
      "(sort by notional). Tip: open interest units differ " +
      "between futures_usdm (base asset) and futures_coinm (contracts) — filter " +
      "market_type to keep rankings comparable.",
    supportedSizes: ["md", "lg", "xl"],
    supportedUpdateModes: ["content"],
    dataShapes: [
      // quote_volume 는 표시 컬럼이 아니라 정렬 타깃(예시 프롬프트 "24h Volume Leaders").
      //   now_futures_ticker 는 그 정렬 수요가 약해 미요구 — 옛 두 카드 비대칭 그대로 계승(S1/S3 자문).
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
      {
        datasourceId: "premium_index",
        requiredFields: ["predicted_funding_rate", "mark_price", "next_funding_time"],
      },
      {
        datasourceId: "basis",
        requiredFields: ["basis", "basis_rate"],
      },
      {
        datasourceId: "open_interest",
        requiredFields: ["open_interest", "oi_chg_1h"],
      },
      {
        datasourceId: "long_short_ratio",
        requiredFields: ["top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio"],
      },
      {
        datasourceId: "taker_long_short",
        requiredFields: ["taker_buy_sell_ratio", "taker_buy_vol"],
      },
      // ff#2 재개 Step 4 (2026-07-05): 청산도 표로 — "recent/biggest liquidations"
      //   (범위·정렬 질의). "흐름 지켜보기"는 feed-card 소관 — AI 가 의도로 form 선택.
      {
        datasourceId: "liquidation",
        requiredFields: ["side", "notional", "trade_time"],
      },
      // 사이클 4b Step 3 (2026-07-12): 통합 스크리너 — 크로스 family 필터/정렬.
      //   표시 컬럼은 dynamicColumns(참조 필드 파생)라 특정 필드 미요구.
      {
        datasourceId: "futures_indicators",
        requiredFields: [],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "md",
    // shape (Stage 2): 여러 대상 × 필드 set 소비 — web TABLE_CONSUMES_SHAPE 와 등치 불변식.
    acceptsShapes: ["set"],
  });

  // ─── 컴포넌트: KlineChartCard ──────────────────────
  registerComponent({
    id: "kline-chart-card",
    name: "Kline Chart Card",
    description:
      "Candlestick (OHLC) chart for a single symbol at a chosen timeframe " +
      "interval (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w). Renders via embedded " +
      "TradingView widget. Use when the user wants a visual price history " +
      "(keywords they may use: chart, candle, kline, candlestick, " +
      "OHLC, timeframe, minute/hour/day chart).",
    supportedSizes: ["md", "lg", "xl"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      {
        datasourceId: "kline",
        requiredFields: ["interval"],
      },
    ],
    supportedInteractions: [],
    defaultSize: "lg",
    // shape (Stage 2): OHLC 시계열 소비 (TradingView 위젯이 렌더+fetch 담당).
    acceptsShapes: ["series"],
  });

  // ─── 컴포넌트: DetailCard (모양-제네릭 전 필드 리스트) ──────────
  // Composable Stage 1b (2026-07-14) — 옛 indicator-card(지표 5종 전용)를 수렴한 record
  //   소비 form. "지표 카드"가 아니라 어떤 record datasource 의 전 필드든 세로 리스트로 —
  //   티커 Detail("BTCUSDT 24h stats")이 이 일반화가 처음 여는 조합. 표시 필드/라벨은
  //   recordDescriptors 팩 소유. big-value-card 와 같은 pack 을 role 로 다르게 소비.
  registerComponent({
    id: "detail-card",
    name: "Detail Card",
    description:
      "Single-symbol detail card that lists ALL fields of the chosen " +
      "dataset as labeled rows — e.g. full 24h ticker stats (price, range, " +
      "VWAP, volumes, trades) or a complete derivatives metric group " +
      "(funding with mark/index and countdown, open interest with every " +
      "change window, long/short ratios with taker). Use when the user " +
      "wants a full breakdown of one symbol's dataset rather than a single " +
      "headline number (updateMode: value). For one value at a glance, use " +
      "the big-value card; for multi-symbol screens, use a table-style card " +
      "(keywords they may use: details, full stats, breakdown).",
    supportedSizes: ["sm", "md"],
    supportedUpdateModes: ["value"],
    // requiredFields = big-value-card 와 동일 승계 (같은 record 7종 pack 공유).
    dataShapes: [
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
      {
        datasourceId: "premium_index",
        requiredFields: ["predicted_funding_rate", "mark_price", "next_funding_time"],
      },
      {
        datasourceId: "basis",
        requiredFields: ["basis", "basis_rate"],
      },
      {
        datasourceId: "open_interest",
        requiredFields: ["open_interest", "oi_chg_1h"],
      },
      {
        datasourceId: "long_short_ratio",
        requiredFields: ["top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio"],
      },
      {
        datasourceId: "taker_long_short",
        requiredFields: ["taker_buy_sell_ratio"],
      },
    ],
    supportedInteractions: ["spawn"],
    // 전 필드 리스트(티커 10줄)라 md 기본 — sm 은 축약 공간용으로 허용.
    defaultSize: "md",
    // 경로 A 단일 토픽 구독 카드(티커·premium_index ws_direct) — 필수 selectorKey 강제 대상.
    subscribesByTopic: true,
    acceptsShapes: ["record"],
  });

  // ─── 컴포넌트: FeedCard (모양-제네릭 이벤트 피드) ──────────
  // Composable Expressiveness Stage 3 (ff#2 재개 Step 5, 2026-07-05) — events shape 첫
  //   form. "청산 전용 카드"가 아니라 어떤 events datasource 든 받는 tape — 뉴스/체결이
  //   합류하면 dataShapes 나열 + descriptor 팩만 추가(superRefine 자동, AI 자동 인지).
  registerComponent({
    id: "feed-card",
    name: "Feed Card",
    description:
      "Live event tape that streams discrete events as they happen, newest " +
      "first — each line shows the event time, direction, and size. Use when " +
      "the user wants to WATCH a flow of events in real time (e.g. a live " +
      "liquidation tape for the whole market, or for one symbol when a symbol " +
      "is given). Items appear from the moment the card is created onward. " +
      "For ranked or time-ranged queries over PAST events (e.g. biggest " +
      "recorded liquidations), use a table-style card instead " +
      "(updateMode: content).",
    supportedSizes: ["md", "lg"],
    supportedUpdateModes: ["content"],
    dataShapes: [
      {
        datasourceId: "liquidation",
        requiredFields: ["side", "avg_price", "price", "notional", "trade_time"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "md",
    // 경로 A 단일 토픽 구독 카드 — 필수 selectorKey(market_type) 스키마 강제 대상.
    //   symbol 은 optionalSelectorKey = 전체 tape(생략)/심볼별(지정) 분기 (Step 1 계약).
    subscribesByTopic: true,
    // shape (Stage 2): 시간순 도착 사건 스트림 소비 — web FEED_CONSUMES_SHAPE 와 등치 불변식.
    acceptsShapes: ["events"],
  });

  // ─── 컴포넌트: ChartCard (모양-제네릭 series 차트) ──────────
  // Composable 사이클 2 Step 5 (2026-07-09) — series shape 를 소비하는 첫 자체 차트 form.
  //   "OI 차트 전용 카드"가 아니라 어떤 series datasource 든 받는 시계열 차트 — 새 metric
  //   은 history datasource + chartDescriptor 팩 추가만으로 자동 유입(superRefine/렌더
  //   게이트/AI 프롬프트 전부 이 dataShapes 선언에서 파생). 가격 캔들은 kline-chart-card
  //   (TradingView iframe) 유지 정책 — 이 카드는 파생 지표 시계열 전용.
  // ★ requiredFields 는 queryableFields ⊆ 불변식 대상 — history 의 값 컬럼(open_interest
  //   등)은 의도적으로 queryableFields 에 없어(silent-wrong 필터 차단) 여기 못 넣는다.
  //   플롯 컬럼은 web chartDescriptors(표시 전용 계약)가 소유. interval 만 요구
  //   (kline-chart-card 선례).
  registerComponent({
    id: "chart-card",
    name: "Chart Card",
    description:
      "Time-series chart drawn by TRAVIS showing how ONE derivatives metric " +
      "evolved over time — open interest, top-trader long/short ratio " +
      "(accounts or positions), global long/short ratio, taker buy/sell " +
      "ratio, futures basis, settled funding rate, or liquidation volume. " +
      // ★ "for one symbol" 단정 삭제 ([10-84] M3-step3a): 시장 전체 집계를 서빙하는
      //   datasource 가 생기면서 부류 전체에 참이 아니게 됐다. 스코프 규칙은 각
      //   datasource description 이 소유 (form desc 는 부류 전체에 참인 것만).
      "Most datasources need a symbol; a few aggregate the whole market when " +
      "you omit it (their own description says so). " +
      "Most metrics are sampled at a chosen interval (5m to 1d); some " +
      "datasources are settlement/event streams with no interval field — " +
      "do not set interval for those (their own description says so). " +
      // ↑ datasource-agnostic 규칙 (reviewer W1): 특정 id(funding_history) 지목은
      //   form↔data 직교 역방향 — 2번째 이벤트 datasource 추가 시 재수정 강제라 일반화.
      "Always set marketType (futures_usdm or futures_coinm) — " +
      "history queries cannot run without it. " +
      // 사이클 4a [10-101] (2026-07-12): 스타일 다이얼 사실 선언 — 값 매핑 금지.
      "Each metric renders with its domain-default style (line, area, or " +
      "bars); the optional card-level style contract can override it when " +
      "the user asks for a specific look. " +
      "Use when the user wants a metric's history or trend " +
      "over time (keywords: trend, history, over time, evolution). To " +
      "overlay several symbols of the SAME metric on one chart, filter " +
      "symbol in [...]. limit = how many past data points to load, which " +
      "sets the visible time range (limit × interval for sampled metrics; " +
      "default 300 points — e.g. last 24h at 5m interval → limit 288; very " +
      "long lookbacks may be truncated by data retention). For price candlesticks " +
      "use the candlestick chart card; for a current snapshot value or a " +
      "multi-symbol ranking use an indicator- or table-style card instead " +
      "(updateMode: value, refreshed by periodic pull).",
    supportedSizes: ["md", "lg", "xl"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      { datasourceId: "open_interest_history", requiredFields: ["interval"] },
      { datasourceId: "top_ls_ratio_accounts_history", requiredFields: ["interval"] },
      { datasourceId: "top_ls_ratio_positions_history", requiredFields: ["interval"] },
      { datasourceId: "global_ls_ratio_history", requiredFields: ["interval"] },
      { datasourceId: "taker_long_short_history", requiredFields: ["interval"] },
      { datasourceId: "basis_history", requiredFields: ["interval"] },
      // 펀딩 = 정산 이벤트 (interval 축 없음 — queryableFields 에 interval 부재라
      //   "requiredFields ⊆ queryableFields" 불변식상 interval 요구 불가). market_type
      //   요구 = PK prefix 필수 축 (marketType 누락 500 사고 계보의 프롬프트층 가드).
      { datasourceId: "funding_history", requiredFields: ["market_type"] },
      // 청산 집계 ([10-84] M3-step3a, 2026-07-19) — interval 축은 있으나
      //   **requiredFields 에 넣지 않는다**: 이 datasource 는 symbol 을 생략한
      //   전 시장 집계가 유효 요청이라 market_type 만이 진짜 필수 축이다.
      //   (interval 생략 시 descriptor defaultInterval 폴백 — AI 명시값 불변.)
      { datasourceId: "liquidation_volume_history", requiredFields: ["market_type"] },
    ],
    supportedInteractions: [],
    defaultSize: "lg",
    // subscribesByTopic 미선언(=false) — 주기 pull(useDataServiceSeries)이라 토픽 구독 아님.
    // shape (Stage 2): 시간축 위의 값 소비 — web CHART_CONSUMES_SHAPE 와 등치 불변식.
    acceptsShapes: ["series"],
  });

  // ─── 인터랙션: Spawn ───────────────────────────────
  //
  // M3-step1 (2026-07-16): params 의 필드 재열거 폐기 — 정확한 필드 계약의 유일
  //   권위는 CardActionSchema/SpawnTargetSchema (aiCardConfig.ts). 두 곳 열거는
  //   drift 재생산 공장 (실제로 구 params [targetComponentId, symbol] 가 스키마의
  //   [targetComponentId, parameterMapping] 과 이미 어긋나 있었다). AI 는 카드
  //   출력 계약(tool input_schema = zod 파생)에서 actions 의 정확한 shape 를 본다.
  //   여기 description 은 "언제 쓰는 인터랙션인가" 의도 선언만 담당.
  registerInteraction({
    id: "spawn",
    name: "Spawn New Card",
    type: "spawn",
    description:
      "Clicking an element of a card (a table/feed row, or a record card's " +
      "header) instantly creates a new card on the canvas, assembled from the " +
      "action's upfront target declaration — no extra AI round-trip. Attach it " +
      "via a card's `actions` field when a deeper view of the clicked element " +
      "would help the user.",
    params: [],
  });
}

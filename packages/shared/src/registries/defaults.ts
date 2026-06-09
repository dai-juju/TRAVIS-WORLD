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
import { registerComponent } from "./componentRegistry";
import { registerInteraction } from "./interactionRegistry";

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
  // M1.6 Step 4 확장 (2026-04-28): 3 → 6 필드 — index_price / estimated_settle_price
  //   / interest_rate 추가. crypto-domain-expert 자문 (2026-04-28).
  // 단위 변환 deferred [3-48]: last_funding_rate 는 raw decimal (0.0001 = 0.01%) —
  //   카드 렌더 시 *100 후 % 표시.
  registerDatasource({
    id: "premium_index",
    table: "now_futures_indicator",
    name: "Futures Premium Index (Funding + Mark)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "Perpetual futures mark price, index price, next funding time, and " +
      "current funding rate. Source: Binance `!markPrice@arr@1s` WS. " +
      "Site parity: https://www.binance.com/en/futures/funding-history/perpetual/real-time-funding-rate. " +
      "Funding settles every 8 hours (discrete event); for history use " +
      "`history_futures_indicator`.",
    queryableFields: [
      { name: "mark_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Mark price — used for liquidation and unrealized P&L. Smoothed, distinct from last_price", sortable: true },
      { name: "index_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Spot index price (basket of major spot exchanges)", sortable: true },
      { name: "estimated_settle_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Estimated settlement price (only meaningful within 1h before delivery for dated contracts)", sortable: true },
      { name: "last_funding_rate", type: "number", operators: [">", "<", ">=", "<="],
        description: "Current funding rate per 8h settlement window. Positive = longs pay shorts. Stored as decimal (0.0001 = 0.01%) — display layer must `*100` for % rendering ([3-48])", sortable: true },
      { name: "interest_rate", type: "number", operators: [">", "<", ">=", "<="],
        description: "Reference interest rate component of funding (typically 0.0001 = 0.01% per 8h)", sortable: true },
      { name: "next_funding_time", type: "number", operators: [">", "<", "="],
        description: "Next funding settlement timestamp (epoch ms). Funding settles every 8h", sortable: true },
    ],
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
    description:
      "Aggregate futures open interest (OI). Source: Binance `/fapi/v1/openInterest` " +
      "REST polling (~5min). Site parity: https://www.binance.com/en/futures/funding-history/perpetual/open-interest-statistics. " +
      "Used for trend reversal and liquidation-risk scanning. Stored in " +
      "`now_futures_indicator`.",
    queryableFields: [
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
    ],
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
    description:
      "Long/short account and position ratios. Source: Binance " +
      "`/futures/data/topLongShortAccountRatio` + `globalLongShortAccountRatio` " +
      "REST polling. Site parity: https://www.binance.com/en/futures/funding-history/perpetual/long-short-ratio. " +
      "Top-trader vs global metrics distinguish 'whale' vs 'crowd' sentiment.",
    queryableFields: [
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
    ],
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
    description:
      "Taker-side aggressive buy vs sell volume. Source: Binance " +
      "`/futures/data/takerlongshortRatio` REST polling (5m bucket). " +
      "Site parity: https://www.binance.com/en/futures/funding-history/perpetual/taker-buy-sell-volume. " +
      "Immediate read of aggressive side dominance; commonly used by scalpers " +
      "as momentum signal.",
    queryableFields: [
      { name: "taker_buy_sell_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "Taker buy volume / taker sell volume. >1 = aggressive buyers dominate. Distinct from long/short ratio", sortable: true },
      { name: "taker_buy_vol", type: "number", operators: [">", "<", ">=", "<="],
        description: "Taker buy volume in the period (typically 5m bucket)", sortable: true },
      { name: "taker_sell_vol", type: "number", operators: [">", "<", ">=", "<="],
        description: "Taker sell volume in the period", sortable: true },
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
      { name: "contract_type", type: "enum", operators: ["=", "in"],
        enumValues: ["PERPETUAL", "CURRENT_QUARTER", "NEXT_QUARTER"],
        description: "Futures contract type (NULL for spot). PERPETUAL has no expiry; quarterly contracts deliver" },
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
    description:
      "Forced liquidation events on perpetual futures. Source: Binance " +
      "`!forceOrder@arr` WS (event-driven INSERT). Stored in " +
      "`history_futures_liquidation`. Although `_history` category, supports " +
      "real-time queries for 'last N minutes' liquidation patterns.",
    queryableFields: [
      { name: "side", type: "enum", operators: ["=", "in"],
        enumValues: ["BUY", "SELL"],
        description: "Liquidation side. BUY = a SHORT position was force-closed (price went up). SELL = a LONG position was force-closed (price went down)" },
      { name: "price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Liquidation price", sortable: true },
      { name: "avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Average fill price across the liquidation", sortable: true },
      { name: "quantity", type: "number", operators: [">", "<", ">=", "<="],
        description: "Liquidation size (base-asset units). Multiply by price for USD notional", sortable: true },
      { name: "last_filled_qty", type: "number", operators: [">", "<", ">=", "<="],
        description: "Quantity filled in the last partial fill" },
      { name: "accumulated_qty", type: "number", operators: [">", "<", ">=", "<="],
        description: "Cumulative filled quantity" },
      { name: "order_status", type: "enum", operators: ["=", "in"],
        enumValues: ["FILLED", "PARTIALLY_FILLED"],
        description: "Order final state" },
      { name: "trade_time", type: "number", operators: [">", "<", "="],
        description: "Liquidation timestamp (epoch ms via timestamptz). Use for 'last N minutes' filters", sortable: true },
      { name: "recorded_at", type: "number", operators: [">", "<", "="],
        description: "When TRAVIS recorded the row (DB-side timestamp)", sortable: true },
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

  // ─── 컴포넌트: TickerCard ──────────────────────────
  registerComponent({
    id: "ticker-card",
    name: "Ticker Card",
    description:
      "Compact card showing a single symbol's live price with its 24h " +
      "percent change and quote volume. Use when the user wants to track " +
      "the current value of one specific market. Updates via Supabase " +
      "Realtime row subscription (updateMode: value).",
    supportedSizes: ["sm", "md"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "sm",
  });

  // ─── 컴포넌트: CoinListCard ────────────────────────
  registerComponent({
    id: "coin-list-card",
    name: "Coin List Card",
    description:
      "Scrollable list-style card that renders many symbols simultaneously " +
      "based on filter/sort/limit criteria. Rows join and leave the list " +
      "reactively as underlying rows match or unmatch filter conditions " +
      "(updateMode: content). Use for leaderboards, screeners, or " +
      "'top N by <metric>' queries.",
    supportedSizes: ["md", "lg", "xl"],
    supportedUpdateModes: ["content"],
    dataShapes: [
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "md",
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
  });

  // ─── 인터랙션: Spawn ───────────────────────────────
  registerInteraction({
    id: "spawn",
    name: "Spawn New Card",
    type: "spawn",
    description:
      "Clicking a row in an existing card creates a new card on the canvas. " +
      "Example: clicking BTC in a coin list spawns a TickerCard for BTCUSDT.",
    params: [
      {
        name: "targetComponentId",
        type: "string",
        required: true,
        description: "ID of the component to spawn (e.g. 'ticker-card')",
      },
      {
        name: "symbol",
        type: "string",
        required: true,
        description: "Target symbol (e.g. 'BTCUSDT')",
      },
    ],
  });
}

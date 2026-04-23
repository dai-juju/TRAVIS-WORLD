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
  registerDatasource({
    id: "ticker_spot",
    name: "Spot 24h Ticker",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "Spot market 24h rolling ticker: last price, 24h price-change percent, " +
      "traded volume (base and quote). Stored in `now_spot_ticker`. " +
      "Use for single-symbol live price cards and for filtered/sorted list " +
      "cards over spot markets.",
    queryableFields: [
      {
        name: "last_price",
        type: "number",
        operators: [">", "<", ">=", "<=", "="],
        description: "Latest traded price",
        sortable: true,
      },
      {
        name: "price_change_pct",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24h price change in percent",
        sortable: true,
      },
      {
        name: "quote_volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24h traded volume in quote asset (e.g. USDT)",
        sortable: true,
      },
      {
        name: "volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24h traded volume in base asset (e.g. BTC)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: 선물 티커 (USDM + COINM 통합) ──────
  registerDatasource({
    id: "ticker_futures",
    name: "Futures 24h Ticker",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "USDT-M and COIN-M perpetual futures 24h ticker. The `market_type` " +
      "field distinguishes futures_usdm vs futures_coinm. Stored in " +
      "`now_futures_ticker`. Use for derivatives price cards and filtered " +
      "lists over perpetual markets.",
    queryableFields: [
      {
        name: "market_type",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["futures_usdm", "futures_coinm"],
        description: "Futures sub-type",
      },
      {
        name: "last_price",
        type: "number",
        operators: [">", "<", ">=", "<=", "="],
        description: "Latest traded price (distinct from mark price)",
        sortable: true,
      },
      {
        name: "price_change_pct",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24h price change in percent",
        sortable: true,
      },
      {
        name: "quote_volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24h quote volume (USDM only; COINM returns NULL)",
        sortable: true,
      },
      {
        name: "base_volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24h base-asset volume (COINM only; USDM returns NULL)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: premiumIndex (펀딩레이트 + 마크가) ─
  registerDatasource({
    id: "premium_index",
    name: "Futures Premium Index (Funding + Mark)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "Perpetual futures mark price, index price, next funding time, and " +
      "current funding rate. Funding settles every 8 hours (discrete event); " +
      "for history use `history_futures_indicator`.",
    queryableFields: [
      {
        name: "last_funding_rate",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description:
          "Current funding rate per 8h settlement (positive = longs pay shorts)",
        sortable: true,
      },
      {
        name: "mark_price",
        type: "number",
        operators: [">", "<", ">=", "<=", "="],
        description: "Mark price (used for liquidation and funding calc)",
        sortable: true,
      },
      {
        name: "next_funding_time",
        type: "number",
        operators: [">", "<", "="],
        description: "Next funding settlement time (epoch ms)",
      },
    ],
  });

  // ─── 데이터소스: Open Interest (미결제약정) ─────────
  registerDatasource({
    id: "open_interest",
    name: "Futures Open Interest",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Aggregate futures open interest. Used for trend reversal and " +
      "liquidation-risk scanning. `now_futures_indicator.open_interest`.",
    queryableFields: [
      {
        name: "open_interest",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "Open interest (contracts)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: Long/Short Ratio ───────────────────
  registerDatasource({
    id: "long_short_ratio",
    name: "Long/Short Account Ratio",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Top-trader long/short ratio (`top_ls_ratio_accounts`) and global " +
      "long/short ratio (`global_ls_ratio`). Detects trader-side euphoria " +
      "vs fear.",
    queryableFields: [
      {
        name: "top_ls_ratio_accounts",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "Top-trader long/short account ratio (>1 = long heavy)",
        sortable: true,
      },
      {
        name: "global_ls_ratio",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "Global long/short ratio (USDM only)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: Taker Long/Short Volume Ratio ──────
  registerDatasource({
    id: "taker_long_short",
    name: "Taker Buy/Sell Volume Ratio",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Taker-side buy vs sell volume ratio. Immediate read of aggressive " +
      "side dominance; commonly used by scalpers as momentum signal. " +
      "`taker_buy_sell_ratio`.",
    queryableFields: [
      {
        name: "taker_buy_sell_ratio",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "Taker buy volume / taker sell volume (>1 = buy heavy)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: 심볼 마스터 ─────────────────────────
  registerDatasource({
    id: "symbols_meta",
    name: "Symbol Metadata",
    category: "exchange",
    refreshTier: "low",
    exchangeId: "binance",
    description:
      "Tradable symbol catalog and exchange filters (tick_size, step_size, " +
      "min_notional). Stored in the `symbols` table.",
    queryableFields: [
      {
        name: "status",
        type: "enum",
        operators: ["=", "in"],
        enumValues: [
          "TRADING",
          "HALT",
          "BREAK",
          "SETTLING",
          "CLOSE",
          "PENDING_TRADING",
        ],
        description: "Current trading status",
      },
      {
        name: "base_asset",
        type: "string",
        operators: ["=", "in", "contains"],
        description: "Base asset (e.g. BTC)",
      },
      {
        name: "quote_asset",
        type: "string",
        operators: ["=", "in", "contains"],
        description: "Quote asset (e.g. USDT, USD)",
      },
    ],
  });

  // ─── 데이터소스: Liquidation ───────────────────────
  registerDatasource({
    id: "liquidation",
    name: "Liquidation Event Log",
    category: "_history",
    refreshTier: "realtime",
    exchangeId: "binance",
    description:
      "Forced liquidation events on perpetual futures. Ingested from " +
      "`!forceOrder@arr` WS into `history_futures_liquidation`.",
    queryableFields: [
      {
        name: "side",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["BUY", "SELL"],
        description: "BUY = short liquidation, SELL = long liquidation",
      },
      {
        name: "quantity",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "Liquidation quantity",
        sortable: true,
      },
      {
        name: "trade_time",
        type: "number",
        operators: [">", "<", "="],
        description: "Liquidation timestamp (timestamptz)",
        sortable: true,
      },
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
        datasourceId: "ticker_spot",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "ticker_futures",
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
        datasourceId: "ticker_spot",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "ticker_futures",
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

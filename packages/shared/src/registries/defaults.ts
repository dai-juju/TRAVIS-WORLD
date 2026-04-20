/**
 * 기본 레지스트리 항목 등록.
 *
 * M1.2: Binance 기반 반실제 dummy 4건.
 * M1.3 Step 3 (2026-04-19): dummy → **실제** 레지스트리로 강화.
 *   - Exchange: Binance spot + futures_usdm + futures_coinm (COINM 추가)
 *   - Datasource: ticker_spot / ticker_futures / premium_index / open_interest /
 *                 long_short_ratio / taker_long_short / symbols_meta / liquidation
 *     (총 8건 — liquidation은 스키마만, 데이터는 Step 5에서)
 *   - Component / Interaction: M1.2 dummy 그대로 유지 (M1.4에서 교체).
 *
 * registerDefaults()를 호출하면 4개 레지스트리에 기본 항목이 등록된다.
 * 명시적 함수 호출 방식 — 테스트에서 clearAll() 후 재호출 가능.
 *
 * 참고: queryableFields는 AI 시스템 프롬프트에 주입되어, "거래량 상위 N개",
 * "펀딩레이트 음수 코인" 같은 쿼리 해석 근거가 된다. 너무 많으면 프롬프트가
 * 비대해지고, 너무 적으면 AI가 필터를 못 만든다. Step 3에서는 "가장 자주
 * 필터로 쓰일 필드"를 보수적으로 선정하되, 확장 루프에서 사용자 로그 분석
 * 후 추가/제거.
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
    name: "현물 24h 시세 (Spot Ticker)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "현물 24시간 시세 — 현재가, 24h 변동률·거래량·거래대금·고가·저가. Binance /api/v3/ticker/24hr 기반. `now_spot_ticker` 테이블에 저장.",
    queryableFields: [
      {
        name: "last_price",
        type: "number",
        operators: [">", "<", ">=", "<=", "="],
        description: "현재가",
        sortable: true,
      },
      {
        name: "price_change_pct",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24시간 가격 변동률 (%)",
        sortable: true,
      },
      {
        name: "quote_volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24시간 거래대금 (quote asset, 예: USDT)",
        sortable: true,
      },
      {
        name: "volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24시간 거래량 (base asset, 예: BTC)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: 선물 티커 (USDM + COINM 통합) ──────
  registerDatasource({
    id: "ticker_futures",
    name: "선물 24h 시세 (Futures Ticker)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "USDT-M 및 COIN-M 선물 24시간 시세. market_type 필드로 구분 (futures_usdm vs futures_coinm). `now_futures_ticker` 테이블.",
    queryableFields: [
      {
        name: "market_type",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["futures_usdm", "futures_coinm"],
        description: "선물 타입",
      },
      {
        name: "last_price",
        type: "number",
        operators: [">", "<", ">=", "<=", "="],
        description: "현재가 (마크가와 별개의 체결가)",
        sortable: true,
      },
      {
        name: "price_change_pct",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24시간 가격 변동률 (%)",
        sortable: true,
      },
      {
        name: "quote_volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24시간 거래대금 (USDM 전용, COINM은 NULL)",
        sortable: true,
      },
      {
        name: "base_volume",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "24시간 base asset 거래량 (COINM 전용, USDM은 NULL)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: premiumIndex (펀딩레이트 + 마크가) ─
  registerDatasource({
    id: "premium_index",
    name: "선물 펀딩레이트·마크가 (Premium Index)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    description:
      "선물 마크가·인덱스가·다음 펀딩 정산 시각·현재 펀딩레이트. `now_futures_indicator` 테이블의 premium 도메인 컬럼. 8시간 주기 이산 이벤트이므로 추이는 `history_futures_indicator` 참조.",
    queryableFields: [
      {
        name: "last_funding_rate",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "현재 펀딩레이트 (8시간 주기 기준, 양수=롱이 숏에게 지급)",
        sortable: true,
      },
      {
        name: "mark_price",
        type: "number",
        operators: [">", "<", ">=", "<=", "="],
        description: "마크가격 (청산·펀딩 계산 기준가)",
        sortable: true,
      },
      {
        name: "next_funding_time",
        type: "number",
        operators: [">", "<", "="],
        description: "다음 펀딩 정산 시각 (epoch ms)",
      },
    ],
  });

  // ─── 데이터소스: Open Interest (미결제약정) ─────────
  registerDatasource({
    id: "open_interest",
    name: "선물 미결제약정 (Open Interest)",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "선물 미결제약정 총량. 추세 전환·청산 리스크 스캐닝에 사용. `now_futures_indicator.open_interest`.",
    queryableFields: [
      {
        name: "open_interest",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "미결제약정 수량",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: Long/Short Ratio ───────────────────
  registerDatasource({
    id: "long_short_ratio",
    name: "롱숏비율 (Long/Short Account Ratio)",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "상위 트레이더 기준(top_ls_ratio_accounts)과 전체 트레이더 기준(global_ls_ratio) 롱숏비율. 과열·공포 감지.",
    queryableFields: [
      {
        name: "top_ls_ratio_accounts",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "상위 트레이더 롱/숏 계정 수 비율 (>1 = 롱 우세)",
        sortable: true,
      },
      {
        name: "global_ls_ratio",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "전체 트레이더 롱/숏 계정 수 비율 (USDM 전용)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: Taker Long/Short Volume Ratio ──────
  registerDatasource({
    id: "taker_long_short",
    name: "테이커 매수·매도 비율",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "테이커 매수·매도 거래량 비율. 체결 측 우세를 즉시 감지 — 스캘퍼의 모멘텀 신호로 활용. `taker_buy_sell_ratio`.",
    queryableFields: [
      {
        name: "taker_buy_sell_ratio",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "테이커 매수량/매도량 (>1 = 매수 우세)",
        sortable: true,
      },
    ],
  });

  // ─── 데이터소스: 심볼 마스터 ─────────────────────────
  registerDatasource({
    id: "symbols_meta",
    name: "심볼 메타데이터",
    category: "exchange",
    refreshTier: "low",
    exchangeId: "binance",
    description:
      "거래소별 거래 가능 심볼 목록과 거래 필터(tick_size, step_size, min_notional). `symbols` 테이블.",
    queryableFields: [
      {
        name: "status",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["TRADING", "HALT", "BREAK", "SETTLING", "CLOSE", "PENDING_TRADING"],
        description: "현재 거래 상태",
      },
      {
        name: "base_asset",
        type: "string",
        operators: ["=", "in", "contains"],
        description: "기초 자산 (예: BTC)",
      },
      {
        name: "quote_asset",
        type: "string",
        operators: ["=", "in", "contains"],
        description: "상대 자산 (예: USDT, USD)",
      },
    ],
  });

  // ─── 데이터소스: Liquidation (스키마만, 데이터는 Step 5) ─
  registerDatasource({
    id: "liquidation",
    name: "청산 이벤트 로그",
    category: "_history",
    refreshTier: "realtime",
    exchangeId: "binance",
    description:
      "선물 강제청산 이벤트. 실시간 WS `!forceOrder@arr` 스트림으로 `history_futures_liquidation`에 insert. M1.3 Step 5에서 WS 릴레이 추가.",
    queryableFields: [
      {
        name: "side",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["BUY", "SELL"],
        description: "BUY=숏 청산, SELL=롱 청산",
      },
      {
        name: "quantity",
        type: "number",
        operators: [">", "<", ">=", "<="],
        description: "청산 수량",
        sortable: true,
      },
      {
        name: "trade_time",
        type: "number",
        operators: [">", "<", "="],
        description: "청산 발생 시각 (timestamptz)",
        sortable: true,
      },
    ],
  });

  // ─── 컴포넌트: TickerCard (M1.2 dummy 유지, M1.4에서 교체) ─
  registerComponent({
    id: "ticker-card",
    name: "실시간 가격 카드",
    description:
      "단일 심볼의 실시간 가격, 24h 변동률, 거래량을 표시하는 카드. 경로 A(WS 직접 구독)로 갱신.",
    supportedSizes: ["sm", "md"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      {
        datasourceId: "ticker_spot",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "sm",
  });

  // ─── 인터랙션: Spawn ───────────────────────────────
  registerInteraction({
    id: "spawn",
    name: "새 카드 생성",
    type: "spawn",
    description:
      "기존 카드에서 특정 항목을 클릭하면 새 카드를 캔버스에 추가. 예: CoinList에서 BTC 클릭 → TickerCard 생성.",
    params: [
      {
        name: "targetComponentId",
        type: "string",
        required: true,
        description: "생성할 컴포넌트의 ID (예: 'ticker-card')",
      },
      {
        name: "symbol",
        type: "string",
        required: true,
        description: "대상 심볼 (예: 'BTCUSDT')",
      },
    ],
  });
}

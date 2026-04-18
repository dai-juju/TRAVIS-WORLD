/**
 * 기본 레지스트리 항목 등록.
 *
 * M1.2: Binance 기반 반실제 dummy 4건.
 * M1.3에서 실제 구현으로 교체/확장.
 *
 * registerDefaults()를 호출하면 4개 레지스트리에 기본 항목이 등록된다.
 * 명시적 함수 호출 방식 — 테스트에서 clearAll() 후 재호출 가능.
 */

import { registerExchange } from "./exchangeRegistry.js";
import { registerDatasource } from "./datasourceRegistry.js";
import { registerComponent } from "./componentRegistry.js";
import { registerInteraction } from "./interactionRegistry.js";

/** 4개 레지스트리에 기본 항목을 등록한다. */
export function registerDefaults(): void {

// ─── 거래소: Binance ────────────────────────────────

registerExchange({
  id: "binance",
  name: "Binance",
  marketTypes: ["spot", "futures_usdm"],
  baseRestUrl: "https://api.binance.com",
  baseWsUrl: "wss://stream.binance.com:9443",
  batchSupport: true,
});

// ─── 데이터소스: Ticker (24h) ───────────────────────

registerDatasource({
  id: "ticker",
  name: "Ticker (24h)",
  category: "_now",
  refreshTier: "high",
  description: "24시간 거래량·가격변동·최고가·최저가 등 종합 시세 정보",
  queryableFields: [
    {
      name: "volume_24h",
      type: "number",
      operators: [">", "<", ">=", "<="],
      description: "24시간 거래량 (USDT 기준)",
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
      name: "last_price",
      type: "number",
      operators: [">", "<", ">=", "<=", "="],
      description: "현재가 (마지막 체결가)",
      sortable: true,
    },
  ],
});

// ─── 컴포넌트: TickerCard ───────────────────────────

registerComponent({
  id: "ticker-card",
  name: "실시간 가격 카드",
  description:
    "단일 심볼의 실시간 가격, 24h 변동률, 거래량을 표시하는 카드. 경로 A(WS 직접 구독)로 갱신.",
  supportedSizes: ["sm", "md"],
  supportedUpdateModes: ["value"],
  dataShapes: [
    {
      datasourceId: "ticker",
      requiredFields: ["last_price", "price_change_pct", "volume_24h"],
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

} // registerDefaults 끝

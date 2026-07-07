// WS 릴레이 배럴 (M1.3 Step 5).
// 추가 핸들러는 각 substep에서 import하여 등록.

export { BinanceWsRelay, type BinanceWsRelayConfig } from "./BinanceWsRelay.js";
export { StreamRouter } from "./streamRouter.js";
export {
  BINANCE_WS_BASE,
  buildCombinedStreamUrl,
  type BinanceWsRelayStatus,
  type MarketConnectionStatus,
  type MarketType,
  type StreamHandler,
  type WsConnectionState,
} from "./types.js";
export {
  createTickerWsHandler,
  type TickerWsHandlerDeps,
} from "./streams/tickerWsHandler.js";
export {
  createMarkPriceWsHandler,
  type MarkPriceWsHandlerDeps,
} from "./streams/markPriceWsHandler.js";
export {
  createForceOrderWsHandler,
  type ForceOrderWsHandlerDeps,
} from "./streams/forceOrderWsHandler.js";
export {
  createKlineWsHandler,
  type KlineWsHandlerDeps,
} from "./streams/klineWsHandler.js";
export {
  BinanceKlineRelay,
  type BinanceKlineRelayConfig,
} from "./BinanceKlineRelay.js";
// M2 테마 A Step 2.5 — [10-11] @arr stall 근본 수정 (chunked per-symbol 이전)
export {
  BinanceChunkedRelay,
  buildPerSymbolStreams,
  chunkStreams,
  type BinanceChunkedRelayConfig,
  type ChunkedRelaySink,
} from "./BinanceChunkedRelay.js";
export {
  StreamCoalescer,
  type CoalescerRule,
  type StreamCoalescerConfig,
} from "./streamCoalescer.js";
// [10-77] M2 사이클 1 — markPrice DB 쓰기 전용 시간창 코얼레서 (Realtime throttle)
export {
  MarkPriceWriteCoalescer,
  type MarkPriceWriteCoalescerConfig,
} from "./markPriceWriteCoalescer.js";

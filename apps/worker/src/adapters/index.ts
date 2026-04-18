/**
 * Worker 어댑터 인터페이스 배럴.
 *
 * M1.3에서 BinanceAdapter, BinanceWsRelay 등 구현체가 추가될 때
 * 여기에 re-export 추가.
 */

export type {
  FetchResult,
  RawTicker,
  RawKline,
  IExchangeAdapter,
} from "./IExchangeAdapter.js";

export type {
  NormalizedTick,
  WsConnectionState,
  IWsRelay,
} from "./IWsRelay.js";

export type {
  PollTask,
  PollStatus,
  IPoller,
} from "./IPoller.js";

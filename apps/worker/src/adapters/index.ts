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

// M1.9 Step 1 (2026-06-02): PollTask/PollStatus/IPoller 는 @travis/shared 로 이동.
// 폴링 계약이 필요하면 `import type { PollTask } from "@travis/shared"` 사용.

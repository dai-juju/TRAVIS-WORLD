// ============================================================
// WS 릴레이 공통 타입 정의 (M1.3 Step 5a).
//
// 책임:
//   - 스트림 핸들러 인터페이스 (StreamHandler)
//   - 연결 상태 enum 및 status 객체
//   - Binance 마켓별 base URL 상수
//
// 설계 원칙:
//   - 핸들러는 "자기가 처리할 수 있는 스트림 이름" 스스로 판단 (canHandle)
//   - 라우터는 단순 dispatch만 수행 (조건 분기 로직 핸들러로 위임)
//   - 새 스트림 추가 시 core (BinanceWsRelay/streamRouter) 는 수정 불필요
// ============================================================

/**
 * WS 스트림 1종을 처리하는 핸들러 계약.
 *
 * 각 구현체(tickerWsHandler, markPriceWsHandler, ...)는:
 * 1. 자신이 처리할 stream 이름 패턴을 알고 있다 (canHandle)
 * 2. 파싱/정규화/사전계산/upsert 흐름을 자기 내부에서 완결 (handle)
 * 3. 에러는 throw하지 말고 내부 catch + 로그 (graceful, CLAUDE.md)
 */
export interface StreamHandler {
  /** 로그용 식별자 (예: "tickerWsHandler") */
  readonly id: string;

  /**
   * 수신한 stream 이름이 이 핸들러 소관인지 판정.
   * Binance Combined Stream은 `"!miniTicker@arr"`, `"btcusdt@kline_1m"` 같은
   * 이름을 돌려준다. 핸들러는 자기만 알 수 있는 패턴으로 매칭.
   */
  canHandle(streamName: string, marketType: MarketType): boolean;

  /**
   * 스트림 페이로드 처리. 반드시 throw 금지.
   * 처리 실패는 내부 로그로만 남기고 void 반환 — 라우터는 다음 메시지로.
   */
  handle(streamName: string, marketType: MarketType, data: unknown): Promise<void>;
}

/** Binance 마켓 구분 (WS 연결 단위) */
export type MarketType = "spot" | "futures_usdm" | "futures_coinm";

/** 연결 상태 머신 */
export type WsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

/** 마켓 1개당 연결 상태 스냅샷 (로그·모니터링용) */
export interface MarketConnectionStatus {
  marketType: MarketType;
  state: WsConnectionState;
  /** connected 진입 시각 (epoch ms). 재연결로 끊기면 null로 리셋. */
  connectedSince: number | null;
  /** 연속 재시도 횟수. connected 진입 시 0으로 리셋. */
  reconnectAttempts: number;
  /** 마지막 에러 메시지 (재연결 원인 추적용) */
  lastError: string | null;
  /** 마지막 수신 메시지 시각 (ms). heartbeat 관측용. */
  lastMessageAt: number | null;
}

/** 릴레이 전체 상태 (3개 마켓 집계) */
export interface BinanceWsRelayStatus {
  spot: MarketConnectionStatus;
  usdm: MarketConnectionStatus;
  coinm: MarketConnectionStatus;
}

// ─── Binance WS base URL 상수 ──────────────────────

/**
 * Combined Stream 경로.
 * 사용: `${BASE}/stream?streams=${encodedStreamNames}`
 * 공식: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
 *
 * ★ USDM `/market` 경로 (M2 테마 A Step 2.5 근본 원인 수정, 2026-06-10):
 *   Binance 가 2026-04-23 USDM 레거시 URL(`fstream.binance.com/ws`·`/stream`)을
 *   폐지하고 카테고리 경로로 이전 — ticker/miniTicker/markPrice/forceOrder/kline 은
 *   전부 `/market` 소속 (bookTicker/depth 는 `/public`). 미이전 연결은 핸드셰이크·
 *   구독 ACK 는 정상이지만 /market 스트림 데이터가 push 되지 않음 — [10-11] 사고
 *   (청산 4/27 정지, markPrice frozen)의 진짜 근본 원인.
 *   ref: https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Important-WebSocket-Change-Notice (2026-06-10 조회)
 *   검증: 레거시 URL 0 frames vs /market 95 frames/30s (로컬 + production 동일).
 *   COIN-M(dstream)은 동일 공지 없음(404, 2026-06-10) — 레거시 유지.
 */
export const BINANCE_WS_BASE: Readonly<Record<MarketType, string>> = {
  spot: "wss://stream.binance.com:9443",
  futures_usdm: "wss://fstream.binance.com/market",
  futures_coinm: "wss://dstream.binance.com",
};

// ─── Combined Stream 빌더 ─────────────────────────

/**
 * subscriptions 리스트 → Combined Stream URL 쿼리 부분 생성.
 *
 * 예: `["!miniTicker@arr", "!markPrice@arr@1s"]`
 *  → `/stream?streams=!miniTicker@arr/!markPrice@arr@1s`
 *
 * Binance 스트림 이름에 포함될 수 있는 `@`, `!`는 URL-safe 문자라 인코딩 불필요.
 * `/` 는 스트림 구분자이므로 보존.
 */
export function buildCombinedStreamUrl(
  baseUrl: string,
  streams: readonly string[],
): string {
  if (streams.length === 0) {
    throw new Error("buildCombinedStreamUrl: streams 배열이 비어있음");
  }
  const joined = streams.join("/");
  return `${baseUrl}/stream?streams=${joined}`;
}

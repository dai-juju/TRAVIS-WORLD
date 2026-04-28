// ============================================================
// BinanceWsRelay — Binance WebSocket 연결 3개 관리자 (M1.3 Step 5a).
//
// 책임:
//   1. SPOT / USDM / COINM 각 1개씩 WebSocket 연결 유지
//   2. Combined Stream (`/stream?streams=...`) 으로 여러 스트림 한 연결에 멀티플렉싱
//   3. 수신 메시지 파싱 → StreamRouter 에게 dispatch (비즈니스 로직은 여기 없음)
//   4. 자동 재연결 (exponential backoff 1s → 30s cap, 무한 재시도)
//   5. 서버 장애 감지 — N초 이상 아무 메시지 없으면 강제 close → 재연결
//   6. graceful shutdown — SIGINT 시 close + 재연결 타이머 취소
//
// 설계 원칙:
//   - 이 클래스는 "연결 관리" 만 함. 비즈니스 로직(upsert, 변환)은 StreamHandler.
//   - throw 금지 (CLAUDE.md). 모든 에러는 내부 catch + 로그.
//   - 24시간 자동 단절(Binance 정책)은 별도 처리 불필요 — close 이벤트가 발생해
//     재연결 로직이 자연히 돌아감.
//
// 참고:
//   공식 문서: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
//   - SPOT: server ping 20s
//   - FUTURES: server ping 3min
//   `ws` npm 라이브러리는 pong 을 자동 응답 (추가 설정 불필요)
// ============================================================

import WebSocket from "ws";
import {
  BINANCE_WS_BASE,
  buildCombinedStreamUrl,
  type BinanceWsRelayStatus,
  type MarketConnectionStatus,
  type MarketType,
} from "./types.js";
import type { StreamRouter } from "./streamRouter.js";

// ─── 설정 및 기본값 ────────────────────────────────

/** 재연결 backoff 최소/최대값 (ms) */
const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
/**
 * 이 시간 이상 메시지 수신이 없으면 "죽은 연결" 로 간주하고 강제 재연결.
 * Binance tick은 1초 주기이므로 120초는 확실한 비정상 신호.
 */
const DEFAULT_STALE_CONNECTION_MS = 120_000;
/** 헬스체크 주기 */
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 30_000;

export interface BinanceWsRelayConfig {
  /** 수신 메시지를 라우팅할 StreamRouter */
  router: StreamRouter;
  /**
   * 마켓별 구독 스트림 목록.
   * 예: spot: ["!miniTicker@arr"], usdm: ["!miniTicker@arr", "!markPrice@arr@1s", "!forceOrder@arr"]
   */
  subscriptions: Readonly<Record<MarketType, readonly string[]>>;
  /** 옵션: 재연결 backoff 최소 (ms). 기본 1000. */
  reconnectBaseMs?: number;
  /** 옵션: 재연결 backoff 최대 (ms). 기본 30000. */
  reconnectMaxMs?: number;
  /** 옵션: stale 판정 ms. 기본 120000. */
  staleConnectionMs?: number;
  /** 옵션: 헬스체크 interval ms. 기본 30000. */
  healthCheckIntervalMs?: number;
}

// ─── 본체 ──────────────────────────────────────────

export class BinanceWsRelay {
  private readonly router: StreamRouter;
  private readonly subscriptions: Readonly<Record<MarketType, readonly string[]>>;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly staleConnectionMs: number;
  private readonly healthCheckIntervalMs: number;

  private readonly statusMap: Record<MarketType, MarketConnectionStatus>;
  private readonly sockets: Map<MarketType, WebSocket> = new Map();
  private readonly reconnectTimers: Map<MarketType, NodeJS.Timeout> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private shuttingDown = false;

  constructor(config: BinanceWsRelayConfig) {
    this.router = config.router;
    this.subscriptions = config.subscriptions;
    this.reconnectBaseMs = config.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = config.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.staleConnectionMs = config.staleConnectionMs ?? DEFAULT_STALE_CONNECTION_MS;
    this.healthCheckIntervalMs =
      config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS;

    this.statusMap = {
      spot: emptyStatus("spot"),
      futures_usdm: emptyStatus("futures_usdm"),
      futures_coinm: emptyStatus("futures_coinm"),
    };
  }

  // ─── 공개 API ────────────────────────────────

  /** 3개 마켓 연결 시작. 이미 시작했으면 무시. */
  start(): void {
    if (this.shuttingDown) {
      console.warn("[BinanceWsRelay] start() 호출됨 but shuttingDown 상태 — 무시");
      return;
    }
    for (const market of Object.keys(this.subscriptions) as MarketType[]) {
      if (this.subscriptions[market].length === 0) {
        console.log(`[BinanceWsRelay] ${market} 구독 0개 — 연결 생략`);
        continue;
      }
      this.connectMarket(market);
    }
    this.startHealthCheck();
  }

  /** graceful shutdown. 재연결 타이머 취소 + 소켓 close + close 이벤트 대기. */
  async stop(): Promise<void> {
    this.shuttingDown = true;
    this.stopHealthCheck();

    // 재연결 예약 취소
    for (const [market, timer] of this.reconnectTimers) {
      clearTimeout(timer);
      this.reconnectTimers.delete(market);
    }

    // 모든 소켓 close + close 이벤트 대기
    const closeTasks: Promise<void>[] = [];
    for (const [market, ws] of this.sockets) {
      closeTasks.push(
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          ws.once("close", () => resolve());
          try {
            ws.close(1000, "graceful shutdown");
          } catch (e) {
            console.error(`[BinanceWsRelay] ${market} close 예외:`, e);
            resolve();
          }
          // 안전 타임아웃 — 5초 내 close 이벤트 못 받으면 강제 resolve
          setTimeout(() => resolve(), 5_000);
        }),
      );
    }
    await Promise.all(closeTasks);
    this.sockets.clear();
  }

  /** 현재 연결 상태 조회 (상태 로그용). */
  getStatus(): BinanceWsRelayStatus {
    return {
      spot: { ...this.statusMap.spot },
      usdm: { ...this.statusMap.futures_usdm },
      coinm: { ...this.statusMap.futures_coinm },
    };
  }

  // ─── 연결 라이프사이클 ─────────────────────────

  private connectMarket(market: MarketType): void {
    const streams = this.subscriptions[market];
    const baseUrl = BINANCE_WS_BASE[market];
    const url = buildCombinedStreamUrl(baseUrl, streams);

    this.setState(market, "connecting");
    // M1.6 Step 4 hotfix (2026-04-28): Windows + ws 라이브러리 + !ticker@arr
    //   17필드 (~3배 페이로드, M1.6 Step 3.5 hotfix 부수효과) backpressure 회피.
    //   증상 — payload-size selective failure: COINM 30 심볼 정상 / USDM 608 +
    //   SPOT 1408 심볼 → handleOpen 후 메시지 0개 도착 → 120s stale → terminate
    //   (close code=1006 자가유발) → 재연결 무한 루프 → DB 적재 영구 정지.
    //   permessage-deflate 압축이 큰 페이로드 + Windows TCP RWND 콤보에서
    //   첫 메시지 stall 트리거 (ws#1810 사례). 압축 disable 로 우회.
    //   Hetzner 1Gbps 네트워크 대역폭 ~2배 증가 무시 가능. 트레이드오프 OK.
    const ws = new WebSocket(url, {
      perMessageDeflate: false,
      maxPayload: 100 * 1024 * 1024, // 100MB 안전 상한
    });
    this.sockets.set(market, ws);

    ws.on("open", () => this.handleOpen(market));
    ws.on("message", (raw: Buffer) => this.handleMessage(market, raw));
    ws.on("error", (err: Error) => this.handleError(market, err));
    ws.on("close", (code: number, reason: Buffer) =>
      this.handleClose(market, code, reason),
    );
    // ws 라이브러리는 서버 ping 에 pong 자동 응답. 별도 핸들러 불필요.
  }

  private handleOpen(market: MarketType): void {
    const s = this.statusMap[market];
    s.state = "connected";
    s.connectedSince = Date.now();
    s.reconnectAttempts = 0;
    s.lastError = null;
    s.lastMessageAt = Date.now();
    console.log(`[BinanceWsRelay] ${market} connected`);
  }

  private handleMessage(market: MarketType, raw: Buffer): void {
    this.statusMap[market].lastMessageAt = Date.now();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      // JSON 파싱 실패 — 극히 드물지만 방어. 메시지 하나 버림.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[BinanceWsRelay] ${market} JSON parse 실패: ${msg}`);
      return;
    }

    // Combined Stream 응답 형식: { stream: "<name>", data: <payload> }
    // 단일 스트림 응답도 있지만 우리는 Combined 만 씀 → 항상 {stream, data}.
    const msg = parsed as { stream?: unknown; data?: unknown };
    if (typeof msg.stream !== "string" || msg.data === undefined) {
      // Binance 헬스 메시지 또는 구독 응답 — 무시.
      return;
    }

    // 비동기지만 await 안 함 — 다음 메시지 수신 blocking 방지.
    // StreamRouter 내부에서 graceful 처리 (throw 안 함).
    void this.router.route(msg.stream, market, msg.data);
  }

  private handleError(market: MarketType, err: Error): void {
    // error 이벤트 후 거의 항상 close 가 따라오므로 여기선 로그만.
    const errMsg = err.message || String(err);
    this.statusMap[market].lastError = errMsg;
    console.error(`[BinanceWsRelay] ${market} error: ${errMsg}`);
  }

  private handleClose(market: MarketType, code: number, reason: Buffer): void {
    const reasonStr = reason.toString("utf8") || "(no reason)";
    const s = this.statusMap[market];
    s.state = "disconnected";
    s.connectedSince = null;

    this.sockets.delete(market);

    if (this.shuttingDown) {
      console.log(`[BinanceWsRelay] ${market} closed (shutdown): code=${code}`);
      return;
    }

    const errorMsg = `close code=${code} reason="${reasonStr}"`;
    console.warn(`[BinanceWsRelay] ${market} closed — 재연결 예약: ${errorMsg}`);
    this.scheduleReconnect(market, errorMsg);
  }

  private scheduleReconnect(market: MarketType, errorMsg: string): void {
    if (this.shuttingDown) return;

    const s = this.statusMap[market];
    s.state = "reconnecting";
    s.lastError = errorMsg;
    s.reconnectAttempts += 1;

    const delay = this.backoffMs(s.reconnectAttempts);
    console.log(
      `[BinanceWsRelay] ${market} 재연결 예약: attempt=${s.reconnectAttempts}, delay=${delay}ms`,
    );

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(market);
      if (this.shuttingDown) return;
      this.connectMarket(market);
    }, delay);

    this.reconnectTimers.set(market, timer);
  }

  /**
   * exponential backoff with cap:
   *   attempt 1 → base × 2^0 = 1s
   *   attempt 2 → 2s
   *   attempt 3 → 4s
   *   attempt 4 → 8s
   *   attempt 5 → 16s
   *   attempt 6+ → 30s (cap)
   */
  backoffMs(attempts: number): number {
    if (attempts <= 0) return this.reconnectBaseMs;
    const exp = this.reconnectBaseMs * 2 ** (attempts - 1);
    return Math.min(exp, this.reconnectMaxMs);
  }

  // ─── 헬스체크 ─────────────────────────────────

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      this.checkStaleConnections();
    }, this.healthCheckIntervalMs);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * 연결되어 있지만 staleConnectionMs 이상 메시지 수신이 없는 소켓을 찾아
   * 강제 close → close 이벤트가 handleClose 에서 재연결 예약을 트리거.
   * Binance ticker tick은 1초 주기라 120초 무응답은 명확한 이상.
   */
  private checkStaleConnections(): void {
    if (this.shuttingDown) return;
    const now = Date.now();
    for (const [market, ws] of this.sockets) {
      const s = this.statusMap[market];
      if (s.state !== "connected") continue;
      if (s.lastMessageAt === null) continue;
      const elapsed = now - s.lastMessageAt;
      if (elapsed > this.staleConnectionMs) {
        console.warn(
          `[BinanceWsRelay] ${market} stale 감지 (${elapsed}ms 무응답) — 강제 재연결`,
        );
        try {
          ws.terminate();
        } catch (e) {
          console.error(`[BinanceWsRelay] ${market} terminate 예외:`, e);
        }
      }
    }
  }

  // ─── 내부 헬퍼 ─────────────────────────────────

  private setState(
    market: MarketType,
    state: MarketConnectionStatus["state"],
  ): void {
    this.statusMap[market].state = state;
  }
}

// ─── 모듈 헬퍼 ──────────────────────────────────

function emptyStatus(marketType: MarketType): MarketConnectionStatus {
  return {
    marketType,
    state: "disconnected",
    connectedSince: null,
    reconnectAttempts: 0,
    lastError: null,
    lastMessageAt: null,
  };
}

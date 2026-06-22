// ============================================================
// LiveWsServer — 프론트向 WebSocket 서버 (M2 경로 A Step 1 + Step 2, 2026-06-22).
//
// 책임:
//   - 워커 프로세스 안에서 `ws` WebSocketServer 를 띄워 클라이언트 접속 수신
//   - **핸드셰이크 시 JWT 인증** (Step 2) — 무효/무토큰은 데이터 1바이트 전에 거부
//   - 클라 메시지 { type: "subscribe"|"unsubscribe", topic } 처리
//   - 구독한 topic 의 LiveEnvelope 만 해당 클라에게 fan-out
//
// ★ Step 2 보안 (security-auditor W-1~W-4, 2026-06-22):
//   - **W-3 핸드셰이크 인증**: verifyClient 에서 토큰 검증 → 실패 시 HTTP 401 로
//     upgrade 거부(WS 자체가 안 열림 = 리소스 0). 토큰은 Sec-WebSocket-Protocol
//     subprotocol 로 전달(브라우저가 헤더를 못 달므로 + 쿼리스트링과 달리 로그 비노출).
//   - **W-4 구독 cap + rate limit + idle 정리** (`[10-52]` 회수):
//       · 연결당 최대 구독 토픽 수 cap (초과분 graceful 무시, 소켓 유지)
//       · 메시지 토큰 버킷 rate limit (지속 남용 시 close 4429)
//       · ping/pong 으로 좀비 연결 정리(죽은 소켓이 fan-out 대상에 남는 것 방지)
//       · 토큰 만료 시 close 4401 → 클라가 fresh 토큰으로 재인증
//       · maxPayload 로 거대 메시지 차단
//   - **W-1 (운영)**: 외부 노출 후에도 host=127.0.0.1 유지 + Caddy(443)만 공개.
//     WS 서버를 0.0.0.0 으로 직접 열지 않음(인프라 단계, 코드 아님).
//
// 설계 의도:
//   - topic 은 **불투명 문자열** — 서버는 파싱 안 하고 LiveBus 에 그대로 전달.
//   - graceful (CLAUDE.md): 잘못된 JSON·소켓 에러·인증 실패로 서버가 죽지 않게 격리.
// ============================================================

import type { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { LiveBus } from "./LiveBus.js";
import type { LiveEnvelope } from "./envelope.js";
import type { TokenVerifier, VerifiedClient } from "./auth.js";
import { TokenBucket } from "./rateLimiter.js";

// ─── 보안 상수 (Step 2, [10-52]) ───────────────────────────
/**
 * subprotocol 식별자 — 클라는 [WS_SUBPROTOCOL, <accessToken>] 로 핸드셰이크.
 * ★ 단일 진실: 프론트(Step 4)·smoke·테스트가 전부 이 상수를 참조(drift 방지).
 */
export const WS_SUBPROTOCOL = "travis-live-v1";
/** 연결당 최대 구독 토픽 수 기본값. 단일 심볼 카드 위주(경로 A)라 100 이면 풍부. */
const DEFAULT_MAX_SUBSCRIPTIONS_PER_CONN = 100;
/** 메시지 rate limit 기본값 — 버스트 20개 허용, 지속 2건/초. */
const DEFAULT_RATE_BURST = 20;
const DEFAULT_RATE_REFILL_PER_SEC = 2;
/** 메시지 최대 크기(bytes). subscribe 메시지는 작음 — 초과 = 남용 신호. */
const MAX_MESSAGE_BYTES = 4096;
/** 토픽 문자열 길이 상한 — 불투명 토픽을 해석하진 않되 Map 키 비대화 방어(S1). */
const MAX_TOPIC_LENGTH = 256;
/** ping 주기(ms). 직전 ping 의 pong 미수신 시 좀비로 간주해 종료. */
const PING_INTERVAL_MS = 30_000;
/** setTimeout 32-bit 상한(≈24.8일). 비정상 큰 exp 가 즉시 발동되지 않도록 클램프. */
const MAX_TIMER_MS = 2_147_483_647;

/** 애플리케이션 정의 close code (4000~4999). */
const CLOSE_UNAUTHORIZED = 4401; // 토큰 무효/만료 → 클라가 재인증
const CLOSE_RATE_LIMITED = 4429; // 메시지 rate 초과

export interface LiveWsServerOptions {
  liveBus: LiveBus;
  /** ★ Step 2 필수 — 핸드셰이크 토큰 검증기. 미주입 불가(인증 없는 서버 금지). */
  verifyToken: TokenVerifier;
  /** listen 포트. */
  port: number;
  /** bind 호스트. 기본 127.0.0.1 (Caddy 뒤 — 외부 직접 노출 차단). */
  host?: string;
  /** 오남용 방어 한계 override (테스트·환경 튜닝용). 미지정 시 기본 상수. */
  limits?: {
    maxSubscriptionsPerConn?: number;
    rateBurst?: number;
    rateRefillPerSec?: number;
  };
}

/** 클라이언트 → 서버 메시지 (느슨하게 파싱, 모르는 필드 무시). */
interface ClientMessage {
  type?: string;
  topic?: string;
}

/** 인증된 연결 1건의 서버측 상태. */
interface ConnState {
  socket: WebSocket;
  /** 이 연결의 구독 목록 (topic → unsubscribe). close 시 전부 해제. */
  subs: Map<string, () => void>;
  /** 메시지 rate limit 버킷. */
  bucket: TokenBucket;
  /** ping/pong 생존 플래그. */
  isAlive: boolean;
  /** 토큰 만료 시 재인증 유도용 타이머. */
  expiryTimer: ReturnType<typeof setTimeout> | null;
}

export class LiveWsServer {
  private readonly liveBus: LiveBus;
  private readonly verifyToken: TokenVerifier;
  private readonly port: number;
  private readonly host: string;
  private readonly maxSubsPerConn: number;
  private readonly rateBurst: number;
  private readonly rateRefillPerSec: number;
  private wss: WebSocketServer | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** 인증된 연결 상태 집합 — ping 순회·정리에 사용. */
  private readonly connections = new Set<ConnState>();
  /**
   * verifyClient → connection 사이 검증 결과 전달(req 단위).
   * WeakMap 이라 connection 이벤트가 안 와도(핸드셰이크 중 클라 끊김 등) request
   * 객체 GC 시 자동 회수 — 누수 안전망(code-reviewer W1). 정상 경로는 onConnection 이 즉시 delete.
   */
  private readonly verifiedByReq = new WeakMap<IncomingMessage, VerifiedClient>();

  constructor(opts: LiveWsServerOptions) {
    this.liveBus = opts.liveBus;
    this.verifyToken = opts.verifyToken;
    this.port = opts.port;
    this.host = opts.host ?? "127.0.0.1";
    this.maxSubsPerConn =
      opts.limits?.maxSubscriptionsPerConn ?? DEFAULT_MAX_SUBSCRIPTIONS_PER_CONN;
    this.rateBurst = opts.limits?.rateBurst ?? DEFAULT_RATE_BURST;
    this.rateRefillPerSec = opts.limits?.rateRefillPerSec ?? DEFAULT_RATE_REFILL_PER_SEC;
  }

  /** 서버 시작 (멱등 — 이미 떠 있으면 무시). */
  start(): void {
    if (this.wss) return;
    const wss = new WebSocketServer({
      port: this.port,
      host: this.host,
      maxPayload: MAX_MESSAGE_BYTES, // 거대 프레임 차단
      // 핸드셰이크 인증 — 실패 시 upgrade 거부(WS 미수립 = 리소스 0).
      verifyClient: (info, cb) => this.verifyClient(info.req, cb),
      // 우리 subprotocol 만 echo (토큰 값은 절대 echo 안 함).
      handleProtocols: (protocols) => (protocols.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false),
    });
    this.wss = wss;
    wss.on("connection", (socket, request) => this.onConnection(socket, request));
    wss.on("error", (e) => console.error(`[liveWsServer] server error: ${e.message}`));
    // 좀비 연결 정리 — 직전 ping 의 pong 미수신 연결을 종료.
    this.pingTimer = setInterval(() => this.sweepDeadConnections(), PING_INTERVAL_MS);
    console.log(`[liveWsServer] listening ws://${this.host}:${this.port} (Step 2: JWT 인증 활성)`);
  }

  // ─── 핸드셰이크 인증 (W-3) ──────────────────────────────

  /** Sec-WebSocket-Protocol 에서 토큰 추출 ("travis-live-v1, <token>"). */
  private extractToken(request: IncomingMessage): string | undefined {
    const raw = request.headers["sec-websocket-protocol"];
    if (typeof raw !== "string") return undefined;
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // WS_SUBPROTOCOL 식별자가 아닌 **첫** 값 = 토큰 (code-reviewer W4: 비정상적으로
    // 여러 값이 와도 첫 비-식별자만 채택 — 검증 단계가 어차피 거름).
    return parts.find((p) => p !== WS_SUBPROTOCOL);
  }

  private verifyClient(
    request: IncomingMessage,
    cb: (res: boolean, code?: number, message?: string) => void,
  ): void {
    const token = this.extractToken(request);
    // verifyToken 은 throw 하지 않지만 방어적으로 catch — 실패 시 거부(fail-closed).
    this.verifyToken(token)
      .then((result) => {
        if (result.ok) {
          this.verifiedByReq.set(request, result.client);
          cb(true);
        } else {
          // 클라엔 사유 노출 안 함(정보 누출 방지) — 로그만.
          console.warn(`[liveWsServer] 핸드셰이크 인증 거부: ${result.reason}`);
          cb(false, 401, "Unauthorized");
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[liveWsServer] verifyClient 예외(거부): ${msg}`);
        cb(false, 401, "Unauthorized");
      });
  }

  // ─── 연결 수립 (인증 통과 후) ───────────────────────────

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const verified = this.verifiedByReq.get(request);
    this.verifiedByReq.delete(request);
    if (!verified) {
      // 정상 경로엔 항상 존재 — 방어적 차단.
      socket.close(CLOSE_UNAUTHORIZED, "unauthorized");
      return;
    }

    // ★ connections 등록·close 핸들러 등록 **전에** 만료 차단 (security-auditor W-3):
    //   토큰이 핸드셰이크~onConnection 사이에 만료된 극단 레이스에서, state 를
    //   connections 에 넣은 뒤 조기 return 하면 close 핸들러가 없어 Set 누수.
    //   따라서 만료 체크를 state 구성 이전으로 끌어올린다.
    const ttlMs = verified.expiresAt * 1000 - Date.now();
    if (ttlMs <= 0) {
      socket.close(CLOSE_UNAUTHORIZED, "token_expired");
      return;
    }

    const state: ConnState = {
      socket,
      subs: new Map(),
      bucket: new TokenBucket({
        capacity: this.rateBurst,
        refillPerSec: this.rateRefillPerSec,
      }),
      isAlive: true,
      expiryTimer: null,
    };
    this.connections.add(state);

    // 토큰 만료 시 재인증 유도 — exp 도달 시 close(4401).
    // setTimeout 32-bit 상한 클램프(code-reviewer W2): 비정상 큰 exp 가 1ms 로
    // 클램핑돼 즉시 발동되는 사고 방지(현실 토큰 1h 라 거의 안 닿지만 graceful).
    state.expiryTimer = setTimeout(
      () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(CLOSE_UNAUTHORIZED, "token_expired");
        }
      },
      Math.min(ttlMs, MAX_TIMER_MS),
    );

    socket.on("pong", () => {
      state.isAlive = true;
    });
    socket.on("message", (raw) => this.onMessage(socket, state, raw));
    socket.on("close", () => this.cleanup(state));
    socket.on("error", (e) => console.error(`[liveWsServer] client socket error: ${e.message}`));
  }

  private onMessage(socket: WebSocket, state: ConnState, raw: RawData): void {
    // rate limit (W-4) — 파싱 **이전**에 토큰 소비 (code-reviewer W3: 깨진 JSON·쓰레기
    // 폭탄도 비용을 물어야 DoS 방어가 성립. 정상 클라는 카드 mount 시에만 메시지 전송).
    if (!state.bucket.tryConsume()) {
      socket.close(CLOSE_RATE_LIMITED, "rate_limited");
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return; // 잘못된 JSON 은 graceful 무시
    }
    if (typeof msg.topic !== "string" || msg.topic.length === 0) return;
    // 토픽 길이 상한 (S1) — 불투명 토픽을 해석하진 않되 Map 키 비대화 방어.
    if (msg.topic.length > MAX_TOPIC_LENGTH) return;
    const topic = msg.topic;

    if (msg.type === "subscribe") {
      if (state.subs.has(topic)) return; // 중복 구독 무시
      // 구독 cap (W-4) — 초과분은 graceful 무시(소켓은 유지).
      if (state.subs.size >= this.maxSubsPerConn) {
        console.warn(`[liveWsServer] 구독 cap(${this.maxSubsPerConn}) 초과 — 무시: ${topic}`);
        return;
      }
      const off = this.liveBus.subscribe(topic, (env: LiveEnvelope) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(env));
        }
      });
      state.subs.set(topic, off);
    } else if (msg.type === "unsubscribe") {
      const off = state.subs.get(topic);
      if (off) {
        off();
        state.subs.delete(topic);
      }
    }
    // 알 수 없는 type 은 무시 (graceful)
  }

  /** 연결 종료 시 구독·타이머·집합 정리. */
  private cleanup(state: ConnState): void {
    for (const off of state.subs.values()) off();
    state.subs.clear();
    if (state.expiryTimer) {
      clearTimeout(state.expiryTimer);
      state.expiryTimer = null;
    }
    this.connections.delete(state);
  }

  /** ping/pong — 직전 주기에 pong 안 온 연결을 좀비로 보고 종료. */
  private sweepDeadConnections(): void {
    // terminate() → close 이벤트가 다음 tick 에 발생 → cleanup 이 connections 에서 제거.
    // 순회 중 Set 즉시 변경이 아니므로 for...of 안전(S2).
    for (const state of this.connections) {
      if (!state.isAlive) {
        state.socket.terminate(); // close 핸들러가 cleanup
        continue;
      }
      state.isAlive = false;
      try {
        state.socket.ping();
      } catch {
        // ping 실패는 다음 sweep 에서 terminate 로 정리.
      }
    }
  }

  /** 서버 종료 — 타이머 해제 + 모든 클라 소켓 종료 + listen 해제. graceful shutdown 용. */
  async stop(): Promise<void> {
    const wss = this.wss;
    if (!wss) return;
    this.wss = null;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const client of wss.clients) client.terminate();
    this.connections.clear();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    console.log("[liveWsServer] stopped");
  }
}

// apps/web/lib/dataService/liveConnection.ts
//
// 경로 A 단일 WebSocket 연결 생명주기 (M2 경로 A Step 3b, 2026-06-22).
//
// 워커 WS 서버(로컬 ws://localhost:8081, 배포는 Step 2 wss)에 연결 1개를 유지하고,
// 끊기면 지수 backoff 로 자동 재연결한다. 토픽 구독/dispatch 는 liveTopicManager 가
// 이 위에서 운영(channelManager 의 채널 생명주기 분리와 동형).
//
// 설계:
//   - envelope 타입은 프론트 로컬 정의 (apps/web → apps/worker import 불가 +
//     "Step 3 워커 무접촉" 원칙). 워커 ws-server/envelope.ts 와 같은 4필드 wire 계약.
//   - WebSocket 생성자는 주입 가능(wsFactory) — 테스트에서 mock 으로 교체.
//   - graceful: 소켓 에러/생성 실패로 throw 하지 않고 재연결로 흡수.

"use client";

import { WS_SUBPROTOCOL } from "@travis/shared";

/** 워커가 방송하는 메시지 봉투 (wire 계약 — 워커 ws-server/envelope.ts 와 동일 4필드). */
export interface LiveEnvelope {
  topic: string;
  ts: number;
  seq: number;
  payload: unknown;
}

export type LiveConnectionStatus = "connecting" | "open" | "errored" | "closed";

export interface LiveConnectionCallbacks {
  /** 메시지 수신 시. */
  onEnvelope: (env: LiveEnvelope) => void;
  /** 연결 상태 변경 시. */
  onStatus: (status: LiveConnectionStatus) => void;
  /** 연결 (재)성립 시 — manager 가 활성 토픽 전체를 재구독하는 hook. */
  onOpen: () => void;
}

/** 브라우저 WebSocket 의 최소 면 (mock 주입을 위한 구조적 타입). */
interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

/**
 * WebSocket 생성 팩토리 (mock 주입용). protocols 는 핸드셰이크 subprotocol —
 * 경로 A 는 `[WS_SUBPROTOCOL, <accessToken>]` 로 토큰을 실어 보낸다(Step 4).
 */
export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocketLike;

/** 세션 access token 공급자. 미로그인/실패 시 null (graceful). */
export type TokenProvider = () => Promise<string | null>;

const DEFAULT_WS_URL = "ws://localhost:8081";
const BASE_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 15_000;

function defaultWsUrl(): string {
  // NEXT_PUBLIC_* 은 빌드 시 인라인. ws 주소는 공개 정보라 노출 OK. 로컬 default.
  return process.env.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL;
}

function defaultWsFactory(url: string, protocols?: string[]): WebSocketLike {
  return new WebSocket(url, protocols) as unknown as WebSocketLike;
}

export class LiveConnection {
  private ws: WebSocketLike | null = null;
  private status: LiveConnectionStatus = "closed";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** close() 로 우리가 의도적으로 닫은 경우 — 재연결 안 함. */
  private closedByUs = false;

  constructor(
    private readonly callbacks: LiveConnectionCallbacks,
    private readonly url: string = defaultWsUrl(),
    private readonly wsFactory: WebSocketFactory = defaultWsFactory,
    /** 세션 토큰 공급자. 미주입 시 토큰 없이 연결(테스트/무인증 경로). */
    private readonly tokenProvider?: TokenProvider,
  ) {}

  /** 연결 보장 (lazy). 이미 open/connecting 이거나 재연결 예약 중이면 무시. */
  ensureOpen(): void {
    // ★ connect() 가 비동기(토큰 await)라 this.ws 할당 전 창이 생긴다 → this.ws 가
    //   아닌 status 로 판정해 그 창에서의 중복 connect 를 막는다. 재연결 타이머가
    //   예약돼 있어도 중복 소켓 생성 방지(예약된 connect 가 곧 실행).
    if (this.status === "open" || this.status === "connecting") return;
    if (this.reconnectTimer) return;
    this.closedByUs = false;
    void this.connect();
  }

  private async connect(): Promise<void> {
    this.setStatus("connecting");

    // 핸드셰이크 직전 최신 세션 토큰 확보. subprotocol 로 실어 보내 쿼리스트링
    // 로그 노출을 피한다(Step 2 설계). tokenProvider 미주입(테스트)은 토큰 없이 진행.
    let token: string | null = null;
    if (this.tokenProvider) {
      try {
        token = await this.tokenProvider();
      } catch (err) {
        console.error("[liveConnection] 세션 토큰 조회 실패 — 재연결 예약", err);
        this.scheduleReconnect();
        return;
      }
      // await 동안 close() 가 불렸으면 소켓을 만들지 않는다(경합 가드).
      if (this.closedByUs) return;
      // 토큰 없음(미로그인/세션 만료) → 서버가 401 → 시도 무의미. 재연결로 흡수
      // (세션 복구 후 자연 성립). 무인증 테스트 경로(tokenProvider 부재)는 통과.
      if (!token) {
        // ★ 의도(code-reviewer W1): 토큰 실패/없음 시 status 는 "connecting" 에
        //   머문 채 재연결만 예약한다. ensureOpen 의 status==="connecting" 가드가
        //   타이머 발화 전까지 중복 connect 를 막으므로 안전(errored 로 내리지 않음 =
        //   재연결 중인데 카드가 빨갛게 깜빡이는 것 차단, [10-53]a 정신과 일치).
        console.warn("[liveConnection] 세션 토큰 없음 — 연결 보류, 재연결 예약");
        this.scheduleReconnect();
        return;
      }
    }

    const protocols = token ? [WS_SUBPROTOCOL, token] : [WS_SUBPROTOCOL];

    let ws: WebSocketLike;
    try {
      ws = this.wsFactory(this.url, protocols);
    } catch (err) {
      console.error("[liveConnection] WS 생성 실패 — 재연결 예약", err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("open");
      this.callbacks.onOpen(); // manager 가 활성 토픽 재구독
    };
    ws.onmessage = (ev) => {
      const env = parseEnvelope(ev.data);
      if (env) this.callbacks.onEnvelope(env);
    };
    ws.onerror = () => {
      // onclose 가 뒤따르며 재연결 처리 — 여기선 상태만.
      this.setStatus("errored");
    };
    ws.onclose = () => {
      this.ws = null;
      this.setStatus("closed");
      if (!this.closedByUs) this.scheduleReconnect();
    };
  }

  /** open 일 때만 전송. 아니면 무시 (onOpen 재구독이 동기화 담당). */
  trySend(msg: object): void {
    if (!this.ws || this.status !== "open") return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.error("[liveConnection] send 실패", err);
    }
  }

  /** 의도적 종료 — 재연결 안 함. */
  close(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        // 무시
      }
    }
    this.setStatus("closed");
  }

  getStatus(): LiveConnectionStatus {
    return this.status;
  }

  private setStatus(s: LiveConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.callbacks.onStatus(s);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.closedByUs) return;
    const delay = Math.min(
      MAX_RECONNECT_MS,
      BASE_RECONNECT_MS * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}

/** 수신 data → LiveEnvelope (graceful: 비정상은 null). */
function parseEnvelope(data: unknown): LiveEnvelope | null {
  if (typeof data !== "string") return null;
  try {
    const obj = JSON.parse(data) as Record<string, unknown>;
    if (typeof obj.topic !== "string") return null;
    return {
      topic: obj.topic,
      ts: typeof obj.ts === "number" ? obj.ts : 0,
      seq: typeof obj.seq === "number" ? obj.seq : 0,
      payload: obj.payload,
    };
  } catch {
    return null;
  }
}

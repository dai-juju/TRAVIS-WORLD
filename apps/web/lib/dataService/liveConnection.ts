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

export type WebSocketFactory = (url: string) => WebSocketLike;

const DEFAULT_WS_URL = "ws://localhost:8081";
const BASE_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 15_000;

function defaultWsUrl(): string {
  // NEXT_PUBLIC_* 은 빌드 시 인라인. ws 주소는 공개 정보라 노출 OK. 로컬 default.
  return process.env.NEXT_PUBLIC_WS_URL ?? DEFAULT_WS_URL;
}

function defaultWsFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
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
  ) {}

  /** 연결 보장 (lazy). 이미 open/connecting 이면 무시. */
  ensureOpen(): void {
    if (this.ws && (this.status === "open" || this.status === "connecting")) {
      return;
    }
    this.closedByUs = false;
    this.connect();
  }

  private connect(): void {
    this.setStatus("connecting");
    let ws: WebSocketLike;
    try {
      ws = this.wsFactory(this.url);
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
      this.connect();
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

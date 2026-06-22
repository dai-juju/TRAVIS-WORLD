// ============================================================
// LiveWsServer — 프론트向 WebSocket 서버 (M2 경로 A Step 1, 2026-06-22).
//
// 책임:
//   - 워커 프로세스 안에서 `ws` WebSocketServer 를 띄워 클라이언트 접속 수신
//   - 클라 메시지 { type: "subscribe"|"unsubscribe", topic } 처리
//   - 구독한 topic 의 LiveEnvelope 만 해당 클라에게 fan-out
//
// ★ Step 1 범위 (인증·TLS 없음):
//   - 기본 host = 127.0.0.1 (로컬 전용). 외부 노출 안 함.
//   - JWT 인증 + wss(TLS) 는 Step 2. 인증 없는 서버를 프로덕션에 배포하지 않음.
//
// 설계 의도:
//   - topic 은 **불투명 문자열** — 서버는 파싱 안 하고 LiveBus 에 그대로 전달.
//     "바이낸스 ticker 전용"이 아니라 어떤 topic 이든 구독/전달하는 범용 파이프.
//   - graceful (CLAUDE.md): 잘못된 JSON·소켓 에러로 서버가 죽지 않게 전부 격리.
// ============================================================

import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { LiveBus } from "./LiveBus.js";
import type { LiveEnvelope } from "./envelope.js";

export interface LiveWsServerOptions {
  liveBus: LiveBus;
  /** listen 포트. */
  port: number;
  /** bind 호스트. 기본 127.0.0.1 (Step 1 로컬 전용 — 외부 노출 차단). */
  host?: string;
}

/** 클라이언트 → 서버 메시지 (느슨하게 파싱, 모르는 필드 무시). */
interface ClientMessage {
  type?: string;
  topic?: string;
}

export class LiveWsServer {
  private readonly liveBus: LiveBus;
  private readonly port: number;
  private readonly host: string;
  private wss: WebSocketServer | null = null;

  constructor(opts: LiveWsServerOptions) {
    this.liveBus = opts.liveBus;
    this.port = opts.port;
    this.host = opts.host ?? "127.0.0.1";
  }

  /** 서버 시작 (멱등 — 이미 떠 있으면 무시). */
  start(): void {
    if (this.wss) return;
    const wss = new WebSocketServer({ port: this.port, host: this.host });
    this.wss = wss;
    wss.on("connection", (socket) => this.onConnection(socket));
    wss.on("error", (e) =>
      console.error(`[liveWsServer] server error: ${e.message}`),
    );
    console.log(
      `[liveWsServer] listening ws://${this.host}:${this.port} (Step 1: 인증/TLS 없음 — 로컬 전용)`,
    );
  }

  private onConnection(socket: WebSocket): void {
    // 이 연결의 구독 목록 (topic → unsubscribe). close 시 전부 해제.
    const subs = new Map<string, () => void>();

    socket.on("message", (raw) => this.onMessage(socket, subs, raw));
    socket.on("close", () => {
      for (const off of subs.values()) off();
      subs.clear();
    });
    socket.on("error", (e) =>
      console.error(`[liveWsServer] client socket error: ${e.message}`),
    );
  }

  private onMessage(
    socket: WebSocket,
    subs: Map<string, () => void>,
    raw: RawData,
  ): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return; // 잘못된 JSON 은 graceful 무시
    }
    if (typeof msg.topic !== "string" || msg.topic.length === 0) return;
    const topic = msg.topic;

    if (msg.type === "subscribe") {
      if (subs.has(topic)) return; // 중복 구독 무시
      const off = this.liveBus.subscribe(topic, (env: LiveEnvelope) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(env));
        }
      });
      subs.set(topic, off);
    } else if (msg.type === "unsubscribe") {
      const off = subs.get(topic);
      if (off) {
        off();
        subs.delete(topic);
      }
    }
    // 알 수 없는 type 은 무시 (graceful)
  }

  /** 서버 종료 — 모든 클라 소켓 종료 + listen 해제. graceful shutdown 용. */
  async stop(): Promise<void> {
    const wss = this.wss;
    if (!wss) return;
    this.wss = null;
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    console.log("[liveWsServer] stopped");
  }
}

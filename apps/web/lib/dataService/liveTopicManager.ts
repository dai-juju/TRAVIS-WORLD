// apps/web/lib/dataService/liveTopicManager.ts
//
// 경로 A 토픽 dispatch table (M2 경로 A Step 3b, 2026-06-22).
//
// channelManager(경로 B)의 정확한 쌍둥이 — 단일 WS 연결(liveConnection) 위에서
// 토픽별 listener 를 등록/해제하고, envelope 도착 시 fan-out 한다.
//   - 한 토픽 첫 listener → 서버에 {type:"subscribe", topic} 전송.
//   - 마지막 listener 제거 → 1초 grace 후 {type:"unsubscribe", topic} (channelManager 동형).
//   - 재연결 시 활성 토픽 전체 재구독(onOpen).
//   - listener throw 격리(try/catch). 절대 crash 없음.
//
// ★ Step 3b 는 휴면: ws_direct datasource 가 아직 없어(ticker realtime 유지)
//   production 에선 호출되지 않음. mock WS 단위 테스트로만 검증. Step 4 에서 활성화.

"use client";

import {
  LiveConnection,
  type LiveConnectionStatus,
  type LiveEnvelope,
  type TokenProvider,
  type WebSocketFactory,
} from "./liveConnection";
import { getLiveAccessToken } from "./liveAuthToken";

/** 마지막 listener 제거 후 서버 unsubscribe 까지의 grace (channelManager 와 동일 1초). */
const GRACE_PERIOD_MS = 1000;

/** 경로 A 구독 상태 — channelManager 의 ChannelStatus 와 동형(hooks 가 동일 매핑). */
export type LiveStatus = "subscribing" | "subscribed" | "errored" | "closed";

export interface LiveListener<T extends Record<string, unknown>> {
  /** envelope.payload(= row)가 도착. */
  onRow: (row: T) => void;
  onStatus?: (status: LiveStatus) => void;
}

interface LiveEntry {
  listeners: Map<string, LiveListener<Record<string, unknown>>>;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

class LiveTopicManager {
  private entries = new Map<string, LiveEntry>();
  private listenerSeq = 0;
  private connection: LiveConnection | null = null;
  /** 테스트 주입용 — production 은 undefined(기본 WebSocket/URL). */
  private wsFactory?: WebSocketFactory;
  private url?: string;
  /** 세션 토큰 공급자 — production 기본은 Supabase 세션, 테스트는 fake 주입. */
  private tokenProvider: TokenProvider = getLiveAccessToken;

  /**
   * LiveConnectionStatus → LiveStatus 매핑.
   *
   * ★ [10-53](a) 재연결 깜빡임 차단: **활성 토픽이 있는 동안**의 errored/closed 는
   *   backoff 자동 재연결이 곧 복구하는 "정상 재연결 중" 상태이므로, 낙관적으로
   *   subscribing(=hooks 의 loading)으로 매핑한다. 경로 B(Supabase)는 라이브러리가
   *   재연결을 내부 흡수해 사용자가 못 봤는데, 경로 A 도 같은 체감을 주려는 것.
   *   → TickerCard 가 errored 를 빨간 error 로 깜빡이는 일을 구조적으로 차단.
   *   활성 토픽 0(진짜 teardown)이면 errored/closed 그대로 노출.
   */
  private mapStatus(s: LiveConnectionStatus): LiveStatus {
    const reconnecting = this.entries.size > 0;
    switch (s) {
      case "open":
        return "subscribed";
      case "connecting":
        return "subscribing";
      case "errored":
        return reconnecting ? "subscribing" : "errored";
      case "closed":
        return reconnecting ? "subscribing" : "closed";
      default: {
        // exhaustiveness 가드 — LiveConnectionStatus 에 새 값 추가 시 컴파일 에러로 누락 감지.
        const _exhaustive: never = s;
        return _exhaustive;
      }
    }
  }

  /**
   * topic 구독. 동기 cleanup 반환 (useEffect 친화, channelManager 와 동일 계약).
   */
  subscribe<T extends Record<string, unknown>>(
    topic: string,
    listener: LiveListener<T>,
  ): () => void {
    const id = `l${++this.listenerSeq}`;
    let entry = this.entries.get(topic);
    if (!entry) {
      entry = { listeners: new Map(), teardownTimer: null };
      this.entries.set(topic, entry);
    }
    // 진행 중 cleanup timer 취소 (grace 효과).
    if (entry.teardownTimer) {
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
    }
    const wasEmpty = entry.listeners.size === 0;
    entry.listeners.set(
      id,
      listener as LiveListener<Record<string, unknown>>,
    );

    const conn = this.ensureConnection();

    // 새 listener 에게 현재 status 즉시 통지 (이미 연결된 경우 onStatus 누락 방어).
    if (listener.onStatus) {
      try {
        listener.onStatus(this.mapStatus(conn.getStatus()));
      } catch (err) {
        console.error(`[liveTopicManager] onStatus 초기 통지 실패 (${topic})`, err);
      }
    }

    // 이 토픽 첫 listener → 서버 구독 (open 일 때만 즉시; 아니면 onOpen 재구독이 처리).
    if (wasEmpty) {
      conn.trySend({ type: "subscribe", topic });
    }

    return () => this.unsubscribe(topic, id);
  }

  private unsubscribe(topic: string, id: string): void {
    const entry = this.entries.get(topic);
    if (!entry) return;
    entry.listeners.delete(id);
    if (entry.listeners.size > 0) return;

    entry.teardownTimer = setTimeout(() => {
      const current = this.entries.get(topic);
      if (!current || current.listeners.size > 0) return;
      this.connection?.trySend({ type: "unsubscribe", topic });
      this.entries.delete(topic);
      // 연결 자체는 유지 — 재연결 비용 회피. 토픽 0 이어도 소켓 1개는 가벼움.
    }, GRACE_PERIOD_MS);
  }

  private ensureConnection(): LiveConnection {
    if (!this.connection) {
      this.connection = new LiveConnection(
        {
          onEnvelope: (env) => this.dispatch(env),
          onStatus: (s) => this.broadcastStatus(this.mapStatus(s)),
          onOpen: () => this.resubscribeAll(),
        },
        this.url,
        this.wsFactory,
        this.tokenProvider,
      );
    }
    this.connection.ensureOpen();
    return this.connection;
  }

  /** 재연결 시 활성 토픽 전체 재구독. */
  private resubscribeAll(): void {
    for (const topic of this.entries.keys()) {
      this.connection?.trySend({ type: "subscribe", topic });
    }
  }

  /** envelope 도착 → 해당 토픽 listener 들에게 row fan-out (격리). */
  private dispatch(env: LiveEnvelope): void {
    const entry = this.entries.get(env.topic);
    if (!entry) return;
    const row = env.payload as Record<string, unknown>;
    for (const lst of entry.listeners.values()) {
      try {
        lst.onRow(row);
      } catch (err) {
        console.error(`[liveTopicManager] onRow 예외 (${env.topic})`, err);
      }
    }
  }

  private broadcastStatus(status: LiveStatus): void {
    for (const entry of this.entries.values()) {
      for (const lst of entry.listeners.values()) {
        if (!lst.onStatus) continue;
        try {
          lst.onStatus(status);
        } catch (err) {
          console.error("[liveTopicManager] onStatus dispatch 예외", err);
        }
      }
    }
  }

  /** 디버그/테스트 — 활성 토픽 수. */
  __debugTopicCount(): number {
    return this.entries.size;
  }

  /** 테스트 격리 전용 — 연결 닫고 상태 초기화 + mock 주입. production 호출 금지. */
  __resetForTesting(
    wsFactory?: WebSocketFactory,
    url?: string,
    tokenProvider?: TokenProvider,
  ): void {
    for (const entry of this.entries.values()) {
      if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
    }
    this.connection?.close();
    this.connection = null;
    this.entries.clear();
    this.listenerSeq = 0;
    this.wsFactory = wsFactory;
    this.url = url;
    // 미주입 시 production 기본(Supabase 세션)으로 복귀.
    this.tokenProvider = tokenProvider ?? getLiveAccessToken;
  }
}

/**
 * 모듈 singleton — channelManager 와 동형. hooks.ts 가 직접 import.
 * index.ts 는 export 안 함 (외부 우회 차단, [3-10] 정신).
 */
export const liveTopicManager = new LiveTopicManager();

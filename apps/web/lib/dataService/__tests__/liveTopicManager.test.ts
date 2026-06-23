// liveTopicManager 단위 테스트 (M2 경로 A Step 3b, 2026-06-22 / Step 4 async 재작성 2026-06-23).
//
// mock WebSocket 주입 + fake timers 로 격리 검증 (실 워커/소켓 불필요 — 저사양 배려).
// 검증: 구독→open→subscribe 전송 / row fan-out / topic 격리 / unsubscribe grace /
//       다중 listener / 재연결 재구독 / listener throw 격리 / ★토큰 subprotocol 첨부.
//
// ★ Step 4 변경: liveConnection.connect() 가 핸드셰이크 전 tokenProvider 를 await 하면서
//   비동기화 → mock WS 가 subscribe() 직후 동기 생성되지 않는다. 각 "새 연결" 직후
//   flushConnect() 로 await 마이크로태스크를 비운 뒤 latest() 로 소켓을 집는다.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WS_SUBPROTOCOL } from "@travis/shared";
import { liveTopicManager } from "../liveTopicManager";
import type { WebSocketFactory } from "../liveConnection";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    MockWebSocket.instances.push(this);
  }
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    this.onclose?.();
  }
  // ─ 테스트 헬퍼 ─
  fireOpen(): void {
    this.onopen?.();
  }
  deliver(env: unknown): void {
    this.onmessage?.({ data: JSON.stringify(env) });
  }
  fireClose(): void {
    this.onclose?.();
  }
  fireError(): void {
    this.onerror?.();
  }
  subsSent(): string[] {
    return this.sent.filter(
      (s) => (JSON.parse(s) as { type: string }).type === "subscribe",
    );
  }
}

const factory: WebSocketFactory = (url, protocols) =>
  new MockWebSocket(url, protocols);
const latest = (): MockWebSocket => MockWebSocket.instances.at(-1)!;

/** connect() 의 `await tokenProvider()` 마이크로태스크를 비운다 (fake timers 는 promise 미차단). */
async function flushConnect(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

beforeEach(() => {
  MockWebSocket.instances = [];
  // fake 토큰 공급자 주입 — 실 Supabase 세션 불필요.
  liveTopicManager.__resetForTesting(factory, "ws://test", async () => "test-token");
  vi.useFakeTimers();
});
afterEach(() => {
  liveTopicManager.__resetForTesting();
  vi.useRealTimers();
});

describe("liveTopicManager", () => {
  it("구독 → open → subscribe 전송 + envelope payload(row) fan-out", async () => {
    const rows: unknown[] = [];
    liveTopicManager.subscribe("t:btc", { onRow: (r) => rows.push(r) });
    await flushConnect();
    const ws = latest();
    ws.fireOpen(); // onOpen → resubscribeAll
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: "subscribe", topic: "t:btc" });
    ws.deliver({ topic: "t:btc", ts: 1, seq: 1, payload: { symbol: "BTCUSDT", last_price: 100 } });
    expect(rows).toEqual([{ symbol: "BTCUSDT", last_price: 100 }]);
  });

  it("핸드셰이크 subprotocol 에 [WS_SUBPROTOCOL, 세션토큰] 첨부 (Step 4)", async () => {
    liveTopicManager.subscribe("t:btc", { onRow: () => {} });
    await flushConnect();
    expect(latest().protocols).toEqual([WS_SUBPROTOCOL, "test-token"]);
  });

  it("다른 topic envelope 미전달 (격리)", async () => {
    const rows: unknown[] = [];
    liveTopicManager.subscribe("t:btc", { onRow: (r) => rows.push(r) });
    await flushConnect();
    const ws = latest();
    ws.fireOpen();
    ws.deliver({ topic: "t:eth", ts: 1, seq: 1, payload: { x: 1 } });
    expect(rows).toEqual([]);
  });

  it("unsubscribe → 1초 grace 후 서버 unsubscribe 전송 + 토픽 제거", async () => {
    const off = liveTopicManager.subscribe("t:btc", { onRow: () => {} });
    await flushConnect();
    const ws = latest();
    ws.fireOpen();
    off();
    expect(liveTopicManager.__debugTopicCount()).toBe(1); // grace 중 유지
    vi.advanceTimersByTime(1000);
    expect(liveTopicManager.__debugTopicCount()).toBe(0);
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: "unsubscribe", topic: "t:btc" });
  });

  it("같은 topic 다중 listener fan-out + subscribe 전송은 첫 listener 1회만", async () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    liveTopicManager.subscribe("t:x", { onRow: (r) => a.push(r) });
    await flushConnect();
    const ws = latest();
    ws.fireOpen();
    liveTopicManager.subscribe("t:x", { onRow: (r) => b.push(r) });
    expect(ws.subsSent()).toHaveLength(1); // 첫 listener 만 subscribe
    ws.deliver({ topic: "t:x", ts: 1, seq: 1, payload: { v: 1 } });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("재연결 시 활성 토픽 재구독 (onOpen)", async () => {
    liveTopicManager.subscribe("t:btc", { onRow: () => {} });
    await flushConnect();
    const ws1 = latest();
    ws1.fireOpen();
    expect(ws1.subsSent()).toHaveLength(1);
    ws1.fireClose(); // 서버 끊김 → backoff 재연결
    vi.advanceTimersByTime(500); // BASE_RECONNECT_MS → connect() 재호출(async)
    await flushConnect();
    const ws2 = latest();
    expect(ws2).not.toBe(ws1);
    ws2.fireOpen(); // onOpen → resubscribeAll
    expect(JSON.parse(ws2.sent[0]!)).toEqual({ type: "subscribe", topic: "t:btc" });
  });

  it("재연결 중(errored, 활성 토픽 존재) → subscribing 매핑 (빨간 깜빡임 차단, [10-53]a)", async () => {
    const statuses: string[] = [];
    liveTopicManager.subscribe("t:btc", {
      onRow: () => {},
      onStatus: (s) => statuses.push(s),
    });
    await flushConnect();
    const ws = latest();
    ws.fireOpen();
    ws.fireError(); // 끊김 직전 에러 — 활성 토픽 있으므로 errored 노출 안 됨
    expect(statuses).toContain("subscribed");
    expect(statuses).not.toContain("errored");
    expect(statuses.at(-1)).toBe("subscribing");
  });

  it("listener throw 격리 — 다른 listener 정상 수신", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok: unknown[] = [];
    liveTopicManager.subscribe("t:x", {
      onRow: () => {
        throw new Error("boom");
      },
    });
    liveTopicManager.subscribe("t:x", { onRow: (r) => ok.push(r) });
    await flushConnect();
    const ws = latest();
    ws.fireOpen();
    expect(() =>
      ws.deliver({ topic: "t:x", ts: 1, seq: 1, payload: { v: 1 } }),
    ).not.toThrow();
    expect(ok).toHaveLength(1);
    errSpy.mockRestore();
  });
});

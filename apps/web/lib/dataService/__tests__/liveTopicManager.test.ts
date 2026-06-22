// liveTopicManager 단위 테스트 (M2 경로 A Step 3b, 2026-06-22).
//
// mock WebSocket 주입 + fake timers 로 격리 검증 (실 워커/소켓 불필요 — 저사양 배려).
// 검증: 구독→open→subscribe 전송 / row fan-out / topic 격리 / unsubscribe grace /
//       다중 listener / 재연결 재구독 / listener throw 격리.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { liveTopicManager } from "../liveTopicManager";
import type { WebSocketFactory } from "../liveConnection";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
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
  subsSent(): string[] {
    return this.sent.filter(
      (s) => (JSON.parse(s) as { type: string }).type === "subscribe",
    );
  }
}

const factory: WebSocketFactory = (url) => new MockWebSocket(url);
const latest = (): MockWebSocket => MockWebSocket.instances.at(-1)!;

beforeEach(() => {
  MockWebSocket.instances = [];
  liveTopicManager.__resetForTesting(factory, "ws://test");
  vi.useFakeTimers();
});
afterEach(() => {
  liveTopicManager.__resetForTesting();
  vi.useRealTimers();
});

describe("liveTopicManager", () => {
  it("구독 → open → subscribe 전송 + envelope payload(row) fan-out", () => {
    const rows: unknown[] = [];
    liveTopicManager.subscribe("t:btc", { onRow: (r) => rows.push(r) });
    const ws = latest();
    ws.fireOpen(); // onOpen → resubscribeAll
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: "subscribe", topic: "t:btc" });
    ws.deliver({ topic: "t:btc", ts: 1, seq: 1, payload: { symbol: "BTCUSDT", last_price: 100 } });
    expect(rows).toEqual([{ symbol: "BTCUSDT", last_price: 100 }]);
  });

  it("다른 topic envelope 미전달 (격리)", () => {
    const rows: unknown[] = [];
    liveTopicManager.subscribe("t:btc", { onRow: (r) => rows.push(r) });
    const ws = latest();
    ws.fireOpen();
    ws.deliver({ topic: "t:eth", ts: 1, seq: 1, payload: { x: 1 } });
    expect(rows).toEqual([]);
  });

  it("unsubscribe → 1초 grace 후 서버 unsubscribe 전송 + 토픽 제거", () => {
    const off = liveTopicManager.subscribe("t:btc", { onRow: () => {} });
    const ws = latest();
    ws.fireOpen();
    off();
    expect(liveTopicManager.__debugTopicCount()).toBe(1); // grace 중 유지
    vi.advanceTimersByTime(1000);
    expect(liveTopicManager.__debugTopicCount()).toBe(0);
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: "unsubscribe", topic: "t:btc" });
  });

  it("같은 topic 다중 listener fan-out + subscribe 전송은 첫 listener 1회만", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    liveTopicManager.subscribe("t:x", { onRow: (r) => a.push(r) });
    const ws = latest();
    ws.fireOpen();
    liveTopicManager.subscribe("t:x", { onRow: (r) => b.push(r) });
    expect(ws.subsSent()).toHaveLength(1); // 첫 listener 만 subscribe
    ws.deliver({ topic: "t:x", ts: 1, seq: 1, payload: { v: 1 } });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("재연결 시 활성 토픽 재구독 (onOpen)", () => {
    liveTopicManager.subscribe("t:btc", { onRow: () => {} });
    const ws1 = latest();
    ws1.fireOpen();
    expect(ws1.subsSent()).toHaveLength(1);
    ws1.fireClose(); // 서버 끊김 → backoff 재연결
    vi.advanceTimersByTime(500); // BASE_RECONNECT_MS
    const ws2 = latest();
    expect(ws2).not.toBe(ws1);
    ws2.fireOpen(); // onOpen → resubscribeAll
    expect(JSON.parse(ws2.sent[0]!)).toEqual({ type: "subscribe", topic: "t:btc" });
  });

  it("listener throw 격리 — 다른 listener 정상 수신", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok: unknown[] = [];
    liveTopicManager.subscribe("t:x", {
      onRow: () => {
        throw new Error("boom");
      },
    });
    liveTopicManager.subscribe("t:x", { onRow: (r) => ok.push(r) });
    const ws = latest();
    ws.fireOpen();
    expect(() =>
      ws.deliver({ topic: "t:x", ts: 1, seq: 1, payload: { v: 1 } }),
    ).not.toThrow();
    expect(ok).toHaveLength(1);
    errSpy.mockRestore();
  });
});

// ============================================================
// LiveBus 단위 테스트 (M2 경로 A Step 1, 2026-06-22).
//
// 검증 핵심:
//   1. 구독자에게 envelope 전달 (topic/payload/seq 보존)
//   2. 구독자 0 → publish 무비용 no-op (subscriberCount/seq 불변)
//   3. unsubscribe 후 전달 중단 + 멱등(2회 호출 안전)
//   4. 같은 topic 다중 구독자 fan-out
//   5. topic 격리 (다른 topic 구독자에겐 미전달)
//   6. 한 구독자 throw 해도 다른 구독자 전달 계속 (graceful 격리)
// ============================================================

import { describe, expect, it, vi } from "vitest";
import { LiveBus } from "../LiveBus.js";
import type { LiveEnvelope } from "../envelope.js";

describe("LiveBus", () => {
  it("구독자에게 envelope 전달 — topic/payload 보존 + seq 단조 증가", () => {
    const bus = new LiveBus();
    const received: LiveEnvelope[] = [];
    bus.subscribe("t:btc", (env) => received.push(env));

    bus.publish("t:btc", { price: 100 });
    bus.publish("t:btc", { price: 101 });

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({ topic: "t:btc", payload: { price: 100 }, seq: 1 });
    expect(received[1]).toMatchObject({ topic: "t:btc", payload: { price: 101 }, seq: 2 });
    expect(typeof received[0]!.ts).toBe("number");
  });

  it("구독자 0 → publish 는 무비용 no-op (seq 증가 안 함)", () => {
    const bus = new LiveBus();
    const received: LiveEnvelope[] = [];

    bus.publish("t:none", { x: 1 }); // 아무도 안 들음
    expect(bus.subscriberCount()).toBe(0);

    // 이후 구독자가 붙으면 seq 는 1 부터 시작 (앞의 publish 가 seq 를 안 올림)
    bus.subscribe("t:none", (env) => received.push(env));
    bus.publish("t:none", { x: 2 });
    expect(received[0]!.seq).toBe(1);
  });

  it("unsubscribe 후 전달 중단 + 멱등(2회 호출 안전)", () => {
    const bus = new LiveBus();
    const received: LiveEnvelope[] = [];
    const off = bus.subscribe("t:btc", (env) => received.push(env));

    bus.publish("t:btc", { v: 1 });
    off();
    bus.publish("t:btc", { v: 2 }); // 전달 안 됨
    off(); // 2회 호출 — throw/부작용 없어야 함

    expect(received).toHaveLength(1);
    expect(bus.subscriberCount()).toBe(0);
    expect(bus.topicSubscriberCount("t:btc")).toBe(0);
  });

  it("같은 topic 다중 구독자 fan-out", () => {
    const bus = new LiveBus();
    const a: LiveEnvelope[] = [];
    const b: LiveEnvelope[] = [];
    bus.subscribe("t:eth", (env) => a.push(env));
    bus.subscribe("t:eth", (env) => b.push(env));

    bus.publish("t:eth", { p: 1 });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(bus.topicSubscriberCount("t:eth")).toBe(2);
  });

  it("topic 격리 — 다른 topic 구독자에겐 미전달", () => {
    const bus = new LiveBus();
    const btc: LiveEnvelope[] = [];
    const eth: LiveEnvelope[] = [];
    bus.subscribe("t:btc", (env) => btc.push(env));
    bus.subscribe("t:eth", (env) => eth.push(env));

    bus.publish("t:btc", { p: 1 });

    expect(btc).toHaveLength(1);
    expect(eth).toHaveLength(0);
  });

  it("한 구독자가 throw 해도 다른 구독자 전달 계속 (graceful 격리)", () => {
    const bus = new LiveBus();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok: LiveEnvelope[] = [];
    bus.subscribe("t:x", () => {
      throw new Error("boom");
    });
    bus.subscribe("t:x", (env) => ok.push(env));

    expect(() => bus.publish("t:x", { p: 1 })).not.toThrow();
    expect(ok).toHaveLength(1); // 두 번째 구독자는 정상 수신
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});

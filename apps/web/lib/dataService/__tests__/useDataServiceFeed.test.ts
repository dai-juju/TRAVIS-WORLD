// useDataServiceFeed 통합 테스트 (M2 경로 A fast-follow #2 Step 4, 2026-06-28).
//
// renderHook(RTL) + mock WebSocket(liveTopicManager.__resetForTesting 주입)으로
// 훅 생명주기를 end-to-end 검증한다. liveTopicManager.test.ts 와 동일한 mock WS 패턴.
//
// ★ 결정적 타이밍 전략: throttleMs:0 → flush 가 Promise.resolve().then(...) microtask 라
//   fake timer / rAF 없이 `await Promise.resolve()` 로 제어 가능(저사양 + act() 승격 환경
//   에서 fake-timer↔act 상호작용 위험 제거). 연결 establish 도 microtask(`flushConnect`).
//
// ★ datasource 선택: 활성 경로(ws_direct) = "now_futures_ticker"(현재 ws_direct, 토픽
//   조립 가능). 휴면 경로(realtime) = 합성 datasource(Step 6 플립 후 liquidation 도
//   ws_direct 라 실엔트리로는 휴면 계약을 표현 불가 — 2026-07-06 갱신).
//   피드 훅은 datasource-agnostic 이라 ticker 토픽으로 메커니즘만 검증(청산 의미론 무관).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { registerDatasource } from "@travis/shared";

import { liveTopicManager } from "../liveTopicManager";
import type { WebSocketFactory } from "../liveConnection";
import { useDataServiceFeed } from "../useDataServiceFeed";

interface Row extends Record<string, unknown> {
  symbol: string;
  notional: string;
}

const TICKER_DS = "now_futures_ticker"; // ws_direct
// ★ liquidation 은 Step 6 플립(2026-07-06)으로 ws_direct — 휴면(불변식 E) 검증은
//   합성 realtime+liveTopicSpec datasource 로 유지(미래 events 시민의 과도기 계약).
const DORMANT_DS = "test-dormant-events"; // realtime + liveTopicSpec (휴면 계약)
const BTC_TOPIC = "binance:ticker:usdm:BTCUSDT";
const ETH_TOPIC = "binance:ticker:usdm:ETHUSDT";
const BTC_SELECTOR = { market_type: "usdm", symbol: "BTCUSDT" };

// ─── mock WebSocket (liveTopicManager.test.ts 와 동형) ───
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
  fireOpen(): void {
    this.onopen?.();
  }
  deliver(topic: string, payload: unknown, seq = 1): void {
    this.onmessage?.({ data: JSON.stringify({ topic, ts: 1, seq, payload }) });
  }
}

const factory: WebSocketFactory = (url, protocols) =>
  new MockWebSocket(url, protocols);
const latest = (): MockWebSocket => MockWebSocket.instances.at(-1)!;

/** connect() 의 `await tokenProvider()` 마이크로태스크를 비운다. */
async function flushConnect(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

beforeEach(() => {
  MockWebSocket.instances = [];
  liveTopicManager.__resetForTesting(factory, "ws://test", async () => "tok");
});
afterEach(() => {
  liveTopicManager.__resetForTesting();
  vi.restoreAllMocks();
});

/** 활성 ws_direct 피드 훅을 마운트하고 연결을 open 까지 끌어올린다. */
async function mountActive(
  props: Partial<Parameters<typeof useDataServiceFeed<Row>>[0]> = {},
) {
  const view = renderHook(
    (p: Parameters<typeof useDataServiceFeed<Row>>[0]) =>
      useDataServiceFeed<Row>(p),
    {
      initialProps: {
        datasource: TICKER_DS,
        selector: BTC_SELECTOR,
        throttleMs: 0,
        ...props,
      },
    },
  );
  await act(async () => {
    await flushConnect();
  });
  act(() => latest().fireOpen());
  return view;
}

/** 이벤트 N건 deliver 후 microtask flush 까지 act 로 감싼다. */
async function deliverAll(
  ws: MockWebSocket,
  topic: string,
  payloads: Row[],
): Promise<void> {
  await act(async () => {
    payloads.forEach((p, i) => ws.deliver(topic, p, i + 1));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useDataServiceFeed", () => {
  it("ws_direct 구독 → 이벤트 newest-first + FeedEvent(seq/arrivedAt/row) 형태", async () => {
    const { result } = await mountActive();
    expect(result.current.status).toBe("ready"); // open → subscribed → ready

    await deliverAll(latest(), BTC_TOPIC, [
      { symbol: "BTCUSDT", notional: "100" },
      { symbol: "BTCUSDT", notional: "200" },
    ]);

    const { events } = result.current;
    expect(events).toHaveLength(2);
    // newest-first — 마지막 도착(200)이 맨 앞.
    expect(events[0]!.row.notional).toBe("200");
    expect(events[1]!.row.notional).toBe("100");
    // FeedEvent 래퍼 형태.
    expect(events[0]!.seq).toBe(2);
    expect(events[1]!.seq).toBe(1);
    expect(typeof events[0]!.arrivedAt).toBe("number");
    expect(events[0]!.row).toEqual({ symbol: "BTCUSDT", notional: "200" });
  });

  it("cap-N — limit 초과 시 가장 오래된 이벤트 제거(개수 상한)", async () => {
    const { result } = await mountActive({ limit: 3 });

    const payloads: Row[] = [1, 2, 3, 4, 5].map((n) => ({
      symbol: "BTCUSDT",
      notional: String(n),
    }));
    await deliverAll(latest(), BTC_TOPIC, payloads);

    const { events } = result.current;
    expect(events).toHaveLength(3); // cap
    // 최신 3개(5,4,3)만 newest-first 로 유지.
    expect(events.map((e) => e.row.notional)).toEqual(["5", "4", "3"]);
    // seq 는 단조 증가 유지(1~5 중 최신 3개 = 5,4,3).
    expect(events.map((e) => e.seq)).toEqual([5, 4, 3]);
  });

  it("filter — false 반환 이벤트는 피드에서 제외", async () => {
    const filter = (r: Row) => Number(r.notional) >= 100;
    const { result } = await mountActive({ filter });

    await deliverAll(latest(), BTC_TOPIC, [
      { symbol: "BTCUSDT", notional: "50" }, // 제외
      { symbol: "BTCUSDT", notional: "150" }, // 통과
      { symbol: "BTCUSDT", notional: "30" }, // 제외
    ]);

    const { events } = result.current;
    expect(events).toHaveLength(1);
    expect(events[0]!.row.notional).toBe("150");
  });

  it("filter throw 격리 — 한 이벤트 throw 가 다음 정상 이벤트를 막지 않음", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const filter = (r: Row) => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return Number(r.notional) >= 100;
    };
    const { result } = await mountActive({ filter });

    await deliverAll(latest(), BTC_TOPIC, [
      { symbol: "BTCUSDT", notional: "999" }, // filter throw → 제외
      { symbol: "BTCUSDT", notional: "150" }, // 정상 통과
    ]);

    const { events } = result.current;
    expect(events).toHaveLength(1);
    expect(events[0]!.row.notional).toBe("150");
    expect(warn).toHaveBeenCalled();
  });

  it("재구독(selector 변경) → 버퍼 + seq clear (옛 이벤트 잔류 방지)", async () => {
    const { result, rerender } = await mountActive();
    await deliverAll(latest(), BTC_TOPIC, [
      { symbol: "BTCUSDT", notional: "100" },
    ]);
    expect(result.current.events).toHaveLength(1);

    // selector 를 ETH 로 교체 → 새 객체 = 재구독 → 버퍼 clear.
    rerender({
      datasource: TICKER_DS,
      selector: { market_type: "usdm", symbol: "ETHUSDT" },
      throttleMs: 0,
    });
    await act(async () => {
      await flushConnect();
    });
    // 재구독 직후 옛 BTC 이벤트는 사라져 있어야 함.
    expect(result.current.events).toHaveLength(0);

    // 새 토픽으로 이벤트 → seq 가 1부터 다시 시작(리셋 증명).
    await deliverAll(latest(), ETH_TOPIC, [
      { symbol: "ETHUSDT", notional: "777" },
    ]);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]!.seq).toBe(1);
    expect(result.current.events[0]!.row.symbol).toBe("ETHUSDT");
  });

  it("불안정 selector(매번 새 객체, 같은 값) → 재구독/버퍼 소실 없음 (무한루프 방어)", async () => {
    // 인라인 객체 = 매 렌더 새 참조. 값이 같으면 동일 토픽 = 구독 유지 = 버퍼 보존.
    const view = renderHook(
      (p: Parameters<typeof useDataServiceFeed<Row>>[0]) =>
        useDataServiceFeed<Row>(p),
      {
        initialProps: {
          datasource: TICKER_DS,
          selector: { market_type: "usdm", symbol: "BTCUSDT" },
          throttleMs: 0,
        },
      },
    );
    await act(async () => {
      await flushConnect();
    });
    act(() => latest().fireOpen());
    await deliverAll(latest(), BTC_TOPIC, [{ symbol: "BTCUSDT", notional: "1" }]);
    expect(view.result.current.events).toHaveLength(1);
    const wsCountBefore = MockWebSocket.instances.length;

    // 같은 값의 **새 객체**로 rerender → 재구독 없어야(버퍼 유지 + WS 새 연결 0).
    view.rerender({
      datasource: TICKER_DS,
      selector: { market_type: "usdm", symbol: "BTCUSDT" },
      throttleMs: 0,
    });
    await act(async () => {
      await flushConnect();
    });
    expect(view.result.current.events).toHaveLength(1); // 보존
    expect(MockWebSocket.instances.length).toBe(wsCountBefore); // 새 연결 0
  });

  it("filter 강화 → 기존 통과 이벤트 잔류(forward 적용, W1 계약 lock)", async () => {
    const view = renderHook(
      (p: Parameters<typeof useDataServiceFeed<Row>>[0]) =>
        useDataServiceFeed<Row>(p),
      {
        initialProps: {
          datasource: TICKER_DS,
          selector: BTC_SELECTOR,
          throttleMs: 0,
          filter: (r: Row) => Number(r.notional) >= 100,
        },
      },
    );
    await act(async () => {
      await flushConnect();
    });
    act(() => latest().fireOpen());
    await deliverAll(latest(), BTC_TOPIC, [{ symbol: "BTCUSDT", notional: "150" }]);
    expect(view.result.current.events).toHaveLength(1);

    // filter 강화($1000+) — ref 라이브라 재구독/버퍼 clear 없음(forward 적용).
    view.rerender({
      datasource: TICKER_DS,
      selector: BTC_SELECTOR,
      throttleMs: 0,
      filter: (r: Row) => Number(r.notional) >= 1000,
    });
    await act(async () => {
      await flushConnect();
    });
    await deliverAll(latest(), BTC_TOPIC, [{ symbol: "BTCUSDT", notional: "200" }]);
    const ev = view.result.current.events;
    // 옛 150 은 강화된 filter 를 불만족해도 잔류 / 새 200 은 신 filter(>=1000)로 제외.
    expect(ev).toHaveLength(1);
    expect(ev[0]!.row.notional).toBe("150");
  });

  it("limit 런타임 변경 → 버퍼 clear + 재구독 (W2 거동 문서화)", async () => {
    const view = renderHook(
      (p: Parameters<typeof useDataServiceFeed<Row>>[0]) =>
        useDataServiceFeed<Row>(p),
      {
        initialProps: {
          datasource: TICKER_DS,
          selector: BTC_SELECTOR,
          throttleMs: 0,
          limit: 5,
        },
      },
    );
    await act(async () => {
      await flushConnect();
    });
    act(() => latest().fireOpen());
    await deliverAll(latest(), BTC_TOPIC, [
      { symbol: "BTCUSDT", notional: "1" },
      { symbol: "BTCUSDT", notional: "2" },
    ]);
    expect(view.result.current.events).toHaveLength(2);

    // limit 변경 = subscribe deps 변경 → 재구독 진입부 clear(D) → 버퍼 비워짐.
    view.rerender({
      datasource: TICKER_DS,
      selector: BTC_SELECTOR,
      throttleMs: 0,
      limit: 2,
    });
    await act(async () => {
      await flushConnect();
    });
    expect(view.result.current.events).toHaveLength(0);
  });

  it("unmount → 이후 이벤트 무시 (누수 0, crash 0)", async () => {
    const { result, unmount } = await mountActive();
    const ws = latest();
    await deliverAll(ws, BTC_TOPIC, [{ symbol: "BTCUSDT", notional: "100" }]);
    expect(result.current.events).toHaveLength(1);

    unmount();

    // unmount 후 deliver → 훅이 더는 소비하지 않음(throw 없이 무시).
    expect(() =>
      ws.deliver(BTC_TOPIC, { symbol: "BTCUSDT", notional: "200" }, 2),
    ).not.toThrow();
  });

  it("휴면 — transport realtime datasource 는 구독 안 함(빈 idle, 불변식 E)", async () => {
    registerDatasource({
      id: DORMANT_DS,
      name: "Dormant Events",
      category: "_history",
      refreshTier: "realtime",
      queryableFields: [],
      // transport 미명시 = realtime. liveTopicSpec 이 있어도 경로 A 구독 금지가 계약.
      liveTopicSpec: { prefix: "test:dormant", selectorKeys: ["market_type"] },
    });
    const { result } = renderHook(() =>
      useDataServiceFeed<Row>({
        datasource: DORMANT_DS,
        selector: { market_type: "usdm" },
        throttleMs: 0,
      }),
    );
    await act(async () => {
      await flushConnect();
    });
    // ws_direct 아님 → liveTopicManager 구독 자체가 없어 WS 연결 0.
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(result.current.events).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });

  it("enabled=false → 구독 안 함(빈 idle)", async () => {
    const { result } = renderHook(() =>
      useDataServiceFeed<Row>({
        datasource: TICKER_DS,
        selector: BTC_SELECTOR,
        throttleMs: 0,
        enabled: false,
      }),
    );
    await act(async () => {
      await flushConnect();
    });
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(result.current.events).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });

  it("selector 불완전(필수 selectorKey 누락) → 토픽 조립 실패 → 휴면(빈 idle)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() =>
      useDataServiceFeed<Row>({
        datasource: TICKER_DS,
        // selectorKeys = [market_type, symbol] 인데 symbol 누락 → buildLiveTopic null.
        selector: { market_type: "usdm" },
        throttleMs: 0,
      }),
    );
    await act(async () => {
      await flushConnect();
    });
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(result.current.events).toHaveLength(0);
    expect(result.current.status).toBe("idle");
    expect(warn).toHaveBeenCalled();
  });
});

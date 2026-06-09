// apps/web/lib/dataService/__tests__/channelManager.test.ts
//
// channelManager 의 옵션 Z (단일 channel + dispatch table + grace period) 검증.
// [3-33] M1.4 잠복 버그 회귀 방어선.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { channelManager } from "../channelManager";

// supabase-js 타입을 정확히 따라가지 않고 mock 필수 표면만 시뮬레이션.
// 본 테스트는 channel 라이프사이클 + dispatch 동작만 검증하므로 충분.

interface MockChannel {
  __name: string;
  __onCalls: Array<{ event: string; filter: unknown; cb: (payload: unknown) => void }>;
  __subscribeCalls: Array<(status: string) => void>;
  __triggerPayload: (payload: unknown) => void;
  __triggerStatus: (status: string) => void;
  on: (event: unknown, filter: unknown, cb: (payload: unknown) => void) => MockChannel;
  subscribe: (cb: (status: string) => void) => MockChannel;
}

interface MockClient {
  channel: (name: string) => MockChannel;
  removeChannel: (ch: MockChannel) => Promise<void>;
  __channels: MockChannel[];
  __removed: MockChannel[];
}

function createMockClient(autoSubscribed = true): MockClient {
  const channels: MockChannel[] = [];
  const removed: MockChannel[] = [];

  const client: MockClient = {
    channel: (name: string) => {
      const onCalls: MockChannel["__onCalls"] = [];
      const subscribeCalls: MockChannel["__subscribeCalls"] = [];
      const ch: MockChannel = {
        __name: name,
        __onCalls: onCalls,
        __subscribeCalls: subscribeCalls,
        __triggerPayload: (payload) => {
          for (const c of onCalls) c.cb(payload);
        },
        __triggerStatus: (status) => {
          for (const cb of subscribeCalls) cb(status);
        },
        on: (event, filter, cb) => {
          onCalls.push({ event: String(event), filter, cb });
          return ch;
        },
        subscribe: (cb) => {
          subscribeCalls.push(cb);
          if (autoSubscribed) cb("SUBSCRIBED");
          return ch;
        },
      };
      channels.push(ch);
      return ch;
    },
    removeChannel: async (ch: MockChannel) => {
      removed.push(ch);
    },
    __channels: channels,
    __removed: removed,
  };

  return client;
}

describe("channelManager: 옵션 Z (단일 channel + dispatch table)", () => {
  let client: MockClient;

  beforeEach(() => {
    client = createMockClient();
    channelManager.__resetForTesting(() => client as unknown as SupabaseClient);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    channelManager.__resetForTesting();
  });

  it("동일 datasource 의 첫 listener 가 channel 1개 생성", () => {
    const cleanup = channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
    });
    expect(client.__channels).toHaveLength(1);
    expect(channelManager.__debugChannelCount()).toBe(1);
    cleanup();
  });

  it("동일 datasource 두번째 listener 가 channel 재사용 (옵션 Z 핵심, [3-33] 회귀 방어)", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const c1 = channelManager.subscribe("now_spot_ticker", { onChange: cb1 });
    const c2 = channelManager.subscribe("now_spot_ticker", { onChange: cb2 });

    // channel 은 1개만 생성됨.
    expect(client.__channels).toHaveLength(1);
    expect(channelManager.__debugChannelCount()).toBe(1);
    // .on() 도 1회만 (subscribe 후 추가 .on() 호출 없음 — Supabase 정책 준수).
    expect(client.__channels[0]!.__onCalls).toHaveLength(1);

    // payload 도착 시 두 listener 모두 호출.
    const payload = { eventType: "INSERT", new: { symbol: "BTCUSDT" }, old: {} };
    client.__channels[0]!.__triggerPayload(payload);
    expect(cb1).toHaveBeenCalledWith(payload);
    expect(cb2).toHaveBeenCalledWith(payload);

    c1();
    c2();
  });

  it("마지막 listener 제거 후 1초 grace period 후 channel cleanup", () => {
    const cleanup = channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
    });
    expect(client.__channels).toHaveLength(1);

    cleanup();
    // grace period 안 → 아직 cleanup 안 됨.
    expect(client.__removed).toHaveLength(0);

    vi.advanceTimersByTime(1000);
    expect(client.__removed).toHaveLength(1);
    expect(channelManager.__debugChannelCount()).toBe(0);
  });

  it("grace period 안에 새 listener 도착 시 cleanup cancel (Strict Mode 시나리오)", () => {
    const c1 = channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
    });
    c1();
    // grace 진행 중 새 listener.
    vi.advanceTimersByTime(500);
    const c2 = channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
    });

    // grace 만료 시점 도달.
    vi.advanceTimersByTime(1000);
    // 두번째 listener 가 살아있어 cleanup 안 됨.
    expect(client.__removed).toHaveLength(0);
    expect(client.__channels).toHaveLength(1);

    c2();
  });

  it("listener 콜백의 throw 가 다른 listener 를 막지 않는다", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const okCb = vi.fn();
    channelManager.subscribe("now_spot_ticker", {
      onChange: () => {
        throw new Error("listener bug");
      },
    });
    channelManager.subscribe("now_spot_ticker", { onChange: okCb });

    client.__channels[0]!.__triggerPayload({
      eventType: "INSERT",
      new: { symbol: "X" },
    });
    expect(okCb).toHaveBeenCalledOnce();
    consoleErr.mockRestore();
  });

  it("새 listener 도착 시 onStatus 즉시 통지 (현재 channel 상태)", () => {
    channelManager.subscribe("now_spot_ticker", { onChange: vi.fn() });
    // 첫 listener 가 채널 만들고 즉시 SUBSCRIBED 시뮬레이션 → status='subscribed'.
    const onStatus = vi.fn();
    channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
      onStatus,
    });
    expect(onStatus).toHaveBeenCalledWith("subscribed");
  });

  it("같은 물리 테이블 가리키는 논리 datasource 들이 channel 공유 (테마 A Step 1, [8-27] #1)", () => {
    // open_interest / premium_index 는 서로 다른 논리 id 지만 둘 다
    // resolveDatasourceTable 로 now_futures_indicator 에 매핑된다.
    const cbOi = vi.fn();
    const cbFunding = vi.fn();
    const c1 = channelManager.subscribe("open_interest", { onChange: cbOi });
    const c2 = channelManager.subscribe("premium_index", { onChange: cbFunding });

    // 다른 논리 id 2개 → 물리 테이블 1개 → channel 1개만 생성 (중복 채널 방지).
    expect(client.__channels).toHaveLength(1);
    expect(channelManager.__debugChannelCount()).toBe(1);
    // channel 이름 + postgres_changes table 이 논리 id 가 아니라 물리 테이블명.
    expect(client.__channels[0]!.__name).toBe(
      "dataService:now_futures_indicator",
    );
    expect(client.__channels[0]!.__onCalls[0]!.filter).toMatchObject({
      table: "now_futures_indicator",
    });

    // payload 도착 시 OI / 펀딩 listener 모두에게 fan-out (채널 공유).
    const payload = { eventType: "UPDATE", new: { symbol: "BTCUSDT" }, old: {} };
    client.__channels[0]!.__triggerPayload(payload);
    expect(cbOi).toHaveBeenCalledWith(payload);
    expect(cbFunding).toHaveBeenCalledWith(payload);

    c1();
    c2();
  });

  it("CHANNEL_ERROR / TIMED_OUT 시 모든 listener 에 'errored' 통지", () => {
    // autoSubscribed=false 로 SUBSCRIBED 자동 호출 회피 — 수동으로 status 트리거.
    const customClient = createMockClient(false);
    channelManager.__resetForTesting(
      () => customClient as unknown as SupabaseClient,
    );

    const onStatus1 = vi.fn();
    const onStatus2 = vi.fn();
    channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
      onStatus: onStatus1,
    });
    channelManager.subscribe("now_spot_ticker", {
      onChange: vi.fn(),
      onStatus: onStatus2,
    });

    customClient.__channels[0]!.__triggerStatus("CHANNEL_ERROR");
    expect(onStatus1).toHaveBeenCalledWith("errored");
    expect(onStatus2).toHaveBeenCalledWith("errored");
  });
});

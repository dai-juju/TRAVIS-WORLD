// apps/web/lib/dataService/__tests__/throttler.test.ts
//
// createThrottler 의 flush 횟수 / cancel / 즉시 flush 테스트.
// 옛 useRealtimeTable.test.ts 의 throttler 부분을 그대로 마이그레이션.

import { describe, expect, it, vi } from "vitest";
import { createThrottler } from "../throttler";

describe("createThrottler: flush 횟수 제한 (throttleMs=500)", () => {
  it("즉시 연속 schedule 해도 첫 flush 는 1회만", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttler = createThrottler(
      500,
      flush,
      () => Date.now(),
      // rAF 는 setTimeout 으로 시뮬레이트 — 테스트 안정성.
      (cb) => setTimeout(cb, 0) as unknown as number,
      (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
    );

    // 1,000번 이벤트 도착 시뮬레이트 — throttleMs 안에 몰린 상태.
    for (let i = 0; i < 1000; i++) throttler.schedule();

    // 아직 타이머 미경과 → flush 0회.
    expect(flush).not.toHaveBeenCalled();

    // throttleMs 만큼 시간 전진 → setTimeout 콜백 실행 → rAF(setTimeout 0ms) 큐에 들어감.
    await vi.advanceTimersByTimeAsync(500);
    // rAF 로 예약된 0ms 타이머까지 소화.
    await vi.advanceTimersByTimeAsync(0);

    expect(flush).toHaveBeenCalledTimes(1);
    throttler.cancel();
    vi.useRealTimers();
  });

  it("1초 구간(루프) 동안 연속 schedule 은 최대 2회 flush (throttleMs=500)", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttler = createThrottler(
      500,
      flush,
      () => Date.now(),
      (cb) => setTimeout(cb, 0) as unknown as number,
      (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
    );

    for (let tick = 0; tick < 100; tick++) {
      throttler.schedule();
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(flush.mock.calls.length).toBeLessThanOrEqual(2);
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(1);

    throttler.cancel();
    vi.useRealTimers();
  });

  it("throttleMs=0 이면 즉시 flush (마이크로태스크 1 tick 뒤)", async () => {
    const flush = vi.fn();
    const throttler = createThrottler(0, flush);
    throttler.schedule();
    // microtask 큐를 비움.
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancel 후 예약은 무효화된다", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttler = createThrottler(
      500,
      flush,
      () => Date.now(),
      (cb) => setTimeout(cb, 0) as unknown as number,
      (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
    );
    throttler.schedule();
    throttler.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(flush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

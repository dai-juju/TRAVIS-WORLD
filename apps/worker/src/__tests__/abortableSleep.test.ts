// ============================================================
// abortableSleep + token-bucket signal 협조 취소 단위 테스트 ([8-31]ⓑ, 2026-06-05).
//
// 검증 (요청 #6-c 일부 + 기반 유틸):
//   (1) abortableSleep: signal 미지정 시 정상 sleep / abort 시 즉시 깨어남(throw 0) /
//       이미 aborted 면 즉시 resolve.
//   (2) TokenBucket.acquire(signal): 토큰 고갈로 대기 중 abort 시 즉시 탈출(graceful).
//
// 순수 단위 — fake timer + AbortController 표준 API. 네트워크 0.
//
// 단일 진실: docs/task-record/M1.9-step3-rollout.md ([8-31]ⓑ)
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortableSleep,
  TokenBucket,
  type RateLimiterClock,
} from "@travis/exchange-collectors";

describe("abortableSleep ([8-31]ⓑ)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("signal 미지정: ms 후 정상 resolve (기존 sleep 동작 불변)", async () => {
    let done = false;
    const p = abortableSleep(50).then(() => {
      done = true;
    });
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await p;
    expect(done).toBe(true);
  });

  it("이미 aborted 인 signal: 대기 0 으로 즉시 resolve (throw 0)", async () => {
    const ac = new AbortController();
    ac.abort();
    // fake timer 를 전진시키지 않아도 resolve 되어야 한다(즉시).
    await expect(abortableSleep(10_000, ac.signal)).resolves.toBeUndefined();
  });

  it("대기 중 abort: 타이머 만료 전 즉시 깨어남(throw 0)", async () => {
    const ac = new AbortController();
    let done = false;
    const p = abortableSleep(10_000, ac.signal).then(() => {
      done = true;
    });
    // 1초만 흐른 시점에 abort → 남은 9초를 기다리지 않고 깨어나야 함.
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    ac.abort();
    await p; // reject 가 아니라 resolve 여야 함(graceful).
    expect(done).toBe(true);
  });
});

describe("TokenBucket.acquire(signal) ([8-31]ⓑ 대기 중 취소)", () => {
  /** 수동 전진 가짜 시계 — sleep 은 시계만 전진(리필 트리거), signal 은 무시(취소는 acquire 루프가 담당). */
  function makeFakeClock(): RateLimiterClock & { advance: (ms: number) => void } {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
      advance: (ms: number) => {
        t += ms;
      },
    };
  }

  it("토큰 고갈로 대기 중 abort 면 즉시 탈출 (graceful, throw 0)", async () => {
    const clock = makeFakeClock();
    // capacity 1 — 1개 소비 후 다음 acquire 는 60초 대기.
    const bucket = new TokenBucket(1, clock);
    await bucket.acquire(); // 첫 토큰 소비(대기 0).

    const ac = new AbortController();
    ac.abort(); // 이미 취소된 상태로 호출 → 루프 진입 즉시 return.
    // 가짜 시계를 전진시키지 않아도(리필 0) abort 체크로 즉시 반환해야 함.
    await expect(bucket.acquire(ac.signal)).resolves.toBeUndefined();
  });

  it("signal 미지정: 기존 동작(리필 대기 후 진행) 유지 — 회귀 0", async () => {
    const clock = makeFakeClock();
    const bucket = new TokenBucket(1, clock);
    await bucket.acquire(); // 소진.
    // 1분 경과 → 토큰 1개 리필 → 진행.
    clock.advance(60_000);
    await expect(bucket.acquire()).resolves.toBeUndefined();
  });
});

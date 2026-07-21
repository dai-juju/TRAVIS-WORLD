// runGracefulShutdown 회귀 테스트 (M3-step4 Step 0, [10-110]).
//
// 2026-07-14 "반쪽 좀비" 실사고의 결함 3종을 각각 핀:
//   (a) stop 일부 실패 → flush 는 반드시 전부 실행 (기존: catch 점프로 통째 건너뜀)
//   (b) stop hang → watchdog 이 강제 exit(1) (기존: 무한 대기 = 반쪽 좀비)
//   (c) 실패 시 exit(1) / 성공 시 exit(0) (기존: 무조건 exit 0 위장)
// + flush 순서 계약 (streamCoalescer → markPriceWriteCoalescer, [10-77])
// + watchdog 발화 후 늦은 완료가 exit 를 재호출하지 않음 (exit 단일성)

import { afterEach, describe, expect, it, vi } from "vitest";

import { runGracefulShutdown } from "../shutdown.js";

/** 테스트 소음 억제용 무음 로거. */
const silentLogger = { log: () => undefined, error: () => undefined };

function makeExitSpy() {
  const calls: number[] = [];
  return { calls, exit: (code: number) => calls.push(code) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runGracefulShutdown", () => {
  it("정상 경로: 전부 성공 → exit(0), flush 는 선언 순서대로 실행", async () => {
    const order: string[] = [];
    const { calls, exit } = makeExitSpy();

    const code = await runGracefulShutdown({
      signal: "SIGTERM",
      stops: [
        { name: "a", stop: () => order.push("stop:a") },
        // async stop 혼재 허용 확인
        {
          name: "b",
          stop: async () => {
            order.push("stop:b");
          },
        },
      ],
      flushes: [
        // streamCoalescer 는 sync void — sync/async 혼재 계약 확인
        { name: "streamCoalescer", stop: () => order.push("flush:stream") },
        {
          name: "markPriceWriteCoalescer",
          stop: async () => {
            order.push("flush:markPrice");
          },
        },
      ],
      watchdogMs: 30_000,
      exit,
      logger: silentLogger,
    });

    expect(code).toBe(0);
    expect(calls).toEqual([0]);
    // flush 는 stops 이후 + 선언 순서(stream → markPrice) — [10-77] 계약 핀
    expect(order.slice(-2)).toEqual(["flush:stream", "flush:markPrice"]);
  });

  it("(a)+(c) stop 하나가 reject 해도 flush 2종은 전부 실행되고 exit(1)", async () => {
    const flushed: string[] = [];
    const { calls, exit } = makeExitSpy();

    const code = await runGracefulShutdown({
      signal: "SIGTERM",
      stops: [
        { name: "ok", stop: () => undefined },
        { name: "boom", stop: () => Promise.reject(new Error("relay stop 실패")) },
      ],
      flushes: [
        { name: "streamCoalescer", stop: () => flushed.push("stream") },
        { name: "markPriceWriteCoalescer", stop: () => flushed.push("markPrice") },
      ],
      watchdogMs: 30_000,
      exit,
      logger: silentLogger,
    });

    // 기존 구조였다면 catch 점프로 flushed 가 [] 였을 자리 — 결함 (a) 핀
    expect(flushed).toEqual(["stream", "markPrice"]);
    expect(code).toBe(1);
    expect(calls).toEqual([1]);
  });

  it("(a) 앞 flush 가 throw 해도 뒤 flush 는 실행되고 exit(1)", async () => {
    const flushed: string[] = [];
    const { calls, exit } = makeExitSpy();

    const code = await runGracefulShutdown({
      signal: "SIGTERM",
      stops: [{ name: "ok", stop: () => undefined }],
      flushes: [
        {
          name: "streamCoalescer",
          stop: () => {
            throw new Error("flush 실패");
          },
        },
        { name: "markPriceWriteCoalescer", stop: () => flushed.push("markPrice") },
      ],
      watchdogMs: 30_000,
      exit,
      logger: silentLogger,
    });

    expect(flushed).toEqual(["markPrice"]);
    expect(code).toBe(1);
    expect(calls).toEqual([1]);
  });

  it("(b) stop hang → watchdog 이 watchdogMs 후 강제 exit(1)", async () => {
    vi.useFakeTimers();
    const { calls, exit } = makeExitSpy();

    // 영영 resolve 되지 않는 stop — 2026-07-14 반쪽 좀비 시나리오
    void runGracefulShutdown({
      signal: "SIGTERM",
      stops: [{ name: "hang", stop: () => new Promise(() => undefined) }],
      flushes: [],
      watchdogMs: 30_000,
      exit,
      logger: silentLogger,
    });

    // watchdog 직전까지는 미발화
    await vi.advanceTimersByTimeAsync(29_999);
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([1]);
  });

  it("watchdog 메시지에 hang 컴포넌트 이름 명시 (진단 비용 제거)", async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const logger = {
      log: () => undefined,
      error: (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      },
    };
    const { calls, exit } = makeExitSpy();

    void runGracefulShutdown({
      signal: "SIGTERM",
      stops: [
        { name: "ok", stop: () => undefined },
        { name: "poller", stop: () => new Promise(() => undefined) }, // hang
      ],
      flushes: [],
      watchdogMs: 30_000,
      exit,
      logger,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual([1]);
    // 완료된 "ok" 는 빠지고 매달린 "poller" 만 지목돼야 진단이 선다.
    const watchdogMsg = errors.find((m) => m.includes("watchdog"));
    expect(watchdogMsg).toContain("poller");
    expect(watchdogMsg).not.toContain("ok");
  });

  it("watchdog 발화 후 늦은 완료가 exit 를 재호출하지 않음 (exit 단일성)", async () => {
    vi.useFakeTimers();
    const { calls, exit } = makeExitSpy();

    // watchdog(30s) 이후에야 풀리는 stop — 발화 후 늦은 정상 완료 경합 재현
    let release: () => void = () => undefined;
    const promise = runGracefulShutdown({
      signal: "SIGTERM",
      stops: [
        {
          name: "slow",
          stop: () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        },
      ],
      flushes: [],
      watchdogMs: 30_000,
      exit,
      logger: silentLogger,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual([1]); // watchdog 발화

    release?.(); // 늦은 완료
    await promise;
    expect(calls).toEqual([1]); // exit 재호출 없음 — 코드 0 으로 덮이지 않음
  });
});

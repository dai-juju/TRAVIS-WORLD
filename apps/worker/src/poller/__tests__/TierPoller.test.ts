// ============================================================
// TierPoller 단위 테스트 (M1.3 Step 4 Substep 4b).
//
// 검증:
//   1. register → start → stop 사이클
//   2. intervalMs 주기로 반복 실행
//   3. task.execute 에러 시 consecutiveFailures 증가 + 다음 tick 예약
//   4. stop 시 진행 중 execute 완료 대기 (graceful shutdown)
//   5. 유효하지 않은 task는 graceful 무시
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// M1.9 Step 1 (2026-06-02): TierPoller/PollTask 가 @travis/shared 로 이동.
//   이 테스트는 worker 에 남겨 "추출 후에도 동작 불변" 을 worker test suite 에서 검증.
import type { PollTask } from "@travis/shared";
import { TierPoller } from "@travis/shared";

describe("TierPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 시나리오 1: register → start → 첫 실행 ───────────
  it("start 후 task가 즉시 첫 실행되고 intervalMs 주기로 반복", async () => {
    const poller = new TierPoller();
    const execute = vi.fn().mockResolvedValue(undefined);
    const task: PollTask = {
      id: "test-ticker",
      tier: "high",
      intervalMs: 1000,
      execute,
    };

    poller.register(task);
    poller.start();

    // 첫 실행 (0ms 뒤)
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    // 1000ms 뒤 두 번째
    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(2);

    // 2000ms 뒤 세 번째
    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(3);

    await poller.stop();
  });

  // ─── 시나리오 2: 에러 복구 ──────────────────────────
  it("task.execute가 throw해도 Poller는 다음 tick을 예약하고 상태를 기록", async () => {
    const poller = new TierPoller();
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockResolvedValueOnce(undefined);
    const task: PollTask = { id: "fail-task", tier: "mid", intervalMs: 500, execute };

    poller.register(task);
    poller.start();

    // 첫 실행(실패) + 500ms 뒤 두 번째(실패) + 500ms 뒤 세 번째(성공)
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);

    expect(execute).toHaveBeenCalledTimes(3);

    const status = poller.getStatus();
    expect(status).toHaveLength(1);
    expect(status[0]?.taskId).toBe("fail-task");
    expect(status[0]?.lastSuccess).toBe(true);
    expect(status[0]?.consecutiveFailures).toBe(0); // 성공 시 리셋
    expect(status[0]?.lastError).toBeNull();

    await poller.stop();
  });

  // ─── 시나리오 3: 연속 실패 카운트 ───────────────────
  it("연속 실패 시 consecutiveFailures가 누적되고 lastError가 기록", async () => {
    const poller = new TierPoller();
    const execute = vi.fn().mockRejectedValue(new Error("persistent-fail"));
    const task: PollTask = { id: "always-fail", tier: "low", intervalMs: 100, execute };

    poller.register(task);
    poller.start();

    // 3번 실행
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    const status = poller.getStatus();
    expect(status[0]?.consecutiveFailures).toBe(3);
    expect(status[0]?.lastSuccess).toBe(false);
    expect(status[0]?.lastError).toBe("persistent-fail");

    await poller.stop();
  });

  // ─── 시나리오 4: graceful shutdown ──────────────────
  it("stop 호출 시 예약된 timeout 취소 + 이후 execute 호출 중단", async () => {
    const poller = new TierPoller();
    const execute = vi.fn().mockResolvedValue(undefined);
    const task: PollTask = { id: "shutdown-test", tier: "high", intervalMs: 500, execute };

    poller.register(task);
    poller.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    await poller.stop();

    // stop 후에는 아무리 시간 흘러도 execute 호출 없음
    await vi.advanceTimersByTimeAsync(10_000);
    expect(execute).toHaveBeenCalledTimes(1);

    const status = poller.getStatus();
    expect(status[0]?.nextRunAt).toBeNull();
  });

  // ─── 시나리오 5: 다수 task 독립 동작 ────────────────
  it("다수 task가 각자의 intervalMs로 독립 실행", async () => {
    const poller = new TierPoller();
    const execA = vi.fn().mockResolvedValue(undefined);
    const execB = vi.fn().mockResolvedValue(undefined);

    poller.register({ id: "a", tier: "high", intervalMs: 100, execute: execA });
    poller.register({ id: "b", tier: "low", intervalMs: 500, execute: execB });
    poller.start();

    // 500ms 동안: A는 5~6번(0, 100, 200, 300, 400, 500), B는 2번(0, 500).
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);

    expect(execA.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(execB).toHaveBeenCalledTimes(2); // 0, 500

    await poller.stop();
  });

  // ─── 시나리오 6: 유효하지 않은 task 무시 ────────────
  it("intervalMs 비유효/execute 없음 등 잘못된 task는 graceful 무시", () => {
    const poller = new TierPoller();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // intervalMs 0
    poller.register({ id: "bad-1", tier: "high", intervalMs: 0, execute: vi.fn() });
    // intervalMs NaN
    poller.register({ id: "bad-2", tier: "high", intervalMs: NaN, execute: vi.fn() });
    // id 없음
    poller.register({
      id: "",
      tier: "high",
      intervalMs: 1000,
      execute: vi.fn(),
    });

    expect(poller.getStatus()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  // ─── 시나리오 7: stop 유예 상한 ([10-110] 무한 대기 금지, M3-step4) ────────
  it("진행 중 execute 가 안 끝나도 graceMs 후 stop 이 반환 (반쪽 좀비 근본 원인 핀)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const poller = new TierPoller();
    // 영영 resolve 안 되는 execute — perSymbolTask 수 분 사이클 중 SIGTERM 시나리오
    const execute = vi.fn(() => new Promise<void>(() => undefined));
    const task: PollTask = { id: "hang-task", tier: "high", intervalMs: 60_000, execute };
    poller.register(task);
    poller.start();
    await vi.advanceTimersByTimeAsync(0); // 첫 실행 진입 → inFlight 생성

    let stopped = false;
    const stopPromise = poller.stop(5_000).then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(stopped).toBe(false); // 유예 안에서는 대기
    await vi.advanceTimersByTimeAsync(1);
    await stopPromise;
    expect(stopped).toBe(true); // 유예 초과 → 유기하고 반환
    expect(warn).toHaveBeenCalled(); // 유기 사실은 무음이 아니라 경고로 관측
    warn.mockRestore();
  });
});

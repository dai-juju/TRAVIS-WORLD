// ============================================================
// TierPoller — IPoller 구현체 (M1.3 Step 4 Substep 4b).
//
// 책임:
//   등록된 PollTask 들을 각자의 intervalMs 주기로 반복 실행한다.
//   execute() 에러는 Poller 내부에서 catch하여 워커 전체가 죽지 않도록 보호.
//
// 핵심 설계:
//   - setTimeout 재귀: execute 완료 후 "intervalMs 뒤" 다시 예약.
//     ⚠️ 즉 intervalMs는 "실행 주기"가 아니라 **"execute 완료 후 최소 휴식 시간"**.
//     실질 폴링 주기 = `execute 소요 + intervalMs`. execute가 intervalMs를 초과해도
//     큐가 쌓이지 않고 자동 "뒤따라가는 모드"로 전환 (안전하지만 주기 늘어남).
//   - setInterval이 아닌 이유: execute가 intervalMs 초과할 때 큐가 쌓이는 사고 방지.
//   - graceful shutdown: stop() 호출 시 예약된 timeout 취소 + 진행 중 execute 완료 대기.
//   - throw 금지 불변: task.execute() 에러는 console.error + consecutiveFailures++ +
//     다음 tick 예약. 워커 crash 방지 (CLAUDE.md 원칙).
//
// 참고:
//   이 클래스는 "tier"라는 이름을 유지하지만, 실제 주기는 각 PollTask의
//   intervalMs로 결정된다. tier는 모니터링/registry 매칭용 의미론적 태그.
//
// M1.9 Step 1 (2026-06-02): apps/worker → @travis/shared 로 이동 (로직 변경 0).
//   production worker(apps/worker) 와 forward-fill worker(apps/collector-history)
//   가 동일 스케줄러를 공유하기 위함.
// ============================================================

import type { IPoller, PollStatus, PollTask } from "./IPoller";

/** 내부 task 상태. */
interface TaskState {
  task: PollTask;
  timerId: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  lastRunAt: number | null;
  lastSuccess: boolean;
  lastError: string | null;
  consecutiveFailures: number;
  nextRunAt: number | null;
}

export class TierPoller implements IPoller {
  private readonly states: Map<string, TaskState> = new Map();
  private started = false;
  private stopping = false;

  register(task: PollTask): void {
    if (!task || !task.id || typeof task.execute !== "function") {
      console.warn("[TierPoller] register: 유효하지 않은 task, 무시");
      return;
    }
    if (!Number.isFinite(task.intervalMs) || task.intervalMs <= 0) {
      console.warn(`[TierPoller] register: ${task.id} intervalMs 비유효(${task.intervalMs}), 무시`);
      return;
    }

    const existing = this.states.get(task.id);
    if (existing) {
      // 기존 예약 취소 후 교체 (새 task 정의 반영).
      if (existing.timerId) {
        clearTimeout(existing.timerId);
      }
      // W1: 진행 중 execute Promise는 승계하지 않음 — 새 state에서 inFlight=null 시작.
      //     stop() 시 기존 진행 중 작업을 기다리지 못하는 점을 명시적으로 경고.
      //     현재 M1.3 범위에서는 런타임 재등록 경로가 없어 실무 영향 無.
      if (existing.inFlight) {
        console.warn(
          `[TierPoller] register: "${task.id}" 이미 진행 중 — 새 상태로 교체(진행 중 Promise 방기).`,
        );
      }
    }

    const state: TaskState = {
      task,
      timerId: null,
      inFlight: null,
      lastRunAt: null,
      lastSuccess: false,
      lastError: null,
      consecutiveFailures: 0,
      nextRunAt: null,
    };
    this.states.set(task.id, state);

    // 이미 start 된 상태라면 즉시 첫 tick 예약 (initialDelayMs 적용 — staggered start).
    if (this.started && !this.stopping) {
      this.scheduleNextRun(state, task.initialDelayMs ?? 0);
    }
  }

  start(): void {
    if (this.started) {
      console.warn("[TierPoller] start: 이미 시작됨");
      return;
    }
    this.started = true;
    this.stopping = false;

    for (const state of this.states.values()) {
      // 첫 실행은 task.initialDelayMs(기본 0) 뒤 — staggered start 로 동시 발화 피크 분산.
      //   미지정 task 는 0ms = 즉시 첫 실행(기존 동작 불변).
      this.scheduleNextRun(state, state.task.initialDelayMs ?? 0);
    }
    console.log(`[TierPoller] started with ${this.states.size} task(s)`);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.stopping = true;

    // 예약된 timeout 전부 취소.
    for (const state of this.states.values()) {
      if (state.timerId) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }
      state.nextRunAt = null;
    }

    // 진행 중 execute가 있으면 완료 대기 (graceful).
    const inFlights = Array.from(this.states.values())
      .map((s) => s.inFlight)
      .filter((p): p is Promise<void> => p !== null);
    if (inFlights.length > 0) {
      console.log(`[TierPoller] stopping: ${inFlights.length}개 진행 중 작업 완료 대기`);
      await Promise.allSettled(inFlights);
    }

    this.started = false;
    this.stopping = false;
    console.log("[TierPoller] stopped");
  }

  getStatus(): PollStatus[] {
    return Array.from(this.states.values()).map((s) => ({
      taskId: s.task.id,
      tier: s.task.tier,
      intervalMs: s.task.intervalMs,
      lastRunAt: s.lastRunAt !== null ? new Date(s.lastRunAt).toISOString() : null,
      lastSuccess: s.lastSuccess,
      lastError: s.lastError,
      consecutiveFailures: s.consecutiveFailures,
      nextRunAt: s.nextRunAt !== null ? new Date(s.nextRunAt).toISOString() : null,
    }));
  }

  // ─── 내부 헬퍼 ─────────────────────────────────────

  private scheduleNextRun(state: TaskState, delayMs: number): void {
    if (this.stopping || !this.started) return;

    const delay = Math.max(0, delayMs);
    state.nextRunAt = Date.now() + delay;
    state.timerId = setTimeout(() => {
      void this.runTask(state);
    }, delay);
  }

  private async runTask(state: TaskState): Promise<void> {
    if (this.stopping || !this.started) return;

    state.timerId = null;
    state.lastRunAt = Date.now();
    const runPromise = this.executeWithGuard(state);
    state.inFlight = runPromise;

    try {
      await runPromise;
    } finally {
      state.inFlight = null;
      // 다음 tick 예약 — 중지 중이 아닐 때만.
      if (!this.stopping && this.started) {
        this.scheduleNextRun(state, state.task.intervalMs);
      }
    }
  }

  /** execute를 try/catch로 감싸 throw 차단 + 상태 업데이트. */
  private async executeWithGuard(state: TaskState): Promise<void> {
    try {
      await state.task.execute();
      state.lastSuccess = true;
      state.lastError = null;
      state.consecutiveFailures = 0;
    } catch (e) {
      state.lastSuccess = false;
      state.consecutiveFailures += 1;
      state.lastError = e instanceof Error ? e.message : String(e);
      console.error(
        `[TierPoller] task "${state.task.id}" 실패 (연속 ${state.consecutiveFailures}회): ${state.lastError}`,
      );
    }
  }
}

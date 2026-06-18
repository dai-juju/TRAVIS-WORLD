/**
 * autoSaveController 단위 테스트 (M2 테마 C Saved Views v2 Sub-step 3).
 *
 * 순수 엔진이라 React 없이 vi.useFakeTimers() 만으로 핵심 규약을 가드:
 *   debounce coalescing / 해시 멱등 / scratch 무시 / seeding / 재시도 / flush 안전망 /
 *   무한 루프 방지(저장 성공이 캔버스 미변경) / dispose.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  AutoSaveController,
  snapshotHash,
  type AutoSaveControllerDeps,
} from "@/lib/savedView/autoSaveController";
import type { SavedViewSnapshot } from "@/lib/savedView/schema";

const DEBOUNCE = 1500;
const RETRY_DELAY = 800;

/** 최소 스냅샷 — 해시는 JSON.stringify 라 형태만 맞으면 됨. */
function snap(zoom: number): SavedViewSnapshot {
  return { cards: [], viewport: { x: 0, y: 0, zoom } } as SavedViewSnapshot;
}

type Harness = {
  controller: AutoSaveController;
  patch: ReturnType<typeof vi.fn>;
  saveStates: Array<{ state: string; serverTs?: number }>;
  dirtyCount: () => number;
  setActiveId: (id: string | null) => void;
  setSnapshot: (s: SavedViewSnapshot) => void;
};

function makeHarness(overrides: Partial<AutoSaveControllerDeps> = {}): Harness {
  let activeId: string | null = "view-1";
  let current = snap(1);
  let dirty = 0;
  const saveStates: Array<{ state: string; serverTs?: number }> = [];

  const patch =
    overrides.patch !== undefined
      ? (overrides.patch as ReturnType<typeof vi.fn>)
      : vi.fn(async () => 1700_000_000_000);

  const controller = new AutoSaveController({
    getActiveViewId: () => activeId,
    getSnapshot: () => current,
    patch,
    onDirty: () => {
      dirty += 1;
    },
    onSaveState: (state, serverTs) => saveStates.push({ state, serverTs }),
    debounceMs: DEBOUNCE,
    maxRetries: 2,
    retryDelayMs: RETRY_DELAY,
    ...overrides,
  });

  return {
    controller,
    patch,
    saveStates,
    dirtyCount: () => dirty,
    setActiveId: (id) => {
      activeId = id;
    },
    setSnapshot: (s) => {
      current = s;
    },
  };
}

describe("snapshotHash", () => {
  it("동일 스냅샷 = 동일 해시 / 변경 시 다른 해시", () => {
    expect(snapshotHash(snap(1))).toBe(snapshotHash(snap(1)));
    expect(snapshotHash(snap(1))).not.toBe(snapshotHash(snap(2)));
  });
});

describe("AutoSaveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("활성 뷰 변경 → debounce 후 PATCH 1회 (saving → saved, keepalive off)", async () => {
    const h = makeHarness();
    h.setSnapshot(snap(2)); // 기본 lastSavedHash=null 이므로 변경으로 인식.
    h.controller.notifyChange();
    expect(h.patch).not.toHaveBeenCalled(); // 아직 debounce 중.
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(h.patch).toHaveBeenCalledTimes(1);
    // debounce 저장은 keepalive off (64KB 상한 회피).
    expect(h.patch).toHaveBeenCalledWith("view-1", snap(2), { keepalive: false });
    expect(h.saveStates.map((s) => s.state)).toEqual(["saving", "saved"]);
    expect(h.saveStates.at(-1)?.serverTs).toBe(1700_000_000_000);
  });

  it("debounce coalescing — 10회 변경(<debounce) → PATCH 1회 + dirty 보고 1회", async () => {
    const h = makeHarness();
    h.setSnapshot(snap(2));
    for (let i = 0; i < 10; i++) {
      h.controller.notifyChange();
      await vi.advanceTimersByTimeAsync(100); // 누적 1000ms < 1500.
    }
    expect(h.patch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(h.patch).toHaveBeenCalledTimes(1);
    // ★ 저사양 가드: 드래그 매 프레임이어도 onDirty 는 dirty-기간당 1회만(nextjs 🔴#1).
    expect(h.dirtyCount()).toBe(1);
  });

  it("scratch(활성 뷰 없음) → PATCH 0, dirty 0", async () => {
    const h = makeHarness();
    h.setActiveId(null);
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(h.patch).not.toHaveBeenCalled();
    expect(h.dirtyCount()).toBe(0);
  });

  it("해시 멱등 — seed 후 무변화 flush → PATCH 0 (idle)", async () => {
    const h = makeHarness();
    h.controller.seed(); // lastSavedHash = snap(1)
    h.controller.notifyChange(); // 변경 알림이지만 스냅샷은 그대로 snap(1)
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(h.patch).not.toHaveBeenCalled();
    expect(h.saveStates.map((s) => s.state)).toEqual(["idle"]);
  });

  it("seeding 후 실제 변경 → PATCH 1회", async () => {
    const h = makeHarness();
    h.controller.seed(); // 기준 = snap(1)
    h.setSnapshot(snap(3)); // 실제 변경.
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(h.patch).toHaveBeenCalledTimes(1);
    expect(h.patch).toHaveBeenCalledWith("view-1", snap(3), { keepalive: false });
  });

  it("flush 안전망 — debounce 만료 전 flush(pagehide) → 즉시 PATCH (keepalive on)", async () => {
    const h = makeHarness();
    h.setSnapshot(snap(2));
    h.controller.notifyChange();
    await h.controller.flush("pagehide");
    expect(h.patch).toHaveBeenCalledTimes(1);
    // 종료 flush 는 keepalive on (페이지 unload 중 전송 보장).
    expect(h.patch).toHaveBeenCalledWith("view-1", snap(2), { keepalive: true });
  });

  it("조용한 재시도 — 1회 실패 후 성공 → saved (error 없음)", async () => {
    const patch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(1700_000_000_001);
    const h = makeHarness({ patch });
    h.setSnapshot(snap(2));
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE); // 첫 시도(실패)
    await vi.advanceTimersByTimeAsync(RETRY_DELAY); // 재시도 대기 → 두번째(성공)
    expect(patch).toHaveBeenCalledTimes(2);
    const states = h.saveStates.map((s) => s.state);
    expect(states).toContain("saved");
    expect(states).not.toContain("error");
  });

  it("재시도 소진 — 계속 실패 → error 잔류, 절대 saved 아님 (불변식)", async () => {
    const patch = vi.fn().mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const h = makeHarness({ patch });
    h.setSnapshot(snap(2));
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY * 3); // 재시도 전부 소진.
    expect(patch).toHaveBeenCalledTimes(3); // 1 + maxRetries(2)
    const states = h.saveStates.map((s) => s.state);
    expect(states.at(-1)).toBe("error");
    expect(states).not.toContain("saved");
  });

  it("in-flight 중 새 변경 → 완료 후 재저장 (pendingAfterFlight, 유실 없음)", async () => {
    let resolveFirst: ((v: number) => void) | undefined;
    const patch = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<number>((r) => (resolveFirst = r)),
      )
      .mockResolvedValueOnce(2);
    const h = makeHarness({ patch });

    h.setSnapshot(snap(2));
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE); // flush → PATCH #1 (pending)
    expect(patch).toHaveBeenCalledTimes(1);

    // 진행 중 새 변경 — flush 가 inFlight 라 pendingAfterFlight 만 표시.
    h.setSnapshot(snap(3));
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(patch).toHaveBeenCalledTimes(1); // 아직 #1 진행 중.

    resolveFirst?.(1); // #1 완료 → pendingAfterFlight → 재무장.
    await vi.advanceTimersByTimeAsync(0); // 마이크로태스크 flush.
    await vi.advanceTimersByTimeAsync(DEBOUNCE); // 재무장된 debounce → PATCH #2.
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenLastCalledWith("view-1", snap(3), { keepalive: false });
  });

  it("dispose 중 in-flight 완료 → store 쓰기 차단 (좀비 방지, nextjs 🔴#2)", async () => {
    let resolveFirst: ((v: number) => void) | undefined;
    const patch = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<number>((r) => (resolveFirst = r)),
      );
    const h = makeHarness({ patch });

    h.setSnapshot(snap(2));
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE); // PATCH #1 pending, 'saving' 보고됨.
    h.controller.dispose();
    resolveFirst?.(5); // dispose 후 #1 완료.
    await vi.advanceTimersByTimeAsync(0);

    const states = h.saveStates.map((s) => s.state);
    expect(states).toContain("saving");
    expect(states).not.toContain("saved"); // dispose 후 store 쓰기 차단.
  });

  it("dispose 후 변경 무시 — PATCH 0", async () => {
    const h = makeHarness();
    h.controller.dispose();
    h.setSnapshot(snap(2));
    h.controller.notifyChange();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(h.patch).not.toHaveBeenCalled();
  });
});

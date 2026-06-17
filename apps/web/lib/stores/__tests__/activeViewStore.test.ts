/**
 * activeViewStore + activeViewStorage 단위 테스트 (M2 테마 C Saved Views v2 Sub-step 2).
 *
 * 자동 저장 훅(Sub-step 3)이 의존할 상태 전이 규약을 가드:
 *   setActive(동기화) / markDirty / markSaved / setActiveName / clearActive.
 * + localStorage 미러 헬퍼 round-trip(jsdom).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { createActiveViewStore } from "@/lib/stores/activeViewStore";
import {
  persistActiveViewId,
  readPersistedActiveViewId,
  ACTIVE_VIEW_STORAGE_KEY,
} from "@/lib/stores/activeViewStorage";

describe("activeViewStore 상태 전이", () => {
  it("기본 상태 = 활성 뷰 없음(scratch)", () => {
    const store = createActiveViewStore();
    const s = store.getState();
    expect(s.activeViewId).toBeNull();
    expect(s.activeViewName).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.lastSavedAt).toBeNull();
  });

  it("setActive → id/이름 설정 + 동기화 상태(dirty=false, lastSavedAt 기록)", () => {
    const store = createActiveViewStore();
    store.getState().setActive("view-1", "BTC quick check");
    const s = store.getState();
    expect(s.activeViewId).toBe("view-1");
    expect(s.activeViewName).toBe("BTC quick check");
    expect(s.dirty).toBe(false);
    expect(typeof s.lastSavedAt).toBe("number");
    expect(s.lastSavedAt as number).toBeGreaterThan(0);
  });

  it("markDirty → 미저장 표시", () => {
    const store = createActiveViewStore();
    store.getState().setActive("view-1", "v1");
    store.getState().markDirty();
    expect(store.getState().dirty).toBe(true);
  });

  it("markSaved → 동기화 복귀(dirty=false) + lastSavedAt 갱신", () => {
    const store = createActiveViewStore();
    store.getState().setActive("view-1", "v1");
    store.getState().markDirty();
    store.getState().markSaved();
    const s = store.getState();
    expect(s.dirty).toBe(false);
    expect(typeof s.lastSavedAt).toBe("number");
  });

  it("setActiveName → 이름만 갱신(id/dirty 무관)", () => {
    const store = createActiveViewStore();
    store.getState().setActive("view-1", "old name");
    store.getState().markDirty();
    store.getState().setActiveName("new name");
    const s = store.getState();
    expect(s.activeViewName).toBe("new name");
    expect(s.activeViewId).toBe("view-1");
    expect(s.dirty).toBe(true); // rename 은 dirty 에 무관
  });

  it("clearActive → 활성 뷰 해제(전부 초기화)", () => {
    const store = createActiveViewStore();
    store.getState().setActive("view-1", "v1");
    store.getState().markDirty();
    store.getState().clearActive();
    const s = store.getState();
    expect(s.activeViewId).toBeNull();
    expect(s.activeViewName).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.lastSavedAt).toBeNull();
  });
});

describe("activeViewStorage localStorage 미러", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persist → read round-trip", () => {
    persistActiveViewId("view-abc");
    expect(window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY)).toBe(
      "view-abc",
    );
    expect(readPersistedActiveViewId()).toBe("view-abc");
  });

  it("null persist → 키 제거 + read null", () => {
    persistActiveViewId("view-abc");
    persistActiveViewId(null);
    expect(window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY)).toBeNull();
    expect(readPersistedActiveViewId()).toBeNull();
  });

  it("미저장 상태 read = null", () => {
    expect(readPersistedActiveViewId()).toBeNull();
  });

  it("localStorage 예외(프라이빗 모드/쿼터) → graceful 무시(crash 금지)", () => {
    // 핵심 안전장치 검증: setItem/getItem 이 throw 해도 앱이 안 죽고 조용히 처리.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(() => persistActiveViewId("view-x")).not.toThrow();
    expect(readPersistedActiveViewId()).toBeNull(); // 실패 시 null 반환

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

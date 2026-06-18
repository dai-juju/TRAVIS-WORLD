/**
 * activeViewStore — "지금 작업 중인 저장 뷰" 세션 상태 (M2 테마 C Saved Views v2 Sub-step 2).
 *
 * 책임:
 *   현재 활성화된 저장 뷰의 id/이름 + 미저장 변경 여부(dirty) + 마지막 저장 시각만
 *   관리한다. 실제 카드/뷰포트는 canvasStore 가, 저장 뷰 CRUD 는 /api/views 가 담당.
 *   본 store 는 "어느 뷰를 보고 있고, 저장이 동기화됐나"라는 메타 상태 전담.
 *
 * 왜 별도 store 인가 (god store 금지 — uiShellStore 와 동일 근거):
 *   canvasStore(노드/뷰포트)에 끼워 넣으면 dirty 토글마다 캔버스 구독자가 재렌더된다.
 *   분리해 selective 구독으로 두면, "저장됨" 인디케이터만 갱신될 때 캔버스는 무영향.
 *   저사양 UHD620 에서 자동 저장(Sub-step 3) 중 캔버스 재렌더를 0 으로 유지하는 핵심.
 *
 * 왜 vanilla + Provider 패턴인가:
 *   toastStore / uiShellStore / canvasStore 와 동일 — Turbopack HMR module 중복
 *   로드 시 store 가 갈라지는 리스크를 Provider 의 useState lazy 단일 인스턴스로 차단.
 *
 * 영속 경계:
 *   activeViewId 는 localStorage 에 미러된다(새로고침 후 복원용) — 미러 쓰기는
 *   ActiveViewStoreProvider, 읽기/서버 재검증/캔버스 복원은 Sub-step 4(MyViews).
 *   본 store 자체는 순수(브라우저 API 비의존)라 테스트 용이.
 *
 * 상태 전이 (Sub-step 3/4 가 의존):
 *   - 뷰 로드/저장 직후 → setActive(id, name): 서버와 동기화된 상태(dirty=false).
 *   - 캔버스 변경 발생   → markDirty(): 미저장 변경 있음.
 *   - 자동 저장 성공     → markSaved(): 다시 동기화(dirty=false, lastSavedAt 갱신).
 *   - rename 성공        → setActiveName(name): 이름만 갱신(dirty 무관).
 *   - New view / scratch → clearActive(): 활성 뷰 없음(휘발 캔버스).
 */

import { createStore } from "zustand/vanilla";

/**
 * 자동 저장 생명주기 상태 (Sub-step 3 자동 저장 훅이 산출 → Sub-step 4 인디케이터가 소비).
 *   - idle  : 활성 뷰가 없거나(scratch), 활성 뷰가 서버와 동기화돼 쉬는 중.
 *   - saving: PATCH 진행 중.
 *   - saved : 방금 저장 성공 (Sub-step 4 에서 "Saved ✓" 잠깐 뜨고 페이드).
 *   - error : 재시도 소진 후 저장 실패 (★ 잔류 — 실제 실패 중엔 절대 saved 금지, crypto-trader).
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export type ActiveViewState = {
  /** 현재 활성 저장 뷰 id. null = scratch(미저장 휘발 캔버스). */
  activeViewId: string | null;
  /** 활성 뷰 이름(표시/강조용). activeViewId 와 함께만 의미. */
  activeViewName: string | null;
  /** 마지막 저장 이후 미저장 변경이 있는가. */
  dirty: boolean;
  /** 마지막 성공 저장 시각(epoch ms). "saved" 인디케이터용. null = 미저장. */
  lastSavedAt: number | null;
  /** 자동 저장 생명주기 상태. */
  saveState: SaveState;
};

export type ActiveViewActions = {
  /**
   * 뷰 진입(로드/저장 직후) — 서버 동기화 상태로 설정.
   * @param lastSavedAt 서버 시각(epoch ms). 로드/저장 응답의 updated_at/created_at 을
   *   넘기면 클라 Date.now() 의 "약한 거짓"(site=DB 정신 위배)을 피한다. 없으면 now.
   */
  setActive: (id: string, name: string, lastSavedAt?: number) => void;
  /** rename 성공 후 이름만 갱신(dirty 무관). */
  setActiveName: (name: string) => void;
  /** New view / scratch — 활성 뷰 해제. */
  clearActive: () => void;
  /** 캔버스 변경 발생 — 미저장 표시. (이미 dirty 면 값 동일 → selective 구독 무영향) */
  markDirty: () => void;
  /**
   * 자동 저장 성공 — 동기화 복귀(dirty=false, saveState='saved').
   * @param serverTs PATCH 응답 updated_at(epoch ms). 없으면 클라 now.
   */
  markSaved: (serverTs?: number) => void;
  /** 자동 저장 생명주기 상태만 갱신(saving/error/idle). saved 는 markSaved 가 담당. */
  setSaveState: (state: SaveState) => void;
};

export type ActiveViewStore = ActiveViewState & ActiveViewActions;

export const defaultActiveViewState: ActiveViewState = {
  activeViewId: null,
  activeViewName: null,
  dirty: false,
  lastSavedAt: null,
  saveState: "idle",
};

/**
 * 스토어 factory — ActiveViewStoreProvider 가 useState lazy 로 단 한 번 생성한다.
 */
export const createActiveViewStore = (
  initState: ActiveViewState = defaultActiveViewState,
) => {
  return createStore<ActiveViewStore>()((set) => ({
    ...initState,

    setActive: (id, name, lastSavedAt) =>
      set({
        activeViewId: id,
        activeViewName: name,
        dirty: false,
        lastSavedAt: lastSavedAt ?? Date.now(),
        // 뷰 진입은 "저장됨" 플래시 대상이 아님 — 동기화된 휴지 상태(idle).
        saveState: "idle",
      }),

    setActiveName: (name) => set({ activeViewName: name }),

    clearActive: () =>
      set({
        activeViewId: null,
        activeViewName: null,
        dirty: false,
        lastSavedAt: null,
        saveState: "idle",
      }),

    // dirty=true 로만 설정 — 이미 true 면 Object.is(true,true) 로 selective 구독 무영향.
    markDirty: () => set({ dirty: true }),

    markSaved: (serverTs) =>
      set({ dirty: false, lastSavedAt: serverTs ?? Date.now(), saveState: "saved" }),

    setSaveState: (saveState) => set({ saveState }),
  }));
};

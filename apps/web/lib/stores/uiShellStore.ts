/**
 * uiShellStore — UI 셸 패널 개폐 상태 (M2 테마 C Step 0).
 *
 * 책임:
 *   좌측 "My Views"(저장 뷰 목록) / 우측 "Session Log"(세션 채팅·AI 로그) 두
 *   패널의 열림/닫힘 boolean 만 관리. 패널의 *내용*(저장 뷰 CRUD, 로그 렌더)은
 *   각각 테마 C Step 2 / Step 3 에서 채운다. Step 0 은 골격만.
 *
 * 왜 별도 store 인가:
 *   canvasStore(노드/뷰포트) · chatStore(쿼리 히스토리) 와 관심사가 다르다.
 *   셸 개폐는 캔버스/채팅 상태에 의존하지 않으므로 분리해 selective 구독으로
 *   캔버스 재렌더를 0 으로 유지한다 (CanvasInner 는 uiShell 을 구독하지 않음).
 *
 * 왜 vanilla + Provider 패턴인가:
 *   toastStore / canvasStore 와 동일 — Turbopack HMR 에서 module 중복 로드 시
 *   store 인스턴스가 갈라지는 리스크를 Provider 의 useState lazy 단일 인스턴스로
 *   구조적으로 차단.
 *
 * 영속 경계 (테마 C Step 1+ 연계):
 *   현재는 세션 스코프(비영속) — 새로고침 시 둘 다 닫힘으로 초기화. 향후 "패널
 *   개폐 상태를 새로고침 후에도 유지" 요구가 오면 leftOpen/rightOpen 이
 *   user_preferences 직렬화 대상이 될 수 있어, state shape 를 boolean 평면으로
 *   유지한다 (직렬화 깔끔).
 *
 * API:
 *   toggleLeft() / toggleRight() : 현재 상태 반전
 *   setLeft(open) / setRight(open): 명시적 지정 (ESC 닫기, 단일 패널 정책 등)
 */

import { createStore } from "zustand/vanilla";

export type UiShellState = {
  /** 좌측 "My Views" 패널 열림 여부. 기본 닫힘. */
  leftOpen: boolean;
  /** 우측 "Session Log" 패널 열림 여부. 기본 닫힘. */
  rightOpen: boolean;
};

export type UiShellActions = {
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeft: (open: boolean) => void;
  setRight: (open: boolean) => void;
};

export type UiShellStore = UiShellState & UiShellActions;

export const defaultUiShellState: UiShellState = {
  leftOpen: false,
  rightOpen: false,
};

/**
 * 스토어 factory — UiShellStoreProvider 가 useState lazy 로 단 한 번 생성한다.
 */
export const createUiShellStore = (
  initState: UiShellState = defaultUiShellState,
) => {
  return createStore<UiShellStore>()((set) => ({
    ...initState,

    toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
    toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
    setLeft: (open) => set({ leftOpen: open }),
    setRight: (open) => set({ rightOpen: open }),
  }));
};

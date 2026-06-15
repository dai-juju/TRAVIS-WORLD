/**
 * uiShellStore — UI 셸 패널 개폐 상태 (M2 테마 C Step 0).
 *
 * 책임:
 *   좌측 "My Views"(저장 뷰 목록) 패널의 열림/닫힘 boolean 만 관리. 패널의
 *   *내용*(저장 뷰 CRUD)은 테마 C Step 2 에서 채운다. Step 0 은 골격만.
 *
 *   ★ 우측 "Session Log" 패널은 2026-06-15 사용자 결정으로 폐기 — 채팅 복기는
 *   트레이더 워크플로에 중요도 낮다는 판단(crypto-trader 의 "신뢰 자산" 자문과
 *   의견 갈림, 제품 판단 사용자 존중). 셸은 좌측 단일 패널 구조. 폐기 이력 →
 *   docs/task-record/M2-themeC-ui-shell.md §3.
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
 *   현재는 세션 스코프(비영속) — 새로고침 시 닫힘으로 초기화. 향후 "패널 개폐
 *   상태를 새로고침 후에도 유지" 요구가 오면 leftOpen 이 user_preferences
 *   직렬화 대상이 될 수 있어, state shape 를 boolean 평면으로 유지한다.
 *
 * API:
 *   toggleLeft()  : 현재 상태 반전
 *   setLeft(open) : 명시적 지정 (ESC 닫기 등, `[10-41]`)
 */

import { createStore } from "zustand/vanilla";

export type UiShellState = {
  /** 좌측 "My Views" 패널 열림 여부. 기본 닫힘. */
  leftOpen: boolean;
};

export type UiShellActions = {
  toggleLeft: () => void;
  setLeft: (open: boolean) => void;
};

export type UiShellStore = UiShellState & UiShellActions;

export const defaultUiShellState: UiShellState = {
  leftOpen: false,
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
    setLeft: (open) => set({ leftOpen: open }),
  }));
};

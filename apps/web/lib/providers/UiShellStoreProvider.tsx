"use client";
/**
 * UI 셸 스토어 Provider — Zustand vanilla + React Context (M2 테마 C Step 0).
 *
 * 역할:
 *   - createUiShellStore() 인스턴스를 useState lazy 로 단 한 번 생성
 *   - Context 로 하위 트리(셸 패널/rail, CanvasWorkspace)에 주입
 *   - useUiShellStore(selector) 훅으로 selective 구독 노출
 *
 * 왜 toastStore/canvasStore Provider 패턴을 복제했나:
 *   module-level create() 는 Turbopack HMR 중복 로드 시 store 가 갈라질 수 있다.
 *   useState lazy initializer 는 단일 인스턴스를 보장하고 Context 로 명시 공유 —
 *   module 로드 횟수에 영향받지 않는다. 동일 템플릿으로 유지보수 비용 최소화.
 *
 * 왜 throw 인가:
 *   Provider 없이 호출되면 명백한 프로그래머 에러 — graceful fallback 대상이
 *   아니고 개발 중 즉시 발견되는 게 안전하다 (production 은 layout.tsx 고정 마운트).
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createUiShellStore,
  type UiShellStore,
} from "@/lib/stores/uiShellStore";

type UiShellStoreApi = ReturnType<typeof createUiShellStore>;

const UiShellStoreContext = createContext<UiShellStoreApi | undefined>(
  undefined,
);

/**
 * React 19 호환 패턴: useState lazy initializer (useRef + null 체크는 React 19
 * `react-hooks/refs` 룰 위반). factory 가 순수해 Strict Mode 이중 호출도 무해.
 */
export const UiShellStoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState<UiShellStoreApi>(() => createUiShellStore());

  return (
    <UiShellStoreContext.Provider value={store}>
      {children}
    </UiShellStoreContext.Provider>
  );
};

/**
 * UI 셸 스토어 selective 구독 훅.
 *
 * @example
 *   const leftOpen = useUiShellStore((s) => s.leftOpen);
 *   const toggleLeft = useUiShellStore((s) => s.toggleLeft);
 */
export const useUiShellStore = <T,>(
  selector: (store: UiShellStore) => T,
): T => {
  const ctx = useContext(UiShellStoreContext);
  if (!ctx) {
    throw new Error(
      "useUiShellStore must be used within UiShellStoreProvider",
    );
  }
  return useStore(ctx, selector);
};

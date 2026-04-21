"use client";
/**
 * 토스트 스토어 Provider — Zustand v5 vanilla + React Context (M1.4 Step 4-1).
 *
 * 역할:
 *   - createToastStore() 인스턴스를 useState lazy 로 단 한 번 생성
 *   - Context 로 하위 트리에 주입
 *   - useToastStore(selector) 훅으로 selective 구독 노출
 *
 * 왜 CanvasStoreProvider 패턴을 복제했나 (Step 3 Undo 미렌더 회고, 2026-04-22):
 *   이전 module-level create() 는 Turbopack HMR 환경에서 module 이 중복 로드될
 *   때 store 인스턴스가 두 개로 갈라질 수 있었다. UndoToast 가 구독하는 store
 *   와 CardContainer 가 show() 를 호출하는 store 가 달라지면 토스트가 DOM 에
 *   나타나지 않는다. Provider 패턴은 useState lazy initializer 로 단일 인스턴스
 *   를 보장하고, Context 로 명시적으로 공유한다 — module 로드 횟수에 영향 받지
 *   않는다. canvasStore 와 동일 템플릿을 사용해 유지보수 비용을 최소화.
 *
 * 왜 throw 를 하는가:
 *   Provider 없이 호출되면 명백한 프로그래머 에러. graceful fallback 대상이
 *   아니고, 개발 중에 즉시 발견되는 것이 오히려 안전 (production 빌드에서는
 *   Provider 가 layout.tsx 에 고정 마운트되어 있어 발생 불가).
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createToastStore, type ToastStore } from "@/lib/stores/toastStore";

type ToastStoreApi = ReturnType<typeof createToastStore>;

const ToastStoreContext = createContext<ToastStoreApi | undefined>(undefined);

/**
 * React 19 호환 패턴:
 *   useState lazy initializer 를 사용 — useRef + null 체크는 React 19 의
 *   `react-hooks/refs` 룰이 render 중 ref.current 접근을 금지해 경고가 뜬다.
 *   factory 가 순수(side-effect 없음) 하므로 Strict Mode 이중 호출도 무해.
 */
export const ToastStoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState<ToastStoreApi>(() => createToastStore());

  return <ToastStoreContext.Provider value={store}>{children}</ToastStoreContext.Provider>;
};

/**
 * 토스트 스토어 selective 구독 훅.
 *
 * @example
 *   const show = useToastStore((s) => s.show);
 *   const toasts = useToastStore((s) => s.toasts);
 */
export const useToastStore = <T,>(selector: (store: ToastStore) => T): T => {
  const ctx = useContext(ToastStoreContext);
  if (!ctx) {
    throw new Error("useToastStore must be used within ToastStoreProvider");
  }
  return useStore(ctx, selector);
};

/**
 * 이벤트 핸들러 안에서 hook 우회 없이 action 을 호출해야 할 때 사용.
 *   React 훅 규칙상 `useToastStore((s) => s.show)(...)` 만 쓰면 리렌더가 과도하게
 *   유발될 수 있는데, 한 번 메모된 action 함수를 부모 컴포넌트가 먼저 선언해
 *   이벤트 핸들러에 주입하는 패턴을 유지. Context 객체를 직접 주입하는 대안도
 *   가능하지만 컴포넌트가 여러 개인 경우 hook 경로가 더 명료하다.
 */
export const useToastApi = () => {
  const ctx = useContext(ToastStoreContext);
  if (!ctx) {
    throw new Error("useToastApi must be used within ToastStoreProvider");
  }
  return ctx;
};

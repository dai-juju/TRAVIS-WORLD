"use client";
/**
 * 캔버스 스토어 Provider — Zustand v5 공식 Next.js 패턴 (@M1.4 Step 1).
 *
 * 역할:
 *   - createCanvasStore() 인스턴스를 useRef 로 단 한 번 생성
 *   - Context 를 통해 하위 트리에 주입
 *   - useCanvasStore(selector) 훅을 export 하여 selective 구독 지원
 *
 * 왜 useRef + null 비교 패턴인가:
 *   useState(() => createStore()) 는 Strict Mode 에서 init 함수가 두 번 호출돼
 *   store 가 두 번 만들어질 수 있다. useRef + lazy check 가 공식 권장 형태.
 *
 * 왜 throw 를 하는가:
 *   Provider 없이 호출되면 정적 에러를 빨리 띄우는 게 디버깅에 유리.
 *   런타임 crash 지만 "개발 단계에서 Provider 누락" 은 명백한 프로그래머 에러라
 *   graceful 처리 대상이 아니다 (production 에서는 발생 불가).
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createCanvasStore, type CanvasStore } from "@/lib/stores/canvasStore";

type CanvasStoreApi = ReturnType<typeof createCanvasStore>;

const CanvasStoreContext = createContext<CanvasStoreApi | undefined>(undefined);

/**
 * React 19 호환 패턴:
 *   Zustand 공식 Next.js 가이드의 useRef + null 체크 패턴은 React 18 기준으로,
 *   React 19 `react-hooks/refs` 룰이 render 중 ref.current 접근을 금지한다.
 *   → 대안으로 useState lazy initializer 를 사용한다.
 *     (1) 초기화는 최초 1회만 — factory 비용 중복 제거
 *     (2) Strict Mode 이중 호출은 factory 가 순수(side-effect 없음) 하므로 무해.
 *         두번째로 만들어진 store 는 미사용되며 GC 된다.
 */
export const CanvasStoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState<CanvasStoreApi>(() => createCanvasStore());

  return <CanvasStoreContext.Provider value={store}>{children}</CanvasStoreContext.Provider>;
};

/**
 * 캔버스 스토어 selective 구독 훅.
 *
 * @example
 *   const nodes = useCanvasStore((s) => s.nodes);
 *   const addNode = useCanvasStore((s) => s.addNode);
 */
export const useCanvasStore = <T,>(selector: (store: CanvasStore) => T): T => {
  const ctx = useContext(CanvasStoreContext);
  if (!ctx) {
    throw new Error("useCanvasStore must be used within CanvasStoreProvider");
  }
  return useStore(ctx, selector);
};

"use client";
/**
 * 활성 뷰 스토어 Provider — Zustand vanilla + React Context
 *   (M2 테마 C Saved Views v2 Sub-step 2).
 *
 * 역할:
 *   - createActiveViewStore() 인스턴스를 useState lazy 로 단 한 번 생성
 *   - Context 로 하위 트리(MyViews, 자동 저장 훅)에 주입
 *   - useActiveViewStore(selector) 훅으로 selective 구독 노출
 *   - activeViewId 변경 시 localStorage 미러에 기록(새로고침 후 복원용)
 *
 * 왜 uiShellStore/toastStore Provider 패턴을 복제했나:
 *   module-level create() 는 Turbopack HMR 중복 로드 시 store 가 갈라질 수 있다.
 *   useState lazy initializer 는 단일 인스턴스를 보장하고 Context 로 명시 공유.
 *
 * localStorage 미러를 useEffect 에 둔 이유:
 *   useEffect 는 클라이언트 전용이라 SSR(localStorage 미정의) 안전. 초기값을
 *   localStorage 에서 읽지 *않는* 이유 = hydration mismatch(서버 null vs 클라
 *   저장 id) 회피. 복원(읽기+서버 재검증+캔버스 로드)은 Sub-step 4 가 명시 수행.
 *
 * 왜 throw 인가 (uiShellStore 패턴 동일):
 *   Provider 없이 useActiveViewStore 를 호출하면 명백한 프로그래머 에러 — graceful
 *   fallback 대상이 아니고 개발 중 즉시 발견되는 게 안전(production 은 layout.tsx
 *   고정 마운트). CLAUDE.md "crash 금지"의 예외 — 사용자 입력이 아닌 배선 실수.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import {
  createActiveViewStore,
  type ActiveViewStore,
} from "@/lib/stores/activeViewStore";
import { persistActiveViewId } from "@/lib/stores/activeViewStorage";

type ActiveViewStoreApi = ReturnType<typeof createActiveViewStore>;

const ActiveViewStoreContext = createContext<ActiveViewStoreApi | undefined>(
  undefined,
);

export const ActiveViewStoreProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [store] = useState<ActiveViewStoreApi>(() => createActiveViewStore());

  // localStorage 미러 — activeViewId 가 바뀔 때만 기록(dirty/lastSavedAt 변경엔 무반응).
  //   subscribe 는 전체 상태 변경마다 발화하므로 prevId 비교로 id 변경만 필터.
  useEffect(() => {
    let prevId = store.getState().activeViewId;
    persistActiveViewId(prevId); // 마운트 시 1회 동기화
    const unsubscribe = store.subscribe((state) => {
      if (state.activeViewId !== prevId) {
        prevId = state.activeViewId;
        persistActiveViewId(prevId);
      }
    });
    return unsubscribe;
  }, [store]);

  return (
    <ActiveViewStoreContext.Provider value={store}>
      {children}
    </ActiveViewStoreContext.Provider>
  );
};

/**
 * 활성 뷰 스토어 selective 구독 훅.
 *
 * @example
 *   const activeViewId = useActiveViewStore((s) => s.activeViewId);
 *   const markDirty = useActiveViewStore((s) => s.markDirty);
 */
export const useActiveViewStore = <T,>(
  selector: (store: ActiveViewStore) => T,
): T => {
  const ctx = useContext(ActiveViewStoreContext);
  if (!ctx) {
    throw new Error(
      "useActiveViewStore must be used within ActiveViewStoreProvider",
    );
  }
  return useStore(ctx, selector);
};

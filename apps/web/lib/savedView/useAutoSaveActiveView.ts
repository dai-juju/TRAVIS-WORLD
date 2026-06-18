"use client";
/**
 * useAutoSaveActiveView — 활성 뷰 자동 저장 훅 (M2 테마 C Saved Views v2 Sub-step 3).
 *
 * AutoSaveController(순수 엔진)를 React 생명주기에 배선한다:
 *   - canvasStore 비반응 구독(nodes/viewport 변경) → controller.notifyChange()
 *   - activeViewStore 비반응 구독(activeViewId 변경) → controller.seed()
 *   - PATCH fetch(keepalive) 주입
 *   - 저장 상태 보고를 activeViewStore(setSaveState/markSaved/markDirty)로 연결
 *   - flush 안전망: visibilitychange(hidden) / pagehide / 언마운트 (sessionFlusher 패턴)
 *
 * 저사양(UHD620) 핵심: store api 의 getState()/subscribe() 로만 다뤄 이 훅은 절대 리렌더
 *   되지 않는다(selective 구독조차 아님 = 컴포넌트 렌더 0). 직렬화는 debounce 만료 시 1회만.
 */
import { useEffect } from "react";

import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import { useActiveViewStoreApi } from "@/lib/providers/ActiveViewStoreProvider";
import { serializeCanvas } from "@/lib/savedView/serialize";
import {
  AutoSaveController,
  AUTO_SAVE_DEBOUNCE_MS,
} from "@/lib/savedView/autoSaveController";

export function useAutoSaveActiveView(): void {
  const canvasApi = useCanvasStoreApi();
  const activeApi = useActiveViewStoreApi();

  useEffect(() => {
    const controller = new AutoSaveController({
      getActiveViewId: () => activeApi.getState().activeViewId,
      getSnapshot: () => {
        const { nodes, viewport } = canvasApi.getState();
        return serializeCanvas({ nodes, viewport });
      },
      patch: async (id, snapshot, { keepalive }) => {
        const res = await fetch(`/api/views?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot }),
          credentials: "include", // 쿠키 세션 → proxy/RLS 인증.
          // keepalive 는 종료 flush 에서만(64KB 상한). 평상시 debounce 저장은 끔.
          keepalive,
        });
        if (!res.ok) throw new Error(`PATCH /api/views ${res.status}`);
        // 서버 updated_at 을 lastSavedAt 으로 (site=DB 정신 — 클라 now 의 약한 거짓 제거).
        const data = (await res.json().catch(() => null)) as {
          view?: { updated_at?: string };
        } | null;
        const updatedAt = data?.view?.updated_at;
        return updatedAt ? Date.parse(updatedAt) : null;
      },
      onDirty: () => activeApi.getState().markDirty(),
      onSaveState: (state, serverTs) => {
        const s = activeApi.getState();
        if (state === "saved") s.markSaved(serverTs);
        else s.setSaveState(state);
      },
      debounceMs: AUTO_SAVE_DEBOUNCE_MS,
    });

    // ── 1) 캔버스 변경 구독 (nodes/viewport 만 — serialize 대상과 일치) ──
    // zustand subscribe 가 주는 prevState 로 직접 비교 — 외부 mutable 변수 제거(위생).
    const unsubscribeCanvas = canvasApi.subscribe((state, prev) => {
      if (state.nodes !== prev.nodes || state.viewport !== prev.viewport) {
        controller.notifyChange();
      }
    });

    // ── 2) 활성 뷰 id 변경 구독 (seeding — 첫 변경 발화 멱등) ──
    // 마운트 시 이미 활성 뷰가 있으면 즉시 seed (Sub-step 4 복원 대비).
    controller.seed();
    const unsubscribeActive = activeApi.subscribe((state, prev) => {
      if (state.activeViewId !== prev.activeViewId) {
        controller.seed();
      }
    });

    // ── 3) flush 안전망 (탭 전환 / 페이지 종료) ──
    const handleVisibility = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        void controller.flush("visibility");
      }
    };
    const handlePageHide = (): void => {
      void controller.flush("pagehide");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      unsubscribeCanvas();
      unsubscribeActive();
      void controller.flush("unmount"); // 언마운트 직전 마지막 변경 저장.
      controller.dispose();
    };
  }, [canvasApi, activeApi]);
}

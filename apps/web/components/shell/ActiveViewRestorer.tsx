"use client";
/**
 * ActiveViewRestorer — 새로고침 후 활성 뷰 자동 복원 (M2 테마 C Saved Views v2 Sub-step 5).
 *
 * ChatGPT/Claude 가 새로고침해도 마지막 대화를 자동으로 여는 것과 동일:
 *   마운트 시 localStorage 미러(activeViewStorage)에서 마지막 활성 뷰 id 를 읽어,
 *   서버에서 GET 으로 재검증(RLS = 본인 소유만) → 카드/뷰포트 복원 → 활성 뷰로 설정.
 *
 * 화면에 아무것도 그리지 않는다(null 렌더). CanvasShell 안(CanvasStoreProvider +
 *   ActiveViewStoreProvider + AuthSessionProvider 스코프)에 AutoSaveActiveView 와 나란히
 *   배치한다.
 *
 * 안전 장치:
 *   - 인증 확인 끝나고 로그인된 경우에만 1회 실행(didRun ref) — 비로그인 GET 401 회피.
 *   - 캔버스에 이미 카드가 있으면 복원 생략(사용자가 막 만든 작업 보호).
 *   - GET 404(삭제됨)/검증 실패 → clearActive(미러 키도 정리) → 빈 캔버스 유지.
 *   - 모든 실패 graceful(try/catch) — 복원 실패가 앱을 멈추지 않는다(CLAUDE.md).
 *
 * ★ 복원 순서(자동 저장과의 정합): loadNodes/requestViewport 먼저 → setActive 나중.
 *   setActive 가 활성 전환을 알리면 자동 저장 훅이 "방금 복원한 캔버스"를 저장 기준
 *   해시로 심어(seed), 복원이 일으킨 첫 캔버스 변경을 멱등 처리한다(거짓 PATCH 방지).
 */
import { useEffect, useRef } from "react";

import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import { useActiveViewStoreApi } from "@/lib/providers/ActiveViewStoreProvider";
import { useAuthSession } from "@/lib/providers/AuthSessionProvider";
import { hydrateSnapshot } from "@/lib/savedView/serialize";
import { readPersistedActiveViewId } from "@/lib/stores/activeViewStorage";

export function ActiveViewRestorer(): null {
  const canvasApi = useCanvasStoreApi();
  const activeApi = useActiveViewStoreApi();
  const { email, loading } = useAuthSession();
  // 1회 실행 가드 — StrictMode 더블 마운트/auth 재발화에도 복원은 한 번만.
  const didRun = useRef(false);

  useEffect(() => {
    if (loading || !email || didRun.current) return;
    didRun.current = true;

    const id = readPersistedActiveViewId();
    if (!id) return; // 복원할 활성 뷰 없음 — scratch 로 시작.
    // 캔버스에 이미 카드가 있으면 사용자 작업 보호 — 복원 생략.
    if (canvasApi.getState().nodes.length > 0) return;

    void (async () => {
      try {
        const res = await fetch(`/api/views?id=${encodeURIComponent(id)}`);
        if (!res.ok) {
          // 404(삭제됨)/401 등 — 활성 해제(localStorage 키도 정리됨).
          activeApi.getState().clearActive();
          return;
        }
        const { view } = (await res.json()) as {
          view: {
            id: string;
            name: string;
            cards_config: unknown;
            canvas_state: unknown;
            updated_at?: string;
          };
        };
        const result = hydrateSnapshot({
          cards: view.cards_config,
          viewport: view.canvas_state,
        });
        if (!result) {
          activeApi.getState().clearActive();
          return;
        }
        // 복원 동안 사용자가 이미 카드를 만들었으면 덮어쓰지 않는다(레이스 보호).
        if (canvasApi.getState().nodes.length > 0) return;

        const { loadNodes, requestViewport } = canvasApi.getState();
        loadNodes(result.nodes);
        requestViewport(result.viewport);
        const ts = view.updated_at ? Date.parse(view.updated_at) : undefined;
        activeApi.getState().setActive(view.id, view.name, ts);
      } catch {
        // graceful — 복원 실패 시 빈 캔버스 유지(앱 동작 영향 없음).
      }
    })();
  }, [loading, email, canvasApi, activeApi]);

  return null;
}

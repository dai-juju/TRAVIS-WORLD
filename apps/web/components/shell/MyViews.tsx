"use client";
/**
 * MyViews — 좌측 패널 하단 "저장 뷰" 영역 (M2 테마 C Step 2 Sub-step 3).
 *
 * 기능 (사용자 확정 UIUX 2026-06-16):
 *   - 저장: "Save current view" → 인라인 이름 입력(모달 없음) → POST /api/save-view.
 *   - 목록: 본인 뷰 최신순. 행 클릭 = 복원, 휴지통 = 삭제(확인 후).
 *   - 복원: 현재 캔버스에 카드가 있으면 확인 후 교체(loadNodes + requestViewport).
 *
 * 비반응 읽기:
 *   useCanvasStoreApi().getState() 로 nodes/viewport 를 저장 시점에만 읽어,
 *   캔버스 드래그/갱신마다 이 패널이 리렌더되지 않게 한다.
 *
 * 인증:
 *   비로그인 = 안내만(상단 계정 영역이 Sign in 입구). API 는 401 로도 방어.
 *
 * 에러 graceful:
 *   모든 실패는 crash 없이 인라인 notice 로 (CLAUDE.md). 영어 카피(글로벌 타겟).
 */
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import { useActiveViewStoreApi } from "@/lib/providers/ActiveViewStoreProvider";
import { useAuthSession } from "@/lib/providers/AuthSessionProvider";
import { serializeCanvas, hydrateSnapshot } from "@/lib/savedView/serialize";
import { SAVED_VIEW_NAME_MAX } from "@/lib/savedView/schema";

type ViewListItem = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type Status = "loading" | "ready" | "error" | "unauthenticated";

export function MyViews() {
  const api = useCanvasStoreApi();
  // 활성 뷰 설정(비반응) — 저장/로드 성공 시점에만 호출. 자동 저장 훅(Sub-step 3)이
  //   activeViewId 를 보고 이 뷰에 변경을 자동 저장한다. UI 표시는 Sub-step 4.
  const activeApi = useActiveViewStoreApi();
  const { email, loading: authLoading } = useAuthSession();

  const [views, setViews] = useState<ViewListItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [saveMode, setSaveMode] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  // 로드/삭제 in-flight 가드 — 느린 네트워크 연타 시 중복 요청 차단(code-reviewer S1).
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchViews = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/views");
      if (res.status === 401) {
        setStatus("unauthenticated");
        setViews([]);
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as { views?: ViewListItem[] };
      setViews(Array.isArray(data.views) ? data.views : []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (authLoading) return; // 세션 확인 끝나기 전엔 보류.
    if (!email) {
      setStatus("unauthenticated");
      setViews([]);
      return;
    }
    void fetchViews();
  }, [authLoading, email, fetchViews]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    const { nodes, viewport } = api.getState();
    if (nodes.length === 0) {
      setNotice("Add a card before saving a view.");
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const snapshot = serializeCanvas({ nodes, viewport });
      const res = await fetch("/api/save-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, snapshot }),
      });
      if (!res.ok) {
        setNotice(
          res.status === 413
            ? "This view is too large to save."
            : "Couldn't save the view. Please try again.",
        );
        return;
      }
      // 저장한 뷰를 활성 뷰로 — 이후 캔버스 변경이 이 뷰에 자동 저장된다.
      //   응답 view.id 사용. created_at = 서버 시각(lastSavedAt 기준, site=DB 정신).
      const saved = (await res.json().catch(() => null)) as {
        view?: { id: string; name: string; created_at?: string };
      } | null;
      if (saved?.view?.id) {
        const ts = saved.view.created_at
          ? Date.parse(saved.view.created_at)
          : undefined;
        activeApi.getState().setActive(saved.view.id, saved.view.name, ts);
      }
      setName("");
      setSaveMode(false);
      await fetchViews();
    } catch {
      setNotice("Couldn't save the view. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [name, saving, api, activeApi, fetchViews]);

  const handleLoad = useCallback(
    async (view: ViewListItem) => {
      if (busy) return;
      const { nodes: current } = api.getState();
      if (
        current.length > 0 &&
        !window.confirm(
          `Load "${view.name}"? This will replace your current canvas.`,
        )
      ) {
        return;
      }
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(`/api/views?id=${encodeURIComponent(view.id)}`);
        if (!res.ok) {
          setNotice("Couldn't load the view. Please try again.");
          return;
        }
        const { view: full } = (await res.json()) as {
          view: {
            cards_config: unknown;
            canvas_state: unknown;
            updated_at?: string;
          };
        };
        const result = hydrateSnapshot({
          cards: full.cards_config,
          viewport: full.canvas_state,
        });
        if (!result) {
          setNotice("This view can't be loaded (data is invalid).");
          return;
        }
        const { loadNodes, requestViewport } = api.getState();
        loadNodes(result.nodes);
        requestViewport(result.viewport);
        // ★ 활성 뷰 설정은 loadNodes/requestViewport 후 — 자동 저장 훅이 활성 전환을
        //   감지해 "방금 로드한 캔버스"를 저장 기준(해시)으로 심는다(첫 발화 멱등).
        //   updated_at = 서버 시각(lastSavedAt 기준).
        const ts = full.updated_at ? Date.parse(full.updated_at) : undefined;
        activeApi.getState().setActive(view.id, view.name, ts);
        setNotice(
          result.skipped > 0
            ? `Loaded. ${result.skipped} card(s) couldn't be restored (no longer available).`
            : null,
        );
      } catch {
        setNotice("Couldn't load the view. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [api, activeApi, busy],
  );

  const handleDelete = useCallback(
    async (view: ViewListItem) => {
      if (busy) return;
      if (!window.confirm(`Delete "${view.name}"?`)) return;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(
          `/api/views?id=${encodeURIComponent(view.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          setNotice("Couldn't delete the view. Please try again.");
          return;
        }
        // 활성 뷰를 지웠으면 활성 해제 — 자동 저장이 삭제된 row 에 PATCH(404) 하지 않도록.
        if (activeApi.getState().activeViewId === view.id) {
          activeApi.getState().clearActive();
        }
        await fetchViews();
      } catch {
        setNotice("Couldn't delete the view. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, activeApi, fetchViews],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
        My Views
      </h2>

      {status === "unauthenticated" ? (
        <p className="font-sans text-[12px] leading-relaxed text-foreground/40">
          Sign in to save your canvas layouts and reload them later.
        </p>
      ) : (
        <>
          {/* 저장: 버튼 ↔ 인라인 이름 입력 */}
          {saveMode ? (
            <div className="flex flex-col gap-2">
              <Input
                autoFocus
                value={name}
                maxLength={SAVED_VIEW_NAME_MAX}
                placeholder="View name…"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                  if (e.key === "Escape") {
                    setSaveMode(false);
                    setName("");
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSaveMode(false);
                    setName("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || name.trim().length === 0}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => {
                setNotice(null);
                setSaveMode(true);
              }}
            >
              + Save current view
            </Button>
          )}

          {notice ? (
            <p
              className="font-sans text-[11px] leading-relaxed text-foreground/60"
              role="status"
            >
              {notice}
            </p>
          ) : null}

          {/* 목록 */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {status === "loading" ? (
              <p className="font-sans text-[12px] text-foreground/40">Loading…</p>
            ) : status === "error" ? (
              <p className="font-sans text-[12px] text-foreground/50">
                Couldn&apos;t load your views.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => void fetchViews()}
                >
                  Retry
                </button>
              </p>
            ) : views.length === 0 ? (
              <p className="font-sans text-[12px] leading-relaxed text-foreground/40">
                No saved views yet. Arrange some cards, then save this view.
              </p>
            ) : (
              <ul className="flex flex-col">
                {views.map((view) => (
                  <li key={view.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleLoad(view)}
                      disabled={busy}
                      title={`Load "${view.name}"`}
                      className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left font-sans text-[13px] text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(view)}
                      disabled={busy}
                      aria-label={`Delete "${view.name}"`}
                      title="Delete"
                      className="shrink-0 rounded p-1.5 text-foreground/30 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

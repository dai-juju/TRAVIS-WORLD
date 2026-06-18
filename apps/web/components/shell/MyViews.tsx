"use client";
/**
 * MyViews — 좌측 패널 하단 "저장 뷰" 영역 (M2 테마 C Saved Views v2 Sub-step 4).
 *
 * v2 모델 ("살아있는 뷰", ChatGPT/Claude 사이드바와 동일 — 사용자 확정 2026-06-18):
 *   - 활성 뷰 = 지금 작업 중인 뷰. 카드 추가/삭제/이동이 자동 저장된다(자동 저장 훅 담당).
 *   - 행 클릭   = 그 뷰로 전환(로드 + 활성화). 200ms 후 발화(더블클릭과 구분).
 *   - 더블클릭  = 인라인 이름 변경(rename, PATCH name).
 *   - [+] New view = 빈 캔버스로 새로 시작(활성 뷰 해제). 미저장 scratch 카드는 확인 후 폐기.
 *   - Save as view = scratch(활성 뷰 없음)일 때만 노출 — 현재 캔버스를 새 뷰로 저장.
 *   - 활성 뷰 행 = 좌측 바 + 배경 강조 + ViewSaveIndicator(저장 상태) 표시.
 *
 * 멘탈 모델 전환 근거:
 *   활성 뷰 안에선 "저장" 버튼이 없다(자동 저장). 명시 저장은 scratch → 첫 뷰 승격 때만.
 *   쓰레기 "Untitled" 뷰 누적을 막는 "명시 저장" 모델(사용자 결정).
 *
 * 비반응 읽기:
 *   useCanvasStoreApi().getState() 로 nodes/viewport 를 저장 시점에만 읽어, 캔버스
 *   드래그/갱신마다 이 패널이 리렌더되지 않게 한다. 활성 뷰 id 만 selective 구독.
 *
 * 에러 graceful:
 *   모든 실패는 crash 없이 인라인 notice 로 (CLAUDE.md). 영어 카피(글로벌 타겟).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import {
  useActiveViewStore,
  useActiveViewStoreApi,
} from "@/lib/providers/ActiveViewStoreProvider";
import { useAuthSession } from "@/lib/providers/AuthSessionProvider";
import { ViewSaveIndicator } from "@/components/shell/ViewSaveIndicator";
import { serializeCanvas, hydrateSnapshot } from "@/lib/savedView/serialize";
import { SAVED_VIEW_NAME_MAX } from "@/lib/savedView/schema";

type ViewListItem = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type Status = "loading" | "ready" | "error" | "unauthenticated";

/** 행 클릭(로드)과 더블클릭(rename) 구분 지연(ms). */
const CLICK_DELAY_MS = 200;

export function MyViews() {
  const api = useCanvasStoreApi();
  // 활성 뷰 액션(비반응) — 전환/저장/삭제 시점에만 호출.
  const activeApi = useActiveViewStoreApi();
  // 활성 뷰 id 만 반응 구독 — 강조/저장버튼 노출 토글용(이 값이 바뀔 때만 리렌더).
  const activeViewId = useActiveViewStore((s) => s.activeViewId);
  const { email, loading: authLoading } = useAuthSession();

  const [views, setViews] = useState<ViewListItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  // Save as view (scratch → 새 뷰) 인라인 입력.
  const [saveMode, setSaveMode] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // rename 인라인 편집.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // 로드/삭제 in-flight 가드 — 느린 네트워크 연타 시 중복 요청 차단(code-reviewer S1).
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 단일클릭(로드) 지연 타이머 — 더블클릭(rename) 이면 취소된다.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

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

  // ── Save as view (scratch → 새 뷰 저장) ──────────────────────────────
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
      //   created_at = 서버 시각(lastSavedAt 기준, site=DB 정신).
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

  // ── New view (빈 캔버스로 새로 시작) ─────────────────────────────────
  const handleNewView = useCallback(() => {
    if (busy) return;
    const { nodes: current, loadNodes } = api.getState();
    const isScratch = activeApi.getState().activeViewId === null;
    // scratch 에 미저장 카드가 있으면 폐기되므로 확인. 활성 뷰는 이미 자동 저장됨(DB 보존).
    if (
      isScratch &&
      current.length > 0 &&
      !window.confirm(
        "Start a new view? Your current unsaved cards will be cleared.",
      )
    ) {
      return;
    }
    // ★ 순서 중요: 활성 해제 먼저 → 캔버스 비우기. 빈 캔버스 변경이 활성 뷰를 빈 카드로
    //   덮어쓰는 PATCH 를 막는다(autoSaveController.notifyChange 는 activeViewId=null 이면 빠짐).
    activeApi.getState().clearActive();
    loadNodes([]);
    setNotice(null);
    setSaveMode(false);
    setName("");
  }, [api, activeApi, busy]);

  // ── 행 클릭 = 뷰 전환(로드 + 활성화) ────────────────────────────────
  const handleLoad = useCallback(
    async (view: ViewListItem) => {
      if (busy) return;
      // 이미 보고 있는 뷰면 재로드하지 않는다(미저장 변경 stomp 방지).
      if (activeApi.getState().activeViewId === view.id) return;

      const { nodes: current } = api.getState();
      // scratch(활성 뷰 없음)에 카드가 있을 때만 확인 — 활성 뷰 카드는 이미 저장됨.
      const isScratch = activeApi.getState().activeViewId === null;
      if (
        isScratch &&
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

  // 단일/더블 클릭 구분: 단일 = 200ms 후 로드, 더블 = 타이머 취소 + rename 진입.
  //   busy(로드/삭제 in-flight) 중엔 타이머조차 무장하지 않아 클릭 피드백을 명확히 한다
  //   (최종 방어선은 handleLoad 의 busy 가드, code-reviewer W2).
  const handleRowClick = useCallback(
    (view: ViewListItem) => {
      if (busy) return;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        void handleLoad(view);
      }, CLICK_DELAY_MS);
    },
    [handleLoad, busy],
  );

  // ── rename (더블클릭 → 인라인) ──────────────────────────────────────
  const startRename = useCallback((view: ViewListItem) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setNotice(null);
    setRenamingId(view.id);
    setRenameValue(view.name);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const commitRename = useCallback(
    async (view: ViewListItem) => {
      const trimmed = renameValue.trim();
      if (renaming) return;
      if (!trimmed || trimmed === view.name) {
        cancelRename();
        return;
      }
      setRenaming(true);
      try {
        const res = await fetch(
          `/api/views?id=${encodeURIComponent(view.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          },
        );
        if (!res.ok) {
          setNotice("Couldn't rename the view. Please try again.");
          return;
        }
        // 로컬 목록 + 활성 뷰 이름 동기화.
        setViews((prev) =>
          prev.map((v) => (v.id === view.id ? { ...v, name: trimmed } : v)),
        );
        if (activeApi.getState().activeViewId === view.id) {
          activeApi.getState().setActiveName(trimmed);
        }
        cancelRename();
      } catch {
        setNotice("Couldn't rename the view. Please try again.");
      } finally {
        setRenaming(false);
      }
    },
    [renameValue, renaming, activeApi, cancelRename],
  );

  // ── delete ─────────────────────────────────────────────────────────
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
      {/* 헤더: 제목 + New view 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
          My Views
        </h2>
        {status !== "unauthenticated" ? (
          <button
            type="button"
            onClick={handleNewView}
            disabled={busy}
            aria-label="New view"
            title="New view"
            className="rounded p-1 text-foreground/50 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {status === "unauthenticated" ? (
        <p className="font-sans text-[12px] leading-relaxed text-foreground/40">
          Sign in to save your canvas layouts and reload them later.
        </p>
      ) : (
        <>
          {/* Save as view — scratch(활성 뷰 없음)일 때만. 활성 뷰는 자동 저장이라 불필요. */}
          {activeViewId === null ? (
            saveMode ? (
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
                + Save as view
              </Button>
            )
          ) : null}

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
                {views.map((view) => {
                  const isActive = view.id === activeViewId;
                  const isRenaming = view.id === renamingId;
                  return (
                    <li
                      key={view.id}
                      className={cn(
                        "group flex items-center gap-1 rounded border-l-2 border-transparent pl-1",
                        isActive && "border-primary bg-secondary/50",
                      )}
                    >
                      {isRenaming ? (
                        <Input
                          autoFocus
                          value={renameValue}
                          maxLength={SAVED_VIEW_NAME_MAX}
                          disabled={renaming}
                          className="h-7 flex-1 text-[13px]"
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void commitRename(view)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitRename(view);
                            if (e.key === "Escape") cancelRename();
                          }}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRowClick(view)}
                            onDoubleClick={() => startRename(view)}
                            disabled={busy}
                            title={`Open "${view.name}" · double-click to rename`}
                            className={cn(
                              "min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left font-sans text-[13px] transition-colors hover:bg-secondary disabled:opacity-50",
                              isActive
                                ? "font-medium text-foreground"
                                : "text-foreground/80 hover:text-foreground",
                            )}
                          >
                            {view.name}
                          </button>
                          {isActive ? <ViewSaveIndicator /> : null}
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
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

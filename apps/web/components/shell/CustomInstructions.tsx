"use client";
/**
 * CustomInstructions — 좌측 패널 하단 "Custom Instructions" 영역
 * (M2 테마 C Step 4 Sub-step 4, 사용자 UIUX 협업 확정 2026-06-18).
 *
 * 무엇 / 왜:
 *   사용자가 자유텍스트로 트레이딩 선호도("Default to BTC/ETH perpetuals on 4h…")를
 *   적어 두면 AI 시스템 프롬프트에 soft default 로 자동 주입된다(백엔드 이미 작동).
 *   이 컴포넌트는 그 자유텍스트를 보여주고/편집하고/저장하는 독립 폼이다.
 *
 * 확정 UIUX (전부 권장안 채택):
 *   1. 배치  — My Views 아래 별도 섹션.
 *   2. 저장  — 명시 Save 버튼(자동저장 아님). dirty(값≠저장값)일 때만 활성.
 *   3. 노출  — 평소 접힘 + 채워져 있으면 헤더 아래 1줄 truncate 프리뷰.
 *              헤더(제목+chevron) 클릭으로 펼침/접힘 토글.
 *   4. 보조  — placeholder + helper 라인 + "{n} / 800" 카운터.
 *
 * 상태 모델 (Zustand 불필요 — 캔버스 연동 없는 독립 폼):
 *   value      = textarea 현재 값
 *   savedValue = 마지막으로 서버에 저장된 값(GET 초기값 / PUT 응답 에코로 갱신)
 *   dirty      = value !== savedValue   → Save 활성 판정의 단일 근거
 *   expanded   = 편집 영역(textarea) 펼침 여부
 *
 * graceful (CLAUDE.md "절대 crash 금지"):
 *   GET/PUT 실패해도 throw 없이 인라인 notice 로만 알린다. 빈 상태로 시작하므로
 *   초기 로드가 실패해도 폼은 사용 가능(빈 채로 작성→저장 재시도 가능).
 *
 * 저사양 (UHD620):
 *   접힘/펼침은 height 애니메이션 없이 단순 조건부 렌더. savedValue 가 바뀔 때만
 *   프리뷰가 갱신되어 불필요한 리렌더가 없다.
 *
 * English-only (글로벌 타겟): 모든 카피/aria-label/title 영어.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/providers/AuthSessionProvider";
import { MAX_CUSTOM_INSTRUCTIONS_CHARS } from "@/lib/ai/sanitizePreferences";

/** textarea placeholder — 사용자 확정 카피(정확히 이 문구). */
const PLACEHOLDER =
  "e.g. Default to BTC and ETH perpetuals on 4h. Always show funding next to price. Prefer USDT pairs and skip low-volume coins.";

/** textarea 아래 helper 라인 — 사용자 확정 카피. */
const HELPER =
  "Used as a soft default when your query doesn't specify otherwise.";

export function CustomInstructions() {
  const { email, loading: authLoading } = useAuthSession();

  // ── 폼 로컬 상태 ────────────────────────────────────────────────
  const [value, setValue] = useState("");
  // savedValue = 서버 진실값. dirty 판정 및 round-trip 확정의 기준.
  const [savedValue, setSavedValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 초기 GET 진행 여부 — 로드 실패해도 빈 폼은 사용 가능(graceful).
  const [loadError, setLoadError] = useState(false);
  // 저장 성공 시 짧게 "Saved" 표시. 비파괴적 피드백.
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // 언마운트 후 setState 방지(느린 네트워크 graceful) — mountedRef 가드.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 초기 GET 을 1회만 반영 — effect 가 재실행(email 재발급 등)돼도 사용자가
  // 입력 중인 value 를 GET 결과로 덮어쓰지 않기 위한 가드(code-reviewer W2).
  const hasLoadedRef = useRef(false);

  // ── 마운트 시 초기값 GET ────────────────────────────────────────
  //    빈 상태로 시작 → 도착하면 반영(loading 스피너 없이 graceful).
  useEffect(() => {
    if (authLoading) return; // 세션 확인 전엔 보류.
    if (!email) return; // 비로그인은 아래에서 안내만.
    if (hasLoadedRef.current) return; // 이미 1회 로드 — 입력 덮어쓰기 방지.
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/preferences");
        if (!res.ok) {
          if (!cancelled && mountedRef.current) setLoadError(true);
          return;
        }
        const data = (await res.json()) as { customInstructions?: string };
        const initial =
          typeof data.customInstructions === "string"
            ? data.customInstructions
            : "";
        if (!cancelled && mountedRef.current) {
          setValue(initial);
          setSavedValue(initial);
          setLoadError(false);
          hasLoadedRef.current = true; // 성공 로드만 마킹(실패 시 재시도 허용).
        }
      } catch {
        if (!cancelled && mountedRef.current) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, email]);

  // dirty = 현재 입력이 마지막 저장값과 다른가. Save 활성의 단일 근거.
  const dirty = value !== savedValue;

  // ── Save (명시 버튼) ────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setSaveError(false);
    setJustSaved(false);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customInstructions: value }),
      });
      if (!res.ok) {
        if (mountedRef.current) setSaveError(true);
        return;
      }
      // 응답 에코로 savedValue 갱신 (round-trip 확정). dirty 는 이 시점 해제.
      //   ★ 현재 서버 PUT 은 원본을 그대로 에코한다(정화는 읽기 경로=프롬프트
      //   주입 시점에만, raw 저장 설계 — Sub-step 3). 미래에 서버가 저장단
      //   정화/절단을 도입하면 그 최종값을 진실로 채택하기 위해 에코를 채택한다.
      const data = (await res.json().catch(() => null)) as {
        customInstructions?: string;
      } | null;
      const echoed =
        typeof data?.customInstructions === "string"
          ? data.customInstructions
          : value;
      if (mountedRef.current) {
        setValue(echoed);
        setSavedValue(echoed);
        setJustSaved(true);
      }
    } catch {
      if (mountedRef.current) setSaveError(true);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [saving, dirty, value]);

  // 타이핑하면 "Saved" 피드백/에러를 즉시 거둔다(상태 신선도).
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      if (justSaved) setJustSaved(false);
      if (saveError) setSaveError(false);
    },
    [justSaved, saveError],
  );

  // 비로그인 — My Views 와 동일 톤의 안내만.
  if (!authLoading && !email) {
    return (
      <div className="border-t border-foreground/15 p-4">
        <SectionHeader expanded={false} onToggle={() => {}} disabled />
        <p className="mt-2 font-sans text-[12px] leading-relaxed text-foreground/40">
          Sign in to set custom instructions for the AI.
        </p>
      </div>
    );
  }

  // 저장값이 있으면 접힘 상태에서 1줄 프리뷰 노출.
  const hasSaved = savedValue.trim().length > 0;
  const count = value.length;

  return (
    <div className="border-t border-foreground/15 p-4">
      <SectionHeader
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />

      {/* 접힘 + 저장값 있음 → 1줄 truncate 프리뷰 */}
      {!expanded && hasSaved ? (
        <p
          className="mt-1.5 truncate font-sans text-[12px] text-foreground/50"
          title={savedValue}
        >
          {savedValue}
        </p>
      ) : null}

      {/* 펼침 → 편집 영역 */}
      {expanded ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={value}
            onChange={handleChange}
            maxLength={MAX_CUSTOM_INSTRUCTIONS_CHARS}
            rows={5}
            placeholder={PLACEHOLDER}
            aria-label="Custom instructions"
            className={cn(
              "w-full resize-y rounded-md border border-input bg-background px-3 py-2",
              "font-sans text-[13px] leading-relaxed text-foreground/90",
              "placeholder:text-foreground/30 focus-visible:border-ring focus-visible:outline-none",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
          />

          {/* helper + 카운터 */}
          <div className="flex items-start justify-between gap-2">
            <p className="font-sans text-[11px] leading-relaxed text-foreground/40">
              {HELPER}
            </p>
            <span
              className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/40"
              aria-label={`${count} of ${MAX_CUSTOM_INSTRUCTIONS_CHARS} characters used`}
            >
              {count} / {MAX_CUSTOM_INSTRUCTIONS_CHARS}
            </span>
          </div>

          {/* 상태 notice (graceful) */}
          {loadError ? (
            <p
              className="font-sans text-[11px] leading-relaxed text-foreground/60"
              role="alert"
            >
              Couldn&apos;t load your saved instructions. You can still edit and
              save.
            </p>
          ) : null}
          {saveError ? (
            <p
              className="font-sans text-[11px] leading-relaxed text-foreground/60"
              role="alert"
            >
              Couldn&apos;t save. Please try again.
            </p>
          ) : null}

          {/* Save 행 */}
          <div className="flex items-center justify-end gap-2">
            {justSaved && !dirty ? (
              <span
                className="font-sans text-[11px] text-foreground/50"
                role="status"
              >
                Saved
              </span>
            ) : null}
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * SectionHeader — "Custom Instructions" 제목 + chevron 토글 버튼.
 *   접힘/펼침 시 chevron 방향만 바뀐다(저사양 — 회전 애니메이션 없음).
 */
function SectionHeader({
  expanded,
  onToggle,
  disabled,
}: {
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-expanded={expanded}
      className={cn(
        "flex w-full items-center gap-1.5 text-left",
        "font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60",
        "transition-colors hover:text-foreground/80 disabled:opacity-60 disabled:hover:text-foreground/60",
      )}
    >
      <Chevron className="size-3.5 shrink-0" aria-hidden />
      <span>Custom Instructions</span>
    </button>
  );
}

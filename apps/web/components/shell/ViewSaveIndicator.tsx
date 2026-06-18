"use client";
/**
 * ViewSaveIndicator — 활성 뷰 자동 저장 상태 표시 (M2 테마 C Saved Views v2 Sub-step 4).
 *
 * activeViewStore 의 saveState/lastSavedAt 만 selective 구독한다 → 인디케이터가 깜빡여도
 *   부모 MyViews 는 리렌더되지 않는다(저사양 UHD620: 저장 상태 변화가 목록 전체를 다시
 *   그리지 않게).
 *
 * 표시 규칙 (crypto-trader 자문 확정):
 *   - saving : "Saving…"          (작업 중, 차분한 톤)
 *   - saved  : "Saved ✓"          → 2초 뒤 페이드아웃 (방금 저장됐다는 안심만 주고 사라짐)
 *   - error  : "Couldn't save"    → ★ 잔류 (실제 실패 중엔 절대 사라지지 않음 = 불변식)
 *   - idle   : 표시 없음
 *
 * 왜 페이드를 key={lastSavedAt} remount 로 처리하나:
 *   store 의 saveState 는 다음 저장 전까지 "saved" 로 유지된다(엔진은 상태만 보고). "잠깐
 *   떴다 사라지는" 연출은 표시 계층 책임. effect 본문의 동기 setState 는 cascading 렌더라
 *   금지(react-hooks/set-state-in-effect)이므로, setState 는 setTimeout 콜백에서만 호출하고
 *   매 저장마다 lastSavedAt 을 key 로 SavedBadge 를 remount → visible 이 true 로 재초기화돼
 *   페이드가 다시 재생된다.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { useActiveViewStore } from "@/lib/providers/ActiveViewStoreProvider";

/** "Saved ✓" 가 보였다가 페이드하기까지의 시간(ms). */
const SAVED_VISIBLE_MS = 2000;

export function ViewSaveIndicator() {
  const saveState = useActiveViewStore((s) => s.saveState);
  const lastSavedAt = useActiveViewStore((s) => s.lastSavedAt);

  if (saveState === "saving") {
    return (
      <span className="shrink-0 font-sans text-[10px] text-foreground/40">
        Saving…
      </span>
    );
  }

  if (saveState === "error") {
    // ★ 잔류 — 페이드 없음. 저장이 실제로 안 됐다는 신호는 사용자가 알아챌 때까지 유지.
    //   role="alert" — 스크린리더가 즉시 읽어 실패 인지를 앞당김(code-reviewer S4).
    return (
      <span
        role="alert"
        className="shrink-0 font-sans text-[10px] text-destructive"
      >
        Couldn&apos;t save
      </span>
    );
  }

  if (saveState === "saved") {
    // 매 저장마다 remount(visible=true 재초기화) → 페이드 재생.
    return <SavedBadge key={lastSavedAt ?? "saved"} />;
  }

  return null; // idle — 표시 없음.
}

/**
 * "Saved ✓" 뱃지 — 마운트 시 잠깐 보였다가 2초 뒤 페이드아웃.
 *   setState 는 setTimeout 콜백에서만 호출(effect 본문 동기 setState 금지 룰 준수).
 */
function SavedBadge() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-0.5 font-sans text-[10px] text-foreground/40 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!visible}
    >
      <Check className="size-3" aria-hidden />
      Saved
    </span>
  );
}

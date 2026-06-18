"use client";
/**
 * ViewSaveIndicator — 활성 뷰 자동 저장 상태 표시 (M2 테마 C Saved Views v2 Sub-step 4·5).
 *
 * activeViewStore 의 saveState/lastSavedAt 만 selective 구독한다 → 인디케이터가 바뀌어도
 *   부모 MyViews 는 리렌더되지 않는다(저사양 UHD620: 저장 상태 변화가 목록 전체를 다시
 *   그리지 않게). 활성 뷰 행에서만 렌더된다(MyViews 가 isActive 일 때만 마운트).
 *
 * 표시 규칙 (사용자 결정 2026-06-18 = "상시 Saved 잔류" + crypto-trader 안심 신호):
 *   - saving       : "Saving…"        (저장 중, 차분한 톤)
 *   - error        : "Couldn't save"  → ★ 잔류 (실제 실패 중엔 절대 "Saved" 금지, 불변식)
 *   - idle / saved : "Saved ✓"        → ★ 상시 잔류 (활성 뷰가 서버와 동기화돼 있음을 항상
 *                    표시 — "저장됨"과 "쉬는 중"이 시각적으로 같던 공백을 없앤다). 마지막
 *                    저장 시각은 hover title 로 제공(상시 갱신 타이머 없이 가볍게).
 *
 * Sub-step 4 의 2초 페이드(key={lastSavedAt} remount) 설계는 "상시 Saved" 결정으로 폐기 —
 *   페이드가 없어 set-state-in-effect 룰 회피용 타이머/remount 자체가 불필요해졌다(더 단순).
 */
import { Check } from "lucide-react";

import { useActiveViewStore } from "@/lib/providers/ActiveViewStoreProvider";

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
    // ★ 잔류 — 저장이 실제로 안 됐다는 신호는 사용자가 알아챌 때까지 유지.
    //   role="alert" — 스크린리더가 즉시 읽어 실패 인지를 앞당김.
    return (
      <span
        role="alert"
        className="shrink-0 font-sans text-[10px] text-destructive"
      >
        Couldn&apos;t save
      </span>
    );
  }

  // idle | saved → 상시 "Saved ✓". 활성 뷰가 서버와 동기화된 상태(자동 저장됨)를 항상 표시.
  const title = lastSavedAt
    ? `Last saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
    : undefined;
  return (
    <span
      title={title}
      className="flex shrink-0 items-center gap-0.5 font-sans text-[10px] text-foreground/40"
    >
      <Check className="size-3" aria-hidden />
      Saved
    </span>
  );
}

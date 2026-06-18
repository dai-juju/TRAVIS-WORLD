"use client";
/**
 * AutoSaveActiveView — 활성 뷰 자동 저장 훅의 마운트 지점 (M2 테마 C Saved Views v2 Sub-step 3).
 *
 * 화면에 아무것도 그리지 않는다(null 렌더). useAutoSaveActiveView 를 호출만 하는 전용
 *   컴포넌트로 두어, "자동 저장 엔진이 어디서 살아있는지"를 트리에서 명시적으로 드러낸다.
 *   CanvasShell 안(CanvasStoreProvider + ActiveViewStoreProvider 스코프)에 배치해야 한다.
 */
import { useAutoSaveActiveView } from "@/lib/savedView/useAutoSaveActiveView";

export function AutoSaveActiveView(): null {
  useAutoSaveActiveView();
  return null;
}

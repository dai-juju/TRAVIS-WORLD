"use client";
/**
 * UndoToast — toastStore 의 현재 큐를 화면 하단에 렌더 (M1.4 Step 3-5).
 *
 * 역할:
 *   - 하단 중앙 fixed 위치에 여러 토스트를 수직으로 쌓아 표시
 *   - actionLabel + onAction 이 있으면 Undo 버튼 노출, 클릭 시 복구 + dismiss
 *   - × 버튼은 수동 dismiss
 *
 * 디자인:
 *   UI-3 hard-shadow 스타일 — paper 배경 + ink 테두리 + 4px 4px 0 drop shadow.
 *   mono 10px 메시지 + Instrument/DM Serif italic "Undo" 버튼으로 editorial 톤 유지.
 *   양 테마 자동 전환 (bg-background / border-foreground / box-shadow 변수 사용).
 */

import { useToastStore } from "@/lib/providers/ToastStoreProvider";

export function UndoToast() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-4 border border-foreground bg-background px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground"
          style={{ boxShadow: "4px 4px 0 var(--ink)" }}
        >
          <span>{t.message}</span>
          {t.actionLabel && t.onAction && (
            <button
              type="button"
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
              className="font-serif text-[14px] italic normal-case tracking-normal text-foreground underline-offset-4 hover:underline"
            >
              {t.actionLabel}
            </button>
          )}
          <button
            type="button"
            aria-label="dismiss"
            onClick={() => dismiss(t.id)}
            className="text-[color:var(--ink-3)] hover:text-foreground"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

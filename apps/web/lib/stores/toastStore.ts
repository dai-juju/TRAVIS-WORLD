"use client";
/**
 * toastStore — 전역 토스트 큐 (M1.4 Step 3-5, 2026-04-21).
 *
 * 책임:
 *   화면 하단에 짧게 표시되는 비-블로킹 알림(토스트)을 큐로 관리. 첫 유즈케이스
 *   는 "카드 삭제 + Undo" 플로우 — CardContainer 가 즉시 removeNode 후 여기
 *   show() 를 불러 5초간 Undo 버튼을 노출.
 *
 * 왜 module-level create 인가 (canvasStore 와 다른 선택):
 *   canvasStore 는 M1.6 auth 도입 시 사용자별 격리가 필요해 vanilla store +
 *   Provider 패턴을 먼저 채택했다. toast 는 본질적으로 "지금 이 브라우저 탭
 *   에서만 살아있는 휘발성 상태" 이고 사용자 간 격리 요구가 없어 module-level
 *   create 로 충분. Provider 체인을 불필요하게 늘리지 않음.
 *
 * API:
 *   show({ message, actionLabel?, onAction?, durationMs? }): string (toast id)
 *   dismiss(id): void
 *
 * durationMs=0 또는 음수:
 *   자동 dismiss 비활성화 — 사용자가 명시적으로 × 를 눌러야 사라진다.
 */

import { create } from "zustand";

export type ToastEntry = {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 자동 dismiss 타임아웃 핸들 — dismiss 시 clearTimeout 필수. */
  timeoutHandle: ReturnType<typeof setTimeout> | null;
};

type ShowOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 기본 5000ms. 0 이하이면 자동 dismiss 비활성화. */
  durationMs?: number;
};

export type ToastStore = {
  toasts: ToastEntry[];
  show: (opts: ShowOptions) => string;
  dismiss: (id: string) => void;
};

/** 충돌 가능성 극히 낮은 간이 id — 동일 ms 내 다중 show 에만 random 이 필요. */
function makeId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: ({ message, actionLabel, onAction, durationMs = 5000 }) => {
    const id = makeId();
    const timeoutHandle =
      durationMs > 0
        ? setTimeout(() => {
            get().dismiss(id);
          }, durationMs)
        : null;
    const entry: ToastEntry = {
      id,
      message,
      actionLabel,
      onAction,
      timeoutHandle,
    };
    set({ toasts: [...get().toasts, entry] });
    return id;
  },

  dismiss: (id) => {
    const entry = get().toasts.find((t) => t.id === id);
    if (entry?.timeoutHandle) clearTimeout(entry.timeoutHandle);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

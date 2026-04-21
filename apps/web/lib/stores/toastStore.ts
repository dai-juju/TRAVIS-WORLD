/**
 * toastStore — 전역 토스트 큐 (M1.4 Step 4-1, Provider 패턴 승격).
 *
 * 책임:
 *   화면 하단에 짧게 표시되는 비-블로킹 알림(토스트)을 큐로 관리. 첫 유즈케이스
 *   는 "카드 삭제 + Undo" 플로우 — CardContainer 가 즉시 removeNode 후 여기
 *   show() 를 불러 5초간 Undo 버튼을 노출.
 *
 * Step 4-1 변경 (2026-04-22):
 *   이전 module-level `create()` 방식 → vanilla createStore factory + Provider.
 *   배경: Step 3-5 에서 작성한 초기 구조는 CardContainer 가 show() 호출해도
 *   UndoToast 가 구독 중인 store 와 다른 인스턴스를 볼 수 있는 HMR 리스크가 있었다.
 *   Turbopack 이 module 을 두 번 로드하면 module-level create() 결과도 두 개가
 *   될 수 있기 때문. canvasStore 와 같은 vanilla + Provider 패턴으로 승격해
 *   이 가능성을 구조적으로 차단.
 *
 * API:
 *   show({ message, actionLabel?, onAction?, durationMs? }): string (toast id)
 *   dismiss(id): void
 *
 * durationMs=0 또는 음수:
 *   자동 dismiss 비활성화 — 사용자가 명시적으로 × 를 눌러야 사라진다.
 */

import { createStore } from "zustand/vanilla";

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

export type ToastState = {
  toasts: ToastEntry[];
};

export type ToastActions = {
  show: (opts: ShowOptions) => string;
  dismiss: (id: string) => void;
};

export type ToastStore = ToastState & ToastActions;

/** 충돌 가능성 극히 낮은 간이 id — 동일 ms 내 다중 show 에만 random 이 필요. */
function makeId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const defaultToastState: ToastState = {
  toasts: [],
};

/**
 * 스토어 factory — ToastStoreProvider 가 useState lazy 로 단 한 번 생성한다.
 */
export const createToastStore = (initState: ToastState = defaultToastState) => {
  return createStore<ToastStore>()((set, get) => ({
    ...initState,

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
};

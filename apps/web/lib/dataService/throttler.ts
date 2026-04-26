// apps/web/lib/dataService/throttler.ts
//
// flush 스케줄러 (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// 옛 apps/web/lib/hooks/_realtimeInternal.ts 의 createThrottler 함수를
// dataService 안으로 이동. 시그니처/동작 동일.
//
// 분리 이유:
//   - useDataServiceTable 의 flush 스케줄링에 재사용
//   - 순수 함수 — vi.useFakeTimers() 로 결정적 검증 가능
//
// 동작:
//   - schedule() 호출 시 이미 예약돼 있으면 no-op
//   - throttleMs <= 0 → Promise.resolve().then(flush) (microtask 다음 tick 즉시)
//   - 그 외 → setTimeout(delay) → rAF(flush). delay 는 "마지막 flush 이후 throttleMs
//     경과" 를 보장 (leading + trailing).
//   - cancel() → 예약된 타이머/rAF 모두 취소.

export interface Throttler {
  schedule: () => void;
  cancel: () => void;
}

/**
 * createThrottler — throttleMs 간격으로 flush 를 예약하는 핸들 생성.
 *
 * @param throttleMs  리렌더 최소 간격 (0 이면 microtask 다음 tick 즉시 flush).
 * @param flush       실제 수행 콜백 (보통 setState 또는 notify 트리거).
 * @param now         시각 소스 — 테스트에서 주입 가능. 기본 Date.now.
 * @param raf         requestAnimationFrame 소스 — 테스트에서 setTimeout 0ms 로 대체 가능.
 */
export function createThrottler(
  throttleMs: number,
  flush: () => void,
  now: () => number = Date.now,
  raf: ((cb: () => void) => number) | null = typeof requestAnimationFrame !== "undefined"
    ? (cb) => requestAnimationFrame(cb)
    : null,
  cancelRaf: ((h: number) => void) | null = typeof cancelAnimationFrame !== "undefined"
    ? (h) => cancelAnimationFrame(h)
    : null,
): Throttler {
  let scheduled = false;
  let lastFlushAt = 0;
  let rafHandle: number | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const doFlush = () => {
    scheduled = false;
    lastFlushAt = now();
    rafHandle = null;
    flush();
  };

  return {
    schedule() {
      if (scheduled) return;
      scheduled = true;
      if (throttleMs <= 0) {
        void Promise.resolve().then(doFlush);
        return;
      }
      const elapsed = now() - lastFlushAt;
      const delay = Math.max(0, throttleMs - elapsed);
      timeoutHandle = setTimeout(() => {
        timeoutHandle = null;
        if (raf) {
          rafHandle = raf(doFlush);
        } else {
          doFlush();
        }
      }, delay);
    },
    cancel() {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (rafHandle !== null && cancelRaf) {
        cancelRaf(rafHandle);
        rafHandle = null;
      }
      scheduled = false;
    },
  };
}

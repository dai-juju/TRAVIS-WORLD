// apps/web/lib/hooks/_realtimeInternal.ts
//
// Realtime 훅 공통 내부 유틸 (M1.4 Step 2, 2026-04-20).
//
// useRealtimeRow / useRealtimeTable 두 훅이 공유하는 로직:
//   1) postgres_changes 채널 구독 래퍼 (subscribeChanges)
//   2) RealtimePayload 타입 축약 (new/old row 추출)
//   3) 채널 해제 helper (unsubscribeChannel)
//
// 설계 메모:
//   - Supabase Realtime filter는 단일 컬럼 `col=op.value` 1개만 지원.
//     복합 PK(exchange, market_type, symbol) 매칭이 필요하면 서버 필터는
//     선택성 높은 1개만 걸고, 나머지는 클라이언트 콜백에서 보조 검사한다.
//   - 이 파일은 "순수" 유틸 — 리액트 훅 규칙 없음, 테스트 모킹 쉬움.

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

/** postgres_changes 이벤트 종류. `*`로 전부 받는 것이 기본. */
export type ChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

/**
 * 서버 측 postgres_changes 구독 옵션.
 * filter는 선택 — 없으면 테이블 전체 구독.
 */
export interface ChangesSubscribeOptions {
  /** 이 구독 채널의 고유 이름. 동일 이름으로 중복 구독 방지. */
  channelName: string;
  /** 대상 테이블 (public 스키마 가정). */
  table: string;
  /** 서버 필터 문자열. 예) "symbol=eq.BTCUSDT". */
  filter?: string;
  /** 기본값 "*". INSERT/UPDATE/DELETE 모두 수신. */
  event?: ChangeEvent;
}

/**
 * postgres_changes 채널을 생성해 구독 시작.
 * 호출자는 cleanup 시 unsubscribeChannel()로 해제해야 한다.
 *
 * 반환: 채널 인스턴스. 구독 실패도 crash하지 않으며 콘솔 경고만 남긴다.
 */
export function subscribeChanges<T extends Record<string, unknown>>(
  client: SupabaseClient,
  options: ChangesSubscribeOptions,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  onStatus?: (status: string) => void,
): RealtimeChannel {
  const { channelName, table, filter, event = "*" } = options;

  // supabase-js의 on('postgres_changes', ...) 시그니처상 filter 객체.
  // filter를 선택적으로 붙이기 위해 조건부 스프레드.
  const changeFilter = {
    event,
    schema: "public",
    table,
    ...(filter ? { filter } : {}),
  } as const;

  const channel = client.channel(channelName).on(
    // supabase-js 타입 정의 한계로 첫 번째 인자는 string literal union.
    // 런타임상 "postgres_changes" 이면 충분 — 타입 캐스팅으로 우회.
    "postgres_changes" as unknown as never,
    changeFilter as never,
    (payload: RealtimePostgresChangesPayload<T>) => {
      try {
        onChange(payload);
      } catch (err) {
        // 콜백 내부 예외가 채널 전체를 죽이지 않도록 방어.
        // (CLAUDE.md: 절대 crash 금지)
        console.error(`[realtime:${channelName}] onChange 예외`, err);
      }
    },
  );

  channel.subscribe((status) => {
    // SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED 등의 라이프사이클 이벤트.
    if (onStatus) onStatus(status);
  });

  return channel;
}

/**
 * 채널 해제. 이미 해제된 채널에 호출해도 안전.
 * supabase 클라이언트가 null이면 no-op.
 */
export function unsubscribeChannel(
  client: SupabaseClient | null,
  channel: RealtimeChannel | null,
): void {
  if (!client || !channel) return;
  try {
    // removeChannel은 내부적으로 unsubscribe()도 호출한다.
    void client.removeChannel(channel);
  } catch (err) {
    console.warn("[realtime] removeChannel 실패(무시)", err);
  }
}

/**
 * INSERT/UPDATE 페이로드에서 new row를 안전하게 꺼낸다.
 * new가 비어있거나 빈 객체면 null.
 */
export function extractNewRow<T extends Record<string, unknown>>(
  payload: RealtimePostgresChangesPayload<T>,
): T | null {
  const next = (payload as { new?: T | Record<string, never> }).new;
  if (!next || Object.keys(next).length === 0) return null;
  return next as T;
}

/**
 * DELETE 페이로드에서 old row를 꺼낸다.
 * REPLICA IDENTITY 설정에 따라 부분 row일 수 있으니 호출자가 주의.
 */
export function extractOldRow<T extends Record<string, unknown>>(
  payload: RealtimePostgresChangesPayload<T>,
): Partial<T> | null {
  const prev = (payload as { old?: Partial<T> }).old;
  if (!prev || Object.keys(prev).length === 0) return null;
  return prev;
}

// ─────────────────────────────────────────────────────────────────────────
// Throttler — useRealtimeTable의 flush 스케줄러.
//
// 왜 별도 함수로 분리?
//   1) 훅 내부에 인라인하면 ref/effect/cleanup 얽혀 테스트가 어렵다.
//   2) 순수 함수라서 vi.useFakeTimers()로 결정적 검증 가능.
//   3) 향후 다른 고빈도 Realtime 훅(예: 오더북)에도 재사용.
//
// 동작:
//   - schedule() 호출 시, 이미 예약돼 있으면 no-op.
//   - throttleMs <= 0: Promise.resolve().then(flush) — 즉시 다음 microtask.
//   - 그 외: setTimeout(delay) → rAF(flush). delay는 "마지막 flush 이후
//     throttleMs 경과"를 보장하도록 계산 (leading + trailing).
//   - cancel(): 예약된 타이머/rAF 모두 취소.
// ─────────────────────────────────────────────────────────────────────────

export interface Throttler {
  schedule: () => void;
  cancel: () => void;
}

/**
 * createThrottler: throttleMs 간격으로 flush를 예약하는 핸들 생성.
 *
 * @param throttleMs  리렌더 최소 간격 (0 이면 즉시 flush).
 * @param flush       실제 수행할 콜백 (보통 setState(version++)).
 * @param now         시각 소스 — 테스트에서 주입 가능. 기본 Date.now.
 * @param raf         rAF 소스 — 테스트에서 생략 가능. 없으면 setTimeout만 사용.
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

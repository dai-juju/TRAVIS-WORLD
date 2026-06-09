// apps/web/lib/dataService/hooks.ts
//
// dataService 의 React hooks 면 (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// ─── 외부 면 ─────────────────────────────────────
// useDataServiceRow<T>({ datasource, match, initialFetch, enabled })
//   → 단일 row 구독 (TickerCard 등). match 가 PK 매칭 책임.
// useDataServiceTable<T>({ datasource, pk, initialFetch, throttleMs, enabled })
//   → 전 테이블 구독 (CoinListCard 등). Map<pk, row> 누적, throttle 단위 flush.
//
// 옛 useRealtimeRow / useRealtimeTable 의 시그니처를 거의 그대로 흡수하되
// React 19 호환 + tearing 방지 위해 useSyncExternalStore 패턴으로 재작성.
// 카드 측은 import 1줄 + hook 이름만 교체하면 마이그레이션 완료.
//
// ─── React 19 useSyncExternalStore 패턴 ──────────
// snapshot 안정성: snapshotRef.current 객체를 "갱신 시마다 새 참조" 로 교체 →
// React 가 === 비교로 변경 감지. snapshot getter (() => ref.current) 는 매 호출
// 시 같은 ref.current 반환 — React 가 stable snapshot 으로 인식.
// 외부 store 의 notify (subscribe 콜백 인자) 호출 시 React 가 getSnapshot 다시 호출.
//
// 옛 hook 대비 차이 (사용자 측 영향 ≈ 0):
//   - filter (server-side) 옵션 제거 → match (client-side) 가 모든 매칭 책임
//   - table → datasource 명칭 변경
//   - 그 외 동작/계약 동일

"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  channelManager,
  type ChannelListener,
  type ChannelStatus,
} from "./channelManager";
import { extractNewRow, extractOldRow } from "./payload";
import { createThrottler } from "./throttler";
import type {
  DataServiceRowOptions,
  DataServiceRowResult,
  DataServiceStatus,
  DataServiceTableOptions,
  DataServiceTableResult,
} from "./types";

/**
 * [10-7] 회수 — watchColumns 중 prev↔next 값이 다른 컬럼이 하나라도 있으면 true.
 *
 * Realtime payload 의 new row 는 (markPrice WS 의 partial UPDATE 여도) 테이블의 현재
 * 전체 row 라서, OI 카드의 watched 컬럼(open_interest 등)은 funding 만 바뀐 push 에서
 * 이전 값과 동일하다 → false 반환 → 재렌더 skip. 값은 string/number 가 컬럼마다 일관
 * 하므로 strict `!==` 로 충분 (같은 컬럼이 타입을 바꿔 오지 않음).
 *
 * 순수 함수 — 단위 테스트로 [10-7] 로직 자체를 검증한다.
 */
export function hasWatchedColumnChanged<T extends Record<string, unknown>>(
  prev: T,
  next: T,
  watchColumns: string[],
): boolean {
  for (const col of watchColumns) {
    if (prev[col] !== next[col]) return true;
  }
  return false;
}

/** ChannelStatus → DataServiceStatus 매핑 (외부 면 안정화). */
function toServiceStatus(status: ChannelStatus): DataServiceStatus {
  switch (status) {
    case "subscribed":
      return "ready";
    case "errored":
      return "error";
    case "closed":
      return "idle";
    case "subscribing":
    default:
      return "loading";
  }
}

/**
 * 단일 row 구독 hook.
 *
 * channelManager 가 datasource 단위 단일 channel 운영 — 동일 datasource 카드 N 개
 * mount 해도 1 channel 만 생성. M1.4 잠복 버그 [3-33] 자연 해소.
 *
 * @example
 * const match = useCallback((row) => row.symbol === "BTCUSDT", []);
 * const initialFetch = useCallback(async () => { ... }, [...]);
 * const { data, status } = useDataServiceRow<TickerRow>({
 *   datasource: "now_spot_ticker",
 *   match,
 *   initialFetch,
 *   enabled: Boolean(symbol),
 * });
 */
export function useDataServiceRow<T extends Record<string, unknown>>(
  options: DataServiceRowOptions<T>,
): DataServiceRowResult<T> {
  const { datasource, match, initialFetch, enabled = true, watchColumns } =
    options;

  // useSyncExternalStore 가 안정 참조를 요구 — useRef 에 working state 보유.
  // ref.current 객체 자체를 새 참조로 교체할 때 React 가 변경 감지.
  const snapshotRef = useRef<DataServiceRowResult<T>>({
    data: null,
    status: "idle",
    error: null,
  });
  const notifyRef = useRef<(() => void) | null>(null);

  /** snapshot 갱신 + React notify. */
  const writeAndNotify = useCallback(
    (mutator: (prev: DataServiceRowResult<T>) => DataServiceRowResult<T>) => {
      snapshotRef.current = mutator(snapshotRef.current);
      notifyRef.current?.();
    },
    [],
  );

  // useSyncExternalStore 의 subscribe 콜백 — manager 구독을 effect 단위로 관리.
  // deps 변경 시 React 가 자동으로 unsubscribe → 재 subscribe.
  const subscribe = useCallback(
    (notify: () => void) => {
      notifyRef.current = notify;

      if (!enabled) {
        return () => {
          notifyRef.current = null;
        };
      }

      let cancelled = false;

      writeAndNotify(() => ({
        data: snapshotRef.current.data,
        status: "loading",
        error: null,
      }));

      // 1) 초기 SELECT (선택).
      if (initialFetch) {
        void (async () => {
          try {
            const initial = await initialFetch();
            if (cancelled) return;
            // match 통과 못한 row 는 null 처리 (단일 row hook 의미상).
            if (initial && !match(initial)) {
              writeAndNotify((s) => ({ ...s, data: null }));
            } else {
              writeAndNotify((s) => ({ ...s, data: initial, error: null }));
            }
          } catch (err) {
            if (cancelled) return;
            writeAndNotify(() => ({
              data: null,
              status: "error",
              error: err instanceof Error ? err : new Error(String(err)),
            }));
          }
        })();
      }

      // 2) Realtime 구독.
      const listener: ChannelListener<T> = {
        onChange: (payload) => {
          if (cancelled) return;
          if (payload.eventType === "DELETE") {
            const prev = extractOldRow<T>(payload);
            // DELETE 페이로드는 부분 row — match 가 PK 컬럼만 참조한다고 가정.
            if (prev && match(prev as T)) {
              writeAndNotify((s) => ({ ...s, data: null }));
            }
            return;
          }
          const next = extractNewRow<T>(payload);
          if (!next) return;
          if (!match(next)) return;
          // [10-7] 회수 — 관심 컬럼 dirty check. 채널 공유로 흘러든 payload 중
          //   watched 컬럼이 하나도 안 바뀐 건 재렌더를 일으키지 않는다.
          //   prev 가 null(첫 데이터)이면 항상 통과 — 초기 채움 보장.
          const prev = snapshotRef.current.data;
          if (
            watchColumns &&
            watchColumns.length > 0 &&
            prev &&
            !hasWatchedColumnChanged(prev, next, watchColumns)
          ) {
            return;
          }
          writeAndNotify((s) => ({ ...s, data: next, error: null }));
        },
        onStatus: (channelStatus) => {
          if (cancelled) return;
          const status = toServiceStatus(channelStatus);
          writeAndNotify((s) => ({
            ...s,
            status,
            error:
              status === "error"
                ? new Error(`channel ${channelStatus}`)
                : null,
          }));
        },
      };

      const unsubscribe = channelManager.subscribe<T>(datasource, listener);

      return () => {
        cancelled = true;
        unsubscribe();
        notifyRef.current = null;
      };
    },
    [enabled, datasource, match, initialFetch, writeAndNotify, watchColumns],
  );

  return useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    // SSR snapshot — 클라이언트 전용 hook 이므로 동일 빈 상태 반환.
    () => snapshotRef.current,
  );
}

/**
 * 전 테이블 구독 hook (Map<pk, row> 누적).
 *
 * throttle 단위로 새 Map 참조 생성 → useSyncExternalStore 가 참조 비교로 재렌더 결정.
 * 1,400+ symbol 규모에서 초당 수천 이벤트가 와도 throttleMs(500) 단위 flush 로 압축.
 *
 * @example
 * const pk = useCallback((r) => `${r.exchange}:${r.market_type}:${r.symbol}`, []);
 * const initialFetch = useCallback(async () => { ... }, [...]);
 * const { rows, status } = useDataServiceTable<CoinRow>({
 *   datasource: "now_spot_ticker",
 *   pk,
 *   initialFetch,
 *   throttleMs: 500,
 *   enabled: true,
 * });
 */
export function useDataServiceTable<T extends Record<string, unknown>>(
  options: DataServiceTableOptions<T>,
): DataServiceTableResult<T> {
  const {
    datasource,
    pk,
    initialFetch,
    throttleMs = 500,
    enabled = true,
  } = options;

  const snapshotRef = useRef<DataServiceTableResult<T>>({
    rows: new Map(),
    status: "idle",
    error: null,
  });
  const notifyRef = useRef<(() => void) | null>(null);
  /** 내부 working Map — 이벤트 즉시 누적. flush 시 새 참조로 snapshot 교체. */
  const workingRef = useRef<Map<string, T>>(new Map());

  const subscribe = useCallback(
    (notify: () => void) => {
      notifyRef.current = notify;

      if (!enabled) {
        return () => {
          notifyRef.current = null;
        };
      }

      let cancelled = false;

      /** working Map 을 새 참조로 복사 → snapshot 갱신 + React notify. */
      const flush = () => {
        if (cancelled) return;
        snapshotRef.current = {
          rows: new Map(workingRef.current),
          status: snapshotRef.current.status,
          error: snapshotRef.current.error,
        };
        notifyRef.current?.();
      };
      const throttler = createThrottler(throttleMs, flush);

      const setStatus = (
        status: DataServiceStatus,
        error: Error | null = null,
      ) => {
        snapshotRef.current = {
          rows: snapshotRef.current.rows,
          status,
          error,
        };
        notifyRef.current?.();
      };

      setStatus("loading");

      // 1) 초기 SELECT (선택).
      void (async () => {
        try {
          if (initialFetch) {
            const list = await initialFetch();
            if (cancelled) return;
            const fresh = new Map<string, T>();
            for (const row of list) fresh.set(pk(row), row);
            workingRef.current = fresh;
            // 초기 결과는 즉시 반영 (throttle 우회).
            snapshotRef.current = {
              rows: new Map(fresh),
              status: snapshotRef.current.status,
              error: null,
            };
            notifyRef.current?.();
          }
        } catch (err) {
          if (cancelled) return;
          setStatus(
            "error",
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      })();

      // 2) Realtime 구독.
      const listener: ChannelListener<T> = {
        onChange: (payload) => {
          if (cancelled) return;
          const map = workingRef.current;
          if (payload.eventType === "DELETE") {
            const prev = extractOldRow<T>(payload);
            if (!prev) return;
            const key = pk(prev as T);
            if (map.has(key)) {
              map.delete(key);
              throttler.schedule();
            }
            return;
          }
          const next = extractNewRow<T>(payload);
          if (!next) return;
          map.set(pk(next), next);
          throttler.schedule();
        },
        onStatus: (channelStatus) => {
          if (cancelled) return;
          const status = toServiceStatus(channelStatus);
          setStatus(
            status,
            status === "error" ? new Error(`channel ${channelStatus}`) : null,
          );
        },
      };

      const unsubscribe = channelManager.subscribe<T>(datasource, listener);

      return () => {
        cancelled = true;
        throttler.cancel();
        unsubscribe();
        notifyRef.current = null;
      };
    },
    [enabled, datasource, pk, initialFetch, throttleMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    () => snapshotRef.current,
  );
}

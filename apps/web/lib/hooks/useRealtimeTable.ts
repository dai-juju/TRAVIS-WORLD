// apps/web/lib/hooks/useRealtimeTable.ts
//
// 전 테이블 구독 훅 (M1.4 Step 2, 2026-04-20).
//
// 용도: CoinListCard / 스크리너처럼 "지금 살아있는 모든 심볼"을 한 번에 보여줄 때.
//   예) now_futures_ticker 1,408 심볼을 Map<pk, row>로 들고 정렬/필터해서 표시.
//
// 핵심 성능 전략 — throttle:
//   1,408 심볼이 각자 초당 1회 update면 초당 1,400+ 이벤트 도착.
//   이벤트마다 setState를 부르면 React가 프레임당 수십 번 리렌더 → UI 멈춤.
//
//   해결:
//     a) 이벤트 도착 시 내부 working Map(mutRef)에 즉시 반영 — 리렌더 없음.
//     b) throttleMs(기본 500) 간격으로 createThrottler가 flush를 1회 예약.
//     c) flush에서 working Map을 새 Map으로 얕게 복사해 setState — React가 참조
//        변경을 감지해 리렌더. 1,408 key Map 복사는 1~2회/초이므로 비용 무시 가능.
//
//   이 설계는 React 19의 "렌더 중 ref 쓰기 금지" 규칙과 호환된다
//   (반환값이 state이지 ref가 아니므로).
//
// throttleMs=0 특수 케이스:
//   테스트/디버깅용 즉시 flush (마이크로태스크 다음 tick).
//
// 복합 PK:
//   pk(row) 함수를 호출자가 주입한다. useCallback으로 안정화해야 함
//   (참조가 바뀌면 effect가 재구독된다).

"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import {
  createThrottler,
  extractNewRow,
  extractOldRow,
  subscribeChanges,
  unsubscribeChannel,
} from "./_realtimeInternal";
import type { RealtimeStatus } from "./useRealtimeRow";

export interface UseRealtimeTableOptions<T> {
  /** 구독할 테이블. 예: "now_futures_ticker". */
  table: string;
  /**
   * row → 문자열 PK 직렬화.
   * 복합 PK(exchange, market_type, symbol) 대응용. 결정적이어야 함.
   * useCallback으로 안정화 필요.
   */
  pk: (row: T) => string;
  /**
   * 초기 SELECT (전체 목록). 생략 시 빈 Map.
   * useCallback으로 안정화 필요.
   */
  initialFetch?: () => Promise<T[]>;
  /**
   * React state flush 간격(ms).
   *   - 기본 500: 초당 최대 ~2 리렌더.
   *   - 0: throttle off (매 이벤트 즉시 flush — 테스트/디버그용).
   */
  throttleMs?: number;
  /** false면 구독 안 함. supabase null이면 자동 false. */
  enabled?: boolean;
}

export interface UseRealtimeTableResult<T> {
  /** 현재 스냅샷. flush 때마다 새 Map 참조로 교체된다. */
  rows: Map<string, T>;
  status: RealtimeStatus;
  error: Error | null;
}

export function useRealtimeTable<T extends Record<string, unknown>>(
  options: UseRealtimeTableOptions<T>,
): UseRealtimeTableResult<T> {
  const {
    table,
    pk,
    initialFetch,
    throttleMs = 500,
    enabled = true,
  } = options;

  // 외부로 노출되는 상태 Map — flush 시 새 참조로 교체.
  const [rows, setRows] = useState<Map<string, T>>(() => new Map());
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  // 내부 working Map — 이벤트 도착 즉시 누적. ref 읽기는 effect 안에서만
  // 일어나므로 react-hooks/refs 규칙에 안전.
  const mutRef = useRef<Map<string, T>>(new Map());

  useEffect(() => {
    // 상태 리셋은 run() async 안에서 처리 (effect body 동기 setState 금지 규칙).
    if (!enabled || !supabase) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    // flush: working Map을 새 Map으로 복사해 상태로 교체.
    // 1,408개 규모 얕은 복사는 O(n) 이지만 throttle로 초당 2회 이하 → 무시 가능.
    const throttler = createThrottler(throttleMs, () => {
      if (cancelled) return;
      setRows(new Map(mutRef.current));
    });
    const scheduleFlush = () => throttler.schedule();

    const applyChange = (
      eventType: "INSERT" | "UPDATE" | "DELETE",
      newRow: T | null,
      oldRow: Partial<T> | null,
    ) => {
      const map = mutRef.current;
      if (eventType === "DELETE") {
        // DELETE는 new가 비어있고 old만 있음. REPLICA IDENTITY 설정에 따라
        // old는 부분 row일 수 있으므로 pk 함수가 참조하는 컬럼은 반드시 PK이어야 한다.
        if (!oldRow) return;
        const key = pk(oldRow as T);
        if (map.has(key)) {
          map.delete(key);
          scheduleFlush();
        }
        return;
      }
      // INSERT / UPDATE — 전체 row 교체.
      if (!newRow) return;
      const key = pk(newRow);
      map.set(key, newRow);
      scheduleFlush();
    };

    const run = async () => {
      setStatus("loading");
      setError(null);

      // 1) 초기 SELECT → working Map 빌드.
      try {
        if (initialFetch) {
          const list = await initialFetch();
          if (cancelled) return;
          const fresh = new Map<string, T>();
          for (const row of list) fresh.set(pk(row), row);
          mutRef.current = fresh;
          // 초기 로딩 결과는 즉시 반영 (throttle 우회).
          setRows(new Map(fresh));
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
        return;
      }

      // 2) Realtime 구독.
      const channelName = `table:${table}`;
      channel = subscribeChanges<T>(
        supabase!,
        { channelName, table, event: "*" },
        (payload) => {
          const next = extractNewRow<T>(payload);
          const prev = extractOldRow<T>(payload);
          applyChange(
            payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            next,
            prev,
          );
        },
        (subStatus) => {
          if (cancelled) return;
          if (subStatus === "SUBSCRIBED") {
            setStatus("ready");
          } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") {
            setError(new Error(`Realtime 채널 상태: ${subStatus}`));
            setStatus("error");
          }
        },
      );
    };

    void run();

    return () => {
      cancelled = true;
      throttler.cancel();
      unsubscribeChannel(supabase, channel);
    };
    // pk / initialFetch 참조 변경 시 재구독 — 호출자가 useCallback으로 안정화.
  }, [enabled, table, throttleMs, pk, initialFetch]);

  return { rows, status, error };
}

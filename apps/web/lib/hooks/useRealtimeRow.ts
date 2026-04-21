// apps/web/lib/hooks/useRealtimeRow.ts
//
// 단일 row 구독 훅 (M1.4 Step 2, 2026-04-20).
//
// 용도: 특정 심볼의 now_* 스냅샷을 카드 1장이 구독할 때.
//   예) BTCUSDT 차트 카드가 now_futures_ticker의 BTCUSDT row만 팔로우.
//
// 데이터 경로: B (worker → Supabase → Realtime → front).
//
// 복합 PK 매칭:
//   Supabase Realtime filter는 단일 컬럼만 지원한다. 테이블 PK가
//   (exchange, market_type, symbol)인 경우:
//     - options.filter 에는 선택성 높은 1개(보통 symbol=eq.BTCUSDT)만 전달.
//     - exchange / market_type 등 추가 조건은 options.match 콜백으로 보조 검사.
//   이 분리는 서버측 대역폭 절감(행 단위 필터)과 정확한 PK 매칭을 타협한다.
//
// 호출 규약:
//   initialFetch / match 가 매 렌더마다 새 참조로 들어오면 effect가 재구독된다.
//   호출자는 `useCallback`으로 안정화할 책임이 있다 — React 19의
//   react-hooks/refs 규칙을 따르기 위한 의도적 설계.

"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import {
  extractNewRow,
  subscribeChanges,
  unsubscribeChannel,
} from "./_realtimeInternal";

export type RealtimeStatus = "idle" | "loading" | "ready" | "error";

export interface UseRealtimeRowOptions<T> {
  /** 구독할 테이블 이름. 예: "now_spot_ticker". */
  table: string;
  /**
   * postgres_changes filter 문자열. 단일 컬럼만.
   * 예) "symbol=eq.BTCUSDT"
   */
  filter: string;
  /**
   * 초기 SELECT. 훅 마운트 시 1회 호출돼 기준값을 채운다.
   * 생략 가능 — 없으면 Realtime 이벤트가 올 때까지 data는 null.
   * 호출자는 useCallback으로 안정화할 것 (참조 변경 시 재구독).
   */
  initialFetch?: () => Promise<T | null>;
  /**
   * 서버 필터로 좁혀지지 않는 보조 PK 컬럼 검사.
   * 예) exchange / market_type 비교.
   * 반환 true인 row만 반영. useCallback으로 안정화 권장.
   */
  match?: (row: T) => boolean;
  /** false면 구독 시작 안 함. 기본 true. supabase가 null이어도 자동 false. */
  enabled?: boolean;
}

export interface UseRealtimeRowResult<T> {
  data: T | null;
  status: RealtimeStatus;
  error: Error | null;
}

export function useRealtimeRow<T extends Record<string, unknown>>(
  options: UseRealtimeRowOptions<T>,
): UseRealtimeRowResult<T> {
  const { table, filter, initialFetch, match, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // env 누락 or 명시적 disable → 구독하지 않는다.
    //
    // B-1 정책 확정 (M1.4 Step 3 선처리, 2026-04-21):
    //   enabled 가 true → false 로 전환될 때 data/status 를 **리셋하지 않고 유지**.
    //   근거 3 가지:
    //   (1) React 19 의 react-hooks/set-state-in-effect 규칙이 effect body 에서의
    //       setState 를 거부해 코드로 강제할 수 없고,
    //   (2) 실전 TickerCard 의 심볼 변경 시나리오는 enabled 토글이 아니라 filter 변경
    //       으로 일어나며 이 경우 아래 메인 effect 의 deps 에 의해 자연스럽게
    //       재구독 + 새 값으로 치환된다,
    //   (3) 호출자(카드) 가 status 를 보고 "idle/stale" 배지를 그릴 책임을 지는
    //       구조가 더 유연하다.
    if (!enabled || !supabase) {
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const run = async () => {
      // async 함수 첫 await 이전은 엄밀히 동기 구간이지만, ESLint 규칙이
      // async 함수 내부의 setState는 effect body 동기 setState로 간주하지 않는다.
      setStatus("loading");
      setError(null);

      // 1) 초기 SELECT (있으면).
      //
      // Step 4.5 교훈 (2026-04-22): 이 단계가 null 을 반환하면 Supabase RLS
      // policy 부재가 1차 용의자. `SELECT * FROM pg_policies WHERE tablename=?`
      // 로 먼저 확인하고, 필요 시 anon+authenticated SELECT policy 추가.
      try {
        if (initialFetch) {
          const initial = await initialFetch();
          if (cancelled) return;
          if (initial && match && !match(initial)) {
            // 보조 매처에 걸러진 경우 null로 둔다.
            setData(null);
          } else {
            setData(initial);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
        return;
      }

      // 2) Realtime 구독 시작.
      //    channelName은 table+filter 결정적 조합 — StrictMode 이중 마운트에서도
      //    동일 이름이면 cleanup→재생성이 안전하게 반복된다.
      const channelName = `row:${table}:${filter}`;
      channel = subscribeChanges<T>(
        supabase!,
        { channelName, table, filter, event: "*" },
        (payload) => {
          const eventType = payload.eventType;
          if (eventType === "DELETE") {
            // 대상 row 삭제 — null로 치환.
            setData(null);
            return;
          }
          // INSERT / UPDATE → new row로 치환 (full row replication 가정).
          const next = extractNewRow<T>(payload);
          if (!next) return;
          // 보조 매처: 복합 PK 중 서버 필터로 거르지 못한 컬럼 검증.
          if (match && !match(next)) return;
          setData(next);
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
      unsubscribeChannel(supabase, channel);
    };
    // initialFetch / match 참조가 바뀌면 재구독 — 호출자가 useCallback으로 안정화해야 함.
  }, [enabled, table, filter, initialFetch, match]);

  return { data, status, error };
}

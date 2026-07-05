// apps/web/lib/dataService/hooks.ts
//
// dataService 의 React hooks 면 (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// ─── 외부 면 ─────────────────────────────────────
// useDataServiceRow<T>({ datasource, match, initialFetch, enabled })
//   → 단일 row 구독 (TickerCard 등). match 가 PK 매칭 책임.
// useDataServiceTable<T>({ datasource, pk, initialFetch, throttleMs, enabled })
//   → 전 테이블 구독 (TableCard 등). Map<pk, row> 누적, throttle 단위 flush.
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

import { buildLiveTopic, type MergeMode } from "@travis/shared";

import {
  channelManager,
  type ChannelListener,
  type ChannelStatus,
} from "./channelManager";
import {
  liveTopicManager,
  type LiveListener,
  type LiveStatus,
} from "./liveTopicManager";
import { resolveMergeMode, resolveTransport } from "./transport";
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

/**
 * 도착 row 를 이전 상태와 병합 (M2 경로 A fast-follow #1 Step 2, 2026-06-26).
 *
 * - mode="partial" + prev 존재 → `{...prev, ...next}` (prev 위에 next 컬럼만 덮어쓰기).
 *   경로 A ws_direct 가 markPrice 처럼 **일부 컬럼만** 방송할 때, REST 폴러가 채운
 *   다른 컬럼(last_settled_funding_rate / interest_rate / OI 등 초기 seed)을 보존.
 * - 그 외(mode="replace" / prev 부재=seed 아직 안 옴) → next 통째 반환 = 기존 동작.
 *   full-row 소스(realtime)는 next 가 모든 키를 가져 partial==replace (휴면 안전).
 *
 * 순수 함수 — mergeRow.test.ts 가 병합 규칙(덮어쓰기/null/seed 부재)을 직접 검증.
 * ★ next 가 누락한 키는 prev 값 유지 / next 가 명시한 키(값이 null 이어도)는 덮어씀.
 */
export function mergeRow<T extends Record<string, unknown>>(
  prev: T | null,
  next: T,
  mode: MergeMode,
): T {
  if (mode === "partial" && prev) {
    return { ...prev, ...next };
  }
  return next;
}

/**
 * ChannelStatus / LiveStatus → DataServiceStatus 매핑 (외부 면 안정화).
 *
 * ChannelStatus(경로 B)와 LiveStatus(경로 A)는 멤버가 동일("subscribing"|"subscribed"
 * |"errored"|"closed")이라 한 매퍼가 둘 다 처리. useDataServiceFeed 도 이 매퍼를 재사용
 * (LiveStatus → status) 하므로 export 한다.
 */
export function toServiceStatus(status: ChannelStatus): DataServiceStatus {
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
  const { datasource, match, initialFetch, enabled = true, watchColumns, selector } =
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

      // datasource 의 병합 모드 — datasource 고정이라 구독 1회 resolve(경로 A/B 공용).
      const mergeMode = resolveMergeMode(datasource);

      // 관심 row 반영 — 경로 A/B 공용. match + [10-7] watchColumns dirty check + 병합.
      //   prev 가 null(첫 데이터)이면 dirty check 통과 — 초기 채움 보장.
      const applyRow = (next: T) => {
        if (cancelled || !match(next)) return;
        const prev = snapshotRef.current.data;
        if (
          watchColumns &&
          watchColumns.length > 0 &&
          prev &&
          !hasWatchedColumnChanged(prev, next, watchColumns)
        ) {
          return;
        }
        // partial 모드(premium_index 등)는 prev seed 위에 next 컬럼만 덮어쓰기 —
        //   경로 A 부분 방송이 REST 컬럼(last_settled_funding_rate 등)을 지우지 않도록.
        //   replace(기본)·full-row(realtime)는 next 통째 = 기존 거동(회귀 0).
        //   ★ dirty check 는 raw next 기준 유지(보수적) — partial 에서 next 가 누락한
        //   watched 컬럼(last_settled)은 undefined 라 "변경"으로 보여 매 틱 통과하나,
        //   markPrice 는 mark_price 가 매초 변해 어차피 재렌더 → 실害 0([10-7] 무력화 미미).
        //   게다가 [10-7] fan-out 은 경로 B 전용(여러 도메인 카드가 공유 Supabase 채널) —
        //   ws_direct 는 토픽이 datasource 별 분리라 막을 cross-domain fan-out 자체가 없어
        //   이 잉여 통과는 moot. (잘못된 skip 은 구조적 불가 — 누락 컬럼은 ≠undefined 라
        //   절대 "동일" 판정 안 남 → 진짜 변경 누락 버그 발생 불가, 최악이 잉여 재렌더.)
        const merged = mergeRow(prev, next, mergeMode);
        writeAndNotify((s) => ({ ...s, data: merged, error: null }));
      };

      // status 반영 — 경로 A/B 공용. LiveStatus 와 ChannelStatus 는 멤버 동일이라
      // toServiceStatus 가 둘 다 처리. 에러 라벨은 경로 중립("subscription")으로
      // — 경로 A 에러를 "channel"(Supabase) 로 오인하지 않게 (code-reviewer W1).
      const applyStatus = (raw: ChannelStatus | LiveStatus) => {
        if (cancelled) return;
        const status = toServiceStatus(raw);
        writeAndNotify((s) => ({
          ...s,
          status,
          error: status === "error" ? new Error(`subscription ${raw}`) : null,
        }));
      };

      // 2) 구독 — transport 에 따라 경로 A(ws_direct) / B(realtime) 분기.
      //    ws_direct datasource 가 없으면(전부 realtime) 항상 아래 경로 B 로 감.
      if (resolveTransport(datasource) === "ws_direct") {
        const topic = selector ? buildLiveTopic(datasource, selector) : null;
        if (topic) {
          const liveListener: LiveListener<T> = {
            onRow: (row) => applyRow(row),
            onStatus: (s) => applyStatus(s),
          };
          const unsubscribeLive = liveTopicManager.subscribe<T>(topic, liveListener);
          return () => {
            cancelled = true;
            unsubscribeLive();
            notifyRef.current = null;
          };
        }
        // ★ 토픽 조립 실패(selector 불완전 — 예: marketType 누락 [10-62]) → **경로 B 폴백**.
        //   구독 skip(영구 frozen-stale = 트레이더가 옛 값을 실값으로 오인하는 위험) 대신
        //   Supabase Realtime 으로 graceful degrade. 워커가 경로 B(upsert)를 계속하므로
        //   데이터는 DB 에 있어 라이브 유지된다(박동은 있으나 frozen 보다 안전). 아래 경로 B
        //   로 fall-through. (스키마 superRefine 이 marketType 을 강제해 정상은 경로 A.)
        console.warn(
          `[useDataServiceRow] ws_direct "${datasource}" 토픽 조립 실패 ` +
            `(selector 누락/불일치) — 경로 B 폴백`,
        );
      }

      // 경로 B (Supabase Realtime) — 기존 realtime + ws_direct 토픽 실패 시 폴백.
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
          applyRow(next);
        },
        onStatus: (channelStatus) => applyStatus(channelStatus),
      };

      const unsubscribe = channelManager.subscribe<T>(datasource, listener);

      return () => {
        cancelled = true;
        unsubscribe();
        notifyRef.current = null;
      };
    },
    [enabled, datasource, match, initialFetch, writeAndNotify, watchColumns, selector],
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
    maxRows,
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
          // maxRows 상한 — 이벤트성 set(INSERT 마다 새 pk)의 무한 누적 방어 (C2).
          //   Map 은 삽입 순서 보존 → 가장 오래 머문 키부터 축출. now_* 스냅샷은
          //   pk 덮어쓰기라 cap 에 사실상 미도달(무영향).
          if (maxRows !== undefined) {
            while (map.size > maxRows) {
              const oldest = map.keys().next().value;
              if (oldest === undefined) break;
              map.delete(oldest);
            }
          }
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
    [enabled, datasource, pk, initialFetch, throttleMs, maxRows],
  );

  return useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    () => snapshotRef.current,
  );
}

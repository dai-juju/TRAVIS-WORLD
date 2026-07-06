// apps/web/lib/dataService/useDataServiceFeed.ts
//
// 피드(이벤트 스트림) 구독 hook (M2 경로 A fast-follow #2 Step 4, 2026-06-28).
//
// ─── 무엇 ────────────────────────────────────────
// useDataServiceRow(단일 최신 row) · useDataServiceTable(스냅샷 목록)의 세 번째 형제.
// 청산(forceOrder) 같은 **append-only 이벤트 스트림**을 상한 N개 ring buffer 에 누적해
// 카드로 공급한다. PRD §3 `content` updateMode(항목 동적 추가/제거)의 첫 실사용.
//
//   - 도착 이벤트를 시간순 working 버퍼에 push, 길이 > limit 이면 가장 오래된 것 제거(cap).
//   - flush(throttle) 때만 working 을 newest-first 로 복사해 snapshot 교체 → 재렌더.
//   - 각 이벤트에 훅 로컬 seq 부여(React key 안정성).
//
// ─── ★ 핵심 불변식 (nextjs-frontend 자문 2026-06-28) ───
//  (A) getSnapshot 은 snapshotRef.current 를 **verbatim** 반환 — 배열 가공(reverse/slice)은
//      반드시 flush/ingestion 시점에 끝내 박아둔다. getSnapshot 안에서 새 배열 만들면 무한 렌더.
//  (B) cap 은 **ingestion 시점**(push + 조건부 shift) — flush-only cap 은 청산 폭포 때
//      working 버퍼가 무한 증식. 메모리는 항상 O(limit) bounded(shift 비용도 O(limit), limit≈100 무시).
//  (C) seq 는 **훅 로컬** 카운터 — LiveEnvelope.seq(워커 연결당, 재연결 리셋) 재사용 금지.
//  (D) 재구독(토픽 변경) 진입부에서 working+seq **명시 clear** — Feed 는 initialFetch 가
//      없어 자동 초기화가 안 됨(예: BTC→ETH selector 전환 시 옛 청산 잔류 방지).
//  (E) ws_direct 전용 — transport realtime / 토픽 실패는 **휴면**(빈 배열, 경로 B 폴백 없음).
//      Row 훅과 의도적 차이 — 청산 datasource 가 realtime 인 Phase A 동안 자동 휴면 보장.
//  (F) selector 안정화 = **훅이 흡수**. 값 기준 키(selectorKey)로 토픽을 메모이즈하고 filter 는
//      ref 로 라이브 적용 → 불안정 참조(인라인 객체/함수)가 무한루프/잉여 버퍼 소실을 못 일으킴.
//      Row 훅보다 강한 방어(카드 작성자 footgun 차단, CLAUDE.md "crash 금지").
//  (G) seed(과거 채움, Step 7 2026-07-06) — seedFetch 는 구독 시작과 동시에 async 실행,
//      결과(oldest-first 계약)를 버퍼 **앞**에 배치(라이브보다 과거). seed seq 는 음수
//      하강 카운터(라이브 양수와 충돌 0 = React key 유일). filter 는 seed 에도 동일 적용.
//      dedupeKey 가 있으면 버퍼 내 키 집합(O(limit))으로 seed↔라이브 겹침 창 제거.
//      seed 실패 = console.warn + 라이브-only 진행(graceful). 재구독 시 재실행((D) 확장).
//      seedFetch/dedupeKey 도 ref 라이브((F) 동일) — 불안정 참조 무해.

"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { buildLiveTopic } from "@travis/shared";

import { toServiceStatus } from "./hooks";
import {
  liveTopicManager,
  type LiveListener,
  type LiveStatus,
} from "./liveTopicManager";
import { resolveTransport } from "./transport";
import { createThrottler } from "./throttler";
import type {
  DataServiceFeedOptions,
  DataServiceFeedResult,
  DataServiceStatus,
  FeedEvent,
} from "./types";

/**
 * selector 를 **값 기준** 안정 문자열로 직렬화 (키 정렬 → 순서 무관).
 * 같은 내용이면 새 객체여도 동일 키 → 토픽 메모이즈가 재계산/재구독을 막는다.
 * ★ 값이 enum 성(market_type/symbol)이라 `${k}=${v}` join 으로 충돌 없음 — 자유값 키가
 *   생기면(값에 `=`/`&` 포함 가능) JSON.stringify(정렬 entries)로 강화할 것.
 */
function stableSelectorKey(selector: Record<string, string>): string {
  return Object.keys(selector)
    .sort()
    .map((k) => `${k}=${selector[k]}`)
    .join("&");
}

/**
 * 이벤트 스트림 구독 hook.
 *
 * @example
 * const selector = useMemo(() => ({ market_type: "usdm" }), []);
 * const filter = useCallback((r: LiqRow) => Number(r.notional) >= 100_000, []);
 * const { events, status } = useDataServiceFeed<LiqRow>({
 *   datasource: "liquidation",
 *   selector,
 *   filter,
 *   limit: 100,
 * });
 */
export function useDataServiceFeed<T extends Record<string, unknown>>(
  options: DataServiceFeedOptions<T>,
): DataServiceFeedResult<T> {
  const {
    datasource,
    selector,
    filter,
    limit = 100,
    throttleMs = 250,
    enabled = true,
    seedFetch,
    dedupeKey,
  } = options;

  // useSyncExternalStore 안정 참조 — snapshot 은 갱신 시에만 새 참조로 교체.
  const snapshotRef = useRef<DataServiceFeedResult<T>>({
    events: [],
    status: "idle",
    error: null,
  });
  const notifyRef = useRef<(() => void) | null>(null);
  // 내부 working 버퍼 — 시간순(oldest-first) 누적. flush 때 reverse+copy 로 newest-first.
  const workingRef = useRef<FeedEvent<T>[]>([]);
  // 훅 로컬 단조 증가 seq (불변식 C). 재구독 시 0 으로 리셋.
  const seqRef = useRef(0);

  // (F) filter 는 ref 로 라이브 적용 — 불안정 함수여도 재구독/clear 안 일으킴.
  //   filter 변경은 "새 이벤트부터" 적용(버퍼는 안 비움) — 임계값 조정은 forward.
  //   ★ 렌더 중 ref 쓰기지만 읽기는 async 콜백(onRow)에서만 = 렌더 출력에 미사용 → 안전
  //   ("latest value ref" 관용 패턴, 렌더 결정에 ref.current 를 읽지 않음).
  const filterRef = useRef(filter);
  filterRef.current = filter;
  // (G) seed/dedupe 도 동일 ref-라이브 패턴 — 구독 시점에만 읽음.
  const seedFetchRef = useRef(seedFetch);
  seedFetchRef.current = seedFetch;
  const dedupeKeyRef = useRef(dedupeKey);
  dedupeKeyRef.current = dedupeKey;

  // (F) 토픽을 selector **값** 기준으로 메모이즈 — 인라인 객체로 매 렌더 새로 와도
  //   내용 같으면 동일 토픽 = subscribe 재실행 없음(무한루프/버퍼 소실 차단).
  const selectorKey = selector ? stableSelectorKey(selector) : "";
  const topic = useMemo(
    () => (selector ? buildLiveTopic(datasource, selector) : null),
    // selectorKey 가 selector 의 값 대리 — 의도된 직렬화 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasource, selectorKey],
  );

  const subscribe = useCallback(
    (notify: () => void) => {
      notifyRef.current = notify;

      // (D) 재구독 진입부 명시 clear — Feed 고유 필수(initialFetch 없음).
      workingRef.current = [];
      seqRef.current = 0;

      /** snapshot 교체 + React notify. 초기/휴면 경로 공용. */
      const settle = (next: DataServiceFeedResult<T>) => {
        snapshotRef.current = next;
        notifyRef.current?.();
      };

      // 구독 안 하는 3경로 — 전부 idle + 빈 배열(graceful, crash 0).
      if (!enabled) {
        settle({ events: [], status: "idle", error: null });
        return () => {
          notifyRef.current = null;
        };
      }
      // (E) ws_direct 전용. realtime(청산 Phase A 휴면 상태)은 구독 안 함.
      if (resolveTransport(datasource) !== "ws_direct") {
        settle({ events: [], status: "idle", error: null });
        return () => {
          notifyRef.current = null;
        };
      }
      // 토픽 조립 실패(selector 불완전 — 필수 selectorKey 누락) → 휴면.
      if (!topic) {
        console.warn(
          `[useDataServiceFeed] ws_direct "${datasource}" 토픽 조립 실패 ` +
            `(selector 누락/불일치) — 구독 skip(빈 피드)`,
        );
        settle({ events: [], status: "idle", error: null });
        return () => {
          notifyRef.current = null;
        };
      }

      let cancelled = false;

      // status 만 바뀔 때: events 배열 참조 **유지**, wrapper 만 새로 → memo 행 보존.
      const setStatus = (
        status: DataServiceStatus,
        error: Error | null = null,
      ) => {
        if (cancelled) return;
        snapshotRef.current = {
          events: snapshotRef.current.events,
          status,
          error,
        };
        notifyRef.current?.();
      };

      // (A) flush — working(oldest-first) → newest-first 복사. 배열 가공은 여기서만.
      const flush = () => {
        if (cancelled) return;
        snapshotRef.current = {
          events: workingRef.current.slice().reverse(),
          status: snapshotRef.current.status,
          error: snapshotRef.current.error,
        };
        notifyRef.current?.();
      };
      const throttler = createThrottler(throttleMs, flush);

      // 초기 상태 — 구독 시작(첫 이벤트 전까지 loading). 빈 events + ready 는 정상(조용한 장).
      settle({ events: [], status: "loading", error: null });

      // (G) dedupe — 버퍼 내 키 집합. 축출 시 함께 제거해 O(limit) bounded.
      const keys = new Set<string>();
      const keyOf = (row: T): string | null => {
        const fn = dedupeKeyRef.current;
        if (!fn) return null;
        try {
          return fn(row);
        } catch {
          return null; // 키 계산 실패 행은 dedupe 미적용 (graceful)
        }
      };
      const evictOldest = (buf: FeedEvent<T>[]): void => {
        const evicted = buf.shift();
        if (evicted) {
          const k = keyOf(evicted.row);
          if (k !== null) keys.delete(k);
        }
      };
      /** filter(ref 최신값) 적용 — 통과 true. throw 는 해당 행만 제외. */
      const passesFilter = (row: T): boolean => {
        const f = filterRef.current;
        if (!f) return true;
        try {
          return f(row);
        } catch (err) {
          console.warn("[useDataServiceFeed] filter 예외 — 이벤트 제외", err);
          return false;
        }
      };

      // (G) seed — 라이브 구독과 동시에 과거 이벤트 async 채움 (oldest-first 계약).
      //   라이브가 먼저 도착해도 안전: seed 는 버퍼 **앞**(과거)에 배치 + dedupe 로 겹침 제거.
      let seedSeq = 0; // 음수 하강 — 라이브 양수 seq 와 충돌 0 (React key 유일성)
      const seed = seedFetchRef.current;
      if (seed) {
        void (async () => {
          try {
            const rows = await seed();
            if (cancelled) return;
            const seeded: FeedEvent<T>[] = [];
            for (const row of rows) {
              if (!passesFilter(row)) continue;
              const k = keyOf(row);
              if (k !== null) {
                if (keys.has(k)) continue;
                keys.add(k);
              }
              seeded.push({ seq: --seedSeq, arrivedAt: Date.now(), row });
            }
            if (seeded.length > 0) {
              workingRef.current = [...seeded, ...workingRef.current];
              while (workingRef.current.length > limit) {
                evictOldest(workingRef.current); // (B) cap — 가장 오래된 seed 부터
              }
            }
            flush(); // 첫 화면 채움은 throttle 대기 없이 즉시
          } catch (err) {
            // seed 실패 = 라이브-only 진행 (graceful, crash 금지)
            console.warn(
              `[useDataServiceFeed] seed 실패 — 라이브-only 진행 ("${datasource}")`,
              err,
            );
          }
        })();
      }

      const liveListener: LiveListener<T> = {
        onRow: (row) => {
          if (cancelled) return;
          if (!passesFilter(row)) return;
          // (G) seed↔라이브 겹침 창 dedupe — 동일 키 재도착 skip.
          const k = keyOf(row);
          if (k !== null) {
            if (keys.has(k)) return;
            keys.add(k);
          }
          // (B) ingestion cap — push 후 길이 > limit 이면 앞(oldest)에서 제거(O(1) 유지).
          const buf = workingRef.current;
          buf.push({ seq: ++seqRef.current, arrivedAt: Date.now(), row });
          if (buf.length > limit) evictOldest(buf);
          throttler.schedule();
        },
        onStatus: (s: LiveStatus) => setStatus(toServiceStatus(s)),
      };

      const unsubscribe = liveTopicManager.subscribe<T>(topic, liveListener);

      return () => {
        cancelled = true;
        throttler.cancel();
        unsubscribe();
        notifyRef.current = null;
      };
    },
    [enabled, datasource, topic, limit, throttleMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    // SSR snapshot — 클라이언트 전용 hook 이므로 동일 빈 상태 반환.
    () => snapshotRef.current,
  );
}

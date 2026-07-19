// apps/web/lib/dataService/useDataServiceSeries.ts
//
// series(시계열) 구독 hook — 4번째 형제 (Composable Stage 2 Step 2, 2026-07-08).
//
// ─── 무엇 ────────────────────────────────────────
// useDataServiceRow(단일 row)·Table(스냅샷 목록)·Feed(이벤트 스트림)에 이어,
// history_* 시계열을 "심볼별 oldest-first 곡선 묶음"으로 카드에 공급한다.
// GenericChart(Step 4)가 첫 소비자 — "BTC vs ETH OI" 다중 심볼 오버레이 지원.
//
// ─── ★ 핵심 계약 (zod + backend-infra 자문 2026-07-08) ───
//  (A) **주기 pull** — history 는 Realtime push 가 없어 refreshIntervalMs 로 재fetch
//      (TRAVIS 첫 주기 pull). 타이머는 구독 생명주기 소유, 겹침 fetch 는 skip.
//  (B) **호출자 콜백 0개** — fetch 를 primitive 옵션으로 완전 명세(seriesFetch 가
//      조립). ref-라이브 방어 표면 자체가 없음. symbols[] 만 값-기준 메모(F 미러).
//  (C) **oldest-first 훅 보증** — Feed(seedFetch=호출자 책임)보다 강한 보증. 차트는
//      절대 재정렬하지 않는다.
//  (D) **soft/hard 실패 분리** — 첫 fetch 실패(표시할 것 없음)=error / 재fetch 실패
//      (데이터 있음)=기존 series 유지 + status ready + warn + lastUpdatedAt 미전진
//      (작동하던 차트를 순간 장애로 비우지 않음, CLAUDE.md graceful).
//  (E) **per-series 참조 재사용** — (length + 마지막 row shallow) 무변화 곡선은 이전
//      참조 유지 → uPlot setData/React.memo 가 변한 곡선만 갱신(UHD620 주기 pull 상쇄).
//      한계: 마지막이 아닌 과거 버킷의 in-place UPDATE 는 참조 재사용에 가려질 수
//      있음(새 포인트 도착 시 자연 복구) — 의도된 트레이드오프.
//  (F) **재구독(옵션 변경) 진입부 명시 clear** — 이전 datasource/심볼 조합의 곡선
//      잔류 방지 (Feed 불변식 D 미러).
//  (G) 부분 실패 병합 — 재fetch 에서 일부 심볼만 실패하면 그 심볼은 **이전 곡선
//      유지**(soft per-series), 성공 심볼만 갱신. 첫 fetch 부터 실패한 심볼은 생략.

"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import { seriesFetch } from "./seriesFetch";
import type {
  DataServiceSeriesOptions,
  DataServiceSeriesResult,
  SeriesGroup,
} from "./types";

/**
 * 두 곡선이 "실질 동일"인지 — 참조 재사용 판정 (불변식 E).
 * length + **마지막 row 의 shallow 필드 비교**: 시계열 변화의 현실적 경로
 * (새 포인트 append / 최신 버킷 forward-fill UPDATE) 둘 다 마지막 row 에서 드러난다.
 */
function isSameSeries<T extends Record<string, unknown>>(
  prev: SeriesGroup<T>,
  next: SeriesGroup<T>,
): boolean {
  if (prev.rows.length !== next.rows.length) return false;
  const a = prev.rows[prev.rows.length - 1];
  const b = next.rows[next.rows.length - 1];
  if (!a || !b) return true; // 둘 다 빈 곡선
  const keys = Object.keys(b);
  if (Object.keys(a).length !== keys.length) return false;
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * 시계열 구독 hook.
 *
 * @example
 * const { series, status, lastUpdatedAt } = useDataServiceSeries<IndicatorHistoryRow>({
 *   datasource: "open_interest_history",       // Step 3 등록 예정 논리 id (훅은 무지)
 *   symbols: ["BTCUSDT", "ETHUSDT"],           // 오버레이 — 인라인 배열 안전(값 메모)
 *   marketType: "futures_usdm",                // ★ DB 저장값 (WS 토픽 "usdm" 아님)
 *   interval: "5m",
 *   maxPoints: 288,                            // 최근 24h
 *   refreshIntervalMs: 150_000,                // interval/2 비례 권장
 * });
 */
export function useDataServiceSeries<T extends Record<string, unknown>>(
  options: DataServiceSeriesOptions,
): DataServiceSeriesResult<T> {
  const {
    datasource,
    symbols,
    exchange,
    marketType,
    interval,
    side,
    timeField = "recorded_at",
    lookbackMs,
    maxPoints = 500,
    refreshIntervalMs,
    enabled = true,
  } = options;

  const snapshotRef = useRef<DataServiceSeriesResult<T>>({
    series: [],
    status: "idle",
    error: null,
    lastUpdatedAt: null,
  });
  const notifyRef = useRef<(() => void) | null>(null);

  // (B) symbols 값-기준 메모 — 인라인 배열(매 렌더 새 참조)이어도 내용 같으면 동일 키
  //   = 재구독 없음. 순서 보존(정렬 안 함) — 순서가 곧 uPlot 색/범례 슬롯이라
  //   순서 변경은 의도된 재fetch. 심볼은 enum 성 값이라 "," 충돌 없음.
  const symbolsKey = symbols.join(",");

  const subscribe = useCallback(
    (notify: () => void) => {
      notifyRef.current = notify;

      /** snapshot 교체 + React notify. */
      const settle = (next: DataServiceSeriesResult<T>) => {
        snapshotRef.current = next;
        notifyRef.current?.();
      };

      // ★ symbols prop 참조는 deps 에 없어(불안정) 클로저 캡처 금지 — key 에서 파생.
      //   중복 심볼은 dedupe (reviewer S3 — 중복이 그대로 가면 React/uPlot key 충돌).
      const symbolList = symbolsKey.length > 0
        ? Array.from(new Set(symbolsKey.split(",").filter((s) => s.length > 0)))
        : [];

      // 구독 안 하는 2경로 — idle + 빈 곡선 (graceful, crash 0).
      if (!enabled || symbolList.length === 0) {
        settle({ series: [], status: "idle", error: null, lastUpdatedAt: null });
        return () => {
          notifyRef.current = null;
        };
      }

      let cancelled = false;
      let inFlight = false; // 겹침 fetch 방지 — 느린 응답 중 타이머 재발화 skip
      // soft-fail warn 은 "실패로 전환될 때 1회만" — 실패 지속 시 매 interval 스팸 방지
      // (reviewer S2, feedback_authoritative_enum_gate_silent_drop 의 rate-limit 원칙).
      let softWarned = false;

      // (F) 재구독 진입부 명시 clear — 이전 조합 곡선 잔류 방지.
      settle({ series: [], status: "loading", error: null, lastUpdatedAt: null });

      const doFetch = async () => {
        if (cancelled || inFlight) return;
        inFlight = true;
        try {
          const { groups, failedSymbols } = await seriesFetch<T>({
            datasource,
            symbols: symbolList,
            exchange,
            marketType,
            interval,
            side,
            timeField,
            lookbackMs,
            maxPoints,
          });
          if (cancelled) return;

          const prev = snapshotRef.current;
          const hadData = prev.lastUpdatedAt !== null;

          // 전 심볼 실패 — hard(첫 fetch)=error / soft(데이터 있음)=기존 유지 (D).
          if (groups.length === 0 && failedSymbols.length > 0) {
            if (!hadData) {
              settle({
                series: [],
                status: "error",
                error: new Error(
                  `series fetch failed for all symbols ("${datasource}")`,
                ),
                lastUpdatedAt: null,
              });
            } else if (!softWarned) {
              softWarned = true;
              console.warn(
                `[useDataServiceSeries] refresh 전체 실패 — 기존 series 유지 ("${datasource}")`,
              );
            }
            return;
          }

          // (E)(G) 병합 — 요청 순서대로: 성공=참조 재사용 판정 / 실패=이전 곡선 유지.
          const prevByKey = new Map(prev.series.map((g) => [g.key, g]));
          const freshByKey = new Map(groups.map((g) => [g.key, g]));
          const merged: SeriesGroup<T>[] = [];
          let suspiciousEmpty = false;
          for (const symbol of symbolList) {
            const fresh = freshByKey.get(symbol);
            const old = prevByKey.get(symbol);
            if (fresh) {
              if (old && old.rows.length > 0 && fresh.rows.length === 0) {
                // ★ "직전엔 데이터가 있었는데 이번 라운드가 0행" = 의심 신호 (reviewer W1).
                //   fulfilled-empty 는 fetch 성공이지만, retention 삭제 경계/복제 지연이
                //   작동 중인 차트를 깜빡 비울 수 있어 rejection 과 동일하게 이전 곡선 유지.
                //   진짜 데이터 소멸(상장폐지 등)은 재구독/새 카드에서 자연 반영.
                merged.push(old);
                suspiciousEmpty = true;
              } else {
                merged.push(old && isSameSeries(old, fresh) ? old : fresh);
              }
            } else if (old) {
              // 이번 라운드 실패 심볼 — 이전 곡선 유지(soft per-series).
              // 첫 fetch 부터 실패한 심볼은 생략(부분 성공 반환).
              merged.push(old);
            }
          }
          if (suspiciousEmpty && !softWarned) {
            softWarned = true;
            console.warn(
              `[useDataServiceSeries] 일부 심볼이 빈 결과로 전환 — 이전 곡선 유지 ("${datasource}")`,
            );
          }
          if (!suspiciousEmpty && failedSymbols.length === 0) softWarned = false; // 정상 복귀 시 warn 재무장

          settle({
            series: merged,
            status: "ready",
            error: null,
            lastUpdatedAt: Date.now(),
          });
        } catch (err) {
          // seriesFetch 자체는 allSettled 라 여기 도달은 예외적(조립 로직 결함 등).
          if (cancelled) return;
          if (snapshotRef.current.lastUpdatedAt === null) {
            settle({
              series: [],
              status: "error",
              error: err instanceof Error ? err : new Error(String(err)),
              lastUpdatedAt: null,
            });
          } else if (!softWarned) {
            softWarned = true;
            console.warn(
              `[useDataServiceSeries] refresh 실패 — 기존 series 유지 ("${datasource}")`,
              err,
            );
          }
        } finally {
          inFlight = false;
        }
      };

      // 첫 fetch 즉시 + (A) 주기 pull 타이머 (지정 시).
      void doFetch();
      let timer: ReturnType<typeof setInterval> | null = null;
      if (refreshIntervalMs !== undefined && refreshIntervalMs > 0) {
        timer = setInterval(() => {
          void doFetch();
        }, refreshIntervalMs);
      }

      return () => {
        cancelled = true;
        if (timer !== null) clearInterval(timer);
        notifyRef.current = null;
      };
    },
    [
      enabled,
      datasource,
      symbolsKey,
      exchange,
      marketType,
      interval,
      side,
      timeField,
      lookbackMs,
      maxPoints,
      refreshIntervalMs,
    ],
  );

  return useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    // SSR snapshot — 클라이언트 전용 hook 이므로 동일 빈 상태 반환.
    () => snapshotRef.current,
  );
}

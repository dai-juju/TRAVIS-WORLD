"use client";
/**
 * useSingleRecord — 단일-record 카드의 공용 데이터 엔진 (Stage 1b Step 2, 2026-07-14).
 *
 * 배경:
 *   옛 TickerCard/IndicatorCard 가 match 콜백 + initialFetch(EqFilter 조립) +
 *   경로 A selector + useDataServiceRow + useLoadingTimeout 을 **통째로 동형 중복**
 *   (~120줄 × 2) 하고 있었다. 모양-제네릭 BigValue/Detail form 이 또 복제하면
 *   4중이 되므로, 검증된 로직을 이 훅 1곳으로 이식한다 (신작 금지 — 블록 이동 위주).
 *
 * 책임:
 *   - PK 매처: dataService 가 server-side filter 를 쓰지 않으므로 symbol/exchange/
 *     marketType 매칭을 여기서 책임 (옛 두 카드 verbatim).
 *   - 초기 SELECT: datasource 논리 id → dsInitialFetch(single) (env 누락/SSR 시
 *     graceful null — CLAUDE.md "절대 crash 금지").
 *   - 경로 A(ws_direct) selector: liveTopicSpec.selectorKeys=["market_type","symbol"]
 *     와 키 일치 필수. realtime datasource(경로 B 폴백)에서는 무시됨.
 *   - [10-7] watchColumns: 같은 물리 테이블을 공유하는 datasource 의 fan-out
 *     재렌더 차단 (지표 pack 필수 / 티커 pack 생략 — recordDescriptors 참조).
 *   - 8초+ 로딩 정체 stale 신호 (useLoadingTimeout).
 */

import { useCallback, useMemo } from "react";
import type { RecordRow } from "@/lib/cards/recordDescriptors";
import {
  initialFetch as dsInitialFetch,
  useDataServiceRow,
  type DataServiceStatus,
  type EqFilter,
} from "@/lib/dataService";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";

/** AI 계약 config.data 중 이 엔진이 소비하는 최소 구조 (구조적 서브셋). */
export interface SingleRecordBinding {
  datasource: string;
  symbol?: string;
  exchange?: string;
  marketType?: string;
}

export interface UseSingleRecordOptions {
  /** config.data 그대로 전달 (여분 필드는 무시 — 구조적 타이핑). */
  binding: SingleRecordBinding;
  /** 렌더 게이트 통과 여부 — false 면 구독/조회 전부 skip. */
  enabled: boolean;
  /** [10-7] dirty check 대상 컬럼 (descriptor.watchColumns 전달). */
  watchColumns?: string[];
}

export interface UseSingleRecordResult<T extends RecordRow> {
  data: T | null;
  status: DataServiceStatus;
  /** 8초+ 로딩 정체 (연결 문제 안내용). */
  stale: boolean;
}

export function useSingleRecord<T extends RecordRow>({
  binding,
  enabled,
  watchColumns,
}: UseSingleRecordOptions): UseSingleRecordResult<T> {
  const { datasource, symbol, exchange, marketType } = binding;

  // PK 매처 — useCallback 으로 참조 고정해 useDataServiceRow 재구독 루프 방지.
  const match = useCallback(
    (row: T) =>
      row.symbol === symbol &&
      (!exchange || row.exchange === exchange) &&
      (!marketType || row.market_type === marketType),
    [symbol, exchange, marketType],
  );

  // 초기 SELECT — Realtime/WS 이벤트 도착 전 최초 1회 값 채움.
  const initialFetch = useCallback(async (): Promise<T | null> => {
    if (!symbol) return null;
    const eq: EqFilter[] = [{ column: "symbol", value: symbol }];
    if (exchange) eq.push({ column: "exchange", value: exchange });
    if (marketType) eq.push({ column: "market_type", value: marketType });
    const row = await dsInitialFetch<T>({ datasource, eq, single: true });
    return Array.isArray(row) ? null : row;
  }, [datasource, symbol, exchange, marketType]);

  // 경로 A(ws_direct) 전용 토픽 selector — 키 이름은 liveTopicSpec.selectorKeys 와 일치.
  const selector = useMemo(
    () => (symbol && marketType ? { market_type: marketType, symbol } : undefined),
    [marketType, symbol],
  );

  const { data, status } = useDataServiceRow<T>({
    datasource,
    match,
    initialFetch,
    selector,
    enabled: Boolean(symbol && datasource) && enabled,
    watchColumns,
  });

  const { stale } = useLoadingTimeout({
    hasData: data !== null && data !== undefined,
    initialDelayMs: 8000,
  });

  return { data, status, stale };
}

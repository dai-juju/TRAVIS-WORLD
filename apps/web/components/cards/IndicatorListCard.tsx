"use client";
/**
 * IndicatorListCard — 선물 지표 정렬 랭킹 리스트 카드 (M2 테마 A Step 3, 2026-06-11).
 *
 * 역할:
 *   now_futures_indicator 한 테이블을 Realtime 구독하고, AI 가 고른 indicator
 *   datasource(premium_index / basis / open_interest / long_short_ratio /
 *   taker_long_short)에 맞는 컬럼 구성으로 다중 심볼 랭킹을 렌더한다.
 *   "top OI" / "highest funding" / "LSR ranking" 류 쿼리의 전용 카드 —
 *   [10-3] 기둥1 (전 metric 리스트 표현) 완결.
 *
 * 구조 (두 기존 카드의 하이브리드):
 *   - 데이터 흐름 = CoinListCard 패턴 (useDataServiceTable + evaluateFilters
 *     + sort + limit, 500ms throttle, 채널은 물리 테이블 기준 공유).
 *   - 표시 적응 = IndicatorCard 패턴 (descriptor 테이블 — datasource 별 컬럼
 *     정의는 indicatorListDescriptors.ts 한 곳에만. 새 metric = descriptor 행 추가).
 *
 * 정렬 정확성 (사이트=DB 위생 #9):
 *   - 초기 SELECT 에 서버 측 order 적용 (initialFetch.order) — limit(500) <
 *     테이블 행 수(~628) 상황에서 "초기 화면이 정렬 상위권으로 채워짐" 보장.
 *     단 이는 **초기 윈도우 한정 방어선** — Realtime 이 전 테이블 UPDATE 를
 *     Map 에 누적하므로 정상 상태의 진실은 클라이언트 재정렬이다 (code-reviewer
 *     W1, 2026-06-11).
 *   - sort 미지정 시 descriptor.defaultSort 사용 ("top OI" 처럼 정렬 의도가
 *     암묵적인 쿼리에서도 의미 있는 랭킹).
 *   - null 값은 방향 무관 바닥 (indicator 컬럼은 COINM/USDM 별 NULL 흔함).
 *
 * Step 4 인계: 행 단위 flash + 순위 FLIP 은 Step 4 (공통 LiveRow) 에서 적용.
 *   descriptor.watchColumns 가 flash 비교 대상으로 예약돼 있다.
 */

import { memo, useCallback, useMemo } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  getIndicatorListDescriptor,
  type IndicatorListDescriptor,
} from "@/lib/cards/indicatorListDescriptors";
import type { IndicatorRow } from "@/lib/cards/indicatorDescriptors";
import { COMING_SOON_LABEL } from "@/lib/cards/renderableDatasource";
import {
  DEFAULT_INITIAL_LIMIT,
  initialFetch as dsInitialFetch,
  useDataServiceTable,
  type EqFilter,
} from "@/lib/dataService";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { evaluateFilters } from "@/lib/realtime/filterEvaluator";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

/** 정렬 비교값 — null/비숫자는 방향 무관 바닥으로 보낸다. */
function sortValue(row: IndicatorRow, field: string): number | null {
  const v = row[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function IndicatorListCardInner({ config }: CardComponentProps) {
  const {
    datasource,
    exchange,
    marketType,
    filters,
    sort,
    limit = 20,
  } = config.data;

  // self-gate: descriptor 가 있는 datasource 만 렌더 (IndicatorCard 와 동일 패턴).
  // schema 의 dataShapes cross-field 검증이 1차 방어선이고, 이건 표시 계층 2차 방어.
  //   useMemo 인 이유 (관측 기반, 2026-06-11 eslint react-hooks/preserve-manual-memoization):
  //   일반 함수 호출 반환값을 파생값(sortField 등)의 출처로 쓰면 React Compiler 가
  //   "dependency may be modified later" 로 수동 memo 보존을 포기했다("Compilation
  //   Skipped" 4건). useMemo 로 감싸자 해소 — 컴파일러가 memo 결과를 안정 값으로 취급.
  const descriptor = useMemo(
    () => getIndicatorListDescriptor(datasource),
    [datasource],
  );
  const renderable = Boolean(descriptor);

  // 유효 정렬 — AI sort 우선, 없으면 descriptor 기본값.
  //   객체가 아닌 원시값 2개로 분해 — React Compiler 가 descriptor 파생 객체를
  //   mutable 로 추론해 수동 memo 보존을 포기하는 것 방지 (deps 는 원시값만).
  const sortField = sort?.field ?? descriptor?.defaultSort.field;
  const sortDirection = sort?.direction ?? descriptor?.defaultSort.direction;

  const pk = useCallback(
    (row: IndicatorRow) => `${row.exchange}:${row.market_type}:${row.symbol}`,
    [],
  );

  // 초기 fetch — 서버 측 order 로 "정렬 상위 N" 보장 + exchange/marketType 서버 필터.
  const initialFetch = useCallback(async (): Promise<IndicatorRow[]> => {
    const eq: EqFilter[] = [];
    if (exchange) eq.push({ column: "exchange", value: exchange });
    if (marketType) eq.push({ column: "market_type", value: marketType });
    const data = await dsInitialFetch<IndicatorRow>({
      datasource,
      eq,
      limit: DEFAULT_INITIAL_LIMIT,
      order: sortField
        ? { column: sortField, ascending: sortDirection === "asc" }
        : undefined,
    });
    return Array.isArray(data) ? data : [];
  }, [datasource, exchange, marketType, sortField, sortDirection]);

  const { rows, status } = useDataServiceTable<IndicatorRow>({
    datasource,
    pk,
    initialFetch,
    throttleMs: 500,
    enabled: Boolean(datasource) && renderable,
  });

  // 필터 + 정렬 + 상한 (rows 참조 변경 시만 재계산 — CoinListCard 패턴).
  //   scopeCount = exchange/marketType 만 적용한 모수 — subtitle 분모가 "내가 건
  //   조건과 무관한 전체 628" 로 보이는 혼란 방지 (code-reviewer W3, 2026-06-11).
  const { displayed, scopeCount } = useMemo(() => {
    const list: IndicatorRow[] = [];
    let scoped = 0;
    for (const row of rows.values()) {
      if (exchange && row.exchange !== exchange) continue;
      if (marketType && row.market_type !== marketType) continue;
      scoped += 1;
      if (!evaluateFilters(row, filters)) continue;
      list.push(row);
    }
    if (sortField) {
      const mul = sortDirection === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const av = sortValue(a, sortField);
        const bv = sortValue(b, sortField);
        // null 은 방향 무관 바닥 — "값 없는 심볼이 랭킹 상단 점유" 방지.
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * mul;
      });
    }
    return { displayed: list.slice(0, limit), scopeCount: scoped };
  }, [rows, exchange, marketType, filters, sortField, sortDirection, limit]);

  const title = config.title ?? descriptor?.defaultTitle ?? "Indicators";
  const subtitle =
    config.subtitle ?? `${displayed.length} of ${scopeCount} symbols`;
  const kicker = config.kicker ?? descriptor?.kicker;

  const { stale } = useLoadingTimeout({
    hasData: rows.size > 0,
    initialDelayMs: 8000,
  });

  return (
    <div className="flex h-full flex-col px-3 py-2 font-sans text-foreground">
      <header className="flex-shrink-0 border-b border-[color:var(--ink-5)] pb-2">
        {kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {kicker}
          </div>
        )}
        <h3
          className="mt-0.5 font-serif text-[18px] leading-tight tracking-tight"
          dangerouslySetInnerHTML={{ __html: sanitizeTitle(title) }}
        />
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {subtitle}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!renderable || !descriptor ? (
          <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
        ) : status === "error" ? (
          <StatusLine tone="down">! realtime error</StatusLine>
        ) : rows.size === 0 ? (
          <LoadingOrStale stale={stale} />
        ) : displayed.length === 0 ? (
          <StatusLine tone="neutral">no matches</StatusLine>
        ) : (
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-[color:var(--ink-5)]">
                <th className="py-1 text-left font-normal text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
                  SYMBOL
                </th>
                {descriptor.columns.map((col) => (
                  <th
                    key={col.key}
                    className="py-1 text-right font-normal text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((row) => (
                <IndicatorListRow
                  key={pk(row)}
                  row={row}
                  descriptor={descriptor}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * 행 1개 — 심볼 + descriptor 컬럼들. Step 4 에서 flash/FLIP 이 여기 적용된다.
 * memo: flush 시 변경된 row 만 새 참조 → 안 바뀐 행 재렌더 skip (저사양 절감,
 * code-reviewer S1).
 */
const IndicatorListRow = memo(function IndicatorListRow({
  row,
  descriptor,
}: {
  row: IndicatorRow;
  descriptor: IndicatorListDescriptor;
}) {
  return (
    <tr className="border-b border-[color:var(--ink-5)]">
      <td className="py-1 text-foreground font-semibold">{row.symbol}</td>
      {descriptor.columns.map((col) => {
        const tone = col.tone?.(row) ?? "neutral";
        const color =
          tone === "up"
            ? "var(--up)"
            : tone === "down"
              ? "var(--down)"
              : "var(--ink-2)";
        return (
          <td
            key={col.key}
            className="py-1 text-right tabular-nums"
            style={{ color }}
          >
            {col.value(row)}
          </td>
        );
      })}
    </tr>
  );
});

/** 로딩 vs 8초+ 정체 stale 분기 (CoinListCard 와 동일 패턴). */
function LoadingOrStale({ stale }: { stale: boolean }) {
  if (stale) {
    return (
      <div className="space-y-1 p-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <div className="text-[color:var(--ink-4)]">··· loading (8s+)</div>
        <div className="text-[color:var(--down)] normal-case tracking-normal">
          connection issue — check Supabase/worker status
        </div>
      </div>
    );
  }
  return <StatusLine tone="neutral">··· loading</StatusLine>;
}

function StatusLine({
  tone,
  children,
}: {
  tone: "neutral" | "down";
  children: string;
}) {
  const color = tone === "down" ? "var(--down)" : "var(--ink-4)";
  return (
    <div
      className="p-3 font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color }}
    >
      {children}
    </div>
  );
}

export const IndicatorListCard = memo(IndicatorListCardInner);
IndicatorListCard.displayName = "IndicatorListCard";

export default IndicatorListCard;

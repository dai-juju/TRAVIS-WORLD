"use client";
/**
 * TableCard — 모양-제네릭 set 표 (Composable Expressiveness Stage 1 Step 2, 2026-06-29).
 *
 * 역할:
 *   "어떤 set datasource 든 받는 하나의 표." coin-list-card(티커 전용)와
 *   indicator-list-card(지표 전용)를 수렴 — AI 가 고른 datasource 의 tableDescriptors
 *   레시피로 컬럼/색/정렬/식별을 파생해 다중 심볼 랭킹/스크리닝을 렌더한다.
 *   컴포넌트는 데이터 필드명을 모른다(레시피가 공급). PRD §2 "모든 데이터 × 모든 형태".
 *
 * 두 기존 카드의 병합:
 *   - 표시 적응 = IndicatorListCard 의 descriptor 구동 thead/tbody (base).
 *   - 데이터 흐름 = 공통(useDataServiceTable + evaluateFilters + sort + slice, 500ms throttle).
 *   - 가상화 + fetchAll('전체보기') + 연속 색농도 = CoinListCard 에서 흡수(무회귀).
 *   - 색 = 레시피의 tone(방향)/intensity(크기)를 tableCardFormat 이 픽셀로 번역(바닥값 form 소유).
 *
 * 성능 / 표시 규모 (저사양 Intel UHD 620 + 8GB):
 *   - displayed.length ≤ VIRTUALIZE_THRESHOLD → <table> + 순위 FLIP 슬라이드.
 *   - 초과 → @tanstack/react-virtual 가상 스크롤(가시영역만 DOM) + flash 만(FLIP off,
 *     transform 충돌). 지표 리스트도 '전체보기' 시 이 경로 진입 가능(티커 동일 처리).
 *   - useVirtualizer 는 React Compiler 비호환 → Compiler 가 이 컴포넌트 최적화 skip →
 *     수동 useMemo/useCallback/memo + 원시값 분해(sortField 등)로 메모이제이션 담당.
 *
 * Stage 1 범위: registry 등록 = Step 3 ✅(2026-06-30, table-card 양쪽 등록). 옛 두 카드
 *   (coin-list-card / indicator-list-card) 폐기 = Step 4 ✅(저장뷰는 alias 대신 전체 삭제
 *   — 베타 전, 폐기 옛 id 는 graceful skip 안전망). 라이브 G2 = Step 5.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import { TableCardRow, TableRowDiv } from "@/components/cards/TableCardRow";
import {
  LoadingOrStale,
  StatusLine,
} from "@/components/cards/TableCardStatus";
import {
  buildRowKey,
  compareByField,
  gridTemplateColumns,
  numericField,
} from "@/lib/cards/tableCardFormat";
import {
  getTableDescriptor,
  type TableRow,
} from "@/lib/cards/tableDescriptors";
import {
  COMING_SOON_LABEL,
  isDatasourceSupportedByComponent,
} from "@/lib/cards/renderableDatasource";
import {
  DEFAULT_INITIAL_LIMIT,
  initialFetch as dsInitialFetch,
  splitServerFilters,
  useDataServiceTable,
  type EqFilter,
} from "@/lib/dataService";
import { useListFlip } from "@/lib/hooks/useListFlip";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { evaluateFilters } from "@/lib/realtime/filterEvaluator";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

// [10-33] 패턴: 이 값 초과 시 가상 스크롤로 전환(저사양 1,400행 대비).
const VIRTUALIZE_THRESHOLD = 100;
// 가상 행 1개 추정 높이(px). 고정 estimateSize — 라이브 실측 후 정밀 조정(Step 5).
const ROW_HEIGHT = 26;
// working Map 상한 (ff#2 Step 4 C2) — 이벤트성 set(청산 INSERT=매번 새 pk)의 무한
//   누적 방어. FETCH_HARD_CAP(3000) + 라이브 헤드룸. now_* 는 덮어쓰기라 무영향.
const LIVE_ROWS_CAP = 5000;

function TableCardInner({ config }: CardComponentProps) {
  const { datasource, exchange, marketType, filters, sort, limit } = config.data;

  // 표시 레시피. useMemo — React Compiler 가 일반 함수 반환값을 mutable 로 추론해
  //   수동 memo 보존을 포기하는 것 방지(IndicatorListCard 패턴).
  const descriptor = useMemo(() => getTableDescriptor(datasource), [datasource]);

  // ── 동적 컬럼 파생 (사이클 4b [10-102](a), 2026-07-12) ──
  //   통합 스크리너 descriptor 는 dynamicColumns 로 AI 의 filters/sort 참조 필드에서
  //   컬럼을 파생 — ChartCard effectiveDescriptor(스타일 override)와 동형 패턴.
  //   기존 descriptor(미선언)는 원본 그대로 = 무회귀. 컬럼 0개 = 참조 metric 없음
  //   → graceful 안내(기본 컬럼 큐레이션 폴백 금지 — CLAUDE.md 사용자 재강조).
  const effectiveDescriptor = useMemo(() => {
    if (!descriptor?.dynamicColumns) return descriptor;
    return { ...descriptor, columns: descriptor.dynamicColumns({ filters, sort }) };
  }, [descriptor, filters, sort]);
  const noMetricColumns =
    Boolean(descriptor?.dynamicColumns) &&
    effectiveDescriptor?.columns.length === 0;

  // 렌더 게이트 = registry 권한(dataShapes) 단일 진실 (Step 3 일원화, 2026-06-30).
  //   descriptorKeys ≡ table-card.dataShapes 등치는 tableDescriptors.test 불변식이 박제 →
  //   descriptor(아래 표시 lookup)는 "어떻게 그릴지"의 거울일 뿐(게이트 아님). 단, 등치가
  //   깨진 잠복 상황(미래 datasource 가 dataShapes 엔 있고 descriptor 엔 없음)에서도 crash
  //   대신 graceful 하도록 렌더부에서 `!descriptor` 를 방어선으로 유지(CLAUDE.md 절대 crash 금지).
  const renderable = isDatasourceSupportedByComponent(
    config.componentId,
    datasource,
  );

  // 유효 정렬 — AI 우선, 없으면 descriptor 기본. 원시값 2개로 분해(Compiler memo 보존).
  const sortField = sort?.field ?? descriptor?.defaultSort?.field;
  const sortDirection = sort?.direction ?? descriptor?.defaultSort?.direction;

  // 식별/재조정 키 — descriptor 가 공급(symbol 특수처리 제거). 없으면 빈 키(미구독).
  const rowKeyFields = descriptor?.rowKeyFields;
  const pk = useCallback(
    (row: TableRow) => (rowKeyFields ? buildRowKey(row, rowKeyFields) : ""),
    [rowKeyFields],
  );

  // 유효 limit — AI 가 결정(생략=전체 · 숫자=그 수). descriptor 기본 cap 없음(하드코딩 금지,
  //   사용자 결정 2026-06-30 — defaultLimit 필드 제거). undefined = 전체(slice 안 함). 티커·지표 동일.
  const effectiveLimit = limit;

  // 초기 fetch — 서버 order + filters pushdown + fetchAll(전체보기). CoinListCard 패턴.
  const initialFetch = useCallback(async (): Promise<TableRow[]> => {
    const pushdown = splitServerFilters(filters);
    const eq: EqFilter[] = [...pushdown.eq];
    if (exchange) eq.push({ column: "exchange", value: exchange });
    if (marketType) eq.push({ column: "market_type", value: marketType });
    const wantsAll =
      effectiveLimit === undefined || effectiveLimit > DEFAULT_INITIAL_LIMIT;
    const data = await dsInitialFetch<TableRow>({
      datasource,
      eq,
      in: pushdown.inFilters,
      // 범위 필터 서버 pushdown — "sort + 범위" 조합의 fetch 창 절단 왜곡 방지 (C1).
      range: pushdown.range,
      order: sortField
        ? { column: sortField, ascending: sortDirection === "asc" }
        : undefined,
      ...(wantsAll ? { fetchAll: true } : { limit: DEFAULT_INITIAL_LIMIT }),
    });
    return Array.isArray(data) ? data : [];
  }, [
    datasource,
    exchange,
    marketType,
    filters,
    sortField,
    sortDirection,
    effectiveLimit,
  ]);

  const { rows, status } = useDataServiceTable<TableRow>({
    datasource,
    pk,
    initialFetch,
    throttleMs: 500,
    // noMetricColumns = 표시할 컬럼이 없는 상태 — fetch 자체가 낭비라 차단(안내만).
    enabled: Boolean(datasource) && renderable && !noMetricColumns,
    maxRows: LIVE_ROWS_CAP,
  });

  // 필터 + 정렬 + 상한 (rows 참조 변경 시만 재계산).
  //   scopeCount = exchange/marketType 만 적용한 모수(subtitle 분모 — 전체 628 혼란 방지).
  const { displayed, scopeCount } = useMemo(() => {
    const list: TableRow[] = [];
    let scoped = 0;
    for (const row of rows.values()) {
      if (exchange && row.exchange !== exchange) continue;
      if (marketType && row.market_type !== marketType) continue;
      scoped += 1;
      if (!evaluateFilters(row, filters)) continue;
      list.push(row);
    }
    if (sortField) {
      // 숫자/문자열 합집합 비교 — 티커(symbol 알파벳)·지표(수치) 정렬 둘 다 보존.
      const dir = sortDirection ?? "desc";
      list.sort((a, b) => compareByField(a, b, sortField, dir));
    }
    return {
      displayed:
        effectiveLimit === undefined ? list : list.slice(0, effectiveLimit),
      scopeCount: scoped,
    };
  }, [rows, exchange, marketType, filters, sortField, sortDirection, effectiveLimit]);

  // 임계값 초과 시 가상 스크롤(FLIP off), 이하면 table + FLIP.
  const shouldVirtualize = displayed.length > VIRTUALIZE_THRESHOLD;

  // 순위 FLIP — 가상화 모드에선 비활성(빈 orderKey → 모션 skip + join 비용 회피).
  const orderKey = useMemo(
    () => (shouldVirtualize ? "" : displayed.map((row) => pk(row)).join("|")),
    [displayed, pk, shouldVirtualize],
  );
  const tbodyRef = useListFlip(orderKey);

  // flash 출처 — descriptor.flashColumn(티커=last_price 가격박동) 우선, 없으면 sort 값(지표 랭킹).
  const flashField = descriptor?.flashColumn ?? sortField;

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? displayed.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // 안정 키 — 가상 행 재사용 시 useRowFlash 값 비교가 엉키지 않도록 pk 고정.
    getItemKey: (index) => {
      const row = displayed[index];
      return row ? pk(row) : index;
    },
    overscan: 8,
  });

  const title = config.title ?? descriptor?.defaultTitle ?? "Table";
  const subtitle =
    config.subtitle ??
    `${displayed.length} of ${scopeCount} ${descriptor?.countNoun ?? "symbols"}`;
  const kicker = config.kicker ?? descriptor?.kicker;
  const gridTemplate = effectiveDescriptor
    ? gridTemplateColumns(effectiveDescriptor)
    : "";

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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!renderable || !effectiveDescriptor ? (
          <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
        ) : noMetricColumns ? (
          // 통합 스크리너에 참조 metric 이 없음 — 기본 컬럼 큐레이션 폴백 금지
          //   (표시 결정은 AI 소유). self-correction 대상이 아닌 graceful 안내.
          <StatusLine tone="neutral">
            no metrics referenced — filter or sort by an indicator field
          </StatusLine>
        ) : status === "error" ? (
          <StatusLine tone="down">! realtime error</StatusLine>
        ) : rows.size === 0 ? (
          <LoadingOrStale stale={stale} />
        ) : displayed.length === 0 ? (
          <StatusLine tone="neutral">no matches</StatusLine>
        ) : shouldVirtualize ? (
          // 가상 스크롤 — div role="table" + absolute translateY (<tr> transform 은
          //   border-collapse 를 깨므로 회피). 컬럼 폭은 descriptor.width → grid-template.
          <>
            {/* [10-79] 회수 (2026-07-12): 가상화 경로에도 컬럼 헤더 — <table> 경로와
                비대칭 해소. sticky(스크롤 컨테이너 기준) + 행과 동일 gridTemplate =
                폭 정합 보장. bg 지정: 스크롤 시 행이 비쳐 보이는 것 방지. */}
            <div
              role="row"
              className="sticky top-0 z-10 grid w-full border-b border-[color:var(--ink-5)] bg-[color:var(--paper)] font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span className="py-1 text-left">
                {effectiveDescriptor.labelColumn.header}
              </span>
              {effectiveDescriptor.columns.map((col) => (
                <span key={col.key} className="py-1 text-right">
                  {col.header}
                </span>
              ))}
            </div>
            <div
              role="table"
              className="relative w-full font-mono text-[11px]"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((vItem) => {
                const row = displayed[vItem.index];
                if (!row) return null;
                return (
                  <TableRowDiv
                    key={vItem.key}
                    row={row}
                    descriptor={effectiveDescriptor}
                    flashValue={
                      flashField ? numericField(row, flashField) : null
                    }
                    top={vItem.start}
                    height={vItem.size}
                    gridTemplate={gridTemplate}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <table className="w-full font-mono text-[11px]">
            <thead>
              <tr className="border-b border-[color:var(--ink-5)]">
                <th className="py-1 text-left font-normal text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
                  {effectiveDescriptor.labelColumn.header}
                </th>
                {effectiveDescriptor.columns.map((col) => (
                  <th
                    key={col.key}
                    className="py-1 text-right font-normal text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {displayed.map((row) => (
                <TableCardRow
                  key={pk(row)}
                  flipKey={pk(row)}
                  row={row}
                  descriptor={effectiveDescriptor}
                  flashValue={flashField ? numericField(row, flashField) : null}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export const TableCard = memo(TableCardInner);
TableCard.displayName = "TableCard";

export default TableCard;

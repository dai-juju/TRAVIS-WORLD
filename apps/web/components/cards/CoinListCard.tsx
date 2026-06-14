"use client";
/**
 * CoinListCard — content-mode 코인 목록 카드 (M1.4 Step 3-3, 2026-04-21).
 *
 * 역할:
 *   now_{spot|futures}_ticker 전체 테이블을 Supabase Realtime 으로 구독하고,
 *   AI 가 발행한 filters + sort + limit 로 실시간 스크리닝. 조건을 만족하는 코인
 *   이 들어오거나(새 심볼 충족) 빠지면(기존 심볼 이탈) UI 가 동적 갱신된다.
 *
 * updateMode:
 *   'content' — 카드 안의 "항목" 이 동적으로 추가/제거. AI 프롬프트 발행 시점
 *   의 스냅샷이 아니라 실시간 재평가. PRD §3 참조.
 *
 * 성능 / 표시 규모 ([10-33] Step 4, 2026-06-14):
 *   limit 생략 시 "모든 코인" 표시 → 최대 ~1,447행. 전수 DOM 렌더는 저사양
 *   (Intel UHD 620 + 8GB) 부담이라 **임계값 분기**:
 *   - displayed.length ≤ VIRTUALIZE_THRESHOLD → 기존 <table> + 순위 FLIP 슬라이드.
 *   - 초과 → @tanstack/react-virtual 가상 스크롤(가시영역만 DOM) + flash 만.
 *   가상화와 FLIP 은 같은 transform 을 다퉈 공존 불가 → 큰 리스트는 슬라이드 OFF
 *   (1,400행 스크롤에서 순위 슬라이드는 비현실적, frontend 자문 2026-06-14).
 *   useDataServiceTable 이 500ms throttle 로 flush → Map<pk, row>. now_* 는 거래소
 *   활성 심볼 수(~1,447)로 자연 bounded — 별도 행 상한 가드 불필요.
 *
 * 디자인:
 *   UI-3 Monochrome 테이블 — ink 테두리, mono 11px, change_24h_pct 은 up/down
 *   2색 예외 적용 + opacity 로 강도 표현 (|pct|/10 정규화).
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
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
// M1.8 §8.5-b (2026-05-26) — 표시 단위 헬퍼 단일 진실 원천 경유.
import { formatPct, formatPrice } from "@/lib/format/marketUnits";
import { useListFlip } from "@/lib/hooks/useListFlip";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { useRowFlash } from "@/lib/hooks/useRowFlash";
import { evaluateFilters } from "@/lib/realtime/filterEvaluator";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

/**
 * now_{spot|futures}_ticker row 의 최소 스키마 — CoinListCard 가 직접 쓰는 필드만.
 * 실제 컬럼명(M1.3 마이그레이션 기준):
 *   - 24h 변동률 = `price_change_pct`
 *   - USD 거래대금 = `quote_volume`
 *   - `last_price` 는 nullable
 */
type CoinRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  last_price: number | null;
  price_change_pct: number | null;
  quote_volume: number | null;
  volume_chg_5m: number | null;
  updated_at: string;
} & Record<string, unknown>;

// [10-33] Step 4 (2026-06-14): 이 값 초과 시 가상 스크롤로 전환.
//   80~120 권장 범위 중 100 채택 — 라이브 실측으로 조정 가능(jank 관측 시).
const VIRTUALIZE_THRESHOLD = 100;

// 가상 행 1개의 추정 높이(px). 고정 estimateSize — 저사양에서 ResizeObserver 회피.
//   ⚠️ 실제 행 높이(py-1 + 11px mono + border)와 어긋나면 스크롤 점프 →
//   라이브 실측 후 정밀 조정 대상(frontend 자문 강조 1순위).
const ROW_HEIGHT = 26;

function CoinListCardInner({ config }: CardComponentProps) {
  // [10-33] Step 4: limit 기본 20 제거 — 생략 시 "모든 코인"(slice 안 함).
  const { datasource, exchange, marketType, filters, sort, limit } =
    config.data;

  // 렌더 가능성 가드 (테마 A Step 5 — registry dataShapes 파생):
  // 이 컴포넌트가 지원 선언(dataShapes)하지 않은 datasource 면 구독 skip +
  // graceful "coming soon". schema superRefine(1차) 를 안 거친 경로(저장 뷰 복원 등)의
  // 표시 계층 2차 방어선.
  const renderable = isDatasourceSupportedByComponent(
    config.componentId,
    datasource,
  );

  // 복합 PK 직렬화 — 정확한 Map key 로 사용. useDataServiceTable 재구독 루프 방지용 stable 참조.
  const pk = useCallback(
    (row: CoinRow) => `${row.exchange}:${row.market_type}:${row.symbol}`,
    [],
  );

  // 초기 전체 fetch — exchange/marketType 서버 필터 + filters pushdown + 서버 측 order.
  // [10-26] 회수 ([10-33] Step 2): order 를 서버로 내려 "정렬 상위 N" 보장.
  // [10-33] Step 4: limit 생략(전체 의도) 또는 500 풀 초과 시 fetchAll →
  //   .range() 페이지네이션으로 매칭 전부 수집(상한 FETCH_HARD_CAP). 그 외엔 기존
  //   500 풀(클라가 slice). limit 지정 < 500 케이스는 풀이 표시 수보다 넉넉.
  const initialFetch = useCallback(async (): Promise<CoinRow[]> => {
    const pushdown = splitServerFilters(filters);
    const eq: EqFilter[] = [...pushdown.eq];
    if (exchange) eq.push({ column: "exchange", value: exchange });
    if (marketType) eq.push({ column: "market_type", value: marketType });
    const order = sort
      ? { column: sort.field, ascending: sort.direction === "asc" }
      : { column: "price_change_pct", ascending: false };
    const wantsAll = limit === undefined || limit > DEFAULT_INITIAL_LIMIT;
    const data = await dsInitialFetch<CoinRow>({
      datasource,
      eq,
      in: pushdown.inFilters,
      order,
      ...(wantsAll ? { fetchAll: true } : { limit: DEFAULT_INITIAL_LIMIT }),
    });
    return Array.isArray(data) ? data : [];
  }, [datasource, exchange, marketType, filters, sort, limit]);

  const { rows, status } = useDataServiceTable<CoinRow>({
    datasource,
    pk,
    initialFetch,
    throttleMs: 500,
    enabled: Boolean(datasource) && renderable,
  });

  // 필터 + 정렬 + 상한.
  //   rows 참조가 바뀔 때만 재계산 (throttle flush 시 매번 새 Map 참조).
  //   exchange / marketType 은 서버 필터로 이미 좁혀 왔지만 Realtime INSERT 에서
  //   다른 거래소 row 가 흘러들 가능성에 대비해 한 번 더 방어.
  const displayed = useMemo(() => {
    const list: CoinRow[] = [];
    for (const row of rows.values()) {
      if (exchange && row.exchange !== exchange) continue;
      if (marketType && row.market_type !== marketType) continue;
      if (!evaluateFilters(row, filters)) continue;
      list.push(row);
    }
    if (sort) {
      const { field, direction } = sort;
      const mul = direction === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (typeof av === "number" && typeof bv === "number") {
          return (av - bv) * mul;
        }
        return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
      });
    } else {
      // 기본 정렬: 24h 변동률 내림차순 — "지금 뜨거운 코인 위로".
      list.sort(
        (a, b) =>
          (b.price_change_pct ?? -Infinity) - (a.price_change_pct ?? -Infinity),
      );
    }
    // [10-33] Step 4: limit 생략 시 전체(slice 안 함). 지정 시만 상위 N.
    return limit === undefined ? list : list.slice(0, limit);
  }, [rows, exchange, marketType, filters, sort, limit]);

  // [10-33] Step 4 — 임계값 초과 시 가상 스크롤(FLIP off), 이하면 table + FLIP.
  const shouldVirtualize = displayed.length > VIRTUALIZE_THRESHOLD;

  // Step 4b ([10-1]) — 순위 FLIP: 표시 순서가 바뀐 렌더에서 이동 행을 슬라이드.
  //   가상화 모드에선 비활성(빈 orderKey → 모션 skip + 큰 join 문자열 계산 회피).
  const orderKey = useMemo(
    () => (shouldVirtualize ? "" : displayed.map((row) => pk(row)).join("|")),
    [displayed, pk, shouldVirtualize],
  );
  const tbodyRef = useListFlip(orderKey);

  // 가상 스크롤러 — 스크롤 컨테이너(아래 overflow div)를 기준으로 가시 행만 렌더.
  //   count=0 (비가상화 시) 이면 사실상 no-op.
  const scrollRef = useRef<HTMLDivElement>(null);
  // useVirtualizer 는 React Compiler 가 분석 못 하는 패턴 → Compiler 가 이 컴포넌트
  //   최적화를 건너뜀(의도). 위 수동 useMemo/useCallback/memo 가 메모이제이션을
  //   이미 담당하므로 성능 손실 없음 (테마 A 함정 3 — React Compiler 인지).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? displayed.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // 안정 키 — 가상 행 재사용 시 useRowFlash 의 값 비교가 엉키지 않도록 pk 고정.
    getItemKey: (index) => {
      const row = displayed[index];
      return row ? pk(row) : index;
    },
    overscan: 8,
  });

  const title = config.title ?? "Market board";
  const subtitle =
    config.subtitle ?? `${displayed.length} of ${rows.size} symbols`;

  // Step 4-4 (2026-04-22) — 8초 이상 로딩 지속 시 stale 안내 노출.
  const { stale } = useLoadingTimeout({
    hasData: rows.size > 0,
    initialDelayMs: 8000,
  });

  return (
    <div className="flex h-full flex-col px-3 py-2 font-sans text-foreground">
      <header className="flex-shrink-0 border-b border-[color:var(--ink-5)] pb-2">
        {config.kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {config.kicker}
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
        {!renderable ? (
          <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
        ) : status === "error" ? (
          <StatusLine tone="down">! realtime error</StatusLine>
        ) : rows.size === 0 ? (
          <LoadingOrStale stale={stale} />
        ) : displayed.length === 0 ? (
          <StatusLine tone="neutral">no matches</StatusLine>
        ) : shouldVirtualize ? (
          // 가상 스크롤 — div role="table" + absolute translateY (★ <tr> transform 은
          //   border-collapse 레이아웃을 깨므로 회피, frontend 자문 2026-06-14).
          <div
            role="table"
            className="relative w-full font-mono text-[11px]"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const row = displayed[vItem.index];
              if (!row) return null;
              return (
                <CoinListRowDiv
                  key={vItem.key}
                  row={row}
                  top={vItem.start}
                  height={vItem.size}
                />
              );
            })}
          </div>
        ) : (
          <table className="w-full font-mono text-[11px]">
            <tbody ref={tbodyRef}>
              {displayed.map((row) => (
                <CoinListRow key={pk(row)} flipKey={pk(row)} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Step 4-4: 로딩 중 vs 8초 이상 정체 된 stale 상태를 분기 렌더. */
function LoadingOrStale({ stale }: { stale: boolean }) {
  if (stale) {
    return (
      <div className="space-y-1 p-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <div className="text-[color:var(--ink-4)]">··· loading (8s+)</div>
        <div className="text-[color:var(--down)] normal-case tracking-normal">
          연결 문제 가능 — Supabase/worker 상태 확인 권장
        </div>
      </div>
    );
  }
  return <StatusLine tone="neutral">··· loading</StatusLine>;
}

/**
 * 행 1개 (table 경로, 소규모 리스트). memo — flush 시 변경된 row 만 새 참조라
 * 안 바뀐 행 재렌더 skip. Step 4a ([10-1]) — last_price 변동 시 행 배경 flash.
 */
const CoinListRow = memo(function CoinListRow({
  row,
  flipKey,
}: {
  row: CoinRow;
  flipKey: string;
}) {
  const rowRef = useRowFlash<HTMLTableRowElement>(row.last_price);
  const pct = row.price_change_pct ?? 0;
  // 정규화 강도 — |pct| 가 10% 가 되면 포화(opacity 1.0). 이하는 선형.
  const intensity = Math.min(1, Math.abs(pct) / 10);
  const isUp = pct >= 0;
  return (
    <tr
      ref={rowRef}
      data-flip-key={flipKey}
      className="border-b border-[color:var(--ink-5)]"
    >
      <td className="py-1 text-foreground font-semibold">{row.symbol}</td>
      <td className="py-1 text-right tabular-nums text-[color:var(--ink-2)]">
        {row.last_price !== null ? `$${formatPrice(row.last_price)}` : "—"}
      </td>
      <td
        className="py-1 text-right tabular-nums"
        style={{
          color: isUp ? "var(--up)" : "var(--down)",
          opacity: 0.55 + intensity * 0.45,
        }}
      >
        {formatPct(pct)}
      </td>
    </tr>
  );
});

/**
 * 행 1개 (가상 스크롤 경로, 대규모 리스트). div 기반 — 가상화가 절대배치
 * translateY 로 위치를 잡으므로 <tr>(border-collapse) 대신 grid div 사용.
 *   - 컬럼 폭 고정(grid-cols)으로 행 간 정렬 일치 — div 는 table 처럼 컬럼 공유 X.
 *   - useRowFlash 는 HTMLElement 제네릭이라 div 에 그대로 적용(값 변동 flash 유지).
 *   - 순위 FLIP 슬라이드는 가상화 transform 과 충돌해 미적용(의도).
 */
const CoinListRowDiv = memo(function CoinListRowDiv({
  row,
  top,
  height,
}: {
  row: CoinRow;
  top: number;
  height: number;
}) {
  const rowRef = useRowFlash<HTMLDivElement>(row.last_price);
  const pct = row.price_change_pct ?? 0;
  const intensity = Math.min(1, Math.abs(pct) / 10);
  const isUp = pct >= 0;
  return (
    <div
      ref={rowRef}
      className="absolute left-0 grid w-full grid-cols-[1fr_6rem_4.5rem] items-center border-b border-[color:var(--ink-5)]"
      style={{ transform: `translateY(${top}px)`, height }}
    >
      <span className="truncate text-foreground font-semibold">
        {row.symbol}
      </span>
      <span className="text-right tabular-nums text-[color:var(--ink-2)]">
        {row.last_price !== null ? `$${formatPrice(row.last_price)}` : "—"}
      </span>
      <span
        className="text-right tabular-nums"
        style={{
          color: isUp ? "var(--up)" : "var(--down)",
          opacity: 0.55 + intensity * 0.45,
        }}
      >
        {formatPct(pct)}
      </span>
    </div>
  );
});

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

// formatPrice → `@/lib/format/marketUnits` 로 이전 (M1.8 §8.5-b). 단일 진실 원천 원칙.

export const CoinListCard = memo(CoinListCardInner);
CoinListCard.displayName = "CoinListCard";

export default CoinListCard;

"use client";
/**
 * ChartCard — 모양-제네릭 series 차트 (Composable 사이클 2 Step 4, 2026-07-08).
 *
 * 역할:
 *   "어떤 series datasource 든 받는 하나의 차트." 시계열 시맨틱(주 플롯 컬럼·기준선·
 *   단위·포맷)은 전부 chartDescriptors 레시피에서 파생 — 컴포넌트는 데이터 필드명을
 *   모른다. TRAVIS 첫 자체 데이터 차트(가격 캔들은 TradingView iframe 유지 정책).
 *
 * 데이터 흐름 (주기 pull — Realtime/WS 아님):
 *   useDataServiceSeries(per-symbol 병렬 fetch + interval/2 비례 refreshInterval).
 *
 * 다중 심볼 오버레이 (사이클 2 확정 (a)):
 *   AI 는 단일 심볼이면 data.symbol, 오버레이면 filters 의 `symbol in [...]` 로 표현
 *   (registry queryableFields 의 symbol `in` = 오버레이 실행 경로, zod 자문). 색은
 *   방향이 아닌 **심볼 슬롯**(범례 1:1) — chartFormat.seriesStrokes.
 *
 * 상태 분기 (전부 graceful, crash 금지 — FeedCard 동형):
 *   coming soon(미등록/레시피 없음) → missing symbol scope → loading → no data yet
 *   → error(첫 fetch 실패) → chart. 재fetch 실패는 훅의 soft-fail 이 기존 곡선 유지.
 *
 * ★ 등록 (Step 5, 2026-07-09): registerCards + componentRegistry 양쪽 등록 완료 =
 *   라이브 플립. 렌더 권한의 단일 진실 = registry dataShapes(history 6종) —
 *   isDatasourceSupportedByComponent 가 여기서 파생 (chartDescriptors 와 등치 불변식).
 */

import { memo, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  getChartDescriptor,
  type ChartDescriptor,
} from "@/lib/cards/chartDescriptors";
import {
  buildAlignedData,
  buildChartOptions,
  downsampleAligned,
  refreshMsForInterval,
  DEFAULT_CHART_POINTS,
  SERIES_STROKE_VARS,
  type ChartThemeTokens,
} from "@/lib/cards/chartFormat";
import { useUplot } from "@/lib/cards/useUplot";
import {
  COMING_SOON_LABEL,
  isDatasourceSupportedByComponent,
} from "@/lib/cards/renderableDatasource";
import { LoadingOrStale, StatusLine } from "@/components/cards/TableCardStatus";
import { useDataServiceSeries } from "@/lib/dataService";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { sanitizeTitle } from "@/lib/sanitizeTitle";
import { formatEventTime } from "@/lib/format/marketUnits";

type ChartRow = Record<string, unknown>;

/**
 * AI config → 오버레이 심볼 배열. 단일 = data.symbol / 오버레이 = filters
 * `symbol in [...]` (또는 `symbol =`). 둘 다 없으면 [] = 훅 idle (missing scope 안내).
 */
export function resolveChartSymbols(
  symbol: string | undefined,
  filters:
    | Array<{ field: string; operator: string; value: unknown }>
    | undefined,
): string[] {
  if (symbol) return [symbol];
  const clause = (filters ?? []).find((f) => f.field === "symbol");
  if (!clause) return [];
  if (clause.operator === "in" && Array.isArray(clause.value)) {
    return clause.value.map((v) => String(v)).filter((s) => s.length > 0);
  }
  if (clause.operator === "=" && typeof clause.value === "string") {
    return [clause.value];
  }
  return [];
}

function ChartCardInner({ config }: CardComponentProps) {
  const { datasource, exchange, marketType, symbol, filters, limit, interval } =
    config.data;

  // 표시 레시피 — 렌더 게이트 아님 (권한 진실 = registry dataShapes, Table/Feed 동형).
  const descriptor = useMemo(() => getChartDescriptor(datasource), [datasource]);
  const renderable = isDatasourceSupportedByComponent(
    config.componentId,
    datasource,
  );

  const symbols = useMemo(
    () => resolveChartSymbols(symbol, filters),
    [symbol, filters],
  );

  // interval — AI 생략 시 descriptor 기본값 (생략은 의미 부재라 의도 덮어쓰기 아님).
  const effectiveInterval = interval ?? descriptor?.defaultInterval;
  // 포인트 상한 — AI limit ?? 픽셀 밀도 기준 인프라 상한 (Feed 링버퍼 기본과 동격).
  const maxPoints = limit ?? DEFAULT_CHART_POINTS;

  const { series, status, lastUpdatedAt } = useDataServiceSeries<ChartRow>({
    datasource,
    symbols,
    exchange,
    marketType,
    interval: effectiveInterval,
    timeField: descriptor?.timeField,
    maxPoints,
    refreshIntervalMs: refreshMsForInterval(effectiveInterval),
    enabled: renderable && Boolean(descriptor) && symbols.length > 0,
  });

  // 픽셀 데이터 — series 참조가 안정(훅 per-series 재사용)이라 memo 가 실질 캐시.
  //   다운샘플은 실측 폭이 필요해 useUplot(명령형 레이어)의 prepareData 로 위임 —
  //   렌더 중 ref.current 읽기 금지(react-hooks/refs, [10-71] 교훈).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aligned = useMemo(() => {
    if (!descriptor || series.length === 0) return null;
    const raw = buildAlignedData(series, descriptor.timeField, descriptor.valueField);
    return raw[0].length === 0 ? null : raw; // 전 곡선 빈 데이터 = null
  }, [descriptor, series]);

  const labels = useMemo(() => series.map((g) => g.symbol), [series]);
  const makeOptions = (theme: ChartThemeTokens, width: number, height: number) =>
    buildChartOptions({
      descriptor: descriptor as ChartDescriptor, // aligned 존재 시 descriptor 보장
      theme,
      width,
      height,
      labels,
    });

  useUplot({
    containerRef,
    data: aligned,
    makeOptions,
    seriesKey: labels.join(","), // 구성 키 — 동수 심볼 스왑도 재생성 (reviewer S1)
    prepareData: downsampleAligned,
  });

  // 헤더 — AI 자유 텍스트 우선, 안전망은 descriptor (Table/Feed 동형).
  const title = config.title ?? descriptor?.defaultTitle ?? "Chart";
  const safeTitle = useMemo(() => sanitizeTitle(title), [title]);
  const kicker = config.kicker ?? descriptor?.kicker;
  const unitLabel =
    descriptor?.axisUnitLabel && marketType
      ? descriptor.axisUnitLabel(marketType)
      : undefined;
  const subtitle =
    config.subtitle ??
    [
      effectiveInterval,
      unitLabel,
      lastUpdatedAt ? `as of ${formatEventTime(lastUpdatedAt)}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");

  const hasData = aligned !== null;
  const { stale } = useLoadingTimeout({ hasData, initialDelayMs: 8000 });

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
          dangerouslySetInnerHTML={{ __html: safeTitle }}
        />
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          <span>{subtitle}</span>
          {labels.length > 1 && (
            <span className="flex items-center gap-1.5 normal-case tracking-normal">
              {labels.map((label, i) => (
                <span key={label} className="flex items-center gap-0.5">
                  <span
                    aria-hidden
                    className="inline-block h-[2px] w-3"
                    style={{
                      background:
                        SERIES_STROKE_VARS[i % SERIES_STROKE_VARS.length],
                    }}
                  />
                  {label}
                </span>
              ))}
            </span>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {/* uPlot 마운트 지점 — 항상 마운트 유지(재생성 비용 회피). */}
        <div ref={containerRef} className="h-full w-full" />
        {/* 상태 오버레이 — absolute 로 차트 위에 정확히 겹침 (reviewer S4:
            normal-flow 형제면 차트 div 가 안내문을 밀어냄). */}
        {(!renderable || !descriptor || symbols.length === 0 || !hasData) && (
          <div className="absolute inset-0 flex items-start bg-[color:var(--paper)]">
            {!renderable || !descriptor ? (
              <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
            ) : symbols.length === 0 ? (
              // ★ 유일한 1차 방어선 (reviewer W1, 2026-07-09): 현재 스키마는 chart-card
              //   의 symbol 존재를 강제하지 않음 — 주기 pull·비-토픽 카드라 superRefine
              //   (2.5) 대상 밖. shape 파생 강제는 [10-91]([10-78] 동류, Stage 1b/4).
              <StatusLine tone="neutral">missing symbol scope</StatusLine>
            ) : status === "error" ? (
              <StatusLine tone="down">! chart data error</StatusLine>
            ) : status === "loading" ? (
              <LoadingOrStale stale={stale} />
            ) : (
              // ready + 빈 시계열 = 이 창에 데이터 없음 (에러 아님 — 신규 상장/retention 밖).
              <StatusLine tone="neutral">no data in this window</StatusLine>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChartCard = memo(ChartCardInner);
ChartCard.displayName = "ChartCard";

export default ChartCard;

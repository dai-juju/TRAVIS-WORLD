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
 *   방향이 아닌 **심볼 슬롯**(범례 1:1) — chart/theme.seriesStrokes.
 *
 * ★ 분할 (M3-step3b Step 0, 2026-07-20, [10-120]① 회수 — 순수 이동, 거동 불변):
 *   AI 계약→축 번역 = lib/cards/useChartScope / freshness·결측 = useChartFreshness /
 *   오버레이 3겹 = ChartStatusOverlay. 본 파일은 form 조립(fetch 훅 연결 + 헤더 +
 *   픽셀 레이어 위임)만 소유한다.
 *
 * ★ 등록 (Step 5, 2026-07-09): registerCards + componentRegistry 양쪽 등록 완료 =
 *   라이브 플립. 렌더 권한의 단일 진실 = registry dataShapes(history 6종+집계) —
 *   isDatasourceSupportedByComponent 가 여기서 파생 (chartDescriptors 와 등치 불변식).
 */

import { memo, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import type { ChartDescriptor } from "@/lib/cards/chartDescriptors";
import {
  buildAlignedData,
  buildChartOptions,
  downsampleAligned,
  refreshMsForInterval,
  SERIES_STROKE_VARS,
  type ChartThemeTokens,
} from "@/lib/cards/chartFormat";
import { useChartScope, resolveChartSymbols } from "@/lib/cards/useChartScope";
import { useChartFreshness } from "@/lib/cards/useChartFreshness";
import { useUplot } from "@/lib/cards/useUplot";
import { ChartStatusOverlay } from "@/components/cards/ChartStatusOverlay";
import { useDataServiceSeries } from "@/lib/dataService";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

// 기존 소비자(테스트 포함)의 import 경로 보존 — 본체는 useChartScope 로 이동 (Step 0).
export { resolveChartSymbols };

type ChartRow = Record<string, unknown>;

function ChartCardInner({ config }: CardComponentProps) {
  const { datasource, exchange, marketType, interval } = config.data;

  const {
    descriptor,
    effectiveDescriptor,
    styleOverride,
    renderable,
    symbols,
    missingMarketScope,
    allowsMarketWide,
    hasScopeTarget,
    sideFilter,
    userInterval,
    setUserInterval,
    intervalOptions,
    supportsInterval,
    effectiveInterval,
    maxPoints,
  } = useChartScope(config);

  const { series, status } = useDataServiceSeries<ChartRow>({
    datasource,
    symbols,
    exchange,
    marketType,
    interval: effectiveInterval,
    side: sideFilter,
    // 심볼 없이도 요청 성립 = 전 시장 집계 (registry 파생, useChartScope 와 동일 진실).
    allowEmptySymbols: allowsMarketWide,
    timeField: descriptor?.timeField,
    maxPoints,
    // 주기 pull — descriptor 직접 지정(interval 없는 이벤트 datasource, 예: 펀딩 10분)
    //   > interval/2 비례 (사이클 2 Step 6 — 60초 폴백은 4h/8h 정산에 순수 낭비).
    refreshIntervalMs:
      descriptor?.defaultRefreshMs ?? refreshMsForInterval(effectiveInterval),
    enabled:
      renderable &&
      Boolean(descriptor) &&
      hasScopeTarget &&
      !missingMarketScope,
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
      // aligned 존재 시 descriptor 보장 — 스타일 override 반영본 (미지정 시 원본 동일 참조).
      descriptor: effectiveDescriptor as ChartDescriptor,
      theme,
      width,
      height,
      labels,
    });

  useUplot({
    containerRef,
    data: aligned,
    makeOptions,
    // 구성 키 — 동수 심볼 스왑도 재생성 (reviewer S1). 스타일 축 포함 (사이클 4a
    // reviewer W1): uPlot 은 생성 시점에만 옵션(paths/scales)을 읽으므로, 미래
    // "형태 사후 변경"이 config.style 만 바꿔도 재생성되도록 키에 승계.
    seriesKey: `${labels.join(",")}|${styleOverride ?? ""}`,
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
    [effectiveInterval, unitLabel].filter(Boolean).join(" · ");
  // 토글이 AI 시점 interval 과 달라지면 AI 자유 텍스트 subtitle("(1H INTERVALS)" 류)이
  // 낡는다 ([10-92]①). AI 텍스트 파싱/치환은 금지 — 표시 계층에서 현재 interval
  // 뱃지를 병기해 정정. fallback subtitle 은 effectiveInterval 직참조라 자동 갱신.
  const intervalOverridden =
    supportsInterval &&
    userInterval !== null &&
    userInterval !== (interval ?? descriptor?.defaultInterval) &&
    Boolean(config.subtitle);

  const { freshness, hasIncompleteBuckets } = useChartFreshness(
    series,
    descriptor,
  );

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
        {/* flex-wrap: 소형 카드에서 freshness/범례가 잘리는 대신 줄바꿈 ([10-92]③,
            crypto-trader P3 — 밀집 시 클리핑보다 개행이 정보 보존). */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {subtitle && <span>{subtitle}</span>}
          {intervalOverridden && (
            <span className="whitespace-nowrap">· showing {effectiveInterval}</span>
          )}
          {/* freshness — AI subtitle 유무와 무관한 상시 고지 (sampled 고지 선례).
              구분자 · 는 subtitle 존재 시에만 (빈 subtitle 이면 고아 중점 — reviewer W2:
              funding 은 interval/unitLabel 둘 다 없어 fallback subtitle 이 빈 문자열). */}
          {freshness && (
            <span className="whitespace-nowrap">
              {subtitle ? `· ${freshness}` : freshness}
            </span>
          )}
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
          {/* interval 토글 — nodrag(React Flow 노드 드래그 오발동 방지). 선택지는
              registry interval enum 파생(9종) — 사용자 결정 2026-07-09.
              supportsInterval = fetch 게이트와 같은 판정 상수 (reviewer S1 일관화). */}
          {supportsInterval && effectiveInterval && (
            <select
              value={effectiveInterval}
              onChange={(e) => setUserInterval(e.target.value)}
              aria-label="Chart interval"
              className="nodrag ml-auto cursor-pointer rounded border border-[color:var(--ink-5)] bg-transparent px-1 py-0.5 font-mono text-[9px] uppercase text-[color:var(--ink-3)] outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ink-3)]"
            >
              {intervalOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {/* uPlot 마운트 지점 — 항상 마운트 유지(재생성 비용 회피).
            ★ absolute inset-0 격리 (라이브 G2 hotfix 2026-07-09, nextjs 자문):
            uPlot 은 자기 픽셀 크기를 DOM 에 write 하는 유일한 카드 콘텐츠 —
            in-flow(h-full)면 그 크기가 flex 레이아웃으로 역류해 측정↔setSize
            되먹임(카드 점진 축소)을 만들 수 있다. flow 에서 빼 top-down 전용화. */}
        <div ref={containerRef} className="absolute inset-0" />
        <ChartStatusOverlay
          renderable={renderable}
          hasDescriptor={Boolean(descriptor)}
          missingMarketScope={missingMarketScope}
          hasScopeTarget={hasScopeTarget}
          hasData={hasData}
          status={status}
          stale={stale}
          disclosure={descriptor?.disclosure}
          hasIncompleteBuckets={hasIncompleteBuckets}
        />
      </div>
    </div>
  );
}

export const ChartCard = memo(ChartCardInner);
ChartCard.displayName = "ChartCard";

export default ChartCard;

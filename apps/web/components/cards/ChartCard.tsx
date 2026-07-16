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

import { memo, useMemo, useRef, useState } from "react";
import { getDatasource } from "@travis/shared";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  getChartDescriptor,
  type ChartDescriptor,
} from "@/lib/cards/chartDescriptors";
import {
  buildAlignedData,
  buildChartOptions,
  downsampleAligned,
  formatChartTime,
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
import { useNow } from "@/lib/hooks/useNow";
import { sanitizeTitle } from "@/lib/sanitizeTitle";
import { formatEventTime } from "@/lib/format/marketUnits";
import { formatRelativeTime } from "@/lib/format/relativeTime";

type ChartRow = Record<string, unknown>;

/**
 * AI config → 오버레이 심볼 배열. 단일 = data.symbol / 오버레이 = filters
 * `symbol in [...]` (또는 `symbol =`). 둘 다 없으면 [] = 훅 idle (missing scope 안내).
 *
 * ★ [10-104] hotfix (2026-07-12, G2-a 라이브 적발): AI 가 symbol 과 filters
 *   `symbol in [...]` 을 **이중 지정**하면 union 으로 합친다 — 옛 "symbol 우선
 *   return" 은 오버레이 의도를 조용히 단일 시리즈로 붕괴시켜 타이틀("BTC & ETH")과
 *   실제 렌더(BTC 만)가 어긋나는 신뢰 결함(crypto-trader 판정). 스키마 레벨
 *   이중 지정 정식화는 4b Step 5([10-91] symbol 스코프)와 한 묶음.
 */
export function resolveChartSymbols(
  symbol: string | undefined,
  filters:
    | Array<{ field: string; operator: string; value: unknown }>
    | undefined,
): string[] {
  const clause = (filters ?? []).find((f) => f.field === "symbol");
  const fromFilters =
    clause?.operator === "in" && Array.isArray(clause.value)
      ? clause.value.map((v) => String(v)).filter((s) => s.length > 0)
      : clause?.operator === "=" && typeof clause.value === "string"
        ? [clause.value]
        : [];
  if (!symbol) return fromFilters;
  // symbol 을 첫 슬롯(색/범례 기준)으로 두고 filters 값과 중복 없이 union.
  return [symbol, ...fromFilters.filter((s) => s !== symbol)];
}

function ChartCardInner({ config }: CardComponentProps) {
  const { datasource, exchange, marketType, symbol, filters, limit, interval } =
    config.data;

  // 표시 레시피 — 렌더 게이트 아님 (권한 진실 = registry dataShapes, Table/Feed 동형).
  const descriptor = useMemo(() => getChartDescriptor(datasource), [datasource]);

  // ── 스타일 override (사이클 4a [10-101], 2026-07-12) ──
  //   AI 계약 top-level style.series 가 있으면 descriptor 의 seriesStyle(도메인
  //   기본값)만 치환한 파생 descriptor 를 픽셀 레이어에 공급. tone(방향색)/
  //   midline(기준선)은 스타일과 직교인 도메인 가드레일이라 원본 유지 —
  //   title/kicker 의 "config 우선 ?? descriptor 안전망" 선례와 동형.
  //   오버레이 stepped 자동 전환·bars y스케일 0 포함은 chartFormat 이 effective
  //   스타일 기준으로 기존 로직 그대로 적용 (form 소유 픽셀 정책 불변).
  const styleOverride = config.style?.series;
  const effectiveDescriptor = useMemo(() => {
    if (!descriptor || !styleOverride) return descriptor;
    if (styleOverride === descriptor.seriesStyle) return descriptor;
    return { ...descriptor, seriesStyle: styleOverride };
  }, [descriptor, styleOverride]);

  const renderable = isDatasourceSupportedByComponent(
    config.componentId,
    datasource,
  );

  const symbols = useMemo(
    () => resolveChartSymbols(symbol, filters),
    [symbol, filters],
  );

  // ★ market scope 가드 (라이브 G2 hotfix 2026-07-09): market_type queryableField 를
  //   가진 datasource 는 marketType 이 PK prefix 필수 축 — AI 가 누락하면 인덱스
  //   미정합 풀스캔(9.8초/73k 버퍼 EXPLAIN 실측)으로 statement timeout 500 = Disk IO
  //   사고 벡터. registry 파생 게이트(하드코딩 0 — market_type 필드가 없는 미래
  //   series datasource 는 자동 면제). 스키마 파생 강제는 [10-91].
  const missingMarketScope = useMemo(() => {
    if (marketType) return false;
    return Boolean(
      getDatasource(datasource)?.queryableFields.some(
        (f) => f.name === "market_type",
      ),
    );
  }, [datasource, marketType]);

  // ── interval 토글 (사용자 UIUX 결정 2026-07-09, PRD §3 "카드 설정에서 조절" 실현) ──
  //   사후 조정은 카드 로컬 상태(세션 한정, 저장 뷰 미반영 = v1 단순화). 선택지는
  //   registry queryableFields 의 interval enum 파생 — 하드코딩 0 (datasource 가
  //   지원 interval 을 바꾸면 토글도 자동 추종). null = AI/descriptor 값 사용.
  const [userInterval, setUserInterval] = useState<string | null>(null);
  const intervalOptions = useMemo(
    () =>
      getDatasource(datasource)?.queryableFields.find(
        (f) => f.name === "interval",
      )?.enumValues ?? [],
    [datasource],
  );
  // interval — 토글 > AI > descriptor 기본값 (AI 생략은 의미 부재라 덮어쓰기 아님).
  // ★ interval 미지원 datasource 가드 (사이클 2 Step 6, Plan 검증 적발): funding_history
  //   (정산 이벤트, interval 축 없음)에 AI 가 interval 을 emit 해도 스키마가 안 막음 —
  //   그대로 fetch 에 넘기면 PostgREST 400(컬럼 부재) = 전 심볼 실패. registry 파생
  //   intervalOptions(위)로 지원 여부를 판정해 미지원이면 undefined 로 무력화
  //   (marketScope 가드와 동형 — 하드코딩 0, subtitle/refresh 도 함께 정리됨).
  const supportsInterval = intervalOptions.length > 0;
  const effectiveInterval = supportsInterval
    ? (userInterval ?? interval ?? descriptor?.defaultInterval)
    : undefined;
  // 포인트 상한 — AI limit ?? 픽셀 밀도 기준 인프라 상한 (Feed 링버퍼 기본과 동격).
  //   토글로 interval 이 바뀌어도 포인트 수 유지 = 시간범위가 늘어남 (사용자 결정
  //   2026-07-09 — Binance 관행. "기간 고정·해상도 변경"이 아님).
  const maxPoints = limit ?? DEFAULT_CHART_POINTS;

  const { series, status } = useDataServiceSeries<ChartRow>({
    datasource,
    symbols,
    exchange,
    marketType,
    interval: effectiveInterval,
    timeField: descriptor?.timeField,
    maxPoints,
    // 주기 pull — descriptor 직접 지정(interval 없는 이벤트 datasource, 예: 펀딩 10분)
    //   > interval/2 비례 (사이클 2 Step 6 — 60초 폴백은 4h/8h 정산에 순수 낭비).
    refreshIntervalMs:
      descriptor?.defaultRefreshMs ?? refreshMsForInterval(effectiveInterval),
    enabled:
      renderable &&
      Boolean(descriptor) &&
      symbols.length > 0 &&
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

  // ── freshness: 마지막 "데이터 포인트" 시각 (fetch 시각 아님 — 사용자 결정 2026-07-09).
  //   forward-fill 순회 lag([10-35])로 우측 끝이 수 시간 전일 수 있어, 표기 없이 두면
  //   "지금 데이터"로 오인 = 신뢰 문제 (crypto-trader E). ISO(+00:00 고정 포맷) 문자열
  //   그룹 간 최댓값은 Date.parse 숫자 비교(reviewer W1 — buildAlignedData 와 해석
  //   방식 통일: 문자열 사전식은 "Z" vs "+00:00" 포맷 갈림에 무음 취약). now 는
  //   useNow 5s 틱(렌더 중 Date.now() impure 회피 — IndicatorCard freshness 선례).
  const now = useNow();
  const lastPointIso = useMemo(() => {
    const timeField = descriptor?.timeField;
    if (!timeField) return null;
    let latestIso: string | null = null;
    let latestMs = -Infinity;
    for (const g of series) {
      const raw = g.rows[g.rows.length - 1]?.[timeField];
      if (typeof raw !== "string") continue;
      const ms = Date.parse(raw);
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
        latestIso = raw;
      }
    }
    return latestIso;
  }, [series, descriptor]);
  // 24h 이상 지난 포인트는 시각만으론 어제/그제 구분 불가 → 날짜 병기 ([10-92]②,
  // crypto-trader S1 적중 — 라이브 1d 토글에서 "09:00:00 (1D AGO)" 가 어느 날인지 모호).
  const lastPointMs = lastPointIso ? Date.parse(lastPointIso) : NaN;
  const lastPointLabel =
    lastPointIso && Number.isFinite(lastPointMs)
      ? now - lastPointMs >= 86_400_000
        ? formatChartTime(lastPointMs)
        : formatEventTime(lastPointIso)
      : null;
  // [10-99] 절대 시각 = UTC — 라벨은 두 경로(24h± 포매터) 공통으로 여기서 1회 부착.
  const freshness = lastPointLabel
    ? `last point ${lastPointLabel} UTC (${formatRelativeTime(lastPointIso, now)})`
    : null;

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
        {/* [10-109]① x축 상시 "UTC" 표식 (M3-step1 웜업, 2026-07-16) — 눈금 값의
            타임존 단서를 hover(툴팁) 없이 상시 노출 (TradingView 하단 타임존 표시
            관례). pointer-events-none = 차트 커서/툴팁 무간섭. 상태 오버레이(z-10,
            paper bg)가 뜨면 자연히 가려진다. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-1 bottom-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-[color:var(--ink-4)]"
        >
          UTC
        </span>
        {/* 상태 오버레이 — absolute 로 차트 위에 정확히 겹침 (reviewer S4:
            normal-flow 형제면 차트 div 가 안내문을 밀어냄). */}
        {(!renderable ||
          !descriptor ||
          missingMarketScope ||
          symbols.length === 0 ||
          !hasData) && (
          // z-10: 마운트 div 도 absolute 라 paint 순서를 DOM 순서에 안 맡기고 명시.
          <div className="absolute inset-0 z-10 flex items-start bg-[color:var(--paper)]">
            {!renderable || !descriptor ? (
              <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
            ) : missingMarketScope ? (
              // marketType 누락 = 위 가드가 fetch 자체를 차단한 상태 (500 원천 차단).
              <StatusLine tone="neutral">missing market scope</StatusLine>
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

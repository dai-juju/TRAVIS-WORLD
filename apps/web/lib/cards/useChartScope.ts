// apps/web/lib/cards/useChartScope.ts
//
// ChartCard 의 스코프/축 파생 훅 — ChartCard 분할 (M3-step3b Step 0, 2026-07-20,
// [10-120]① 회수). 순수 이동: 로직·주석 원본(ChartCard.tsx 사이클 2~M3-step3a) 그대로.
// "AI 계약(config) + registry + descriptor → fetch 에 넘길 축들" 번역을 한 곳에 모은다
// — 전부 registry 파생(하드코딩 0), 컴포넌트는 결과만 소비.

import { useMemo, useState } from "react";
import { getDatasource } from "@travis/shared";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  getChartDescriptor,
  type ChartDescriptor,
} from "@/lib/cards/chartDescriptors";
import {
  isComponentsMode,
  resolvePlotSpecs,
  type PlotSpec,
} from "@/lib/cards/chart/plotSpec";
import { DEFAULT_CHART_POINTS } from "@/lib/cards/chart/time";
import { isDatasourceSupportedByComponent } from "@/lib/cards/renderableDatasource";

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

/**
 * AI filters 의 시간축 범위 연산자 → 절대 시간창 ([10-120]② M3-step3b, 2026-07-20).
 *
 * registry 가 `bucket_time`/`recorded_at` 범위 연산자를 AI 에 광고하는데 카드가
 * 안 이어 **조용히 무시**되던 선재 갭의 해소 — [10-81] 현재시각 주입으로 AI 의
 * 시간창 emit 빈도가 오르는 시점에 맞춰 배선한다.
 *
 * - `>=`/`>` → from(여러 개면 max = 교집합), `<=`/`<` → to(min).
 * - `>`는 inclusive 근사 — 버킷/포인트 해상도상 오차 ≤ 1버킷이라 별도 보정 없음.
 * - 파싱 불가 값은 무시 (graceful — 필터 하나가 깨져도 나머지는 산다).
 */
export function resolveChartTimeRange(
  filters:
    | Array<{ field: string; operator: string; value: unknown }>
    | undefined,
  timeField: string | undefined,
): { fromIso?: string; toIso?: string } {
  if (!timeField || !filters) return {};
  let from: number | undefined;
  let to: number | undefined;
  for (const f of filters) {
    if (f.field !== timeField) continue;
    if (typeof f.value !== "string" && typeof f.value !== "number") continue;
    const ms = new Date(f.value).getTime();
    if (Number.isNaN(ms)) continue;
    if (f.operator === ">=" || f.operator === ">") {
      from = from === undefined ? ms : Math.max(from, ms);
    } else if (f.operator === "<=" || f.operator === "<") {
      to = to === undefined ? ms : Math.min(to, ms);
    }
  }
  return {
    ...(from !== undefined ? { fromIso: new Date(from).toISOString() } : {}),
    ...(to !== undefined ? { toIso: new Date(to).toISOString() } : {}),
  };
}

export function useChartScope(config: CardComponentProps["config"]) {
  const { datasource, marketType, symbol, filters, limit, interval } =
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
  const styledDescriptor = useMemo((): ChartDescriptor | undefined => {
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

  // ★ 시장 전체 스코프 허용 ([10-84] M3-step3a, 2026-07-19) — registry 파생(하드코딩 0).
  //   symbol 생략이 결핍이 아니라 "전 시장 집계"라는 **정의된 의미**를 갖는
  //   datasource 만 true. aiCardConfig superRefine (3) 이 읽는 것과 **같은 필드** =
  //   단일 진실 (두 곳이 각자 판단하면 스키마는 통과했는데 화면이 막히는 드리프트).
  const allowsMarketWide = useMemo(
    () =>
      Boolean(getDatasource(datasource)?.optionalScopeFields.includes("symbol")),
    [datasource],
  );
  const hasScopeTarget = symbols.length > 0 || allowsMarketWide;

  // ★ 부분집합 축 파생 ([10-84]) — AI 계약(filters)에서만 온다. "롱 청산만" 같은
  //   요구는 코드가 해석하지 않고 AI 가 filters 로 선언하며, 여기는 **번역만** 한다.
  //   registry 파생 가드: 그 datasource 가 실제로 side 를 queryableField 로
  //   선언했을 때만 전달 — 아니면 fetch 층이 조용히 무시해 값이 틀린다.
  const sideFilter = useMemo(() => {
    // ★ 게이트 축 = "선언했나"가 아니라 **"실제로 눌러줄 수 있나"**
    //   (code-reviewer W2, 2026-07-19). queryableFields 에 side 가 있는지로 물으면,
    //   미래에 **table 경로** series datasource 가 side 를 선언하는 순간
    //   스키마 통과 + 제목은 "Long liquidations" + 실제론 롱+숏 합계 = 정확히
    //   이번에 피하려던 silent-wrong 이 재발한다(table 경로는 side 를 pushdown
    //   하지 않는다). rpcSpec 의 인자 매핑 존재가 유일한 진실.
    const supportsSide = Boolean(
      getDatasource(datasource)?.rpcSpec?.argNames.side,
    );
    if (!supportsSide) return undefined;
    const hit = (filters ?? []).find(
      (f) => f.field === "side" && f.operator === "=" && typeof f.value === "string",
    );
    return typeof hit?.value === "string" ? hit.value : undefined;
  }, [datasource, filters]);

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

  // ── 플롯 사양 파생 ([10-121] M3-step3b, 2026-07-20) ──
  //   무엇을 플롯할지 = AI 계약(style.breakdown + filters side) × descriptor 선언
  //   (chart/plotSpec 진리표). 오버레이 판정은 심볼 개수(pre-fetch 정보)로 —
  //   전 시장 집계(symbols=[])는 그룹 1개라 오버레이 아님.
  const styleBreakdown = config.style?.breakdown;
  const plotSpecs = useMemo((): PlotSpec[] => {
    if (!descriptor) return [];
    return resolvePlotSpecs(descriptor, {
      sideFilter,
      styleBreakdown,
      overlay: symbols.length > 1,
    });
  }, [descriptor, sideFilter, styleBreakdown, symbols]);
  const componentsMode = isComponentsMode(plotSpecs);

  // ── 절대 시간창 파생 ([10-120]②) — AI filters 의 timeField 범위 연산자 번역.
  //   sideFilter 파생과 동형: 코드는 해석하지 않고 AI 선언을 fetch 축으로 옮기기만.
  const timeField = descriptor?.timeField;
  const timeRange = useMemo(
    () => resolveChartTimeRange(filters, timeField),
    [filters, timeField],
  );

  // components 모드에서만 midline 0 파생 — 대향 경계선. 원본 descriptor 불변
  //   (style.series override 파생과 동형: total 모드의 "midline 없음(금액 ≥0)"은
  //   그 모드의 진실이고, 성분 대향에서는 0 이 의미의 중심이 된다).
  const effectiveDescriptor = useMemo((): ChartDescriptor | undefined => {
    if (!styledDescriptor || !componentsMode) return styledDescriptor;
    if (styledDescriptor.midline !== undefined) return styledDescriptor;
    return { ...styledDescriptor, midline: 0 };
  }, [styledDescriptor, componentsMode]);

  return {
    descriptor,
    effectiveDescriptor,
    plotSpecs,
    componentsMode,
    timeRange,
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
  };
}

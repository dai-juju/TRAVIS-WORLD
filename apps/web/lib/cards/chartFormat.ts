// apps/web/lib/cards/chartFormat.ts
//
// Chart form 의 픽셀 매핑 — **barrel** (M3-step3b Step 0 분할, 2026-07-20, [10-98] 회수).
//
// 본체는 ./chart/ 5모듈로 자연 경계 분할 — 기존 import 경로("@/lib/cards/chartFormat")는
// 전부 그대로 동작한다 (분할 = 순수 이동, 거동 불변):
//   chart/time.ts        시간/interval 헬퍼 + formatChartTime + DEFAULT_CHART_POINTS
//   chart/align.ts       buildAlignedData · downsampleAligned (SeriesGroup[] → AlignedData)
//   chart/theme.ts       ChartThemeTokens · seriesStrokes · SERIES_STROKE_VARS · withAlpha
//   chart/axisMeasure.ts AXIS_FONT · yAxisSize (측정↔렌더 단일 상수 커플링)
//   chart/plugins.ts     midlinePlugin · tooltipPlugin
//   chart/options.ts     buildChartOptions (uPlot 옵션 조립 — 저사양 절제 프리셋)
//
// 층위(사이클 2 Step 4 원설계 불변): chartDescriptors(시맨틱) → 여기(픽셀) →
// useUplot(생명주기) → ChartCard(form 조립). 전 함수 순수 = 단위 테스트 직접 대상.
// 새 코드는 필요 모듈을 ./chart/* 에서 직접 import 해도 되고 barrel 을 써도 된다.

export {
  intervalToMs,
  isSeriesWindowTrimmed,
  refreshMsForInterval,
  formatChartTime,
  DEFAULT_CHART_POINTS,
} from "./chart/time";
export { buildAlignedData, downsampleAligned } from "./chart/align";
export {
  directionStroke,
  directionStrokeVar,
  seriesStrokes,
  withAlpha,
  SERIES_STROKE_VARS,
  type ChartThemeTokens,
} from "./chart/theme";
export { AXIS_FONT, yAxisSize } from "./chart/axisMeasure";
export {
  midlinePlugin,
  tooltipPlugin,
  type TooltipPluginOptions,
} from "./chart/plugins";
export { buildChartOptions, type BuildChartOptionsParams } from "./chart/options";
export {
  isComponentsMode,
  resolvePlotSpecs,
  type PlotSpec,
} from "./chart/plotSpec";

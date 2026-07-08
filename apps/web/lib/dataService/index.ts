// apps/web/lib/dataService/index.ts
//
// dataService 공개 API (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// 외부에 노출하는 면:
//   - hooks: useDataServiceRow / useDataServiceTable / useDataServiceFeed
//   - types: 옵션 / 결과 / Status 인터페이스
//
// 내부 (channelManager / supabaseAdapter / throttler / payload) 는 export 하지 않는다.
// 카드가 우회 호출하면 [3-10] dataService 우회 위반이 되살아나기 때문.

export { useDataServiceRow, useDataServiceTable } from "./hooks";
// M2 경로 A fast-follow #2 (2026-06-28): 이벤트 스트림(청산 피드 등) content updateMode.
export { useDataServiceFeed } from "./useDataServiceFeed";
// Composable Stage 2 Step 2 (2026-07-08): 시계열(series shape) — 첫 주기 pull.
export { useDataServiceSeries } from "./useDataServiceSeries";
// ff#2 재개 Step 3 (2026-07-05): FeedCard 가 "휴면(realtime) vs 라이브(ws_direct)"
//   빈 상태 카피를 구분하는 데 사용 — 읽기 전용 판정 함수라 우회 위반 아님.
export { resolveTransport } from "./transport";
export { initialFetch, DEFAULT_INITIAL_LIMIT } from "./initialFetch";
export type {
  EqFilter,
  InFilter,
  InitialFetchOptions,
  RangeFilter,
} from "./initialFetch";
// M2 테마 B (2026-06-11): AI filters → 서버 pushdown 변환 (순수 함수).
export { splitServerFilters } from "./filterPushdown";
export type { ServerFilterSplit } from "./filterPushdown";
export type {
  DataServiceRowOptions,
  DataServiceRowResult,
  DataServiceStatus,
  DataServiceTableOptions,
  DataServiceTableResult,
  DataServiceFeedOptions,
  DataServiceFeedResult,
  DataServiceSeriesOptions,
  DataServiceSeriesResult,
  FeedEvent,
  SeriesGroup,
} from "./types";

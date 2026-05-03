// apps/web/lib/dataService/index.ts
//
// dataService 공개 API (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// 외부에 노출하는 면:
//   - hooks: useDataServiceRow / useDataServiceTable
//   - types: 옵션 / 결과 / Status 인터페이스
//
// 내부 (channelManager / supabaseAdapter / throttler / payload) 는 export 하지 않는다.
// 카드가 우회 호출하면 [3-10] dataService 우회 위반이 되살아나기 때문.

export { useDataServiceRow, useDataServiceTable } from "./hooks";
export { initialFetch, DEFAULT_INITIAL_LIMIT } from "./initialFetch";
export type { EqFilter, InitialFetchOptions } from "./initialFetch";
export type {
  DataServiceRowOptions,
  DataServiceRowResult,
  DataServiceStatus,
  DataServiceTableOptions,
  DataServiceTableResult,
} from "./types";

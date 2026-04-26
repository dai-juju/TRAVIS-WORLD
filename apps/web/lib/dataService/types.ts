// apps/web/lib/dataService/types.ts
//
// dataService 공개 면 타입 (M1.6 Step 3, 2026-04-26).
//
// 외부(카드/페이지) 가 보는 면만 정의. 내부 구조 (Entry / Listener) 는
// channelManager.ts 에 비공개.

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/** 구독/조회 라이프사이클 상태 — 카드 측 status 표시용. */
export type DataServiceStatus = "idle" | "loading" | "ready" | "error";

/**
 * 단일 row 구독 옵션.
 * `match` 는 client-side row 매칭 함수 — 서버측 channel 은 datasource 단위로
 * 통합되어 있어 server-side filter 사용 안 함 (channelManager Q3 → 옵션 a).
 * 따라서 match 가 PK 매칭(symbol/exchange/marketType) 책임을 진다.
 */
export interface DataServiceRowOptions<T> {
  /** 구독할 테이블 (= datasource id). 예: "now_spot_ticker" */
  datasource: string;
  /**
   * client-side row 매칭. payload 의 new/old row 가 통과해야만 카드로 전달.
   * 단일 row hook 의 의미: "match 가 true 인 row 1개" (보통 PK 정확 매칭).
   * useCallback 안정화 권장 — 참조 변경 시 재구독.
   */
  match: (row: T) => boolean;
  /**
   * 초기 SELECT — 구독 시작 직후 1회 호출되어 기준값 채움.
   * 생략 시 첫 Realtime 이벤트 도착까지 data = null.
   * useCallback 안정화 권장.
   */
  initialFetch?: () => Promise<T | null>;
  /** false 시 구독 안 함. 기본 true. */
  enabled?: boolean;
}

export interface DataServiceRowResult<T> {
  data: T | null;
  status: DataServiceStatus;
  error: Error | null;
}

/**
 * 전 테이블 구독 옵션. CoinListCard 등 스크리너용.
 * Map<pk, row> 형태로 누적된 스냅샷을 throttle 단위로 카드에 전달.
 */
export interface DataServiceTableOptions<T> {
  /** 구독할 테이블 (= datasource id). 예: "now_spot_ticker" */
  datasource: string;
  /** row → 결정적 PK 문자열. 복합 PK 직렬화 함수. useCallback 안정화 권장. */
  pk: (row: T) => string;
  /** 초기 SELECT — 전체 목록. 생략 시 빈 Map. useCallback 안정화 권장. */
  initialFetch?: () => Promise<T[]>;
  /** flush 간격 (ms). 기본 500. 0 시 throttle off (microtask 즉시 flush). */
  throttleMs?: number;
  /** false 시 구독 안 함. 기본 true. */
  enabled?: boolean;
}

export interface DataServiceTableResult<T> {
  rows: Map<string, T>;
  status: DataServiceStatus;
  error: Error | null;
}

/**
 * channelManager 내부에서 Realtime payload 를 listener 에게 전달할 때 사용.
 * hooks.ts 가 import — 외부 노출 X (index.ts 에서 export 안 함).
 */
export type RealtimePayload<T extends Record<string, unknown>> =
  RealtimePostgresChangesPayload<T>;

// apps/web/lib/dataService/initialFetch.ts
//
// dataService 가 노출하는 "초기 SELECT" helper
// (M1.6 Step 6c, 2026-05-03, security-auditor W-1 회수).
//
// 배경:
//   - M1.6 Step 3 에서 dataService 추상 경계를 도입했지만 카드 컴포넌트
//     (CoinListCard / TickerCard) 의 `initialFetch` 콜백이 여전히 `getSupabaseBrowserClient()`
//     + `supabase.from(...)` 직접 호출 패턴을 사용 → dataService 단일 choke point 우회.
//   - 보안 영향 0 (anon SELECT policy 가 양 테이블 모두 `qual=true`) — 일관성 부채.
//   - M2+ 에서 GraphQL/TimescaleDB 등으로 데이터 소스를 갈아끼울 때 본 호출이
//     직접 Supabase 의존이라 이주 비용 증가.
//
// 책임:
//   - "한 번만 SELECT" 시나리오 (Realtime 도착 전 화면 채움) 를 dataService 경유로 제공.
//   - SSR / env 누락 시 graceful 빈 배열 / null 반환 (CLAUDE.md "절대 crash 금지").
//   - 단일 row 모드 (TickerCard) 와 배열 모드 (CoinListCard) 양쪽 지원.
//
// 설계 노트:
//   - row type 은 generic <T> 로 호출자가 명시. supabase 가 반환하는 원시 union type
//     (예: NowSpotTickerRow | NowFuturesTickerRow) 을 호출자 쪽 제한된 인터페이스 (CoinRow / TickerRow)
//     로 좁히기 위해 unknown 경유 캐스트 사용.
//   - eq 필터는 column 등호 매칭만 지원 (CoinListCard / TickerCard 가 사용하는 패턴 한정).
//     M2+ 에서 between / in / orderBy 가 필요하면 본 helper 를 확장 (지금은 YAGNI).

import { resolveDatasourceTable } from "@travis/shared";
import type { Database } from "@travis/data-service";
import { getDataSourceClient } from "./supabaseAdapter";

type Datasource = keyof Database["public"]["Tables"];

/** 컬럼 등호 매칭 필터 (모두 AND). */
export interface EqFilter {
  column: string;
  value: string;
}

/**
 * 카드 초기 SELECT 의 기본 row 상한.
 * - 500 = CoinListCard 가 1,400+ 심볼 중 client-side 정렬 + 필터 후 보여줄 풀.
 * - 단일 진실 공급원 (M1.6 Step 6c S3 회수, code-reviewer 자문).
 *   카드별 별도 상수 정의 금지 — 본 export 만 import.
 */
export const DEFAULT_INITIAL_LIMIT = 500;

export interface InitialFetchOptions {
  /**
   * datasource **논리 id** (예: now_spot_ticker / premium_index / open_interest).
   * Step 1([8-27] #1) 이후 입력은 테이블명이 아닌 논리 id 다 — 내부에서
   * resolveDatasourceTable 로 물리 테이블로 매핑한다. 따라서 string (테이블 키 X).
   */
  datasource: string;
  /** 등호 필터들 (모두 AND). */
  eq?: EqFilter[];
  /** SELECT row 상한. 단일 row 모드 (single=true) 에서는 무시됨. */
  limit?: number;
  /** 단일 row 모드 — `maybeSingle()` 사용. row 없으면 null. */
  single?: boolean;
}

/**
 * dataService 가 노출하는 "초기 SELECT" helper.
 *
 * - SSR / env 누락 시 single=true 면 null, 아니면 빈 배열 반환.
 * - SQL 에러 시 호출자에게 throw — useDataServiceRow/Table 의 `initialFetch` 콜백이 catch.
 *
 * Generic 제약 (M1.6 Step 6c W4 회수, 2026-05-03, code-reviewer 자문):
 *   `T extends Record<string, unknown>` — 카드 측 row 인터페이스가 항상 `& Record<string, unknown>`
 *   인터섹션 패턴을 사용하므로 시그니처 정합. helper 가 다른 카드에서 재사용될 때 잘못된 T
 *   (예: number / string) 가 들어오면 type 에러로 즉시 잡힘.
 *
 * 사용 예 (CoinListCard — 배열 모드):
 *   const rows = await initialFetch<CoinRow>({ datasource, eq: [{ column: "exchange", value: "binance" }], limit: 500 });
 *
 * 사용 예 (TickerCard — 단일 row 모드):
 *   const row = await initialFetch<TickerRow>({ datasource, eq: [{ column: "symbol", value: "BTCUSDT" }], single: true });
 */
export async function initialFetch<T extends Record<string, unknown>>(
  options: InitialFetchOptions,
): Promise<T[] | T | null> {
  let client;
  try {
    client = getDataSourceClient();
  } catch {
    // env 누락 / SSR 환경 — graceful.
    return options.single ? null : [];
  }

  // 빚 [8-27] #1 (테마 A Step 1): datasource 논리 id → 물리 테이블명 resolve.
  //   open_interest 등 indicator 논리 id 는 now_futures_indicator 로 매핑된다.
  //   미등록 id 는 id 그대로 (graceful) — 브라우저 부트스트랩이 registerDefaults 보장.
  const table = resolveDatasourceTable(options.datasource) as Datasource;
  // supabase generated type 은 datasource union 을 반환하므로 type 친화도가 낮음.
  // dataService 경계 안에서만 supabase 직접 호출이 허용되는 것이 본 helper 의 핵심.
  let query = client.from(table).select("*");
  for (const f of options.eq ?? []) {
    query = query.eq(f.column, f.value);
  }

  if (options.single) {
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return (data as unknown as T) ?? null;
  }

  const { data, error } = await query.limit(options.limit ?? DEFAULT_INITIAL_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

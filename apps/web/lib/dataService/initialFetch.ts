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
//   - eq(등호) + in(포함) 필터 지원. in 은 M2 테마 B (2026-06-11, [10-2]) 에서 추가 —
//     AI 발행 filters 의 서버 pushdown 용 (limit 윈도우 절단 방지가 목적, 상세는
//     filterPushdown.ts 헤더 참조). between / orderBy 외 추가 연산자는 필요 시 확장.

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
 * 컬럼 IN 매칭 필터 (모두 AND) — column 값이 values 중 하나면 통과.
 * M2 테마 B (2026-06-11): AI 발행 `in` 필터의 서버 pushdown 용
 * (예: quote_asset in [USDT, USDC]).
 */
export interface InFilter {
  column: string;
  values: (string | number)[];
}

/**
 * 카드 초기 SELECT 의 기본 row 상한.
 * - 500 = CoinListCard 가 1,400+ 심볼 중 client-side 정렬 + 필터 후 보여줄 풀.
 * - 단일 진실 공급원 (M1.6 Step 6c S3 회수, code-reviewer 자문).
 *   카드별 별도 상수 정의 금지 — 본 export 만 import.
 */
export const DEFAULT_INITIAL_LIMIT = 500;

/**
 * fetchAll 모드의 페이지 크기 — PostgREST db-max-rows(1,000) 와 동일하게 맞춰
 * 한 round-trip 당 최대 행을 받는다. 1,000 초과로 키워도 서버가 잘라 무의미
 * (종료 조건 오판) → 1,000 고정.
 */
export const PAGE_SIZE = 1000;

/**
 * fetchAll 모드의 절대 상한 ([10-33] Step 2, 2026-06-14).
 * - 커버리지: spot all(~1,447) + 신규 상장 헤드룸. 메모리: 3,000행 ≈ ~10MB(8GB 무해).
 * - 무제한 fetch 가 Realtime Map 누적과 겹쳐 리렌더 폭발하는 것 차단.
 * - 도달 시: throw 아닌 "잘라서 반환 + console.warn 1회" (graceful, CLAUDE.md).
 * - now_* 는 거래소 활성 심볼 수(~1,447)로 자연 제한 — cap 은 안전망이지 상시 도달 아님.
 */
export const FETCH_HARD_CAP = 3000;

export interface InitialFetchOptions {
  /**
   * datasource **논리 id** (예: now_spot_ticker / premium_index / open_interest).
   * Step 1([8-27] #1) 이후 입력은 테이블명이 아닌 논리 id 다 — 내부에서
   * resolveDatasourceTable 로 물리 테이블로 매핑한다. 따라서 string (테이블 키 X).
   */
  datasource: string;
  /** 등호 필터들 (모두 AND). */
  eq?: EqFilter[];
  /** IN 필터들 (모두 AND) — M2 테마 B 서버 pushdown. */
  in?: InFilter[];
  /** SELECT row 상한. 단일 row 모드 (single=true) 에서는 무시됨. */
  limit?: number;
  /** 단일 row 모드 — `maybeSingle()` 사용. row 없으면 null. */
  single?: boolean;
  /**
   * 서버 측 정렬 (테마 A Step 3, 2026-06-11).
   *
   * 왜 필요한가: limit(기본 500) < 테이블 행 수(now_futures_indicator ~628)일 때
   * 정렬 없이 자르면 정렬 상위권 row 가 초기 SELECT 에서 누락될 수 있다 —
   * WS 컬럼은 Realtime 이 곧 메우지만 폴링 컬럼(OI/LSR)은 최대 수 분간
   * "틀린 랭킹" 으로 보이는 도메인 결함 (사이트=DB 위생 #9).
   * `nullsFirst: false` 고정 — null 값은 정렬 방향과 무관하게 바닥.
   */
  order?: { column: string; ascending: boolean };
  /**
   * 전체 fetch 모드 ([10-33] Step 2, 2026-06-14).
   *
   * true 면 PostgREST db-max-rows(1,000) 캡을 .range() 페이지네이션으로 넘어
   * eq/in/order 조건을 만족하는 row 를 FETCH_HARD_CAP 까지 모두 가져온다.
   * - single=true 와 동시 지정 시 single 우선 (단일 row 모드가 fetchAll 무시).
   * - limit 은 fetchAll=true 일 때 무시 (상한은 FETCH_HARD_CAP).
   * - fetchAll 미지정/false 면 기존 단일 .limit() 경로 완전 불변 — 회귀 0.
   */
  fetchAll?: boolean;
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
  // 매 호출마다 eq/in/order 가 적용된 새 빌더 생성.
  //   supabase 빌더는 await 후 재사용 불가(thenable 1회성)라 fetchAll 페이지마다
  //   새로 빌드해야 한다. 단일/기본 경로도 같은 헬퍼로 일원화(중복 제거).
  //   (타입은 기존 패턴대로 추론 — client 가 any 라 query 체인도 any, as unknown as T 로 좁힘.)
  const buildQuery = () => {
    let query = client.from(table).select("*");
    for (const f of options.eq ?? []) {
      query = query.eq(f.column, f.value);
    }
    // IN 필터 — limit/range 절단 전 서버에서 좁혀야 "필터 후 상위 N" 보장 (eq 동일 원리).
    for (const f of options.in ?? []) {
      query = query.in(f.column, f.values);
    }
    // 서버 측 정렬 — 절단 전 적용해야 "정렬 상위 N" 보장.
    if (options.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending,
        nullsFirst: false,
      });
    }
    return query;
  };

  // 단일 row 모드 (TickerCard) — eq/in 적용 후 maybeSingle.
  if (options.single) {
    const { data, error } = await buildQuery().limit(1).maybeSingle();
    if (error) throw error;
    return (data as unknown as T) ?? null;
  }

  // 전체 fetch 모드 ([10-33] Step 2) — PostgREST 1,000 캡을 .range() 페이지네이션으로
  //   넘어 FETCH_HARD_CAP 까지 수집. order 동률 시 페이지 경계 row 중복/누락을 막기
  //   위해 symbol(복합 PK 일부) 보조 정렬을 추가해 결정론적 페이지네이션 보장.
  if (options.fetchAll) {
    const all: T[] = [];
    let truncated = false;
    for (let from = 0; from < FETCH_HARD_CAP; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE, FETCH_HARD_CAP) - 1;
      const { data, error } = await buildQuery()
        .order("symbol", { ascending: true, nullsFirst: false })
        .range(from, to);
      if (error) throw error;
      const batch = (data ?? []) as unknown as T[];
      all.push(...batch);
      // 요청 폭 미만이면 마지막 페이지 → 종료.
      if (batch.length < to - from + 1) break;
      // hard cap 도달 → 잘라서 종료 + 1회 경고 (graceful — crash 금지).
      if (all.length >= FETCH_HARD_CAP) {
        truncated = true;
        break;
      }
    }
    if (all.length > FETCH_HARD_CAP) all.length = FETCH_HARD_CAP;
    if (truncated) {
      console.warn(
        `[initialFetch] fetchAll truncated at FETCH_HARD_CAP=${FETCH_HARD_CAP} for "${options.datasource}"`,
      );
    }
    return all;
  }

  // 기본 단일 .limit() 경로 — fetchAll 미지정 시 완전 불변 (회귀 0).
  const { data, error } = await buildQuery().limit(
    options.limit ?? DEFAULT_INITIAL_LIMIT,
  );
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

// apps/web/lib/dataService/seriesFetch.ts
//
// series shape 전용 fetch orchestrator (Composable Stage 2 Step 2, 2026-07-08).
//
// ★ initialFetch 를 **재구현하지 않는다** — 심볼당 병렬 호출로 감싸는 초박형 층.
//   각 심볼: eq 축(exchange/market_type/interval) + eq symbol + range(lookback)
//   + order timeField DESC + limit maxPoints → 클라 reverse(oldest-first).
//
// ★ per-symbol 병렬이 계약인 이유 (backend-infra EXPLAIN 실측 2026-07-08):
//   - per-symbol: PK(exchange,market_type,symbol,interval,recorded_at) prefix 완전
//     정합 → Index Scan Backward + LIMIT 조기종료 = **7ms**, 디스크 read ~7버퍼.
//   - `symbol IN (...)` + 글로벌 정렬/limit: 인덱스가 심볼 경계를 못 넘어 retention
//     창 전체(1.2만행)를 읽고 top-N heapsort = **500ms**, 디스크 read 911버퍼
//     (Disk IO 사고 재발 벡터) + 글로벌 limit 이라 한 심볼이 창 독식(불균등).
//   → 이 600만행 시계열 테이블에 `in`+`order`+`limit` 조합 금지. 심볼당 limit 로
//     "심볼당 정확히 최신 N포인트" 를 보장한다.
//
// ★ fetchAll 을 안 쓰는 이유: symbol 보조 정렬 강제(스크리너 페이지네이션용)라
//   시계열 정렬(recorded_at)과 충돌 — 관심사가 다른 별개 경로다.

import { initialFetch, type EqFilter, type RangeFilter } from "./initialFetch";
import type { SeriesGroup } from "./types";

export interface SeriesFetchParams {
  /** datasource 논리 id (resolveDatasourceTable 이 물리 테이블 매핑). */
  datasource: string;
  /** 심볼들 — 반환 groups 는 이 입력 순서를 보존(성공분만). */
  symbols: string[];
  /** eq 축 (생략 = 무제약). market_type 은 DB 저장값("futures_usdm") 기준. */
  exchange?: string;
  marketType?: string;
  interval?: string;
  /** 시간축 컬럼 (정렬 + lookback range 대상). */
  timeField: string;
  /** 상대 시간창(ms). 지정 시 timeField >= now-lookback ISO 서버 range. */
  lookbackMs?: number;
  /** 심볼별 최신 포인트 상한. */
  maxPoints: number;
}

export interface SeriesFetchOutcome<T> {
  /** 성공 심볼의 곡선들 — 입력 순서 보존, rows 는 oldest-first 보증. */
  groups: SeriesGroup<T>[];
  /** fetch 가 reject 된 심볼들 (부분 실패 — 호출자가 soft 처리). */
  failedSymbols: string[];
}

/**
 * 심볼당 병렬 시계열 fetch.
 *
 * - Promise.allSettled — 한 심볼 실패가 나머지 오버레이를 죽이지 않음(crash 금지).
 *   실패 심볼은 failedSymbols 로 보고, 성공분만 groups 반환.
 * - fulfilled 인데 빈 배열 = "데이터 없음"(정상) → rows:[] 그룹으로 포함
 *   (rejected = fetch 에러와 구분 — form 이 "no data for X" 를 그릴 수 있게).
 */
export async function seriesFetch<T extends Record<string, unknown>>(
  params: SeriesFetchParams,
): Promise<SeriesFetchOutcome<T>> {
  const {
    datasource,
    symbols,
    exchange,
    marketType,
    interval,
    timeField,
    lookbackMs,
    maxPoints,
  } = params;

  const baseEq: EqFilter[] = [];
  if (exchange) baseEq.push({ column: "exchange", value: exchange });
  if (marketType) baseEq.push({ column: "market_type", value: marketType });
  if (interval) baseEq.push({ column: "interval", value: interval });

  // lookback → 서버 range (ISO-8601 — PostgREST 가 timestamptz 로 캐스팅).
  const range: RangeFilter[] | undefined =
    lookbackMs !== undefined && lookbackMs > 0
      ? [
          {
            column: timeField,
            op: "gte",
            value: new Date(Date.now() - lookbackMs).toISOString(),
          },
        ]
      : undefined;

  const settled = await Promise.allSettled(
    symbols.map((symbol) =>
      initialFetch<T>({
        datasource,
        eq: [...baseEq, { column: "symbol", value: symbol }],
        range,
        // DESC + limit = PK Backward 스캔 조기종료("최신 N") → 클라 reverse.
        order: { column: timeField, ascending: false },
        limit: maxPoints,
      }),
    ),
  );

  const groups: SeriesGroup<T>[] = [];
  const failedSymbols: string[] = [];
  settled.forEach((res, i) => {
    const symbol = symbols[i]!;
    if (res.status === "fulfilled") {
      const raw = Array.isArray(res.value) ? res.value : [];
      // oldest-first 보증 — 훅/차트는 재정렬 불필요 (SeriesGroup 계약).
      groups.push({ key: symbol, symbol, rows: raw.slice().reverse() });
    } else {
      failedSymbols.push(symbol);
      console.warn(
        `[seriesFetch] "${datasource}" symbol "${symbol}" fetch 실패 — skip (graceful)`,
        res.reason,
      );
    }
  });

  return { groups, failedSymbols };
}

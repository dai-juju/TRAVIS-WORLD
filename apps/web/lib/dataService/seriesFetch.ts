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

// ★ fetchKind:"rpc" 분기 ([10-84] M3-step3a, 2026-07-19) — **가산 확장**.
//   registry 가 rpc 로 선언한 datasource 만 rpcFetch 로 우회하고, 기존 table 경로는
//   한 줄도 안 바뀐다(history 6종 + funding_history 회귀 0).
//   집계 datasource 는 symbols 가 비어도 유효하다 = "전 시장 집계" 1회 호출.

import { getDatasource } from "@travis/shared";
import { initialFetch, type EqFilter, type RangeFilter } from "./initialFetch";
import { rpcFetch } from "./rpcFetch";
import type { SeriesGroup } from "./types";

/**
 * 심볼 스코프 없는(전 시장) 집계 그룹의 key/label.
 * 표시 라벨이지 데이터 정체성이 아니다 — 무엇을 집계할지는 AI 계약(symbol 생략)이 정한다.
 */
export const MARKET_WIDE_KEY = "__market__";
const MARKET_WIDE_LABEL = "ALL";

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
  /**
   * 절대 시간창 ([10-120]②) — AI filters 파생. rpc = p_from/p_to, table = gte/lte.
   * fromIso 는 lookbackMs 파생값보다 우선 (명시 절대 창 = 유저 의도).
   */
  fromIso?: string;
  toIso?: string;
  /** 심볼별 최신 포인트 상한. */
  maxPoints: number;
  /**
   * 집계 부분집합 축 ([10-84]) — rpc 경로에서만 의미. table 경로는 무시한다
   * (initialFetch 가 임의 값 필터를 pushdown 하지 않아, 넘기면 조용히 무시되는
   *  silent-wrong 이 되기 때문에 아예 전달하지 않는다).
   */
  side?: string;
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
    fromIso,
    toIso,
    maxPoints,
    side,
  } = params;

  // ── rpc 경로 (집계 datasource) ────────────────────────────────────
  if (getDatasource(datasource)?.fetchKind === "rpc") {
    // 명시 절대 창(fromIso) > lookback 파생 — 둘 다 오면 절대 창이 유저 의도.
    const from =
      fromIso ??
      (lookbackMs !== undefined && lookbackMs > 0
        ? new Date(Date.now() - lookbackMs).toISOString()
        : undefined);

    // symbols 가 비어도 유효 — "전 시장 집계" 1회 호출 (symbol 인자 미전달).
    const targets: (string | undefined)[] =
      symbols.length > 0 ? symbols : [undefined];

    const settledRpc = await Promise.allSettled(
      targets.map((symbol) =>
        rpcFetch<T>(datasource, {
          exchange,
          marketType,
          symbol,
          interval,
          side,
          from,
          to: toIso,
          limit: maxPoints,
        }),
      ),
    );

    const rpcGroups: SeriesGroup<T>[] = [];
    const rpcFailed: string[] = [];
    settledRpc.forEach((res, i) => {
      const symbol = targets[i];
      const key = symbol ?? MARKET_WIDE_KEY;
      if (res.status === "fulfilled") {
        // 함수는 최신순(DESC)으로 준다 — table 경로와 동일하게 oldest-first 로 뒤집는다.
        rpcGroups.push({
          key,
          symbol: symbol ?? MARKET_WIDE_LABEL,
          rows: res.value.slice().reverse(),
        });
      } else {
        rpcFailed.push(key);
        console.warn(
          `[seriesFetch] "${datasource}" rpc "${key}" 실패 — skip (graceful)`,
          res.reason,
        );
      }
    });
    return { groups: rpcGroups, failedSymbols: rpcFailed };
  }

  // ── table 경로 (기존 — 무변경) ────────────────────────────────────
  // ★ 무음 드롭 금지 (code-reviewer W2): table 경로는 side 를 pushdown 하지 못한다.
  //   상위 게이트(ChartCard 가 rpcSpec.argNames.side 로 판정)가 정상이면 여기 오지
  //   않지만, 도달했다면 그 게이트가 깨진 것이므로 흔적을 남긴다.
  if (side) {
    console.warn(
      `[seriesFetch] "${datasource}" 는 table 경로 — side="${side}" 는 pushdown 불가라 무시됨 ` +
        `(상위 게이트 확인 필요: 값이 조용히 틀리는 경로)`,
    );
  }

  const baseEq: EqFilter[] = [];
  if (exchange) baseEq.push({ column: "exchange", value: exchange });
  if (marketType) baseEq.push({ column: "market_type", value: marketType });
  if (interval) baseEq.push({ column: "interval", value: interval });

  // 시간창 → 서버 range (ISO-8601 — PostgREST 가 timestamptz 로 캐스팅).
  //   [10-120]②: 절대 창(fromIso/toIso, AI filters 파생)이 lookback 파생보다 우선.
  //   history 6종의 "recorded_at 범위 연산자 광고 ↔ 미배선" 선재 갭도 여기서 해소.
  const rangeList: RangeFilter[] = [];
  const fromValue =
    fromIso ??
    (lookbackMs !== undefined && lookbackMs > 0
      ? new Date(Date.now() - lookbackMs).toISOString()
      : undefined);
  if (fromValue) rangeList.push({ column: timeField, op: "gte", value: fromValue });
  if (toIso) rangeList.push({ column: timeField, op: "lte", value: toIso });
  const range: RangeFilter[] | undefined =
    rangeList.length > 0 ? rangeList : undefined;

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

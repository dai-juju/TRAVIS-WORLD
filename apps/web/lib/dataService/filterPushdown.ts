// apps/web/lib/dataService/filterPushdown.ts
//
// AI 발행 filters → 초기 SELECT 서버 필터 변환 (M2 테마 B, 2026-06-11, [10-2]).
//
// 배경:
//   CoinListCard 의 초기 SELECT 는 limit(500) 윈도우라, 테이블 행 수(now_spot_ticker
//   1,441행)가 상한을 넘으면 "필터 매치 row 가 윈도우 밖에서 잘리는" 결함이 생긴다
//   (예: quote_asset=USDT 페어가 초기 화면에서 누락). 따라서 서버에서 좁힐 수 있는
//   필터는 SELECT 단계에 내려보낸다(pushdown). Realtime 도착 row 는 여전히
//   filterEvaluator 가 클라이언트에서 재평가하므로 이중 적용은 AND 라 무해.
//
// 변환 규칙 (operator 기반 일반 변환 — 특정 필드명 하드코딩 금지, CLAUDE.md):
//   - "=" + string value → EqFilter         (PostgREST .eq)
//   - "in" (배열)        → InFilter         (PostgREST .in)
//   - 그 외 (>, <, >=, <=, !=, above, below, number/boolean "=")
//       → pushdown 제외, 클라이언트 evaluateFilters 전용.
//       number "=" 제외 사유: PostgREST 의 numeric 타입 캐스팅 엣지를 피하는
//       보수적 한정. "!=" pushdown(.neq) 은 deferred (M2-themeB task-record 참조).
//
// 순수 함수 — React/supabase 의존 0. 단위 테스트 friendly.

import type { FilterClause } from "@travis/shared";
import type { EqFilter, InFilter } from "./initialFetch";

export interface ServerFilterSplit {
  eq: EqFilter[];
  inFilters: InFilter[];
}

/**
 * AI 발행 FilterClause 배열에서 서버 pushdown 가능한 절만 골라 변환한다.
 *
 * @param filters AI 카드 config 의 filters (없으면 undefined)
 * @returns eq / inFilters — initialFetch 옵션에 그대로 전달 가능한 형태
 */
export function splitServerFilters(
  filters: readonly FilterClause[] | undefined,
): ServerFilterSplit {
  const eq: EqFilter[] = [];
  const inFilters: InFilter[] = [];

  for (const clause of filters ?? []) {
    if (clause.operator === "=" && typeof clause.value === "string") {
      eq.push({ column: clause.field, value: clause.value });
    } else if (clause.operator === "in") {
      // FilterClauseSchema 가 배열 최소 1개를 보장하지만, 방어적으로 한 번 더 확인.
      // 사유: 저장 뷰 복원 등 schema 검증을 안 거친 경로가 미래에 생길 수 있고,
      // 빈 배열 .in() 은 전체 0건 매치라 의도와 다른 결과를 만든다 (code-reviewer S3).
      if (Array.isArray(clause.value) && clause.value.length > 0) {
        inFilters.push({ column: clause.field, values: clause.value });
      }
    }
    // 그 외 연산자는 클라이언트 evaluateFilters 전용 (pushdown 제외).
  }

  return { eq, inFilters };
}

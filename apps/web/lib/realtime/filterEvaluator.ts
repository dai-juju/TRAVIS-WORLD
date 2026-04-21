// apps/web/lib/realtime/filterEvaluator.ts
//
// FilterClause 평가기 (M1.4 Step 3-3, 2026-04-21).
//
// 용도:
//   CoinListCard(updateMode='content') 가 Realtime 으로 받은 1,400+ 심볼 row 를
//   AI 가 발행한 filters 배열(AND 결합)로 걸러내는 핵심 함수.
//
// 시맨틱:
//   - filters 가 비거나 undefined → 모두 통과 (true).
//   - 여러 clause → AND 결합 (모두 만족해야 통과).
//   - clause.field 가 row 에 없거나 null/undefined → false (안전한 기본).
//   - operator 별 타입 매칭:
//       "in"             → row 값이 value 배열에 포함되면 true
//       ">"/"above"      → 수치 큼
//       "<"/"below"      → 수치 작음
//       ">="/"<="/"="/"!=" → 수치 또는 문자열 동등/비교
//
// AI 친화적 별칭:
//   "above" / "below" 는 "X 이상/이하" 자연어 패턴을 AI 가 그대로 쓸 수 있게
//   제공한 별칭 — FilterClauseSchema 에 이미 포함.
//
// 문자열 비교:
//   string field 에도 >/< 를 허용 (사전순). 실전에서 자주 쓰진 않지만 AI 가
//   "symbol > K" 같은 쿼리를 내릴 때 crash 없이 동작.

import type { FilterClause } from "@travis/shared";

/**
 * row 가 모든 filters (AND 결합) 를 통과하는지 판정.
 *
 * @param row       Realtime row (Record<string, unknown>)
 * @param filters   AI 가 발행한 FilterClause 배열. undefined/빈배열이면 항상 true.
 * @returns         모두 통과 시 true, 하나라도 실패하거나 필드 누락이면 false.
 */
export function evaluateFilters(
  row: Record<string, unknown>,
  filters: readonly FilterClause[] | undefined,
): boolean {
  if (!filters || filters.length === 0) return true;
  for (const clause of filters) {
    if (!evaluateClause(row, clause)) return false;
  }
  return true;
}

function evaluateClause(
  row: Record<string, unknown>,
  clause: FilterClause,
): boolean {
  const fieldVal = row[clause.field];
  if (fieldVal === null || fieldVal === undefined) return false;

  if (clause.operator === "in") {
    return clause.value.some((cand) => cand === fieldVal);
  }

  // 수치 비교 경로
  if (typeof fieldVal === "number") {
    const target =
      typeof clause.value === "number" ? clause.value : Number(clause.value);
    if (Number.isNaN(target)) return false;
    return compareNumbers(fieldVal, clause.operator, target);
  }

  // 문자열 비교 경로 (=, !=, 사전순 >, <, >=, <=)
  if (typeof fieldVal === "string") {
    const target = String(clause.value);
    return compareStrings(fieldVal, clause.operator, target);
  }

  // boolean: = / != 만 의미 있음
  if (typeof fieldVal === "boolean") {
    const target =
      typeof clause.value === "boolean" ? clause.value : Boolean(clause.value);
    if (clause.operator === "=") return fieldVal === target;
    if (clause.operator === "!=") return fieldVal !== target;
    return false;
  }

  return false;
}

type ScalarOp = Exclude<FilterClause["operator"], "in">;

function compareNumbers(a: number, op: ScalarOp, b: number): boolean {
  switch (op) {
    case ">":
    case "above":
      return a > b;
    case "<":
    case "below":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "=":
      return a === b;
    case "!=":
      return a !== b;
  }
}

function compareStrings(a: string, op: ScalarOp, b: string): boolean {
  switch (op) {
    case ">":
    case "above":
      return a > b;
    case "<":
    case "below":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "=":
      return a === b;
    case "!=":
      return a !== b;
  }
}

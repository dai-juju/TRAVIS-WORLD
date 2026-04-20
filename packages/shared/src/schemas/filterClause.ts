/**
 * FilterClause — CoinListCard 등이 소비하는 필터 조건 1건.
 *
 * filterEvaluator(M1.4 Step 4)가 이 형식을 그대로 읽으므로 여기가 단일 소스.
 * operator별 value 타입을 discriminatedUnion으로 엄격 매칭:
 * - "in" → Array<number|string> 필수
 * - 그 외 → scalar (number | string | boolean)
 */

import { z } from "zod";

const ScalarValueSchema = z.union([z.number(), z.string(), z.boolean()]);
const ArrayValueSchema = z.array(z.union([z.number(), z.string()])).min(1);

const ScalarOperatorSchema = z.enum([
  ">",
  "<",
  ">=",
  "<=",
  "=",
  "!=",
  "above",
  "below",
]);

export const FilterClauseSchema = z
  .discriminatedUnion("operator", [
    z
      .object({
        field: z.string().min(1).describe("비교 대상 필드명 (예: price_chg_5m)"),
        operator: ScalarOperatorSchema.describe("스칼라 비교 연산자"),
        value: ScalarValueSchema.describe("비교 값 — 단일 scalar"),
      })
      .strict(),
    z
      .object({
        field: z.string().min(1).describe("비교 대상 필드명"),
        operator: z.literal("in").describe("포함 관계 연산자"),
        value: ArrayValueSchema.describe("후보 값 배열 — 최소 1개"),
      })
      .strict(),
  ])
  .describe("단일 필터 조건. evaluator에서 field 존재 여부를 2차 검증.");

export type FilterClause = z.infer<typeof FilterClauseSchema>;

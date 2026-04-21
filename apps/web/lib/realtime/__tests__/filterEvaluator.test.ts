// apps/web/lib/realtime/__tests__/filterEvaluator.test.ts
//
// filterEvaluator 단위 테스트 (M1.4 Step 3-6).

import { describe, it, expect } from "vitest";
import type { FilterClause } from "@travis/shared";
import { evaluateFilters } from "../filterEvaluator";

describe("evaluateFilters", () => {
  const row = {
    symbol: "BTCUSDT",
    last_price: 68000,
    price_change_pct: 2.5,
    volume_chg_5m: -1.2,
    exchange: "binance",
    is_active: true,
    nothing: null,
  };

  it("빈 배열 / undefined 는 모두 통과", () => {
    expect(evaluateFilters(row, undefined)).toBe(true);
    expect(evaluateFilters(row, [])).toBe(true);
  });

  it("스칼라 연산자 수치 비교 (>, <, >=, <=, =, !=)", () => {
    expect(
      evaluateFilters(row, [
        { field: "price_change_pct", operator: ">", value: 2 },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "price_change_pct", operator: "<", value: 2 },
      ] satisfies FilterClause[]),
    ).toBe(false);
    expect(
      evaluateFilters(row, [
        { field: "last_price", operator: ">=", value: 68000 },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "last_price", operator: "<=", value: 67999 },
      ] satisfies FilterClause[]),
    ).toBe(false);
    expect(
      evaluateFilters(row, [
        { field: "last_price", operator: "=", value: 68000 },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "last_price", operator: "!=", value: 68000 },
      ] satisfies FilterClause[]),
    ).toBe(false);
  });

  it("AI 별칭 above / below 는 >, < 와 동일", () => {
    expect(
      evaluateFilters(row, [
        { field: "price_change_pct", operator: "above", value: 1 },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "price_change_pct", operator: "below", value: 5 },
      ] satisfies FilterClause[]),
    ).toBe(true);
  });

  it("in 연산자 — 배열 포함 여부", () => {
    expect(
      evaluateFilters(row, [
        { field: "exchange", operator: "in", value: ["binance", "okx"] },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "exchange", operator: "in", value: ["bybit", "bitget"] },
      ] satisfies FilterClause[]),
    ).toBe(false);
  });

  it("AND 결합 — 여러 clause 중 하나라도 실패면 false", () => {
    expect(
      evaluateFilters(row, [
        { field: "price_change_pct", operator: ">", value: 1 },
        { field: "exchange", operator: "=", value: "binance" },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "price_change_pct", operator: ">", value: 1 },
        { field: "exchange", operator: "=", value: "okx" },
      ] satisfies FilterClause[]),
    ).toBe(false);
  });

  it("필드가 row 에 없거나 null 이면 false — 안전한 기본값", () => {
    expect(
      evaluateFilters(row, [
        { field: "missing_field", operator: ">", value: 0 },
      ] satisfies FilterClause[]),
    ).toBe(false);
    expect(
      evaluateFilters(row, [
        { field: "nothing", operator: "=", value: null as unknown as string },
      ] satisfies FilterClause[]),
    ).toBe(false);
  });

  it("문자열 field — = / != / 사전순 비교", () => {
    expect(
      evaluateFilters(row, [
        { field: "symbol", operator: "=", value: "BTCUSDT" },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "symbol", operator: "!=", value: "ETHUSDT" },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "symbol", operator: ">", value: "ATOM" },
      ] satisfies FilterClause[]),
    ).toBe(true);
  });

  it("boolean field — = / != 지원, 그 외 연산자는 false", () => {
    expect(
      evaluateFilters(row, [
        { field: "is_active", operator: "=", value: true },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "is_active", operator: "!=", value: false },
      ] satisfies FilterClause[]),
    ).toBe(true);
  });

  it("음수 변동률 필터 — -1.2% 보다 큰가?", () => {
    expect(
      evaluateFilters(row, [
        { field: "volume_chg_5m", operator: ">", value: -2 },
      ] satisfies FilterClause[]),
    ).toBe(true);
    expect(
      evaluateFilters(row, [
        { field: "volume_chg_5m", operator: ">", value: 0 },
      ] satisfies FilterClause[]),
    ).toBe(false);
  });
});

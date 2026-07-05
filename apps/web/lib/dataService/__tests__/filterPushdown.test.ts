// splitServerFilters — AI filters → 서버 pushdown 변환 테스트 (M2 테마 B, 2026-06-11).
//
// 박제 포인트: operator 기반 일반 변환 규칙 —
//   "=" string → eq / "in" → inFilters / ">" ">=" "<" "<=" → range (ff#2 Step 4 C1)
//   / 그 외("!=", "above/below", number/boolean "=") 는 제외
//   (클라이언트 evaluateFilters 전용). 규칙이 바뀌면 limit 윈도우 절단 또는
//   PostgREST 타입 캐스팅 이슈가 재발할 수 있어 테스트로 고정.

import { describe, expect, it } from "vitest";
import type { FilterClause } from "@travis/shared";
import { splitServerFilters } from "../filterPushdown";

describe("splitServerFilters", () => {
  it('"=" + string value → eq 로 변환 (quote_asset=USDT)', () => {
    const out = splitServerFilters([
      { field: "quote_asset", operator: "=", value: "USDT" },
    ] satisfies FilterClause[]);
    expect(out.eq).toEqual([{ column: "quote_asset", value: "USDT" }]);
    expect(out.inFilters).toEqual([]);
    expect(out.range).toEqual([]);
  });

  it('"in" 배열 → inFilters 로 변환', () => {
    const out = splitServerFilters([
      { field: "quote_asset", operator: "in", value: ["USDT", "USDC"] },
    ] satisfies FilterClause[]);
    expect(out.eq).toEqual([]);
    expect(out.inFilters).toEqual([
      { column: "quote_asset", values: ["USDT", "USDC"] },
    ]);
  });

  // ff#2 재개 Step 4 (2026-07-05, code-reviewer C1): 범위가 클라 전용이면
  //   "sort + 범위" 조합에서 fetch 창(FETCH_HARD_CAP) 밖 매치 row 가 조용히 잘리는
  //   과소보고 — 청산 "biggest + 시간창" 이 첫 발현. 범위도 서버로.
  it('범위 연산자(">" ">=" "<" "<=") → range 로 변환 (number + ISO string 둘 다)', () => {
    const out = splitServerFilters([
      { field: "notional", operator: ">=", value: 100_000 },
      { field: "trade_time", operator: ">", value: "2026-07-05T00:00:00Z" },
      { field: "price_chg_5m", operator: "<", value: -0.03 },
      { field: "open_interest", operator: "<=", value: 1_000_000 },
    ] satisfies FilterClause[]);
    expect(out.range).toEqual([
      { column: "notional", op: "gte", value: 100_000 },
      { column: "trade_time", op: "gt", value: "2026-07-05T00:00:00Z" },
      { column: "price_chg_5m", op: "lt", value: -0.03 },
      { column: "open_interest", op: "lte", value: 1_000_000 },
    ]);
    expect(out.eq).toEqual([]);
    expect(out.inFilters).toEqual([]);
  });

  it('"!=" · "above/below" · number/boolean "=" 는 pushdown 제외 (클라이언트 전용)', () => {
    const out = splitServerFilters([
      { field: "quote_asset", operator: "!=", value: "TRY" },
      { field: "price_chg_5m", operator: "above", value: 0.03 },
      { field: "price_chg_5m", operator: "below", value: -0.03 },
      { field: "trade_count", operator: "=", value: 1000 }, // number "=" — 보수적 제외
      { field: "is_active", operator: ">", value: true }, // boolean 범위 — 무의미, 제외
    ] satisfies FilterClause[]);
    expect(out.eq).toEqual([]);
    expect(out.inFilters).toEqual([]);
    expect(out.range).toEqual([]);
  });

  it("혼합 배열 — pushdown 가능한 절만 골라내고 순서 보존", () => {
    const out = splitServerFilters([
      { field: "price_chg_5m", operator: ">", value: 0.03 },
      { field: "quote_asset", operator: "=", value: "USDT" },
      { field: "symbol", operator: "in", value: ["BTCUSDT", "ETHUSDT"] },
      { field: "quote_asset", operator: "!=", value: "TRY" },
    ] satisfies FilterClause[]);
    expect(out.eq).toEqual([{ column: "quote_asset", value: "USDT" }]);
    expect(out.inFilters).toEqual([
      { column: "symbol", values: ["BTCUSDT", "ETHUSDT"] },
    ]);
    expect(out.range).toEqual([
      { column: "price_chg_5m", op: "gt", value: 0.03 },
    ]);
  });

  it("filters undefined / 빈 배열 → 빈 결과 (graceful)", () => {
    expect(splitServerFilters(undefined)).toEqual({
      eq: [],
      inFilters: [],
      range: [],
    });
    expect(splitServerFilters([])).toEqual({ eq: [], inFilters: [], range: [] });
  });
});

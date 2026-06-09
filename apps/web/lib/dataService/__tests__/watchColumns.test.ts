// apps/web/lib/dataService/__tests__/watchColumns.test.ts
//
// [10-7] 회수 (M2 테마 A Step 2, 2026-06-09) — 관심 컬럼 dirty check 로직 검증.
//
// useDataServiceRow 가 같은 물리 테이블(now_futures_indicator)을 공유하는 indicator
// 카드들의 fan-out cross-talk 를 막기 위해 쓰는 순수 함수. 시나리오:
//   markPrice WS 가 funding/mark 만 바꾼 row 전체를 push → OI 카드(watched=OI 컬럼)는
//   값이 그대로라 재렌더하면 안 된다.

import { describe, expect, it } from "vitest";
import { hasWatchedColumnChanged } from "../hooks";

type Row = Record<string, unknown>;

describe("hasWatchedColumnChanged ([10-7] dirty check)", () => {
  const base: Row = {
    symbol: "BTCUSDT",
    open_interest: 97630.299,
    oi_chg_5m: -0.28,
    predicted_funding_rate: -0.00009475,
    mark_price: 63087.13,
  };

  it("watched 컬럼이 바뀌면 true (OI 카드: OI 변동)", () => {
    const next = { ...base, open_interest: 98000 };
    expect(
      hasWatchedColumnChanged(base, next, ["open_interest", "oi_chg_5m"]),
    ).toBe(true);
  });

  it("watched 컬럼은 그대로고 비-watched 만 바뀌면 false (funding push → OI 카드 skip)", () => {
    // funding/mark 만 바뀐 1초 push — OI 카드는 재렌더하면 안 됨.
    const next = { ...base, predicted_funding_rate: -0.0001, mark_price: 63100 };
    expect(
      hasWatchedColumnChanged(base, next, [
        "open_interest",
        "oi_chg_5m",
        "oi_chg_15m",
        "oi_chg_1h",
        "oi_chg_4h",
      ]),
    ).toBe(false);
  });

  it("여러 watched 중 하나만 바뀌어도 true", () => {
    const next = { ...base, oi_chg_5m: -0.5 };
    expect(
      hasWatchedColumnChanged(base, next, ["open_interest", "oi_chg_5m"]),
    ).toBe(true);
  });

  it("watchColumns 빈 배열이면 항상 false (변경 없음 취급)", () => {
    const next = { ...base, open_interest: 99999 };
    expect(hasWatchedColumnChanged(base, next, [])).toBe(false);
  });

  it("null → 값 으로 채워지면 true (워밍업 후 첫 값)", () => {
    const prev: Row = { ...base, oi_chg_4h: null };
    const next: Row = { ...base, oi_chg_4h: 1.23 };
    expect(hasWatchedColumnChanged(prev, next, ["oi_chg_4h"])).toBe(true);
  });

  it("동일 null 끼리는 false", () => {
    const prev: Row = { ...base, oi_chg_4h: null };
    const next: Row = { ...base, oi_chg_4h: null };
    expect(hasWatchedColumnChanged(prev, next, ["oi_chg_4h"])).toBe(false);
  });

  it("같은 컬럼은 타입이 일관되므로 동일 string 값은 false", () => {
    // Supabase numeric 이 string 으로 와도 같은 컬럼은 항상 같은 타입 → 일관 비교.
    const prev: Row = { ...base, top_ls_ratio_accounts: "1.9577" };
    const next: Row = { ...base, top_ls_ratio_accounts: "1.9577" };
    expect(
      hasWatchedColumnChanged(prev, next, ["top_ls_ratio_accounts"]),
    ).toBe(false);
  });
});

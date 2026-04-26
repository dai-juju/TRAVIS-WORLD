// apps/web/lib/dataService/__tests__/payload.test.ts
//
// extractNewRow / extractOldRow + applyChange 머지 시맨틱 테스트.
// 옛 useRealtimeTable.test.ts 의 payload 부분을 그대로 마이그레이션.

import { describe, expect, it } from "vitest";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { extractNewRow, extractOldRow } from "../payload";

interface TestRow extends Record<string, unknown> {
  exchange: string;
  market_type: string;
  symbol: string;
  last_price: number;
}

const pk = (r: TestRow) => `${r.exchange}_${r.market_type}_${r.symbol}`;

function makeRow(symbol: string, price: number): TestRow {
  return {
    exchange: "binance",
    market_type: "um",
    symbol,
    last_price: price,
  };
}

function makePayload(
  eventType: "INSERT" | "UPDATE" | "DELETE",
  newRow: TestRow | null,
  oldRow: Partial<TestRow> | null,
): RealtimePostgresChangesPayload<TestRow> {
  return {
    schema: "public",
    table: "now_futures_ticker",
    commit_timestamp: new Date().toISOString(),
    eventType,
    new: (newRow ?? {}) as TestRow,
    old: (oldRow ?? {}) as TestRow,
    errors: null,
  } as unknown as RealtimePostgresChangesPayload<TestRow>;
}

/** dataService hooks 의 applyChange 시맨틱 재현 (외부에 노출 안 됨). */
function applyChange(
  map: Map<string, TestRow>,
  payload: RealtimePostgresChangesPayload<TestRow>,
): boolean {
  const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
  if (eventType === "DELETE") {
    const prev = extractOldRow<TestRow>(payload);
    if (!prev) return false;
    const key = pk(prev as TestRow);
    if (!map.has(key)) return false;
    map.delete(key);
    return true;
  }
  const next = extractNewRow<TestRow>(payload);
  if (!next) return false;
  map.set(pk(next), next);
  return true;
}

describe("payload extract + applyChange 시맨틱", () => {
  it("initialFetch 배열이 pk 기준 Map 으로 빌드된다", () => {
    const list = [makeRow("BTCUSDT", 100), makeRow("ETHUSDT", 200)];
    const map = new Map<string, TestRow>();
    for (const r of list) map.set(pk(r), r);

    expect(map.size).toBe(2);
    expect(map.get("binance_um_BTCUSDT")?.last_price).toBe(100);
    expect(map.get("binance_um_ETHUSDT")?.last_price).toBe(200);
  });

  it("INSERT 가 새 row 추가한다", () => {
    const map = new Map<string, TestRow>();
    expect(
      applyChange(map, makePayload("INSERT", makeRow("BTCUSDT", 50000), null)),
    ).toBe(true);
    expect(map.size).toBe(1);
    expect(map.get("binance_um_BTCUSDT")?.last_price).toBe(50000);
  });

  it("UPDATE 가 기존 row 덮어쓴다", () => {
    const map = new Map<string, TestRow>();
    map.set(pk(makeRow("BTCUSDT", 100)), makeRow("BTCUSDT", 100));
    applyChange(map, makePayload("UPDATE", makeRow("BTCUSDT", 150), null));
    expect(map.get("binance_um_BTCUSDT")?.last_price).toBe(150);
  });

  it("DELETE 가 row 제거한다", () => {
    const map = new Map<string, TestRow>();
    map.set(pk(makeRow("BTCUSDT", 100)), makeRow("BTCUSDT", 100));
    expect(
      applyChange(map, makePayload("DELETE", null, makeRow("BTCUSDT", 100))),
    ).toBe(true);
    expect(map.has("binance_um_BTCUSDT")).toBe(false);
  });

  it("new 객체가 비면 머지를 건너뛴다", () => {
    const map = new Map<string, TestRow>();
    expect(applyChange(map, makePayload("INSERT", null, null))).toBe(false);
    expect(map.size).toBe(0);
  });
});

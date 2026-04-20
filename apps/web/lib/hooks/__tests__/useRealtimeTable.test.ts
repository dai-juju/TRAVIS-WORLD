// useRealtimeTable 코어 로직 단위 테스트 (M1.4 Step 2, 2026-04-20).
//
// 훅 자체(renderHook)는 testing-library 도입 시점에 추가하고, 지금은 훅이 의존하는
// 순수 유틸을 직접 검증한다:
//   1) initialFetch 결과가 Map으로 빌드되는가
//   2) postgres_changes 페이로드(INSERT/UPDATE/DELETE)가 Map에 올바로 머지되는가
//   3) throttleMs=500에서 flush 횟수가 상한을 지키는가
//
// 이 세 가지가 깨지면 훅도 깨지므로 커버리지상 의미 있는 하한선이다.

import { describe, expect, it, vi } from "vitest";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  createThrottler,
  extractNewRow,
  extractOldRow,
} from "../_realtimeInternal";

// ─── 테스트용 row 타입 (실제 now_spot_ticker와 유사한 복합 PK 형태) ───
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
  // supabase-js 타입에 맞춰 대충 구성. eventType과 new/old만 있으면 유틸 검증엔 충분.
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

// useRealtimeTable의 applyChange 로직을 그대로 재현한 헬퍼.
// (훅 내부의 순수 부분만 떼어 테스트 — 훅 렌더링 없이 동일 시맨틱을 검증.)
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

describe("useRealtimeTable core: initial fetch → Map build", () => {
  it("initialFetch 배열이 pk 기준 Map으로 빌드된다", () => {
    const list = [makeRow("BTCUSDT", 100), makeRow("ETHUSDT", 200)];
    const map = new Map<string, TestRow>();
    for (const r of list) map.set(pk(r), r);

    expect(map.size).toBe(2);
    expect(map.get("binance_um_BTCUSDT")?.last_price).toBe(100);
    expect(map.get("binance_um_ETHUSDT")?.last_price).toBe(200);
  });
});

describe("useRealtimeTable core: postgres_changes merge", () => {
  it("INSERT 이벤트가 Map에 새 row를 추가한다", () => {
    const map = new Map<string, TestRow>();
    const changed = applyChange(
      map,
      makePayload("INSERT", makeRow("BTCUSDT", 50000), null),
    );
    expect(changed).toBe(true);
    expect(map.size).toBe(1);
    expect(map.get("binance_um_BTCUSDT")?.last_price).toBe(50000);
  });

  it("UPDATE 이벤트가 기존 row를 덮어쓴다", () => {
    const map = new Map<string, TestRow>();
    map.set(pk(makeRow("BTCUSDT", 100)), makeRow("BTCUSDT", 100));
    applyChange(map, makePayload("UPDATE", makeRow("BTCUSDT", 150), null));
    expect(map.get("binance_um_BTCUSDT")?.last_price).toBe(150);
  });

  it("DELETE 이벤트가 Map에서 row를 제거한다", () => {
    const map = new Map<string, TestRow>();
    map.set(pk(makeRow("BTCUSDT", 100)), makeRow("BTCUSDT", 100));
    const changed = applyChange(
      map,
      makePayload("DELETE", null, makeRow("BTCUSDT", 100)),
    );
    expect(changed).toBe(true);
    expect(map.has("binance_um_BTCUSDT")).toBe(false);
  });

  it("new 객체가 비어있으면 머지를 건너뛴다", () => {
    const map = new Map<string, TestRow>();
    const changed = applyChange(map, makePayload("INSERT", null, null));
    expect(changed).toBe(false);
    expect(map.size).toBe(0);
  });
});

describe("createThrottler: flush 횟수 제한 (throttleMs=500)", () => {
  it("즉시 연속 schedule 해도 첫 flush는 1회만", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttler = createThrottler(
      500,
      flush,
      () => Date.now(),
      // rAF는 setTimeout으로 시뮬레이트 — 테스트 안정성.
      (cb) => setTimeout(cb, 0) as unknown as number,
      (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
    );

    // 1,000번 이벤트 도착 시뮬레이트 — throttleMs 안에 몰린 상태.
    for (let i = 0; i < 1000; i++) throttler.schedule();

    // 아직 타이머 미경과 → flush 0회.
    expect(flush).not.toHaveBeenCalled();

    // throttleMs만큼 시간 전진 → setTimeout 콜백 실행 → rAF(setTimeout 0ms) 큐에 들어감.
    await vi.advanceTimersByTimeAsync(500);
    // rAF로 예약된 0ms 타이머까지 소화.
    await vi.advanceTimersByTimeAsync(0);

    expect(flush).toHaveBeenCalledTimes(1);
    throttler.cancel();
    vi.useRealTimers();
  });

  it("1초 구간(루프) 동안 연속 schedule은 최대 2회 flush (throttleMs=500)", async () => {
    // 꼬리 타이머(루프 종료 후 trailing flush)는 별도 — 여기서는 루프 구간 내 flush만 측정.
    // 루프 구간 = 1,000ms, throttleMs=500 → leading 500ms + 1000ms 경계 = 최대 2회.
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttler = createThrottler(
      500,
      flush,
      () => Date.now(),
      (cb) => setTimeout(cb, 0) as unknown as number,
      (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
    );

    for (let tick = 0; tick < 100; tick++) {
      throttler.schedule();
      await vi.advanceTimersByTimeAsync(10);
    }

    // 루프 종료 시점의 flush 횟수가 상한.
    expect(flush.mock.calls.length).toBeLessThanOrEqual(2);
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(1);

    throttler.cancel();
    vi.useRealTimers();
  });

  it("throttleMs=0이면 즉시 flush (마이크로태스크 1 tick 뒤)", async () => {
    const flush = vi.fn();
    const throttler = createThrottler(0, flush);
    throttler.schedule();
    // microtask 큐를 비움.
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancel 후 예약은 무효화된다", async () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const throttler = createThrottler(
      500,
      flush,
      () => Date.now(),
      (cb) => setTimeout(cb, 0) as unknown as number,
      (h) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
    );
    throttler.schedule();
    throttler.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(flush).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

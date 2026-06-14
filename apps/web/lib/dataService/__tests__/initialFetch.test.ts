// initialFetch — 서버 측 order 옵션 테스트 (테마 A Step 3, 2026-06-11).
//
// 왜 중요한가: limit(500) < 테이블 행 수일 때 order 없는 SELECT 는 "정렬 상위권
// 누락 → 틀린 랭킹" 도메인 결함을 만든다 (사이트=DB 위생 #9). order 옵션이
// supabase query builder 에 정확한 인자(nullsFirst:false 포함)로 전달되는지 박제.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FETCH_HARD_CAP, initialFetch } from "../initialFetch";
import { getDataSourceClient } from "../supabaseAdapter";

vi.mock("../supabaseAdapter", () => ({
  getDataSourceClient: vi.fn(),
}));

/**
 * supabase query builder 체인 mock — from→select→eq*→in*→order?→(limit | range)(await).
 *
 * @param rows       limit 경로(기본/단일)가 반환할 행.
 * @param rangePages fetchAll 경로의 .range() 가 순서대로 반환할 페이지들
 *                   ([10-33] Step 2). 미지정 시 range 는 `rows` 반환.
 */
function buildClientMock(rows: unknown[] = [], rangePages?: unknown[][]) {
  const calls = {
    from: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
  };
  let pageIdx = 0;
  const query = {
    eq: (...args: unknown[]) => {
      calls.eq(...args);
      return query;
    },
    in: (...args: unknown[]) => {
      calls.in(...args);
      return query;
    },
    order: (...args: unknown[]) => {
      calls.order(...args);
      return query;
    },
    limit: (...args: unknown[]) => {
      calls.limit(...args);
      return Promise.resolve({ data: rows, error: null });
    },
    range: (...args: unknown[]) => {
      calls.range(...args);
      const page = rangePages ? (rangePages[pageIdx++] ?? []) : rows;
      return Promise.resolve({ data: page, error: null });
    },
  };
  const client = {
    from: (table: string) => {
      calls.from(table);
      return { select: () => query };
    },
  };
  return { client, calls };
}

describe("initialFetch order 옵션", () => {
  beforeEach(() => {
    vi.mocked(getDataSourceClient).mockReset();
  });

  it("order 지정 시 query.order(column, {ascending, nullsFirst:false}) 호출", async () => {
    const { client, calls } = buildClientMock([{ symbol: "BTCUSDT" }]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    await initialFetch({
      datasource: "open_interest",
      eq: [{ column: "exchange", value: "binance" }],
      order: { column: "open_interest", ascending: false },
    });

    // 논리 id → 물리 테이블 resolve 경유 확인 (테마 A Step 1 배관)
    expect(calls.from).toHaveBeenCalledWith("now_futures_indicator");
    expect(calls.eq).toHaveBeenCalledWith("exchange", "binance");
    expect(calls.order).toHaveBeenCalledWith("open_interest", {
      ascending: false,
      nullsFirst: false,
    });
    expect(calls.limit).toHaveBeenCalled();
  });

  it("order 미지정 시 query.order 미호출 (기존 동작 회귀)", async () => {
    const { client, calls } = buildClientMock([]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    await initialFetch({ datasource: "now_spot_ticker" });

    expect(calls.order).not.toHaveBeenCalled();
    expect(calls.limit).toHaveBeenCalled();
  });

  // ─── in 필터 (M2 테마 B, 2026-06-11, [10-2]) ───

  it("in 필터 지정 시 query.in(column, values) 호출 — quote_asset pushdown", async () => {
    const { client, calls } = buildClientMock([{ symbol: "BTCUSDT" }]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    await initialFetch({
      datasource: "now_spot_ticker",
      eq: [{ column: "exchange", value: "binance" }],
      in: [{ column: "quote_asset", values: ["USDT", "USDC"] }],
    });

    expect(calls.from).toHaveBeenCalledWith("now_spot_ticker");
    expect(calls.eq).toHaveBeenCalledWith("exchange", "binance");
    expect(calls.in).toHaveBeenCalledWith("quote_asset", ["USDT", "USDC"]);
    expect(calls.limit).toHaveBeenCalled();
  });

  it("in 미지정 시 query.in 미호출 (기존 동작 회귀)", async () => {
    const { client, calls } = buildClientMock([]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    await initialFetch({ datasource: "now_spot_ticker" });

    expect(calls.in).not.toHaveBeenCalled();
  });

  it("client 획득 실패(SSR/env 누락) 시 graceful 빈 배열 — order 있어도 동일", async () => {
    vi.mocked(getDataSourceClient).mockImplementation(() => {
      throw new Error("no env");
    });

    const out = await initialFetch({
      datasource: "open_interest",
      order: { column: "open_interest", ascending: false },
    });
    expect(out).toEqual([]);
  });
});

// ─── fetchAll 모드 ([10-33] Step 2, 2026-06-14) ───
//
// 왜 중요한가: spot all(~1,447) > PostgREST db-max-rows(1,000) → .range() 페이지네이션
// 으로 전체를 수집해야 "모든 코인 보기" 가 성립. 무제한 fetch 는 FETCH_HARD_CAP 으로 차단.

describe("initialFetch fetchAll 모드", () => {
  beforeEach(() => {
    vi.mocked(getDataSourceClient).mockReset();
  });

  it("단일 페이지(<1000행) — range(0,999) 1회 + order/보조정렬 적용", async () => {
    const page = Array.from({ length: 449 }, (_, i) => ({ symbol: `S${i}` }));
    const { client, calls } = buildClientMock([], [page]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    const out = await initialFetch({
      datasource: "now_spot_ticker",
      in: [{ column: "quote_asset", values: ["USDT"] }],
      order: { column: "quote_volume", ascending: false },
      fetchAll: true,
    });

    expect(Array.isArray(out)).toBe(true);
    expect((out as unknown[]).length).toBe(449);
    expect(calls.range).toHaveBeenCalledTimes(1);
    expect(calls.range).toHaveBeenCalledWith(0, 999);
    // 주 정렬 + symbol 보조정렬(페이지 안정성) 둘 다 적용.
    expect(calls.order).toHaveBeenCalledWith("quote_volume", {
      ascending: false,
      nullsFirst: false,
    });
    expect(calls.order).toHaveBeenCalledWith("symbol", {
      ascending: true,
      nullsFirst: false,
    });
    // fetchAll 은 .limit() 경로 미사용.
    expect(calls.limit).not.toHaveBeenCalled();
  });

  it("페이지네이션 — 첫 페이지 1000행이면 range(1000,1999) 재호출 (누적 1200)", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ symbol: `S${i}` }));
    const partial = Array.from({ length: 200 }, (_, i) => ({ symbol: `T${i}` }));
    const { client, calls } = buildClientMock([], [full, partial]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    const out = await initialFetch({
      datasource: "now_spot_ticker",
      fetchAll: true,
    });

    expect((out as unknown[]).length).toBe(1200);
    expect(calls.range).toHaveBeenCalledTimes(2);
    expect(calls.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(calls.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("FETCH_HARD_CAP 도달 시 잘라서 반환 + console.warn (graceful)", async () => {
    const full = () =>
      Array.from({ length: 1000 }, (_, i) => ({ symbol: `S${i}` }));
    const { client, calls } = buildClientMock(
      [],
      [full(), full(), full(), full()],
    );
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const out = await initialFetch({
      datasource: "now_spot_ticker",
      fetchAll: true,
    });

    expect((out as unknown[]).length).toBe(FETCH_HARD_CAP);
    // 0-999, 1000-1999, 2000-2999 = 3 페이지에서 cap(3000) 도달.
    expect(calls.range).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("fetchAll 미지정 시 .range 미사용 (기존 .limit 경로 회귀)", async () => {
    const { client, calls } = buildClientMock([{ symbol: "BTCUSDT" }]);
    vi.mocked(getDataSourceClient).mockReturnValue(client as never);

    await initialFetch({ datasource: "now_spot_ticker" });

    expect(calls.range).not.toHaveBeenCalled();
    expect(calls.limit).toHaveBeenCalled();
  });
});

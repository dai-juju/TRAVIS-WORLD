// initialFetch — 서버 측 order 옵션 테스트 (테마 A Step 3, 2026-06-11).
//
// 왜 중요한가: limit(500) < 테이블 행 수일 때 order 없는 SELECT 는 "정렬 상위권
// 누락 → 틀린 랭킹" 도메인 결함을 만든다 (사이트=DB 위생 #9). order 옵션이
// supabase query builder 에 정확한 인자(nullsFirst:false 포함)로 전달되는지 박제.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialFetch } from "../initialFetch";
import { getDataSourceClient } from "../supabaseAdapter";

vi.mock("../supabaseAdapter", () => ({
  getDataSourceClient: vi.fn(),
}));

/** supabase query builder 체인 mock — from→select→eq*→order?→limit(await). */
function buildClientMock(rows: unknown[] = []) {
  const calls = {
    from: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  const query = {
    eq: (...args: unknown[]) => {
      calls.eq(...args);
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

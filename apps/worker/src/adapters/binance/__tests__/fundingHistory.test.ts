// ============================================================
// normalize/fundingHistory.ts 단위 테스트 (사이클 2 Step 6, 2026-07-09).
//
// 검증 시나리오 (crypto-domain 자문 2026-07-09 정합):
//   happy USDM : fundingTime → funding_time ISO / fundingRate 파싱 / markPrice 파싱
//   happy COINM: market_type 주입 + markPrice 미제공(undefined) → null (문서 미등재 graceful)
//   폐기 규약  : fundingTime ≤ 0/누락 → row 폐기 (자연키 축 오염 불가)
//               fundingRate 파싱 실패 → row 폐기 (NOT NULL 컬럼)
//   sanity     : |rate| > 3% → console.warn (값은 저장 — cap/floor 부근 실존 가능)
//
// interval 부재가 계약: 펀딩은 정산 이벤트 — 6 metric normalize(interval 주입)와 달리
//   반환 row 에 interval 키 자체가 없다 (테이블도 축이 없음).
//
// 단일 진실: docs/task-record/M2-cycle2-genericchart.md §4h
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchUsdmFundingRateHistory,
  normalizeFundingRateEvent,
} from "@travis/exchange-collectors";
import type { BinanceFundingRateEvent } from "@travis/exchange-collectors";

// 2026-04-26T08:00:00.000Z 근처 — 검증용 고정 epoch ms (8h 정산 경계 가정).
const TS = 1777968000000;
const TS_ISO = new Date(TS).toISOString();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeFundingRateEvent", () => {
  it("happy USDM: fundingTime ISO + rate 파싱 + markPrice 파싱 + market_type 주입", () => {
    const raw: BinanceFundingRateEvent = {
      symbol: "BTCUSDT",
      fundingTime: TS,
      fundingRate: "-0.00403000",
      markPrice: "108123.45",
    };
    const row = normalizeFundingRateEvent(raw, "futures_usdm");
    expect(row).not.toBeNull();
    expect(row?.exchange).toBe("binance");
    expect(row?.market_type).toBe("futures_usdm");
    expect(row?.symbol).toBe("BTCUSDT");
    expect(row?.funding_time).toBe(TS_ISO);
    expect(row?.funding_rate).toBeCloseTo(-0.00403);
    expect(row?.mark_price).toBeCloseTo(108123.45);
    // ★ interval 부재 계약 — 정산 이벤트 row 에 interval 키 자체가 없다.
    expect(Object.prototype.hasOwnProperty.call(row, "interval")).toBe(false);
  });

  it("happy COINM: markPrice 미제공(문서 미등재) → null graceful + market_type coinm", () => {
    const raw: BinanceFundingRateEvent = {
      symbol: "BTCUSD_PERP",
      fundingTime: TS,
      fundingRate: "0.00010000",
      // markPrice 없음 — COINM 문서 미등재 (라이브 smoke 전 방어).
    };
    const row = normalizeFundingRateEvent(raw, "futures_coinm");
    expect(row).not.toBeNull();
    expect(row?.market_type).toBe("futures_coinm");
    expect(row?.mark_price).toBeNull();
    expect(row?.funding_rate).toBeCloseTo(0.0001);
  });

  it("markPrice 빈 문자열 \"\" → null (num 규약)", () => {
    const raw: BinanceFundingRateEvent = {
      symbol: "ETHUSDT",
      fundingTime: TS,
      fundingRate: "0.00005",
      markPrice: "",
    };
    expect(normalizeFundingRateEvent(raw, "futures_usdm")?.mark_price).toBeNull();
  });

  it("폐기: fundingTime 0/음수 → null (자연키 축 오염 불가)", () => {
    const base = { symbol: "BTCUSDT", fundingRate: "0.0001" };
    expect(
      normalizeFundingRateEvent({ ...base, fundingTime: 0 }, "futures_usdm"),
    ).toBeNull();
    expect(
      normalizeFundingRateEvent({ ...base, fundingTime: -1 }, "futures_usdm"),
    ).toBeNull();
  });

  it("폐기: fundingRate 파싱 실패(빈 문자열/NaN) → null (NOT NULL 컬럼)", () => {
    expect(
      normalizeFundingRateEvent(
        { symbol: "BTCUSDT", fundingTime: TS, fundingRate: "" },
        "futures_usdm",
      ),
    ).toBeNull();
    expect(
      normalizeFundingRateEvent(
        { symbol: "BTCUSDT", fundingTime: TS, fundingRate: "abc" },
        "futures_usdm",
      ),
    ).toBeNull();
  });

  it("sanity: |rate| > 3% → console.warn (값은 저장)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const row = normalizeFundingRateEvent(
      { symbol: "MEMEUSDT", fundingTime: TS, fundingRate: "0.045" },
      "futures_usdm",
    );
    expect(row).not.toBeNull();
    expect(row?.funding_rate).toBeCloseTo(0.045); // 저장은 함 (cap/floor 부근 실존 가능)
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("0% 정산(정상값)은 경고 없이 저장", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const row = normalizeFundingRateEvent(
      { symbol: "BTCUSDT", fundingTime: TS, fundingRate: "0" },
      "futures_usdm",
    );
    expect(row?.funding_rate).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── FundingRatePage 메타 계약 (fetch mock — cursor 무한루프 방어의 근거) ────
// 라이브 smoke 2026-07-09 실측: 같은 fundingTime 에 수백 심볼 동시 등장 → 페이지가
// 그룹 중간에서 잘림 → task 는 raw 기준 first/last/rawCount 로 cursor 를 정한다.
// normalize 폐기 row 가 메타에 영향을 주지 않는 것이 핵심 계약.

describe("fetchUsdmFundingRateHistory 페이지 메타 (fetch mock)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(payload: unknown): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: new Headers(),
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      })),
    );
  }

  it("first/last/rawCount 는 raw 기준 — normalize 폐기 row 와 무관", async () => {
    stubFetch([
      { symbol: "AUSDT", fundingTime: TS, fundingRate: "0.0001" },
      // 폐기 row (fundingRate 파싱 실패) — rows 에선 빠지지만 메타엔 포함돼야 함.
      { symbol: "BUSDT", fundingTime: TS + 1000, fundingRate: "" },
      { symbol: "CUSDT", fundingTime: TS + 2000, fundingRate: "0.0002" },
    ]);
    const res = await fetchUsdmFundingRateHistory({ startTime: TS });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.rows.map((r) => r.symbol)).toEqual(["AUSDT", "CUSDT"]); // 폐기 1
    expect(res.data.rawCount).toBe(3); // raw 기준
    expect(res.data.firstFundingTimeMs).toBe(TS);
    expect(res.data.lastFundingTimeMs).toBe(TS + 2000); // 마지막 raw 기준 (폐기 무관)
  });

  it("빈 페이지 → rawCount 0 + 메타 null (task 의 '다 따라잡음' 판정)", async () => {
    stubFetch([]);
    const res = await fetchUsdmFundingRateHistory({ startTime: TS });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.rawCount).toBe(0);
    expect(res.data.firstFundingTimeMs).toBeNull();
    expect(res.data.lastFundingTimeMs).toBeNull();
  });

  it("배열 아닌 2xx 응답(에러 envelope 아님·비-rate-limit) → success:false 격하", async () => {
    stubFetch({ weird: true });
    const res = await fetchUsdmFundingRateHistory({ startTime: TS });
    expect(res.success).toBe(false);
  });
});

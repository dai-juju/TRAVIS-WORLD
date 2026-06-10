// ============================================================
// tickerWsHandler 단위 테스트 (M2 테마 A Step 2.5, [3-50] USDM full 승격).
//
// 검증 핵심:
//   1. canHandle 매트릭스 — USDM 이 "!ticker@arr"(full) 로 승격되고
//      "!miniTicker@arr" 매칭이 제거됐는지 / COINM 은 mini 유지인지.
//   2. USDM full payload 의 24h 필드(P/p/w/n/O/C)가 실제 upsert row 에
//      매핑되는지 ([3-50] 의 본질 — 이 필드들이 mini 엔 없어 stale 이었음).
//   3. TRADING allowlist + 비배열 payload graceful (기존 불변 회귀 가드).
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDataService } from "@travis/data-service";
import { RollingWindow } from "../../compute/RollingWindow.js";
import type { TickerSample } from "../../compute/preCompute.js";
import { createTickerWsHandler } from "../streams/tickerWsHandler.js";
import type { MarketType } from "../types.js";

/** upsert 호출 기록용 최소 dataService mock */
function makeDeps() {
  const upsertNowSpotTicker = vi.fn<
    (rows: unknown) => Promise<{ success: true }>
  >(async () => ({ success: true }));
  const upsertNowFuturesTicker = vi.fn<
    (rows: unknown) => Promise<{ success: true }>
  >(async () => ({ success: true }));
  const dataService = {
    upsertNowSpotTicker,
    upsertNowFuturesTicker,
  } as unknown as IDataService;
  const tickerWindow = new RollingWindow<TickerSample>({
    maxSize: 10,
    sampleIntervalMs: 1_000,
  });
  return { dataService, tickerWindow, upsertNowSpotTicker, upsertNowFuturesTicker };
}

/** USDM full ticker 원시 payload 샘플 (17필드 중 매핑 대상 위주) */
const USDM_FULL_BTC = {
  e: "24hrTicker",
  E: 1_700_000_000_000,
  s: "BTCUSDT",
  p: "488.20",
  P: "0.803",
  w: "61120.55",
  c: "61300.10",
  o: "60811.90",
  h: "61500.00",
  l: "60500.00",
  v: "12345.67",
  q: "754321987.12",
  O: 1_699_913_600_000,
  C: 1_700_000_000_000,
  n: 987_654,
};

describe("tickerWsHandler.canHandle (Step 2.5 매트릭스)", () => {
  const handler = createTickerWsHandler(makeDeps());

  const cases: Array<[string, MarketType, boolean]> = [
    ["!ticker@arr", "spot", true], // spot full 유지
    ["!ticker@arr", "futures_usdm", true], // ★ USDM full 승격 (신규)
    ["!miniTicker@arr", "futures_usdm", false], // ★ USDM mini 매칭 제거
    ["!miniTicker@arr", "futures_coinm", true], // COINM mini 유지 (변경 0)
    ["!ticker@arr", "futures_coinm", false], // COINM full 아님
    ["!miniTicker@arr", "spot", false], // spot mini 아님 (기존 동작)
    ["!markPrice@arr@1s", "futures_usdm", false], // 타 핸들러 소관
  ];

  it.each(cases)("%s × %s → %s", (stream, market, expected) => {
    expect(handler.canHandle(stream, market)).toBe(expected);
  });
});

describe("tickerWsHandler.handle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("USDM full payload → 24h 필드(P/p/w/n/O/C)가 upsert row 에 매핑 ([3-50] 본질)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler(deps);

    await handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);

    expect(deps.upsertNowFuturesTicker).toHaveBeenCalledTimes(1);
    const rows = deps.upsertNowFuturesTicker.mock.calls[0]?.[0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: "BTCUSDT",
      last_price: 61300.1,
      // ★ mini 엔 없어서 stale 이었던 24h 필드들
      price_change: 488.2,
      price_change_pct: 0.803,
      weighted_avg_price: 61120.55,
      trade_count: 987_654,
      open_time: 1_699_913_600_000,
      close_time: 1_700_000_000_000,
    });
  });

  it("TRADING allowlist 미포함 심볼은 upsert 에서 제외 (위생 #2 회귀 가드)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler({
      ...deps,
      tradingSymbolsByMarket: {
        spot: new Set<string>(),
        futures_usdm: new Set(["ETHUSDT"]), // BTCUSDT 미포함
        futures_coinm: new Set<string>(),
      },
    });

    await handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);
    expect(deps.upsertNowFuturesTicker).not.toHaveBeenCalled();
  });

  it("배열 아닌 payload 는 graceful 무시 (throw·upsert 없음)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler(deps);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      handler.handle("!ticker@arr", "futures_usdm", { not: "array" }),
    ).resolves.toBeUndefined();
    expect(deps.upsertNowFuturesTicker).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("spot full payload 는 기존 경로 그대로 upsertNowSpotTicker (회귀 0)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler(deps);

    const spotRow = { ...USDM_FULL_BTC, s: "BTCUSDT" };
    await handler.handle("!ticker@arr", "spot", [spotRow]);

    expect(deps.upsertNowSpotTicker).toHaveBeenCalledTimes(1);
    expect(deps.upsertNowFuturesTicker).not.toHaveBeenCalled();
  });
});

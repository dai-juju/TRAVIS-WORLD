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
  const upsertNowSpotTicker = vi.fn<(rows: unknown) => Promise<{ success: true }>>(async () => ({
    success: true,
  }));
  const upsertNowFuturesTicker = vi.fn<(rows: unknown) => Promise<{ success: true }>>(async () => ({
    success: true,
  }));
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

  // ─── quote_asset 적재 (M2 테마 B [10-2], 2026-06-11) ───

  it("quoteAssetBySymbol 주입 시 lookup 값이 row 에 적재 (spot/usdm)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler({
      ...deps,
      quoteAssetBySymbol: {
        spot: new Map([["BTCTRY", "TRY"]]),
        futures_usdm: new Map([["BTCUSDT", "USDT"]]),
        futures_coinm: new Map(),
      },
    });

    await handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);
    const futuresRows = deps.upsertNowFuturesTicker.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(futuresRows[0]).toMatchObject({ symbol: "BTCUSDT", quote_asset: "USDT" });

    await handler.handle("!ticker@arr", "spot", [{ ...USDM_FULL_BTC, s: "BTCTRY" }]);
    const spotRows = deps.upsertNowSpotTicker.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(spotRows[0]).toMatchObject({ symbol: "BTCTRY", quote_asset: "TRY" });
  });

  it("lookup miss / 맵 미주입 → quote_asset key 는 항상 존재하되 값 null (mixed-batch 불변)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // (a) 맵 미주입 (테스트/과도기) — null 적재
    const depsA = makeDeps();
    const handlerA = createTickerWsHandler(depsA);
    await handlerA.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);
    const rowsA = depsA.upsertNowFuturesTicker.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect("quote_asset" in rowsA[0]!).toBe(true);
    expect(rowsA[0]!.quote_asset).toBeNull();

    // (b) 맵 주입됐지만 miss — null 적재 + key 존재 (스냅샷 어긋남 시나리오)
    const depsB = makeDeps();
    const handlerB = createTickerWsHandler({
      ...depsB,
      quoteAssetBySymbol: {
        spot: new Map(),
        futures_usdm: new Map([["ETHUSDT", "USDT"]]), // BTCUSDT miss
        futures_coinm: new Map(),
      },
    });
    await handlerB.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);
    const rowsB = depsB.upsertNowFuturesTicker.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rowsB[0]!.quote_asset).toBeNull();

    warnSpy.mockRestore();
  });

  it("배치 내 모든 row 의 key 집합 동일 — 일부만 lookup hit 여도 균일 (mixed-batch 불변)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler({
      ...deps,
      quoteAssetBySymbol: {
        spot: new Map(),
        futures_usdm: new Map([["BTCUSDT", "USDT"]]), // ETHUSDC 는 의도적 miss
        futures_coinm: new Map(),
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await handler.handle("!ticker@arr", "futures_usdm", [
      USDM_FULL_BTC,
      { ...USDM_FULL_BTC, s: "ETHUSDC" },
    ]);
    const rows = deps.upsertNowFuturesTicker.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const keySets = rows.map((r) => Object.keys(r).sort().join(","));
    expect(keySets[0]).toBe(keySets[1]); // 핵심 — key 집합 완전 동일
    expect(rows[0]!.quote_asset).toBe("USDT");
    expect(rows[1]!.quote_asset).toBeNull();

    warnSpy.mockRestore();
  });
});

// ─── 경로 A publish 배선 (M2 경로 A Step 1, 2026-06-22) ───
describe("tickerWsHandler.handle — 경로 A publish 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publish 미주입 시 호출 없이 upsert 정상 (회귀 0)", async () => {
    const deps = makeDeps();
    const handler = createTickerWsHandler(deps);
    await expect(
      handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]),
    ).resolves.toBeUndefined();
    expect(deps.upsertNowFuturesTicker).toHaveBeenCalledTimes(1);
  });

  it("publish 주입 시 enriched 행으로 호출 + upsert 병행 (경로 B 무중단)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createTickerWsHandler({ ...deps, publish });

    await handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);

    expect(publish).toHaveBeenCalledTimes(1);
    const marketType = publish.mock.calls[0]?.[0];
    const rows = publish.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(marketType).toBe("futures_usdm");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "BTCUSDT", last_price: 61300.1 });
    // 경로 B(upsert)는 그대로 — 두 경로 병행
    expect(deps.upsertNowFuturesTicker).toHaveBeenCalledTimes(1);
  });

  // ─── C1 (2026-06-24): 방송 payload 에 updated_at 주입, upsert 에는 미주입 ───
  it("방송 row 는 updated_at(ISO) 포함하지만 upsert 입력은 미포함 (경로 B DB trigger 위임)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createTickerWsHandler({ ...deps, publish });

    await handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);

    // 경로 A: freshness 라인 근거 — updated_at 이 유효한 ISO 문자열로 존재.
    const broadcast = publish.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    const updatedAt = broadcast[0]?.updated_at;
    expect(typeof updatedAt).toBe("string");
    expect(Number.isFinite(Date.parse(updatedAt as string))).toBe(true);

    // 경로 B: upsert 입력은 updated_at 없음 — DB trigger/DEFAULT NOW() 가 채움(무변경).
    const upsertRows = deps.upsertNowFuturesTicker.mock.calls[0]?.[0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(upsertRows[0]).not.toHaveProperty("updated_at");
  });

  it("위생 #2 — allowlist 필터로 빠진 심볼은 방송에서도 제외 (mixed batch)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createTickerWsHandler({
      ...deps,
      publish,
      tradingSymbolsByMarket: {
        spot: new Set<string>(),
        futures_usdm: new Set(["BTCUSDT"]), // ETHUSDC 는 제외
        futures_coinm: new Set<string>(),
      },
    });

    await handler.handle("!ticker@arr", "futures_usdm", [
      USDM_FULL_BTC,
      { ...USDM_FULL_BTC, s: "ETHUSDC" },
    ]);

    expect(publish).toHaveBeenCalledTimes(1);
    const rows = publish.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    // 필터 통과한 BTCUSDT 만 방송 — 상장폐지/미허용 심볼 직결 노출 차단
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "BTCUSDT" });
  });

  it("전 심볼 필터아웃 → enriched 0 → publish 호출 자체 없음", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createTickerWsHandler({
      ...deps,
      publish,
      tradingSymbolsByMarket: {
        spot: new Set<string>(),
        futures_usdm: new Set(["ETHUSDT"]), // BTCUSDT 미포함
        futures_coinm: new Set<string>(),
      },
    });

    await handler.handle("!ticker@arr", "futures_usdm", [USDM_FULL_BTC]);
    expect(publish).not.toHaveBeenCalled();
    expect(deps.upsertNowFuturesTicker).not.toHaveBeenCalled();
  });
});

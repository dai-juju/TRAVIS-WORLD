// ============================================================
// forceOrderWsHandler 단위 테스트 (M2 경로 A fast-follow #2 Step 2, 2026-06-27).
//
// 검증 핵심 = 경로 A publish 배선 (markPrice/ticker 선례 동형):
//   1. publish 미주입 → 호출 없이 insert 정상 (회귀 0).
//   2. publish 주입 → 정규화 row 방송 + insert(경로 B) 병행.
//   3. 위생 — allowlist 통과 심볼만 방송 / 비통과 심볼은 방송 제외(단 insert 는 그대로).
//   4. allowlist 미주입 시 전부 허용(graceful).
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDataService } from "@travis/data-service";
import type { MarketType } from "../types.js";
import { createForceOrderWsHandler } from "../streams/forceOrderWsHandler.js";

/** insertLiquidation 호출 기록용 최소 dataService mock */
function makeDeps() {
  const insertLiquidation = vi.fn<(rows: unknown) => Promise<{ success: true }>>(
    async () => ({ success: true }),
  );
  const dataService = { insertLiquidation } as unknown as IDataService;
  return { dataService, insertLiquidation };
}

/** USDM forceOrder 원시 payload 샘플 (`!forceOrder@arr` 단일 객체) */
function forceOrderRaw(symbol: string, side = "SELL") {
  return {
    e: "forceOrder",
    E: 1_700_000_000_000,
    o: {
      s: symbol,
      S: side,
      o: "LIMIT",
      f: "IOC",
      q: "1.5",
      p: "60000",
      ap: "59950",
      X: "FILLED",
      l: "1.5",
      z: "1.5",
      T: 1_700_000_000_000,
    },
  };
}

const ALL_MARKETS: Record<MarketType, Set<string>> = {
  spot: new Set(),
  futures_usdm: new Set(["BTCUSDT"]),
  futures_coinm: new Set(),
};

describe("forceOrderWsHandler.canHandle", () => {
  const handler = createForceOrderWsHandler(makeDeps());

  const cases: Array<[string, MarketType, boolean]> = [
    ["!forceOrder@arr", "futures_usdm", true],
    ["!forceOrder@arr", "futures_coinm", true],
    ["!forceOrder@arr", "spot", false], // 선물 전용
    ["!ticker@arr", "futures_usdm", false], // 타 핸들러 소관
  ];

  it.each(cases)("%s × %s → %s", (stream, market, expected) => {
    expect(handler.canHandle(stream, market)).toBe(expected);
  });
});

describe("forceOrderWsHandler.handle — 경로 A publish 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publish 미주입 시 호출 없이 insert 정상 (회귀 0)", async () => {
    const deps = makeDeps();
    const handler = createForceOrderWsHandler(deps);
    await expect(
      handler.handle("!forceOrder@arr", "futures_usdm", forceOrderRaw("BTCUSDT")),
    ).resolves.toBeUndefined();
    expect(deps.insertLiquidation).toHaveBeenCalledTimes(1);
  });

  it("publish 주입 시 정규화 row 방송 + insert 병행 (경로 B 무중단)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createForceOrderWsHandler({ ...deps, publish });

    await handler.handle("!forceOrder@arr", "futures_usdm", forceOrderRaw("BTCUSDT"));

    expect(publish).toHaveBeenCalledTimes(1);
    const [marketType, rows] = publish.mock.calls[0]!;
    expect(marketType).toBe("futures_usdm");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: "BTCUSDT",
      side: "SELL",
      price: 60000,
      avg_price: 59950,
      market_type: "futures_usdm",
    });
    expect(deps.insertLiquidation).toHaveBeenCalledTimes(1); // 경로 B 병행
  });

  it("위생 — allowlist 통과 심볼만 방송, 비통과는 방송 제외(단 insert 는 그대로)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createForceOrderWsHandler({
      ...deps,
      publish,
      tradingSymbolsByMarket: ALL_MARKETS,
    });

    // 비통과 심볼(allowlist 에 없음) → 방송 제외, insert 는 그대로
    await handler.handle("!forceOrder@arr", "futures_usdm", forceOrderRaw("DELISTEDUSDT"));
    expect(publish).not.toHaveBeenCalled();
    expect(deps.insertLiquidation).toHaveBeenCalledTimes(1);

    // 통과 심볼 → 방송 + insert
    await handler.handle("!forceOrder@arr", "futures_usdm", forceOrderRaw("BTCUSDT"));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(deps.insertLiquidation).toHaveBeenCalledTimes(2);
  });

  it("allowlist 미주입 시 전부 허용(graceful)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createForceOrderWsHandler({ ...deps, publish }); // tradingSymbolsByMarket 없음

    await handler.handle("!forceOrder@arr", "futures_usdm", forceOrderRaw("ANYUSDT"));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("정규화 실패(필수 필드 누락) → 방송·insert 둘 다 skip (graceful)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createForceOrderWsHandler({ ...deps, publish });

    // o 누락 → normalizeForceOrder null
    await handler.handle("!forceOrder@arr", "futures_usdm", { e: "forceOrder", E: 1 });
    expect(publish).not.toHaveBeenCalled();
    expect(deps.insertLiquidation).not.toHaveBeenCalled();
  });

  it("publish 는 insert(경로 B) 보다 먼저 호출된다 (저지연 불변식, reviewer W1)", async () => {
    const order: string[] = [];
    const deps = makeDeps();
    deps.insertLiquidation.mockImplementation(async () => {
      order.push("insert");
      return { success: true };
    });
    const publish = vi.fn(() => {
      order.push("publish");
    });
    const handler = createForceOrderWsHandler({ ...deps, publish });

    await handler.handle("!forceOrder@arr", "futures_usdm", forceOrderRaw("BTCUSDT"));
    // 순서가 뒤집히면(insert await 뒤로 이동) 즉시 실패 — 저지연 보장.
    expect(order).toEqual(["publish", "insert"]);
  });
});

// ─── [10-72] notional(USD) enrich (ff#2 재개 Step 2, 2026-07-05) ─────────────
//
// canonical (crypto-domain 라이브 검증 2026-07-05):
//   USDM  = z × ap → (ap 결측) z × p → (z 결측/0) q × p   — 체결분(z) 우선.
//   COINM = zEff × contractSize (인버스 — 가격 곱하지 않음. BTCUSD_PERP=100 실측).
//   contractSize 미보유 → null (오산 대신 결측, 위생 #5).
describe("forceOrderWsHandler — notional(USD) enrich [10-72]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** publish 로 방송된 row 1개를 꺼내는 헬퍼 */
  async function broadcastRow(
    payload: unknown,
    marketType: MarketType,
    coinmContractSizeBySymbol?: ReadonlyMap<string, number>,
  ) {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createForceOrderWsHandler({
      ...deps,
      publish,
      coinmContractSizeBySymbol,
    });
    await handler.handle("!forceOrder@arr", marketType, payload);
    expect(publish).toHaveBeenCalledTimes(1);
    return publish.mock.calls[0]![1][0] as Record<string, unknown>;
  }

  it("USDM 정상: notional = z × ap (1.5 × 59950)", async () => {
    const row = await broadcastRow(forceOrderRaw("BTCUSDT"), "futures_usdm");
    expect(row.notional).toBeCloseTo(1.5 * 59950);
  });

  it("USDM ap 결측: 폴백 z × p (체결분 기준 유지)", async () => {
    const raw = forceOrderRaw("BTCUSDT");
    raw.o.ap = "";
    const row = await broadcastRow(raw, "futures_usdm");
    expect(row.notional).toBeCloseTo(1.5 * 60000);
  });

  it("USDM z 결측/0: 최후 폴백 q × p", async () => {
    const raw = forceOrderRaw("BTCUSDT");
    raw.o.ap = "";
    raw.o.z = "0";
    const row = await broadcastRow(raw, "futures_usdm");
    expect(row.notional).toBeCloseTo(1.5 * 60000); // q=1.5 × p=60000
  });

  it("COINM: notional = z × contractSize (가격 곱하지 않음 — 인버스 계약)", async () => {
    const raw = forceOrderRaw("BTCUSD_PERP");
    raw.o.q = "20";
    raw.o.z = "20";
    const row = await broadcastRow(
      raw,
      "futures_coinm",
      new Map([["BTCUSD_PERP", 100]]),
    );
    expect(row.notional).toBe(20 * 100); // 계약 20개 × $100 = $2,000
  });

  it("COINM contractSize 맵 미스 → notional null (오산 대신 결측, graceful)", async () => {
    const raw = forceOrderRaw("NEWUSD_PERP");
    const row = await broadcastRow(
      raw,
      "futures_coinm",
      new Map([["BTCUSD_PERP", 100]]),
    );
    expect(row.notional).toBeNull();
  });

  it("COINM 맵 미주입 → notional null (Phase A 휴면·부팅 직후 graceful)", async () => {
    const row = await broadcastRow(forceOrderRaw("BTCUSD_PERP"), "futures_coinm");
    expect(row.notional).toBeNull();
  });

  it("sanity 상한($1B) 초과 → null + 경고 (위생 #5 — 이상값 미표시)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = forceOrderRaw("BTCUSD_PERP");
    raw.o.q = "999999999";
    raw.o.z = "999999999";
    const row = await broadcastRow(
      raw,
      "futures_coinm",
      new Map([["BTCUSD_PERP", 100]]),
    );
    expect(row.notional).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("insert(경로 B) row 에도 동일 notional 포함 (payload↔DB drift 0)", async () => {
    const deps = makeDeps();
    const handler = createForceOrderWsHandler(deps);
    await handler.handle(
      "!forceOrder@arr",
      "futures_usdm",
      forceOrderRaw("BTCUSDT"),
    );
    const rows = deps.insertLiquidation.mock.calls[0]![0] as Array<
      Record<string, unknown>
    >;
    expect(rows[0]!.notional).toBeCloseTo(1.5 * 59950);
  });
});

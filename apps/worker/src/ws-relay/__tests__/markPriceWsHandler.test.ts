// ============================================================
// markPriceWsHandler 단위 테스트 (M2 경로 A fast-follow #1 Step 3, 2026-06-26).
//
// 검증 핵심 = 경로 A publish 배선 (tickerWsHandler 선례 동형):
//   1. publish 미주입 → 호출 없이 upsert 정상 (회귀 0).
//   2. publish 주입 → **부분 row**(7컬럼) 방송 + upsert(경로 B) 병행.
//   3. C1 — 방송 payload 에 updated_at(ISO) 주입 / upsert 입력엔 미포함(DB trigger 위임).
//   4. 위생 #2 — allowlist 필터로 빠진 심볼은 방송에서도 제외.
//   5. 전 심볼 필터아웃 → publish 호출 자체 없음.
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDataService } from "@travis/data-service";
import { createMarkPriceWsHandler } from "../streams/markPriceWsHandler.js";

/** upsert 호출 기록용 최소 dataService mock */
function makeDeps() {
  const upsertNowFuturesIndicatorPartial = vi.fn<(rows: unknown) => Promise<{ success: true }>>(
    async () => ({ success: true }),
  );
  const dataService = {
    upsertNowFuturesIndicatorPartial,
  } as unknown as IDataService;
  return { dataService, upsertNowFuturesIndicatorPartial };
}

/** USDM markPrice 원시 payload 샘플 (`!markPrice@arr@1s` 원소) */
const USDM_MARK_BTC = {
  e: "markPriceUpdate",
  E: 1_700_000_000_000,
  s: "BTCUSDT",
  p: "61300.10", // mark price
  P: "61305.00", // estimated settle price
  i: "61290.00", // index price
  r: "0.0001", // predicted funding rate
  T: 1_700_028_800_000, // next funding time
};

describe("markPriceWsHandler.canHandle", () => {
  const handler = createMarkPriceWsHandler(makeDeps());

  const cases: Array<[string, "futures_usdm" | "futures_coinm" | "spot", boolean]> = [
    ["!markPrice@arr@1s", "futures_usdm", true],
    ["!markPrice@arr@1s", "futures_coinm", true],
    ["!markPrice@arr@1s", "spot", false], // 선물 전용
    ["!ticker@arr", "futures_usdm", false], // 타 핸들러 소관
  ];

  it.each(cases)("%s × %s → %s", (stream, market, expected) => {
    expect(handler.canHandle(stream, market)).toBe(expected);
  });
});

describe("markPriceWsHandler.handle — 경로 A publish 배선", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publish 미주입 시 호출 없이 upsert 정상 (회귀 0)", async () => {
    const deps = makeDeps();
    const handler = createMarkPriceWsHandler(deps);
    await expect(
      handler.handle("!markPrice@arr@1s", "futures_usdm", [USDM_MARK_BTC]),
    ).resolves.toBeUndefined();
    expect(deps.upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);
  });

  it("publish 주입 시 부분 row(7컬럼)로 호출 + upsert 병행 (경로 B 무중단)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createMarkPriceWsHandler({ ...deps, publish });

    await handler.handle("!markPrice@arr@1s", "futures_usdm", [USDM_MARK_BTC]);

    expect(publish).toHaveBeenCalledTimes(1);
    const marketType = publish.mock.calls[0]?.[0];
    const rows = publish.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(marketType).toBe("futures_usdm");
    expect(rows).toHaveLength(1);
    // markPrice 부분 row — 7컬럼 전수 매핑 확인 (p/i/P/r/T → 도메인 컬럼).
    expect(rows[0]).toMatchObject({
      symbol: "BTCUSDT",
      mark_price: 61300.1,
      index_price: 61290,
      estimated_settle_price: 61305,
      predicted_funding_rate: 0.0001,
      next_funding_time: 1_700_028_800_000,
    });
    // 경로 B(upsert)는 그대로 — 두 경로 병행
    expect(deps.upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);
  });

  it("방송 row 는 updated_at(ISO) 포함하지만 upsert 입력은 미포함 (경로 B DB trigger 위임)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createMarkPriceWsHandler({ ...deps, publish });

    await handler.handle("!markPrice@arr@1s", "futures_usdm", [USDM_MARK_BTC]);

    // 경로 A: freshness 라인 근거 — updated_at 이 유효한 ISO 문자열로 존재.
    const broadcast = publish.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    const updatedAt = broadcast[0]?.updated_at;
    expect(typeof updatedAt).toBe("string");
    expect(Number.isFinite(Date.parse(updatedAt as string))).toBe(true);

    // 경로 B: upsert 입력은 updated_at 없음 — DB trigger/DEFAULT NOW() 가 채움(무변경).
    const upsertRows = deps.upsertNowFuturesIndicatorPartial.mock.calls[0]?.[0] as unknown as Array<
      Record<string, unknown>
    >;
    expect(upsertRows[0]).not.toHaveProperty("updated_at");
  });

  it("위생 #2 — allowlist 필터로 빠진 심볼은 방송에서도 제외 (BREAK/상장폐지 차단)", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createMarkPriceWsHandler({
      ...deps,
      publish,
      tradingSymbolsByMarket: {
        spot: new Set<string>(),
        futures_usdm: new Set(["BTCUSDT"]), // DEFIUSDT 는 제외
        futures_coinm: new Set<string>(),
      },
    });

    await handler.handle("!markPrice@arr@1s", "futures_usdm", [
      USDM_MARK_BTC,
      { ...USDM_MARK_BTC, s: "DEFIUSDT" },
    ]);

    expect(publish).toHaveBeenCalledTimes(1);
    const rows = publish.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "BTCUSDT" });
  });

  it("[10-77] writeCoalescer 주입 → publish 는 즉시(경로 A 유지) + 직접 upsert 0 + enqueue 위임", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const enqueue = vi.fn();
    const handler = createMarkPriceWsHandler({
      ...deps,
      publish,
      writeCoalescer: { enqueue },
    });

    await handler.handle("!markPrice@arr@1s", "futures_usdm", [USDM_MARK_BTC]);

    // 경로 A — 코얼레서 유무와 무관하게 매 배치 즉시 방송 (1초 실시간 유지)
    expect(publish).toHaveBeenCalledTimes(1);
    // 경로 B — 직접 upsert 대신 enqueue 위임 (60초 창 flush 는 코얼레서 소관)
    expect(deps.upsertNowFuturesIndicatorPartial).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toBe("futures_usdm");
    // enqueue 입력 = 기존 upsert 입력과 동일 rows (updated_at 미포함 = DB trigger 위임)
    const rows = enqueue.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "BTCUSDT", mark_price: 61300.1 });
    expect(rows[0]).not.toHaveProperty("updated_at");
  });

  it("전 심볼 필터아웃 → rows 0 → publish 호출 자체 없음", async () => {
    const deps = makeDeps();
    const publish = vi.fn();
    const handler = createMarkPriceWsHandler({
      ...deps,
      publish,
      tradingSymbolsByMarket: {
        spot: new Set<string>(),
        futures_usdm: new Set(["ETHUSDT"]), // BTCUSDT 미포함
        futures_coinm: new Set<string>(),
      },
    });

    await handler.handle("!markPrice@arr@1s", "futures_usdm", [USDM_MARK_BTC]);
    expect(publish).not.toHaveBeenCalled();
    expect(deps.upsertNowFuturesIndicatorPartial).not.toHaveBeenCalled();
  });
});

// ============================================================
// MarkPriceWriteCoalescer 단위 테스트 ([10-77] M2 사이클 1, 2026-07-07).
//
// 검증 핵심 (task-record Step 3 의 3불변 중 ②③ + 유실 경계):
//   1. 창 도래 전 upsert 0 — DB 쓰기가 창 주기로만 발생.
//   2. 창 flush 시 심볼별 latest-wins 1 row + 마켓별 독립 배치(순차).
//   3. flush 후 버퍼 clear — 새 데이터 없으면 다음 창 upsert 0.
//   4. stop() = 타이머 정지 + 잔여 최종 flush (shutdown 유실 방지).
//   5. upsert 실패 → throw 없이 로그만 (graceful, 다음 창 회복).
//   6. 배치 내 row 는 enqueue 입력 그대로 (mixed-batch: 동일 key 집합 보존).
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IDataService } from "@travis/data-service";
import { MarkPriceWriteCoalescer } from "../markPriceWriteCoalescer.js";

const WINDOW_MS = 60_000;

function makeDataService() {
  // ★ dataService 규약 = Result 반환 + throw 금지 (retryOnTransient 전제).
  //   mock 도 같은 계약을 지켜야 실코드 경로가 재현된다.
  const upsertNowFuturesIndicatorPartial = vi.fn<
    (rows: unknown) => Promise<{ success: boolean; error?: string }>
  >(async () => ({ success: true }));
  const dataService = {
    upsertNowFuturesIndicatorPartial,
  } as unknown as IDataService;
  return { dataService, upsertNowFuturesIndicatorPartial };
}

/** markPrice partial row 픽스처 — normalizeMarkPrice 산출 6키 동형 */
function markRow(symbol: string, markPrice: number) {
  return {
    exchange: "binance" as const,
    market_type: "futures_usdm" as const,
    symbol,
    mark_price: markPrice,
    index_price: markPrice - 1,
    estimated_settle_price: null,
    predicted_funding_rate: 0.0001,
    next_funding_time: 1_700_028_800_000,
  };
}

describe("MarkPriceWriteCoalescer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("창 도래 전에는 upsert 0 — enqueue 는 버퍼링만", () => {
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.start();

    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(upsertNowFuturesIndicatorPartial).not.toHaveBeenCalled();
  });

  it("창 flush — 심볼별 latest-wins 1 row (같은 창 60번 도착해도 최신 1개)", async () => {
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.start();

    // 같은 심볼이 창 안에서 3번 도착 (실전은 ~60번) — 최신값만 남아야 함
    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61010)]);
    c.enqueue("futures_usdm", [
      markRow("BTCUSDT", 61020),
      markRow("ETHUSDT", 3400),
    ]);

    await vi.advanceTimersByTimeAsync(WINDOW_MS);

    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);
    const batch = upsertNowFuturesIndicatorPartial.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(batch).toHaveLength(2);
    const btc = batch.find((r) => r.symbol === "BTCUSDT");
    expect(btc?.mark_price).toBe(61020); // latest-wins
    // mixed-batch 불변 — enqueue 입력 row 가 변형 없이 그대로 (동일 key 집합)
    expect(Object.keys(btc ?? {}).sort()).toEqual(
      Object.keys(markRow("BTCUSDT", 0)).sort(),
    );
  });

  it("마켓별 독립 배치 — USDM/COINM 이 별도 upsert 호출 (순차)", async () => {
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.start();

    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    c.enqueue("futures_coinm", [
      { ...markRow("BTCUSD_PERP", 61000), market_type: "futures_coinm" },
    ]);

    await vi.advanceTimersByTimeAsync(WINDOW_MS);

    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(2);
    const markets = upsertNowFuturesIndicatorPartial.mock.calls.map(
      (call) => (call[0] as Array<Record<string, unknown>>)[0]?.market_type,
    );
    expect(markets).toEqual(["futures_usdm", "futures_coinm"]);
  });

  it("flush 후 버퍼 clear — 새 enqueue 없으면 다음 창 upsert 0", async () => {
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.start();

    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    await vi.advanceTimersByTimeAsync(WINDOW_MS);
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(WINDOW_MS); // 빈 창
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);
  });

  it("stop() — 타이머 정지 + 잔여 버퍼 최종 flush (shutdown 유실 방지)", async () => {
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.start();

    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    await c.stop(); // 창 도래 전 종료 — 최종 flush 가 반영해야 함
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);

    // 정지 후엔 타이머 flush 없음
    await vi.advanceTimersByTimeAsync(WINDOW_MS * 2);
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);
  });

  it("upsert 최종 실패(Result success:false) → throw 없이 로그만 (graceful, 다음 창 회복)", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    // Result 계약대로 실패 반환 — "boom" 은 비-transient 라 즉시 최종 실패 수렴.
    upsertNowFuturesIndicatorPartial.mockResolvedValue({
      success: false,
      error: "boom",
    });
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);

    await expect(c.stop()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it("규약 위반 throw(방어선) → 다른 마켓 flush 계속 + reject 없음", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    // 첫 마켓(usdm)에서 규약 위반 throw — 방어선이 삼키고 coinm 은 진행돼야 함.
    upsertNowFuturesIndicatorPartial
      .mockRejectedValueOnce(new Error("contract-violation"))
      .mockResolvedValue({ success: true });
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    c.enqueue("futures_coinm", [
      { ...markRow("BTCUSD_PERP", 61000), market_type: "futures_coinm" },
    ]);

    await expect(c.stop()).resolves.toBeUndefined();
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
  });

  it("W1 — 진행 중 flush × stop() 겹침: 진행분 완료 대기 후 잔여 재flush (유실 0)", async () => {
    const { dataService, upsertNowFuturesIndicatorPartial } = makeDataService();
    // 첫 upsert 를 수동 resolve promise 로 붙잡아 "진행 중 flush" 상태를 재현.
    let releaseFirst!: (v: { success: boolean }) => void;
    upsertNowFuturesIndicatorPartial
      .mockImplementationOnce(
        () =>
          new Promise<{ success: boolean }>((res) => {
            releaseFirst = res;
          }),
      )
      .mockResolvedValue({ success: true });
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.start();

    c.enqueue("futures_usdm", [markRow("BTCUSDT", 61000)]);
    await vi.advanceTimersByTimeAsync(WINDOW_MS); // 창 flush 발화 — upsert pending
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(1);

    // flush 진행 중에 shutdown 직전 잔여 rows 유입 (streamCoalescer 최종 flush 시나리오)
    c.enqueue("futures_usdm", [markRow("ETHUSDT", 3400)]);
    const stopping = c.stop(); // 겹침 가드에 삼켜지면 ETHUSDT 유실되는 경합 지점
    releaseFirst({ success: true }); // 진행 중 upsert 완료
    await stopping;

    // 잔여(ETHUSDT)가 최종 재flush 로 반영 — 유실 0 (W1 회귀 가드)
    expect(upsertNowFuturesIndicatorPartial).toHaveBeenCalledTimes(2);
    const secondBatch = upsertNowFuturesIndicatorPartial.mock
      .calls[1]?.[0] as Array<Record<string, unknown>>;
    expect(secondBatch.map((r) => r.symbol)).toEqual(["ETHUSDT"]);
  });

  it("getStatus — 마켓별 대기 row 수 노출 (관측용)", () => {
    const { dataService } = makeDataService();
    const c = new MarkPriceWriteCoalescer({ dataService });
    c.enqueue("futures_usdm", [
      markRow("BTCUSDT", 61000),
      markRow("ETHUSDT", 3400),
    ]);
    expect(c.getStatus()).toEqual({ futures_usdm: 2 });
  });
});

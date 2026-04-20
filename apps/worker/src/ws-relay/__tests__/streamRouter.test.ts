// ============================================================
// StreamRouter 단위 테스트 (M1.3 Step 5a).
//
// 검증 시나리오:
//   1. 매칭 핸들러 0개 → 조용히 무시
//   2. 매칭 핸들러 1개 → 정확히 1회 호출
//   3. 매칭 핸들러 N개 → 전부 병렬 호출
//   4. 한 핸들러가 throw 해도 다른 핸들러는 계속
//   5. 중복 ID 등록 시 경고 로그 + 2회 호출
// ============================================================

import { describe, expect, it, vi } from "vitest";
import { StreamRouter } from "../streamRouter.js";
import type { StreamHandler } from "../types.js";

function makeHandler(id: string, pattern: string): StreamHandler & { handle: ReturnType<typeof vi.fn> } {
  const handle = vi.fn().mockResolvedValue(undefined);
  return {
    id,
    canHandle: (streamName: string): boolean => streamName.includes(pattern),
    handle,
  };
}

describe("StreamRouter", () => {
  it("매칭 핸들러가 없으면 조용히 무시 (throw 금지)", async () => {
    const router = new StreamRouter();
    await expect(
      router.route("!unknown@stream", "spot", { foo: 1 }),
    ).resolves.toBeUndefined();
  });

  it("매칭 핸들러 1개 → 정확히 1회 호출", async () => {
    const router = new StreamRouter();
    const h = makeHandler("ticker", "miniTicker");
    router.register(h);

    await router.route("!miniTicker@arr", "spot", { e: "24hrMiniTicker" });

    expect(h.handle).toHaveBeenCalledTimes(1);
    expect(h.handle).toHaveBeenCalledWith("!miniTicker@arr", "spot", {
      e: "24hrMiniTicker",
    });
  });

  it("매칭 핸들러 2개 → 모두 호출 (kline 1m은 history + volume 양쪽 핸들러 대상)", async () => {
    const router = new StreamRouter();
    const kline = makeHandler("klineHistory", "kline_1m");
    const volume = makeHandler("volumeKline", "kline_1m");
    router.register(kline);
    router.register(volume);

    await router.route("btcusdt@kline_1m", "futures_usdm", {});

    expect(kline.handle).toHaveBeenCalledTimes(1);
    expect(volume.handle).toHaveBeenCalledTimes(1);
  });

  it("한 핸들러가 throw해도 다른 핸들러는 정상 호출 (graceful)", async () => {
    const router = new StreamRouter();
    const bad = makeHandler("bad", "miniTicker");
    bad.handle.mockRejectedValue(new Error("boom"));
    const good = makeHandler("good", "miniTicker");
    router.register(bad);
    router.register(good);

    // console.error 출력 무시 (테스트 노이즈 방지)
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await router.route("!miniTicker@arr", "spot", {});

    expect(bad.handle).toHaveBeenCalledTimes(1);
    expect(good.handle).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled(); // bad 에러 로그 확인
    errSpy.mockRestore();
  });

  it("canHandle 가 false 면 호출 안 함", async () => {
    const router = new StreamRouter();
    const h = makeHandler("ticker-only", "miniTicker");
    router.register(h);

    await router.route("btcusdt@kline_1m", "futures_usdm", {});

    expect(h.handle).not.toHaveBeenCalled();
  });

  it("중복 ID 등록 → console.warn + 2회 호출", async () => {
    const router = new StreamRouter();
    const h1 = makeHandler("dup", "miniTicker");
    const h2 = makeHandler("dup", "miniTicker");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    router.register(h1);
    router.register(h2);

    await router.route("!miniTicker@arr", "spot", {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(h1.handle).toHaveBeenCalledTimes(1);
    expect(h2.handle).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("listIds — 등록 순서대로 ID 목록 반환", () => {
    const router = new StreamRouter();
    router.register(makeHandler("a", "x"));
    router.register(makeHandler("b", "y"));
    router.register(makeHandler("c", "z"));

    expect(router.listIds()).toEqual(["a", "b", "c"]);
  });
});

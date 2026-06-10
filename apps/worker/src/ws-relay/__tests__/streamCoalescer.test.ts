// ============================================================
// StreamCoalescer 단위 테스트 (M2 테마 A Step 2.5, [10-11]).
//
// 핵심 검증: 코얼레서가 재조립한 배열이 기존 @arr 핸들러의 입력 계약과
// **동등**한가 — 이 계약이 깨지면 "기존 핸들러 무변경 재사용" 설계가 무너짐.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamCoalescer, type CoalescerRule } from "../streamCoalescer.js";
import type { StreamRouter } from "../streamRouter.js";

/** route 호출 기록용 fake router — 제네릭으로 mock.calls 타입 확보 */
function makeFakeRouter() {
  const route = vi.fn<
    (streamName: string, marketType: string, data: unknown) => Promise<void>
  >(async () => undefined);
  return { router: { route } as unknown as StreamRouter, route };
}

const RULES: readonly CoalescerRule[] = [
  { suffix: "@markPrice@1s", synthetic: "!markPrice@arr@1s", mode: "batch" },
  { suffix: "@ticker", synthetic: "!ticker@arr", mode: "batch" },
  { suffix: "@forceOrder", synthetic: "!forceOrder@arr", mode: "passthrough" },
];

describe("StreamCoalescer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("batch: flush 윈도우 동안 모아 synthetic 이름 + 배열로 1회 전달", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    const btc = { e: "markPriceUpdate", s: "BTCUSDT", p: "61000" };
    const eth = { e: "markPriceUpdate", s: "ETHUSDT", p: "3000" };
    c.ingest("btcusdt@markPrice@1s", "futures_usdm", btc);
    c.ingest("ethusdt@markPrice@1s", "futures_usdm", eth);

    expect(route).not.toHaveBeenCalled(); // flush 전엔 전달 안 함

    vi.advanceTimersByTime(1_000);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith("!markPrice@arr@1s", "futures_usdm", [
      btc,
      eth,
    ]);
    c.stop();
  });

  it("batch 원소는 원본 payload 객체 그대로 (shape 계약 — 참조 동일)", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    const original = { e: "24hrTicker", s: "BTCUSDT", c: "61000", P: "0.80" };
    c.ingest("btcusdt@ticker", "futures_usdm", original);
    vi.advanceTimersByTime(1_000);

    const firstCall = route.mock.calls[0];
    expect(firstCall).toBeDefined();
    const batch = firstCall?.[2] as unknown[];
    expect(batch[0]).toBe(original); // 변형 없이 원본 참조 그대로
    c.stop();
  });

  it("같은 flush 윈도우 내 같은 심볼 중복 → 최신 payload 가 이김", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    const older = { s: "BTCUSDT", p: "61000" };
    const newer = { s: "BTCUSDT", p: "61001" };
    c.ingest("btcusdt@markPrice@1s", "futures_usdm", older);
    c.ingest("btcusdt@markPrice@1s", "futures_usdm", newer);
    vi.advanceTimersByTime(1_000);

    expect(route).toHaveBeenCalledWith("!markPrice@arr@1s", "futures_usdm", [
      newer,
    ]);
    c.stop();
  });

  it("passthrough: forceOrder 는 모으지 않고 단건 즉시 전달", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    const liq = { e: "forceOrder", o: { s: "BTCUSDT", S: "SELL" } };
    c.ingest("btcusdt@forceOrder", "futures_usdm", liq);

    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith("!forceOrder@arr", "futures_usdm", liq);

    // flush 가 돌아도 추가 전달 없음 (버퍼에 안 들어갔으므로)
    vi.advanceTimersByTime(1_000);
    expect(route).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it("마켓이 다르면 같은 synthetic 라도 별도 배열로 분리 전달", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    const usdm = { s: "BTCUSDT", c: "61000" };
    const spot = { s: "BTCUSDT", c: "61005" };
    c.ingest("btcusdt@ticker", "futures_usdm", usdm);
    c.ingest("btcusdt@ticker", "spot", spot);
    vi.advanceTimersByTime(1_000);

    expect(route).toHaveBeenCalledTimes(2);
    expect(route).toHaveBeenCalledWith("!ticker@arr", "futures_usdm", [usdm]);
    expect(route).toHaveBeenCalledWith("!ticker@arr", "spot", [spot]);
    c.stop();
  });

  it("매칭 rule 없는 스트림 (kline 등) 은 조용히 무시", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    c.ingest("btcusdt@kline_1m", "spot", { s: "BTCUSDT" });
    vi.advanceTimersByTime(1_000);
    expect(route).not.toHaveBeenCalled();
    c.stop();
  });

  it("suffix 매칭 안전성: @miniTicker 는 @ticker rule 에 매칭되지 않음", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    c.ingest("btcusdt@miniTicker", "futures_usdm", { s: "BTCUSDT" });
    vi.advanceTimersByTime(1_000);
    expect(route).not.toHaveBeenCalled();
    c.stop();
  });

  it("symbol(s) 없는 batch payload 는 drop — throw 없이 경보 1회", () => {
    const { router, route } = makeFakeRouter();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    expect(() => {
      c.ingest("btcusdt@ticker", "spot", { c: "61000" }); // s 없음
      c.ingest("ethusdt@ticker", "spot", null); // null payload
      c.ingest("xrpusdt@ticker", "spot", "not-an-object");
    }).not.toThrow();
    vi.advanceTimersByTime(1_000);

    expect(route).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1); // 동일 rule 경보는 1회만
    warnSpy.mockRestore();
    c.stop();
  });

  it("stop(): 잔여 버퍼 최종 flush (shutdown 데이터 유실 방지)", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    const row = { s: "BTCUSDT", p: "61000" };
    c.ingest("btcusdt@markPrice@1s", "futures_usdm", row);
    c.stop(); // interval 도래 전 stop

    expect(route).toHaveBeenCalledWith("!markPrice@arr@1s", "futures_usdm", [
      row,
    ]);
    // stop 후 timer 잔존 없음 — 추가 flush 없어야 함
    vi.advanceTimersByTime(5_000);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it("flush 후 버퍼 비움 — 다음 윈도우는 새 메시지만 전달", () => {
    const { router, route } = makeFakeRouter();
    const c = new StreamCoalescer({ router, rules: RULES });
    c.start();

    c.ingest("btcusdt@markPrice@1s", "futures_usdm", { s: "BTCUSDT", p: "1" });
    vi.advanceTimersByTime(1_000);
    expect(route).toHaveBeenCalledTimes(1);

    // 빈 윈도우 → route 호출 없음
    vi.advanceTimersByTime(1_000);
    expect(route).toHaveBeenCalledTimes(1);

    const second = { s: "BTCUSDT", p: "2" };
    c.ingest("btcusdt@markPrice@1s", "futures_usdm", second);
    vi.advanceTimersByTime(1_000);
    expect(route).toHaveBeenCalledTimes(2);
    expect(route).toHaveBeenLastCalledWith(
      "!markPrice@arr@1s",
      "futures_usdm",
      [second],
    );
    c.stop();
  });
});

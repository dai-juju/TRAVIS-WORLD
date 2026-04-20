// ============================================================
// BinanceWsRelay 단위 테스트 (M1.3 Step 5a).
//
// 테스트 전략:
//   - ws 전체 mock은 과도 → 순수 로직 중심 테스트
//   - 검증 대상:
//     1. buildCombinedStreamUrl — URL 조립
//     2. backoffMs — exponential with cap
//     3. BINANCE_WS_BASE 상수 정확성
//   - 실제 WebSocket lifecycle(open/message/close/재연결)은 5b 이후
//     live smoke 스크립트(smokeStep5)에서 Binance 실 서버로 검증.
// ============================================================

import { describe, expect, it } from "vitest";
import { StreamRouter } from "../streamRouter.js";
import { BinanceWsRelay } from "../BinanceWsRelay.js";
import {
  BINANCE_WS_BASE,
  buildCombinedStreamUrl,
  type MarketType,
} from "../types.js";

describe("buildCombinedStreamUrl", () => {
  it("단일 스트림 URL 조립", () => {
    const url = buildCombinedStreamUrl("wss://stream.binance.com:9443", [
      "!miniTicker@arr",
    ]);
    expect(url).toBe("wss://stream.binance.com:9443/stream?streams=!miniTicker@arr");
  });

  it("복수 스트림 — `/` 구분자로 join", () => {
    const url = buildCombinedStreamUrl("wss://fstream.binance.com", [
      "!miniTicker@arr",
      "!markPrice@arr@1s",
      "!forceOrder@arr",
    ]);
    expect(url).toBe(
      "wss://fstream.binance.com/stream?streams=!miniTicker@arr/!markPrice@arr@1s/!forceOrder@arr",
    );
  });

  it("빈 배열 → 명시적 에러 (계약 위반)", () => {
    expect(() =>
      buildCombinedStreamUrl("wss://stream.binance.com:9443", []),
    ).toThrow(/비어있음/);
  });
});

describe("BINANCE_WS_BASE", () => {
  it("3개 마켓 모두 정의됨", () => {
    const markets: MarketType[] = ["spot", "futures_usdm", "futures_coinm"];
    for (const m of markets) {
      expect(BINANCE_WS_BASE[m]).toMatch(/^wss:\/\//);
    }
  });

  it("공식 endpoint 문자열 정확성", () => {
    expect(BINANCE_WS_BASE.spot).toBe("wss://stream.binance.com:9443");
    expect(BINANCE_WS_BASE.futures_usdm).toBe("wss://fstream.binance.com");
    expect(BINANCE_WS_BASE.futures_coinm).toBe("wss://dstream.binance.com");
  });
});

describe("BinanceWsRelay.backoffMs", () => {
  function makeRelay(
    overrides: Partial<{ base: number; max: number }> = {},
  ): BinanceWsRelay {
    return new BinanceWsRelay({
      router: new StreamRouter(),
      subscriptions: {
        spot: [],
        futures_usdm: [],
        futures_coinm: [],
      },
      reconnectBaseMs: overrides.base,
      reconnectMaxMs: overrides.max,
    });
  }

  it("attempt 1 → base (기본 1000ms)", () => {
    expect(makeRelay().backoffMs(1)).toBe(1000);
  });

  it("attempt 2~5 → 2x 누적", () => {
    const r = makeRelay();
    expect(r.backoffMs(2)).toBe(2000);
    expect(r.backoffMs(3)).toBe(4000);
    expect(r.backoffMs(4)).toBe(8000);
    expect(r.backoffMs(5)).toBe(16000);
  });

  it("attempt 6+ → max 로 cap (기본 30000ms)", () => {
    const r = makeRelay();
    expect(r.backoffMs(6)).toBe(30000);
    expect(r.backoffMs(10)).toBe(30000);
    expect(r.backoffMs(100)).toBe(30000);
  });

  it("attempt ≤ 0 → base 반환 (방어)", () => {
    expect(makeRelay().backoffMs(0)).toBe(1000);
    expect(makeRelay().backoffMs(-1)).toBe(1000);
  });

  it("custom base/max 반영", () => {
    const r = makeRelay({ base: 500, max: 5000 });
    expect(r.backoffMs(1)).toBe(500);
    expect(r.backoffMs(2)).toBe(1000);
    expect(r.backoffMs(3)).toBe(2000);
    expect(r.backoffMs(4)).toBe(4000);
    expect(r.backoffMs(5)).toBe(5000); // cap
    expect(r.backoffMs(10)).toBe(5000);
  });
});

describe("BinanceWsRelay.getStatus (초기 상태)", () => {
  it("start() 호출 전에는 전부 disconnected + 빈 상태", () => {
    const relay = new BinanceWsRelay({
      router: new StreamRouter(),
      subscriptions: {
        spot: ["!miniTicker@arr"],
        futures_usdm: ["!miniTicker@arr"],
        futures_coinm: ["!miniTicker@arr"],
      },
    });

    const s = relay.getStatus();
    for (const m of ["spot", "usdm", "coinm"] as const) {
      expect(s[m].state).toBe("disconnected");
      expect(s[m].connectedSince).toBeNull();
      expect(s[m].reconnectAttempts).toBe(0);
      expect(s[m].lastError).toBeNull();
      expect(s[m].lastMessageAt).toBeNull();
    }
  });

  it("getStatus는 내부 객체 복사본을 반환 (외부 변조 방지)", () => {
    const relay = new BinanceWsRelay({
      router: new StreamRouter(),
      subscriptions: {
        spot: ["!miniTicker@arr"],
        futures_usdm: [],
        futures_coinm: [],
      },
    });

    const s1 = relay.getStatus();
    s1.spot.reconnectAttempts = 999;
    const s2 = relay.getStatus();
    expect(s2.spot.reconnectAttempts).toBe(0);
  });
});

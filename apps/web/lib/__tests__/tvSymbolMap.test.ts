// tvSymbolMap 단위 테스트 (M1.5 Step 0).
//
// 목적: Binance 의 모든 마켓 타입(spot / futures_usdm / futures_usdm delivery /
//   USDC-M / futures_coinm perpetual / futures_coinm delivery) + 거래소 맵 에지
//   케이스에서 toTradingViewSymbol 이 TradingView 편집 규격(2026-04-22 조사)
//   에 맞게 동작하는지 회귀 보호.
//
// 조사 근거: docs/task-record/M1.5-step0-pre-infra.md + 상단 주석 URL 4개.

import { describe, it, expect } from "vitest";
import {
  toTradingViewSymbol,
  toTradingViewResolution,
} from "../tvSymbolMap";

describe("toTradingViewSymbol — 마켓 타입별 TV 심볼 매핑", () => {
  it("a) Spot BTCUSDT → BINANCE:BTCUSDT", () => {
    expect(toTradingViewSymbol("binance", "spot", "BTCUSDT")).toBe(
      "BINANCE:BTCUSDT",
    );
  });

  it("b) USDM perpetual BTCUSDT → BINANCE:BTCUSDT.P (§7-3 이월 수정)", () => {
    expect(toTradingViewSymbol("binance", "futures_usdm", "BTCUSDT")).toBe(
      "BINANCE:BTCUSDT.P",
    );
  });

  it("c) USDC-M perpetual BTCUSDC → BINANCE:BTCUSDC.P (2026-04-22 사용자 결정)", () => {
    expect(toTradingViewSymbol("binance", "futures_usdm", "BTCUSDC")).toBe(
      "BINANCE:BTCUSDC.P",
    );
  });

  it("d) USDM delivery(BTCUSDT_250627) → null (graceful)", () => {
    expect(
      toTradingViewSymbol("binance", "futures_usdm", "BTCUSDT_250627"),
    ).toBeNull();
  });

  it("e) COIN-M perpetual BTCUSD_PERP → BINANCE:BTCUSD.P (_PERP 제거 + .P)", () => {
    expect(toTradingViewSymbol("binance", "futures_coinm", "BTCUSD_PERP")).toBe(
      "BINANCE:BTCUSD.P",
    );
  });

  it("f) COIN-M delivery(BTCUSD_250627) → null (graceful)", () => {
    expect(
      toTradingViewSymbol("binance", "futures_coinm", "BTCUSD_250627"),
    ).toBeNull();
  });

  it("g) 거래소 undefined → null", () => {
    expect(toTradingViewSymbol(undefined, "spot", "BTCUSDT")).toBeNull();
  });

  it("h) 심볼 undefined → null", () => {
    expect(toTradingViewSymbol("binance", "spot", undefined)).toBeNull();
  });

  it("i) 미등록 거래소 → null", () => {
    expect(
      toTradingViewSymbol("unknown_exchange", "spot", "BTCUSDT"),
    ).toBeNull();
  });

  it("j) 거래소 대문자 입력도 맵 매칭 — BINANCE → BINANCE:BTCUSDT", () => {
    expect(toTradingViewSymbol("BINANCE", "spot", "BTCUSDT")).toBe(
      "BINANCE:BTCUSDT",
    );
  });

  it("k) 숫자 prefix 심볼(1000SHIBUSDT) 도 그대로 전달", () => {
    expect(toTradingViewSymbol("binance", "spot", "1000SHIBUSDT")).toBe(
      "BINANCE:1000SHIBUSDT",
    );
  });

  it("l) 다른 거래소 USDM 도 .P 컨벤션 공유 — BYBIT:BTCUSDT.P", () => {
    expect(toTradingViewSymbol("bybit", "futures_usdm", "BTCUSDT")).toBe(
      "BYBIT:BTCUSDT.P",
    );
  });
});

describe("toTradingViewResolution — interval → TV resolution", () => {
  it("m) 15m → '15' (분 단위는 숫자 문자열)", () => {
    expect(toTradingViewResolution("15m")).toBe("15");
  });

  it("n) 1d → 'D' (일봉은 대문자 D)", () => {
    expect(toTradingViewResolution("1d")).toBe("D");
  });

  it("o) undefined → '15' (기본값, 스캘퍼~스윙 중간)", () => {
    expect(toTradingViewResolution(undefined)).toBe("15");
  });
});

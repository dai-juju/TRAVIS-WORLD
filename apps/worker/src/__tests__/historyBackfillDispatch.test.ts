// ============================================================
// getMetricFetchers / coinmSymbolToPair 단위 테스트 (M1.9 Step 2-D, 2026-06-04).
//
// 검증: marketType → fetcher 세트 dispatch + COINM 심볼→pair 변환.
//   네트워크 의존 0 (fetcher 호출은 안 함, 세트 구성/변환만 검증).
//
// 단일 진실: docs/task-record/M1.9-step2-forward-fill.md §2-D
// ============================================================

import { describe, expect, it } from "vitest";
import {
  coinmSymbolToPair,
  getMetricFetchers,
} from "@travis/exchange-collectors";

describe("getMetricFetchers (marketType 별 fetcher 세트)", () => {
  const EXPECTED_NAMES = [
    "openInterest",
    "topLSAccount",
    "topLSPosition",
    "globalLS",
    "takerLS",
    "basis",
  ];

  it("USDM: 6 metric fetcher, 이름 일치", () => {
    const fetchers = getMetricFetchers("futures_usdm");
    expect(fetchers.map((f) => f.name)).toEqual(EXPECTED_NAMES);
  });

  it("COINM: 6 metric fetcher, 이름 동일(세트만 dapi 로 교체)", () => {
    const fetchers = getMetricFetchers("futures_coinm");
    expect(fetchers.map((f) => f.name)).toEqual(EXPECTED_NAMES);
  });

  it("USDM 과 COINM 은 서로 다른 fetcher 세트(함수 참조 상이)", () => {
    const usdm = getMetricFetchers("futures_usdm");
    const coinm = getMetricFetchers("futures_coinm");
    // 같은 name 이라도 내부 fetch 함수는 다른 endpoint(fapi vs dapi) — 참조가 달라야 함.
    for (let i = 0; i < usdm.length; i++) {
      expect(usdm[i]?.fetch).not.toBe(coinm[i]?.fetch);
    }
  });

  it("spot 등 비-COINM 은 USDM 세트로 폴백(COINM 만 dapi)", () => {
    expect(getMetricFetchers("spot").map((f) => f.name)).toEqual(EXPECTED_NAMES);
  });
});

describe("coinmSymbolToPair", () => {
  it("BTCUSD_PERP → BTCUSD", () => {
    expect(coinmSymbolToPair("BTCUSD_PERP")).toBe("BTCUSD");
  });

  it("ETHUSD_PERP → ETHUSD", () => {
    expect(coinmSymbolToPair("ETHUSD_PERP")).toBe("ETHUSD");
  });

  it("'_' 없는 심볼은 그대로 (방어)", () => {
    expect(coinmSymbolToPair("BTCUSD")).toBe("BTCUSD");
  });

  it("분기물 형식도 '_' 앞부분 (단 분기물은 loop symbolFilter 가 사전 제외)", () => {
    expect(coinmSymbolToPair("BNBUSD_260626")).toBe("BNBUSD");
  });
});

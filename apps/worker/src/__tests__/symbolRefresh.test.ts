// planSymbolRefresh 단위 테스트 (M3-step4 Step 3).
//
// 핀 3종:
//   1. 신규 상장 감지 — 스냅샷 대비 추가된 심볼만 (제거는 재시작 사유 아님).
//   2. 무변화 → addedSymbols 빈 배열 (자기 재시작 미발화 = 루프 방지의 판정 반쪽).
//   3. 빈 리스트 마켓 = 부분 실패 의심 → swap 생략 (fail-closed 전량 drop 방지).

import { describe, expect, it } from "vitest";

import { formatAddedSymbols, planSymbolRefresh } from "../symbolRefresh.js";
import type { MarketSymbolSets } from "../symbolRefresh.js";

const prev: MarketSymbolSets = {
  spot: new Set(["BTCUSDT", "ETHUSDT"]),
  futures_usdm: new Set(["BTCUSDT"]),
  futures_coinm: new Set(["BTCUSD_PERP"]),
};

describe("planSymbolRefresh", () => {
  it("무변화 스냅샷 → 추가 0 + 전 마켓 swap (재시작 미발화 판정)", () => {
    const plan = planSymbolRefresh(prev, {
      spot: ["BTCUSDT", "ETHUSDT"],
      futures_usdm: ["BTCUSDT"],
      futures_coinm: ["BTCUSD_PERP"],
    });
    expect(plan.addedSymbols).toEqual([]);
    expect(plan.skippedEmptyMarkets).toEqual([]);
    expect(plan.marketsToSwap).toEqual(["spot", "futures_usdm", "futures_coinm"]);
    expect(plan.selfRestartAdvised).toBe(false); // 추가 0 = 재시작 사유 없음
  });

  it("신규 상장 감지 — 추가된 심볼만 market:symbol 표기로 수집 + 재시작 권고", () => {
    const plan = planSymbolRefresh(prev, {
      spot: ["BTCUSDT", "ETHUSDT"],
      futures_usdm: ["BTCUSDT", "NEWLISTUSDT"], // 신규 상장
      futures_coinm: ["BTCUSD_PERP"],
    });
    expect(plan.addedSymbols).toEqual(["futures_usdm:NEWLISTUSDT"]);
    expect(plan.selfRestartAdvised).toBe(true);
  });

  it("상장폐지(제거)만 있으면 추가 0 — 재시작 사유 아님 (allowlist swap 으로 충분)", () => {
    const plan = planSymbolRefresh(prev, {
      spot: ["BTCUSDT"], // ETHUSDT 제거
      futures_usdm: ["BTCUSDT"],
      futures_coinm: ["BTCUSD_PERP"],
    });
    expect(plan.addedSymbols).toEqual([]);
    expect(plan.marketsToSwap).toContain("spot"); // 제거 반영 swap 은 정상 수행
  });

  it("빈 리스트 마켓(기존 비어있지 않음) → swap 생략 + skipped 보고 (부분 실패 위생)", () => {
    const plan = planSymbolRefresh(prev, {
      spot: ["BTCUSDT", "ETHUSDT"],
      futures_usdm: [], // loadAllSymbols 부분 실패 시그니처
      futures_coinm: ["BTCUSD_PERP"],
    });
    expect(plan.skippedEmptyMarkets).toEqual(["futures_usdm"]);
    expect(plan.marketsToSwap).toEqual(["spot", "futures_coinm"]);
    expect(plan.addedSymbols).toEqual([]); // 스킵 마켓은 추가 판정에서도 제외
  });

  it("기존도 빈 마켓이 fresh 도 비면 정상 swap (부트 실패 마켓의 회복 경로 유지)", () => {
    const emptyPrev: MarketSymbolSets = { ...prev, futures_coinm: new Set() };
    const plan = planSymbolRefresh(emptyPrev, {
      spot: ["BTCUSDT", "ETHUSDT"],
      futures_usdm: ["BTCUSDT"],
      futures_coinm: [],
    });
    expect(plan.skippedEmptyMarkets).toEqual([]);
    expect(plan.marketsToSwap).toContain("futures_coinm");
  });

  it("★ 부트 실패 마켓 회복 = 대량 추가 → 재시작 억제 (reviewer W1 — 1h 무한 루프 차단)", () => {
    //   부팅 스냅샷이 빈 마켓이 refresh 로 전량 재등장하면 "추가"가 수십 종 —
    //   진짜 상장(수 종)과 구분해 자기 재시작을 억제해야 부팅 실패가 지속되는 동안
    //   "실패 부팅 ↔ 회복 감지 재시작" 1h 루프가 생기지 않는다.
    const emptyPrev: MarketSymbolSets = { ...prev, futures_usdm: new Set() };
    const recovered = Array.from({ length: 25 }, (_, i) => `SYM${i}USDT`);
    const plan = planSymbolRefresh(emptyPrev, {
      spot: ["BTCUSDT", "ETHUSDT"],
      futures_usdm: recovered,
      futures_coinm: ["BTCUSD_PERP"],
    });
    expect(plan.addedSymbols).toHaveLength(25);
    expect(plan.selfRestartAdvised).toBe(false); // 상한(20) 초과 = 억제
    expect(plan.marketsToSwap).toContain("futures_usdm"); // swap 자체는 정상 수행
  });

  it("소량 회복(상한 이하)은 재시작 권고 유지 — 진짜 상장과 동일 취급", () => {
    const emptyPrev: MarketSymbolSets = { ...prev, futures_coinm: new Set() };
    const plan = planSymbolRefresh(emptyPrev, {
      spot: ["BTCUSDT", "ETHUSDT"],
      futures_usdm: ["BTCUSDT"],
      futures_coinm: ["BTCUSD_PERP", "ETHUSD_PERP"],
    });
    expect(plan.addedSymbols).toEqual([
      "futures_coinm:BTCUSD_PERP",
      "futures_coinm:ETHUSD_PERP",
    ]);
    expect(plan.selfRestartAdvised).toBe(true);
  });
});

describe("formatAddedSymbols", () => {
  it("5종 이하는 전체 나열, 초과분은 '외 N종' 요약", () => {
    expect(formatAddedSymbols(["a", "b"])).toBe("a, b");
    expect(formatAddedSymbols(["a", "b", "c", "d", "e", "f", "g"])).toBe(
      "a, b, c, d, e 외 2종",
    );
  });
});

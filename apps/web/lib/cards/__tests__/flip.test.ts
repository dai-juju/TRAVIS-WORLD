// computeFlipDeltas — FLIP 델타 계산 순수 함수 테스트 (M2 테마 A Step 4b, 2026-06-11).

import { describe, expect, it } from "vitest";
import { computeFlipDeltas } from "../flip";

describe("computeFlipDeltas", () => {
  it("위치가 바뀐 행만 prev - current 델타로 반환", () => {
    const prev = new Map([
      ["BTC", 0],
      ["ETH", 24],
      ["SOL", 48],
    ]);
    // ETH 가 1위로 올라온 시나리오
    const current = new Map([
      ["ETH", 0],
      ["BTC", 24],
      ["SOL", 48],
    ]);
    const deltas = computeFlipDeltas(prev, current);
    expect(deltas.get("ETH")).toBe(24); // 24 → 0 (위로 24px 이동, 시작점은 +24)
    expect(deltas.get("BTC")).toBe(-24); // 0 → 24 (아래로)
    expect(deltas.has("SOL")).toBe(false); // 불변 — 델타 0 제외
  });

  it("신규 진입 행(prev 없음)은 애니메이션 대상 아님", () => {
    const prev = new Map([["BTC", 0]]);
    const current = new Map([
      ["NEW", 0],
      ["BTC", 24],
    ]);
    const deltas = computeFlipDeltas(prev, current);
    expect(deltas.has("NEW")).toBe(false);
    expect(deltas.get("BTC")).toBe(-24);
  });

  it("이탈 행(current 없음)은 결과에 없음", () => {
    const prev = new Map([
      ["BTC", 0],
      ["GONE", 24],
    ]);
    const current = new Map([["BTC", 0]]);
    const deltas = computeFlipDeltas(prev, current);
    expect(deltas.size).toBe(0);
  });

  it("빈 맵 graceful", () => {
    expect(computeFlipDeltas(new Map(), new Map()).size).toBe(0);
  });
});

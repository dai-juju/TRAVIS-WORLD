// liquidationSemantics 단위 테스트 (M3-step3b Step 5, 2026-07-20 — [10-83]① 회수).
//
// 청산 도메인 시맨틱 단일 진실(side 라벨/방향색/농도 스케일)의 결정값 핀 —
// feed/table 두 form 이 공유하므로 여기 핀이 드리프트를 구조적으로 차단한다.

import { describe, expect, it } from "vitest";
import {
  LIQ_NOTIONAL_SATURATION_USD,
  liqNotionalIntensity,
  liqSideLabel,
  liqSideTone,
} from "../liquidationSemantics";

describe("liqSideLabel / liqSideTone — 도메인 매핑 (canonical §7.2)", () => {
  it("SELL=롱 청산(하락압력=down) / BUY=숏 청산(상승압력=up) / 미지=중립 graceful", () => {
    expect(liqSideLabel("SELL")).toBe("LONG LIQ");
    expect(liqSideTone("SELL")).toBe("down");
    expect(liqSideLabel("BUY")).toBe("SHORT LIQ");
    expect(liqSideTone("BUY")).toBe("up");
    expect(liqSideLabel("WEIRD")).toBe("LIQ");
    expect(liqSideTone(null)).toBe("neutral");
  });
});

describe("liqNotionalIntensity — 로그 스케일 ([10-83]① 사용자 결정 2026-07-20)", () => {
  it("자릿수별 농도 분리 — 알트 밴드가 더 이상 바닥에 뭉치지 않는다", () => {
    // 구 선형: $1K = 0.0002 (사실상 투명) → 로그: ~0.45 (가시).
    expect(liqNotionalIntensity(1_000)).toBeGreaterThan(0.4);
    expect(liqNotionalIntensity(1_000)).toBeLessThan(0.5);
    // 자릿수 단조 증가 — $100 < $1K < $10K < $100K < $1M.
    const ladder = [100, 1_000, 10_000, 100_000, 1_000_000].map(
      liqNotionalIntensity,
    );
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
    }
    // $1M 은 진하지만 아직 포화 아님 (~0.90) — 고래와 구분 여지.
    expect(liqNotionalIntensity(1_000_000)).toBeGreaterThan(0.85);
    expect(liqNotionalIntensity(1_000_000)).toBeLessThan(1);
  });

  it("포화 앵커 $5M 유지 — 이상은 풀 농도 clamp", () => {
    expect(liqNotionalIntensity(LIQ_NOTIONAL_SATURATION_USD)).toBeCloseTo(1, 5);
    expect(liqNotionalIntensity(50_000_000)).toBe(1);
  });

  it("null/비수치/0/음수 = 0 (form 바닥 불투명도 graceful)", () => {
    expect(liqNotionalIntensity(null)).toBe(0);
    expect(liqNotionalIntensity(undefined)).toBe(0);
    expect(liqNotionalIntensity("1000")).toBe(0);
    expect(liqNotionalIntensity(Number.NaN)).toBe(0);
    expect(liqNotionalIntensity(0)).toBe(0);
    expect(liqNotionalIntensity(-5)).toBe(0);
  });
});

// ============================================================
// preCompute 단위 테스트 (M1.3 Step 4 Substep 4a).
//
// 검증 시나리오:
//   1. pctChange 정상 계산 + 0 나누기 + 비유한 입력
//   2. preComputeTicker: 윈도우 풍부 시 모든 필드 계산
//   3. preComputeTicker: 윈도우 부족 시 해당 필드 null
//   4. preComputeTicker: volume_ratio 계산
//   5. preComputeIndicator: OI 변화율
//   6. graceful: 잘못된 입력(NaN price, 빈 symbol) 모두 null
// ============================================================

import { describe, expect, it } from "vitest";
import { RollingWindow } from "../RollingWindow.js";
import type { IndicatorSample, TickerSample } from "../preCompute.js";
import { pctChange, preComputeIndicator, preComputeTicker } from "../preCompute.js";

describe("pctChange", () => {
  it("정상 변화율 계산 (% 단위)", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(90, 100)).toBeCloseTo(-10);
    expect(pctChange(100, 100)).toBe(0);
  });

  it("prev가 0 또는 음수면 null (0 나누기 방지)", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(100, -1)).toBeNull();
  });

  it("NaN/Infinity 입력은 null", () => {
    expect(pctChange(NaN, 100)).toBeNull();
    expect(pctChange(100, NaN)).toBeNull();
    expect(pctChange(Infinity, 100)).toBeNull();
    expect(pctChange(100, Infinity)).toBeNull();
  });
});

describe("preComputeTicker", () => {
  // 윈도우에 1분 간격으로 N개 sample을 채우는 헬퍼.
  // 최신 sample이 current가 되기 전 시점까지의 과거.
  function seedWindow(count: number): RollingWindow<TickerSample> {
    const win = new RollingWindow<TickerSample>({ maxSize: 500, sampleIntervalMs: 60_000 });
    const baseTs = 0;
    for (let i = 0; i < count; i++) {
      // i=0이 가장 오래된, count-1이 가장 최신.
      // price는 i에 따라 선형 증가, volume은 고정.
      win.push("BTCUSDT", {
        ts: baseTs + i * 60_000,
        price: 100 + i, // 0→100, 1→101, ..., (count-1)→100+(count-1)
        volume: 1_000_000, // 일정
      });
    }
    return win;
  }

  // ─── 시나리오 2: 윈도우 풍부 (5h치 = 300 sample) ─────
  it("윈도우 300개 + 최신보다 1원 높은 current → 모든 변화율 계산", () => {
    const win = seedWindow(300); // 300 sample (past + current 역할 분리)
    const current: TickerSample = { ts: 300 * 60_000, price: 200, volume: 1_100_000 };
    win.push("BTCUSDT", current);

    const result = preComputeTicker("BTCUSDT", current, win);

    // price 5분 전: index 295번째 = 100+295 = 395. 근데 seedWindow price=100+i.
    // 300 sample seed 후 current push → size=301. current가 index=300.
    // 5 step 전(=5분 전): index=295 → price=100+295=395.
    // pctChange(200, 395) = (200-395)/395*100 ≈ -49.37
    expect(result.price_chg_5m).toBeCloseTo(((200 - 395) / 395) * 100);
    // 윈도우 충분하니 모든 필드 non-null
    expect(result.price_chg_5m).not.toBeNull();
    expect(result.price_chg_15m).not.toBeNull();
    expect(result.price_chg_1h).not.toBeNull();
    expect(result.price_chg_4h).not.toBeNull();

    // volume은 1_100_000 vs 과거 1_000_000 → 10% 증가
    expect(result.volume_chg_5m).toBeCloseTo(10);
    expect(result.volume_chg_15m).toBeCloseTo(10);
    expect(result.volume_chg_1h).toBeCloseTo(10);

    // volume_ratio: 최근 20개 중 19개가 1_000_000, 1개가 1_100_000 평균 ≈ 1_005_000
    // current(1_100_000) / avg ≈ 1.09
    expect(result.volume_ratio).not.toBeNull();
    expect(result.volume_ratio!).toBeGreaterThan(1);
  });

  // ─── 시나리오 3: 윈도우 부족 ─────────────────────────
  it("윈도우에 5분치만 있으면 1h/4h는 null", () => {
    const win = new RollingWindow<TickerSample>({ maxSize: 500, sampleIntervalMs: 60_000 });
    // 5분치 seed (5개)
    for (let i = 0; i < 5; i++) {
      win.push("BTCUSDT", { ts: i * 60_000, price: 100 + i, volume: 1_000_000 });
    }
    const current: TickerSample = { ts: 5 * 60_000, price: 110, volume: 1_050_000 };
    win.push("BTCUSDT", current);

    const result = preComputeTicker("BTCUSDT", current, win);

    // 5 step 전 sample 존재 → price_chg_5m 계산됨
    expect(result.price_chg_5m).not.toBeNull();
    // 15/1h/4h는 윈도우 부족 → null
    expect(result.price_chg_15m).toBeNull();
    expect(result.price_chg_1h).toBeNull();
    expect(result.price_chg_4h).toBeNull();
    expect(result.volume_chg_15m).toBeNull();
    expect(result.volume_chg_1h).toBeNull();
  });

  // ─── 시나리오 4: 완전 빈 윈도우 ──────────────────────
  it("완전 빈 윈도우면 모든 변화율 null (volume_ratio 포함)", () => {
    const win = new RollingWindow<TickerSample>({ maxSize: 500 });
    const current: TickerSample = { ts: 0, price: 100, volume: 1_000_000 };
    // current push 없이 호출
    const result = preComputeTicker("BTCUSDT", current, win);

    expect(result.price_chg_5m).toBeNull();
    expect(result.price_chg_15m).toBeNull();
    expect(result.price_chg_1h).toBeNull();
    expect(result.price_chg_4h).toBeNull();
    expect(result.volume_chg_5m).toBeNull();
    expect(result.volume_ratio).toBeNull();
  });

  // ─── 시나리오 5: graceful — 잘못된 입력 ──────────────
  it("NaN price 또는 빈 symbol은 모든 필드 null", () => {
    const win = new RollingWindow<TickerSample>({ maxSize: 500 });
    for (let i = 0; i < 10; i++) {
      win.push("BTCUSDT", { ts: i * 60_000, price: 100, volume: 1_000_000 });
    }

    const nanCurrent: TickerSample = { ts: 10 * 60_000, price: NaN, volume: 1_000_000 };
    const r1 = preComputeTicker("BTCUSDT", nanCurrent, win);
    expect(Object.values(r1).every((v) => v === null)).toBe(true);

    const emptySymbol = preComputeTicker(
      "",
      { ts: 0, price: 100, volume: 1000 },
      win,
    );
    expect(Object.values(emptySymbol).every((v) => v === null)).toBe(true);
  });
});

describe("preComputeIndicator", () => {
  it("OI 변화율 정상 계산", () => {
    const win = new RollingWindow<IndicatorSample>({ maxSize: 500, sampleIntervalMs: 60_000 });
    // 300분치 seed + current
    for (let i = 0; i < 300; i++) {
      win.push("BTCUSDT", { ts: i * 60_000, openInterest: 1000 + i });
    }
    const current: IndicatorSample = { ts: 300 * 60_000, openInterest: 1400 };
    win.push("BTCUSDT", current);

    const result = preComputeIndicator("BTCUSDT", current, win);

    // 5분 전 OI = 1000+295 = 1295, current=1400 → +8.11%
    expect(result.oi_chg_5m).toBeCloseTo(((1400 - 1295) / 1295) * 100);
    expect(result.oi_chg_15m).not.toBeNull();
    expect(result.oi_chg_1h).not.toBeNull();
    expect(result.oi_chg_4h).not.toBeNull();
  });

  it("윈도우 부족 시 해당 필드 null", () => {
    const win = new RollingWindow<IndicatorSample>({ maxSize: 500, sampleIntervalMs: 60_000 });
    for (let i = 0; i < 10; i++) {
      win.push("BTCUSDT", { ts: i * 60_000, openInterest: 1000 });
    }
    const current: IndicatorSample = { ts: 10 * 60_000, openInterest: 1100 };
    win.push("BTCUSDT", current);

    const result = preComputeIndicator("BTCUSDT", current, win);

    expect(result.oi_chg_5m).toBeCloseTo(10); // 1100 vs 1000
    expect(result.oi_chg_15m).toBeNull();
    expect(result.oi_chg_1h).toBeNull();
    expect(result.oi_chg_4h).toBeNull();
  });

  it("NaN openInterest 또는 빈 symbol은 모두 null", () => {
    const win = new RollingWindow<IndicatorSample>({ maxSize: 500 });
    const nanCurrent: IndicatorSample = { ts: 0, openInterest: NaN };
    const result = preComputeIndicator("BTCUSDT", nanCurrent, win);
    expect(Object.values(result).every((v) => v === null)).toBe(true);
  });
});

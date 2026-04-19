// ============================================================
// RollingWindow 단위 테스트 (M1.3 Step 4 Substep 4a).
//
// 검증 시나리오:
//   1. 정상 push → getAt으로 과거 값 조회
//   2. sampleIntervalMs 이내 push는 교체 (큐 크기 증가 안 함)
//   3. maxSize 초과 시 FIFO (오래된 것 제거)
//   4. symbol 간 분리 (한 symbol의 push가 다른 symbol에 영향 없음)
//   5. graceful: 잘못된 입력(빈 symbol, NaN ts, 음수 stepsAgo) 조용히 처리
// ============================================================

import { describe, expect, it } from "vitest";
import { RollingWindow } from "../RollingWindow.js";

interface TestSample {
  ts: number;
  value: number;
}

describe("RollingWindow", () => {
  // ─── 시나리오 1: 정상 push + getAt ───────────────────
  it("push 후 getAt으로 현재·과거 sample 조회", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 10, sampleIntervalMs: 1000 });
    // 1초 간격으로 5개 push (ts 0, 1000, 2000, 3000, 4000).
    for (let i = 0; i < 5; i++) {
      win.push("BTCUSDT", { ts: i * 1000, value: i * 100 });
    }

    // stepsAgo=0 → 최신 (value=400)
    expect(win.getAt("BTCUSDT", 0)?.value).toBe(400);
    // stepsAgo=2 → 2스텝 전 (value=200)
    expect(win.getAt("BTCUSDT", 2)?.value).toBe(200);
    // stepsAgo=4 → 가장 오래된 (value=0)
    expect(win.getAt("BTCUSDT", 4)?.value).toBe(0);
    // 윈도우 부족 → null
    expect(win.getAt("BTCUSDT", 5)).toBeNull();
    expect(win.getAt("BTCUSDT", 100)).toBeNull();

    expect(win.size("BTCUSDT")).toBe(5);
  });

  // ─── 시나리오 2: sampleIntervalMs 이내 push 교체 ───
  it("sampleIntervalMs 이내 push는 맨 뒤 sample을 교체", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 10, sampleIntervalMs: 60_000 });

    // ts=0에 push
    win.push("ETHUSDT", { ts: 0, value: 100 });
    // 30초 뒤 push — 교체되어야 함 (60초 간격 미만)
    win.push("ETHUSDT", { ts: 30_000, value: 200 });

    // 여전히 크기 1, 최신 value=200
    expect(win.size("ETHUSDT")).toBe(1);
    expect(win.getAt("ETHUSDT", 0)?.value).toBe(200);

    // 60초 뒤 push — 이번엔 추가되어야 함
    win.push("ETHUSDT", { ts: 60_000, value: 300 });
    expect(win.size("ETHUSDT")).toBe(2);
    expect(win.getAt("ETHUSDT", 0)?.value).toBe(300);
    expect(win.getAt("ETHUSDT", 1)?.value).toBe(200);
  });

  // ─── 시나리오 3: maxSize 초과 시 FIFO ───────────────
  it("maxSize 초과 시 가장 오래된 sample 제거", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 3, sampleIntervalMs: 1 });

    win.push("SOLUSDT", { ts: 0, value: 1 });
    win.push("SOLUSDT", { ts: 1, value: 2 });
    win.push("SOLUSDT", { ts: 2, value: 3 });
    win.push("SOLUSDT", { ts: 3, value: 4 });
    win.push("SOLUSDT", { ts: 4, value: 5 });

    expect(win.size("SOLUSDT")).toBe(3);
    // 1, 2는 밀려나고 3, 4, 5 남음
    expect(win.getAt("SOLUSDT", 0)?.value).toBe(5);
    expect(win.getAt("SOLUSDT", 1)?.value).toBe(4);
    expect(win.getAt("SOLUSDT", 2)?.value).toBe(3);
    expect(win.getAt("SOLUSDT", 3)).toBeNull();
  });

  // ─── 시나리오 4: symbol 분리 ────────────────────────
  it("한 symbol의 push가 다른 symbol에 영향을 주지 않음", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 10, sampleIntervalMs: 1 });

    win.push("BTCUSDT", { ts: 0, value: 10 });
    win.push("ETHUSDT", { ts: 0, value: 20 });
    win.push("BTCUSDT", { ts: 1, value: 11 });

    expect(win.getAt("BTCUSDT", 0)?.value).toBe(11);
    expect(win.getAt("BTCUSDT", 1)?.value).toBe(10);
    expect(win.getAt("ETHUSDT", 0)?.value).toBe(20);
    expect(win.getAt("ETHUSDT", 1)).toBeNull(); // ETH는 1개만 있음

    expect(win.symbolCount()).toBe(2);
  });

  // ─── 시나리오 5: graceful error handling ────────────
  it("잘못된 입력은 throw 없이 조용히 무시", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 10, sampleIntervalMs: 1 });

    // 빈 symbol
    win.push("", { ts: 0, value: 1 });
    expect(win.size("")).toBe(0);

    // NaN ts
    win.push("BTCUSDT", { ts: NaN, value: 100 });
    expect(win.size("BTCUSDT")).toBe(0);

    // Infinity ts
    win.push("BTCUSDT", { ts: Infinity, value: 100 });
    expect(win.size("BTCUSDT")).toBe(0);

    // 음수/NaN stepsAgo → null
    win.push("BTCUSDT", { ts: 1, value: 10 });
    expect(win.getAt("BTCUSDT", -1)).toBeNull();
    expect(win.getAt("BTCUSDT", NaN)).toBeNull();

    // 존재하지 않는 symbol
    expect(win.getAt("UNKNOWN", 0)).toBeNull();
    expect(win.size("UNKNOWN")).toBe(0);
    expect(win.getRecent("UNKNOWN", 5)).toEqual([]);
  });

  // ─── 보조 시나리오: getRecent, clear ─────────────────
  it("getRecent는 오래된 → 최신 순으로 n개 반환", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 10, sampleIntervalMs: 1 });
    for (let i = 0; i < 5; i++) {
      win.push("BTCUSDT", { ts: i, value: i * 10 });
    }

    const recent3 = win.getRecent("BTCUSDT", 3);
    expect(recent3.map((s) => s.value)).toEqual([20, 30, 40]);

    // n이 버퍼보다 크면 전체 반환
    const recentAll = win.getRecent("BTCUSDT", 100);
    expect(recentAll.length).toBe(5);

    // n <= 0 → 빈 배열
    expect(win.getRecent("BTCUSDT", 0)).toEqual([]);
    expect(win.getRecent("BTCUSDT", -1)).toEqual([]);
  });

  it("clear로 특정 심볼 또는 전체 초기화", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 10, sampleIntervalMs: 1 });
    win.push("BTCUSDT", { ts: 0, value: 1 });
    win.push("ETHUSDT", { ts: 0, value: 2 });

    win.clear("BTCUSDT");
    expect(win.size("BTCUSDT")).toBe(0);
    expect(win.size("ETHUSDT")).toBe(1);

    win.clear();
    expect(win.symbolCount()).toBe(0);
  });

  it("maxSize 0 이하 또는 NaN은 기본값(1500)으로 graceful 보정", () => {
    const win = new RollingWindow<TestSample>({ maxSize: 0, sampleIntervalMs: 1 });
    // 5개 push해도 모두 들어감 (maxSize=1500으로 보정됨, sampleIntervalMs=1이라 전부 commit)
    for (let i = 0; i < 5; i++) win.push("BTCUSDT", { ts: i, value: i });
    expect(win.size("BTCUSDT")).toBe(5);
  });
});

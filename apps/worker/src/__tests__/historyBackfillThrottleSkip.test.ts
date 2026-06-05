// ============================================================
// per-metric throttle ([8-31]ⓒ) + basis -4104 skip 학습 ([8-33]) 단위 테스트.
//   M1.9 Step 3 후속 (2026-06-05).
//
// 검증 2가지 (요청 #4):
//   (a) basis floor(2400ms)가 **basis-to-basis 간격**에만 적용되고, OI→basis 이종 metric
//       간격엔 공통 floor(60000/reqPerMin)만 적용됨 (PerMetricThrottle 결정론 산식, now 주입).
//   (b) 금속/지수 심볼의 basis metric 이 -4104 학습 후 fetch 대상에서 제외됨
//       (학습 캐시 + isUnsupportedContractTypeError 판별).
//
// 순수 단위 — 네트워크/시계 의존 0 (PerMetricThrottle.reserve 에 now 를 직접 주입).
//   ※ executeHistoryBackfill 통합 mock 은 packages 경계(상대 import)로 fetcher 모킹이 안 돼
//     산식/캐시 자체를 직접 검증 (더 결정론적이고 견고).
//
// 단일 진실: docs/task-record/M1.9-step3-rollout.md ([8-31]ⓒ / [8-33])
// ============================================================

import { beforeEach, describe, expect, it } from "vitest";
import {
  PerMetricThrottle,
  isUnsupportedContractTypeError,
  isUnsupportedMetric,
  markUnsupportedMetric,
  _resetUnsupportedMetricCacheForTest,
} from "@travis/exchange-collectors";

// USDM metric 순서 (historyBackfillCore.USDM_FETCHERS 와 동일).
const METRIC_ORDER = [
  "openInterest",
  "topLSAccount",
  "topLSPosition",
  "globalLS",
  "takerLS",
  "basis",
] as const;

// ⚠️ 산식 검증용 임의값 — production reqPerMin 과 무관(W2 IP예산 분배로 달라질 수 있음).
//   여기선 60000/50=1200 을 예시로 throttle 산식만 검증한다.
const COMMON_FLOOR = 1200; // 60000 / reqPerMin(예: 50)
const BASIS_FLOOR = 2400;

/** metric 별 floor — basis 만 2400, 나머지 0(공통 floor 만). */
function floorOf(name: string): number {
  return name === "basis" ? BASIS_FLOOR : 0;
}

describe("PerMetricThrottle ([8-31]ⓒ per-metric floor)", () => {
  it("OI→basis(이종) 간격은 공통 floor(1200)만, takerLS→basis 도 공통 floor", () => {
    const t = new PerMetricThrottle(COMMON_FLOOR);
    let clock = 0;
    const callAt: Record<string, number[]> = {};
    // 1 심볼의 6 metric 순차 호출 시뮬레이션.
    for (const name of METRIC_ORDER) {
      const wait = t.reserve(name, floorOf(name), clock);
      clock += wait; // 호출자가 sleep 한 만큼 시각 전진
      (callAt[name] ??= []).push(clock);
      // (실제 fetch 소요는 0 가정 — throttle 간격만 검증)
    }
    // takerLS(idx4) → basis(idx5): per-metric 이면 공통 floor 1200.
    //   (단일 lastRestCallAt 공유 버그였다면 basis floor 2400 이 직전 takerLS 에 걸려 2400 이었을 것.)
    const takerToBasis =
      (callAt["basis"]?.[0] ?? 0) - (callAt["takerLS"]?.[0] ?? 0);
    expect(takerToBasis).toBe(COMMON_FLOOR);
    // openInterest → topLSAccount 도 공통 floor.
    const oiToTop =
      (callAt["topLSAccount"]?.[0] ?? 0) - (callAt["openInterest"]?.[0] ?? 0);
    expect(oiToTop).toBe(COMMON_FLOOR);
  });

  it("basis-to-basis 간격엔 metric floor(2400)가 적용됨(공통보다 큰 경우)", () => {
    // basis 만 연속 호출하면(가상) 각 간격이 2400 이어야 한다 (공통 1200 < 2400 → metric floor 지배).
    const t = new PerMetricThrottle(COMMON_FLOOR);
    let clock = 0;
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const wait = t.reserve("basis", BASIS_FLOOR, clock);
      clock += wait;
      times.push(clock);
    }
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBe(BASIS_FLOOR);
    expect((times[2] ?? 0) - (times[1] ?? 0)).toBe(BASIS_FLOOR);
  });

  it("basis floor 가 직전 basis 와 충분히 벌어졌으면(2400 경과) 공통 floor 만 적용", () => {
    // 한 심볼 6 metric(공통 1200 × 5 = 6000ms 경과) 후 다음 심볼 basis 는
    //   직전 basis 와 6000ms 떨어져 metricWait 음수 → 공통 floor(1200)만.
    const t = new PerMetricThrottle(COMMON_FLOOR);
    let clock = 0;
    let firstBasisAt = 0;
    let secondBasisAt = 0;
    let lastBeforeSecondBasis = 0;
    // 심볼1: 6 metric
    for (const name of METRIC_ORDER) {
      clock += t.reserve(name, floorOf(name), clock);
      if (name === "basis") firstBasisAt = clock;
    }
    // 심볼2: 6 metric
    for (const name of METRIC_ORDER) {
      const prev = clock;
      clock += t.reserve(name, floorOf(name), clock);
      if (name === "basis") {
        secondBasisAt = clock;
        lastBeforeSecondBasis = prev;
      }
    }
    // 두 basis 간격 = 6 metric × 공통 floor(여러 호출 합) — 2400 보다 훨씬 큼.
    expect(secondBasisAt - firstBasisAt).toBeGreaterThan(BASIS_FLOOR);
    // 따라서 심볼2 basis 직전 호출(takerLS)→basis 간격은 공통 floor 1200 (metric floor 미지배).
    expect(secondBasisAt - lastBeforeSecondBasis).toBe(COMMON_FLOOR);
  });
});

describe("basis -4104 미지원 학습 캐시 ([8-33])", () => {
  beforeEach(() => {
    _resetUnsupportedMetricCacheForTest();
  });

  it("isUnsupportedContractTypeError: -4104 만 true (일시오류 -1003 등은 false)", () => {
    expect(
      isUnsupportedContractTypeError("Binance -4104: Invalid contract type."),
    ).toBe(true);
    // 일시 rate-limit/네트워크 오류는 학습 대상 아님(재시도해야 함).
    expect(isUnsupportedContractTypeError("Binance -1003: Too many requests")).toBe(false);
    expect(isUnsupportedContractTypeError("fetch failed")).toBe(false);
  });

  it("금속(XAUUSDT) basis 학습 후 isUnsupportedMetric=true, 다른 metric/심볼은 영향 없음", () => {
    // 학습 전: 전부 false.
    expect(isUnsupportedMetric("futures_usdm", "XAUUSDT", "basis")).toBe(false);
    // -4104 학습 (loop 가 호출하는 경로).
    markUnsupportedMetric("futures_usdm", "XAUUSDT", "basis");
    // 학습 후: 이 (marketType, symbol, metric) 만 true → 다음 cycle fetch skip.
    expect(isUnsupportedMetric("futures_usdm", "XAUUSDT", "basis")).toBe(true);
    // 같은 심볼의 다른 metric(OI 등)은 정상 — basis 만 제외(mixed-batch 영향 없음).
    expect(isUnsupportedMetric("futures_usdm", "XAUUSDT", "openInterest")).toBe(false);
    // 정상 crypto(BTCUSDT) basis 는 영향 없음.
    expect(isUnsupportedMetric("futures_usdm", "BTCUSDT", "basis")).toBe(false);
    // marketType 격리 — 같은 심볼명이라도 COINM 은 별개 키.
    expect(isUnsupportedMetric("futures_coinm", "XAUUSDT", "basis")).toBe(false);
  });
});

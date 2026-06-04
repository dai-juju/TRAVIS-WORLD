// ============================================================
// computeForwardFillStartMs 단위 테스트 (M1.9 Step 2-B, 2026-06-04).
//
// 검증 대상: @travis/exchange-collectors 의 forward-fill 증분 시작점 순수 함수.
//   historyFutures normalize 테스트와 동일 패턴 — 패키지 함수를 worker vitest 가 import
//   (collector-history 는 별도 test 인프라 없이 본 스위트로 커버).
//
// 시나리오:
//   - anchor 있음 → anchor - SAFETY_BARS*intervalMs (마지막 N봉 재수집)
//   - anchor null → now - defaultLookback (최초 가동 폴백)
//   - anchor 가 미래(시계 이상) → now clamp (빈 윈도우)
//
// 단일 진실: docs/task-record/M1.9-step2-forward-fill.md §2-B
// ============================================================

import { describe, expect, it } from "vitest";
import {
  computeForwardFillStartMs,
  FORWARD_FILL_SAFETY_BARS,
} from "@travis/exchange-collectors";

describe("computeForwardFillStartMs", () => {
  const FIVE_MIN = 5 * 60 * 1000;
  const NOW = 1_700_000_000_000; // 고정 nowMs (Date.now 비의존 — 결정적 테스트)
  const DEFAULT_LOOKBACK = 14 * 24 * 60 * 60 * 1000;

  it("anchor 있음: anchor - SAFETY_BARS*intervalMs (마지막 N봉 재수집, 멱등)", () => {
    const anchor = NOW - 10 * FIVE_MIN; // 충분히 과거
    expect(
      computeForwardFillStartMs(anchor, FIVE_MIN, NOW, DEFAULT_LOOKBACK),
    ).toBe(anchor - FORWARD_FILL_SAFETY_BARS * FIVE_MIN);
  });

  it("anchor null(최초 가동, 예: COINM): now - defaultLookback 폴백", () => {
    expect(
      computeForwardFillStartMs(null, FIVE_MIN, NOW, DEFAULT_LOOKBACK),
    ).toBe(NOW - DEFAULT_LOOKBACK);
  });

  it("anchor 가 now 보다 미래(시계 역행/이상): now 로 clamp → 빈 윈도우", () => {
    const future = NOW + 100 * FIVE_MIN;
    expect(
      computeForwardFillStartMs(future, FIVE_MIN, NOW, DEFAULT_LOOKBACK),
    ).toBe(NOW);
  });

  it("anchor 가 now 직전: 결과는 anchor 기준이며 now 이하", () => {
    const anchor = NOW - FIVE_MIN;
    const r = computeForwardFillStartMs(anchor, FIVE_MIN, NOW, DEFAULT_LOOKBACK);
    expect(r).toBe(anchor - FORWARD_FILL_SAFETY_BARS * FIVE_MIN);
    expect(r).toBeLessThanOrEqual(NOW);
  });

  it("interval 폭이 클수록 안전 lookback 도 비례(1d 기준)", () => {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const anchor = NOW - 3 * ONE_DAY;
    expect(
      computeForwardFillStartMs(anchor, ONE_DAY, NOW, DEFAULT_LOOKBACK),
    ).toBe(anchor - FORWARD_FILL_SAFETY_BARS * ONE_DAY);
  });
});

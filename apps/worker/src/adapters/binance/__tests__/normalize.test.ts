// ============================================================
// normalize 단위 테스트 (M1.8 §8.2a-2 Sub-substep E, 2026-05-26).
//
// 검증 시나리오:
//   1. normalizeUsdmBasis: 정상 응답 매핑
//   2. normalizeUsdmBasis: annualizedBasisRate "" → null 변환 (PERPETUAL Binance 의도적 비움)
//   3. normalizeUsdmBasis: pair → symbol 매핑 (basis 응답은 pair 필드만)
//   4. normalizeUsdmPremium: fundingIntervalHours=4 → last_settled_funding_time 역산 (PHAROSUSDT 류)
//   5. normalizeUsdmPremium: fundingIntervalHours=8 default → 역산
//
// 단일 진실 원천:
//   - docs/task-record/M1.8-step2a-2-fetchers.md §3 (Sub-substep A2 변경)
//   - .claude/agent-memory/crypto-domain-expert/CANONICAL_METRICS.md
// ============================================================

import { describe, expect, it } from "vitest";
import { normalizeUsdmBasis, normalizeUsdmPremium } from "../normalize.js";
import type {
  BinanceUsdmBasis,
  BinanceUsdmPremiumIndex,
} from "../types.js";

describe("normalizeUsdmBasis", () => {
  it("정상 응답 매핑: pair → symbol + basis/basisRate/annualizedBasisRate", () => {
    const raw: BinanceUsdmBasis = {
      indexPrice: "76796.48675000",
      contractType: "PERPETUAL",
      basisRate: "0.0002",
      futuresPrice: "76812.10",
      annualizedBasisRate: "1.752", // 정상값 (만기 선물 케이스 가정)
      basis: "15.61325",
      pair: "BTCUSDT",
      timestamp: 1779757200000,
    };
    const result = normalizeUsdmBasis(raw);

    expect(result.exchange).toBe("binance");
    expect(result.market_type).toBe("futures_usdm");
    expect(result.symbol).toBe("BTCUSDT"); // ★ pair → symbol 매핑
    expect(result.basis).toBeCloseTo(15.61325);
    expect(result.basis_rate).toBeCloseTo(0.0002);
    expect(result.annualized_basis_rate).toBeCloseTo(1.752);
  });

  it("annualizedBasisRate = '' (PERPETUAL 빈 문자열) → null 변환 (D16)", () => {
    // WebFetch spike 2026-05-26 확정: Binance PERPETUAL 환경에서 annualizedBasisRate=""
    const raw: BinanceUsdmBasis = {
      indexPrice: "76796.48675000",
      contractType: "PERPETUAL",
      basisRate: "-0.0006",
      futuresPrice: "76750.10",
      annualizedBasisRate: "", // ★ Binance 의도적 빈 문자열
      basis: "-46.38675",
      pair: "BTCUSDT",
      timestamp: 1779757200000,
    };
    const result = normalizeUsdmBasis(raw);

    expect(result.basis).toBeCloseTo(-46.38675);
    expect(result.basis_rate).toBeCloseTo(-0.0006);
    expect(result.annualized_basis_rate).toBeNull(); // ★ num() 헬퍼가 "" → NaN → null 자동 변환
  });

  it("basisRate 음수도 정상 처리 (futuresPrice < indexPrice = backwardation)", () => {
    const raw: BinanceUsdmBasis = {
      indexPrice: "100",
      contractType: "PERPETUAL",
      basisRate: "-0.001",
      futuresPrice: "99.9",
      annualizedBasisRate: "",
      basis: "-0.1",
      pair: "ETHUSDT",
      timestamp: 1779757200000,
    };
    const result = normalizeUsdmBasis(raw);

    expect(result.symbol).toBe("ETHUSDT");
    expect(result.basis_rate).toBeCloseTo(-0.001);
    expect(result.basis).toBeCloseTo(-0.1);
  });
});

describe("normalizeUsdmPremium — last_settled_funding_time 역산 (D15)", () => {
  // ★ M1.8 §8.0 WebFetch spike 2026-05-26 확정:
  //   premiumIndex 응답에 last_settled_funding_time 직접 필드 없음.
  //   `time` 필드 = 현재 서버 시각 (NOT 정산 시각).
  //   정공: nextFundingTime - fundingIntervalHours × 3600 × 1000 역산.

  const baseRaw: BinanceUsdmPremiumIndex = {
    symbol: "BTCUSDT",
    markPrice: "76629.98",
    indexPrice: "76657.34",
    estimatedSettlePrice: "76658.45",
    lastFundingRate: "0.00007537",
    interestRate: "0.00010000",
    nextFundingTime: 1779782400000, // UTC 2026-05-26 16:00:00.000
    time: 1779767610001, // 현재 서버 시각
  };

  it("fundingIntervalHours=8 (default) → last_settled_funding_time = nextFundingTime - 8h", () => {
    const result = normalizeUsdmPremium(baseRaw, 8);

    // 8h × 3600 × 1000 = 28_800_000 ms
    const expectedLastSettled = 1779782400000 - 28_800_000;
    expect(result.last_settled_funding_time).toBe(expectedLastSettled);
    expect(result.next_funding_time).toBe(1779782400000);
    expect(result.last_settled_funding_rate).toBeCloseTo(0.00007537);
    expect(result.interest_rate).toBeCloseTo(0.0001);
  });

  it("fundingIntervalHours=4 (PHAROSUSDT 류 4h 코인) → 역산 정확", () => {
    const result = normalizeUsdmPremium(baseRaw, 4);

    // 4h × 3600 × 1000 = 14_400_000 ms
    const expectedLastSettled = 1779782400000 - 14_400_000;
    expect(result.last_settled_funding_time).toBe(expectedLastSettled);
  });

  it("fundingIntervalHours 인자 생략 → default 8h 적용 (Binance 정책 정합)", () => {
    const result = normalizeUsdmPremium(baseRaw);

    const expectedLastSettled = 1779782400000 - 28_800_000;
    expect(result.last_settled_funding_time).toBe(expectedLastSettled);
  });

  it("nextFundingTime 누락 시 last_settled_funding_time null (graceful)", () => {
    const rawNoNext: BinanceUsdmPremiumIndex = {
      ...baseRaw,
      nextFundingTime: null as unknown as number, // type 우회 — 실제 응답에선 항상 존재하지만 graceful
    };
    const result = normalizeUsdmPremium(rawNoNext, 8);

    expect(result.last_settled_funding_time).toBeNull();
    expect(result.next_funding_time).toBeNull();
  });
});

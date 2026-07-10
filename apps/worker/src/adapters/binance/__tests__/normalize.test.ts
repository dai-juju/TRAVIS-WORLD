// ============================================================
// normalize 단위 테스트 (M1.8 §8.2a-2 Sub-substep E, 2026-05-26).
//
// 검증 시나리오:
//   1. normalizeUsdmBasis: 정상 응답 매핑
//   2. normalizeUsdmBasis: annualizedBasisRate "" → null 변환 (PERPETUAL Binance 의도적 비움)
//   3. normalizeUsdmBasis: pair → symbol 매핑 (basis 응답은 pair 필드만)
//   4. ★ N1 hotfix (2026-07-10): normalizeUsdmPremium 이 last_settled_funding_rate /
//      last_settled_funding_time 를 **채우지 않음** (predicted 스냅샷 오염 회피). 정산
//      확정값은 collector-history 소관. mark/index/interest_rate/next_funding_time 는 유지.
//
// 단일 진실 원천:
//   - docs/task-record/M1.8-step2a-2-fetchers.md §3 (Sub-substep A2 변경)
//   - docs/task-record/M2-cycle2-genericchart.md §4h (Step 6) + N1 hotfix
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

describe("normalizeUsdmPremium — N1 hotfix: last_settled_* 미채움 (2026-07-10)", () => {
  // ★ N1 배경: premiumIndex.lastFundingRate 는 realized(정산 확정값)가 아니라 predicted 와
  //   같은 소스의 스냅샷 — 정산 사이 계속 변동. 실측(2026-07-10 BTCUSDT 00:00 UTC):
  //   공식 realized(/fapi/v1/fundingRate) = 0.00009058 vs premiumIndex 스냅샷 = 0.00006198.
  //   → normalizeUsdmPremium 은 last_settled_funding_rate / last_settled_funding_time 를
  //   **아예 반환 객체에 포함하지 않는다** (partial upsert 라 컬럼 미포함 = 그 컬럼 미변경).
  //   정산 확정값은 collector-history 의 fundingHistoryTask 가 채움.

  const baseRaw: BinanceUsdmPremiumIndex = {
    symbol: "BTCUSDT",
    markPrice: "76629.98",
    indexPrice: "76657.34",
    estimatedSettlePrice: "76658.45",
    lastFundingRate: "0.00006198", // ★ predicted 궤적 스냅샷 — 이 값을 절대 저장하면 안 됨
    interestRate: "0.00010000",
    nextFundingTime: 1779782400000, // UTC 2026-05-26 16:00:00.000
    time: 1779767610001, // 현재 서버 시각
  };

  it("last_settled_funding_rate / last_settled_funding_time 키가 반환 객체에 없음", () => {
    const result = normalizeUsdmPremium(baseRaw);

    // partial upsert (defaultToNull:false) 는 객체에 없는 키를 SQL 컬럼 리스트에서 제외 →
    // collector 가 채운 확정값을 30분마다 되덮지 않음. 'in' 으로 키 부재를 핀.
    expect("last_settled_funding_rate" in result).toBe(false);
    expect("last_settled_funding_time" in result).toBe(false);
  });

  it("premiumIndex 정공 필드(mark/index/estimated/interest_rate/next_funding_time)는 유지", () => {
    const result = normalizeUsdmPremium(baseRaw);

    expect(result.exchange).toBe("binance");
    expect(result.market_type).toBe("futures_usdm");
    expect(result.symbol).toBe("BTCUSDT");
    expect(result.mark_price).toBeCloseTo(76629.98);
    expect(result.index_price).toBeCloseTo(76657.34);
    expect(result.estimated_settle_price).toBeCloseTo(76658.45);
    expect(result.interest_rate).toBeCloseTo(0.0001);
    expect(result.next_funding_time).toBe(1779782400000);
  });

  it("nextFundingTime 누락 시 next_funding_time null (graceful) — last_settled 는 여전히 미포함", () => {
    const rawNoNext: BinanceUsdmPremiumIndex = {
      ...baseRaw,
      nextFundingTime: null as unknown as number, // type 우회 — 실제 응답엔 항상 존재하나 graceful
    };
    const result = normalizeUsdmPremium(rawNoNext);

    expect(result.next_funding_time).toBeNull();
    expect("last_settled_funding_time" in result).toBe(false);
  });
});

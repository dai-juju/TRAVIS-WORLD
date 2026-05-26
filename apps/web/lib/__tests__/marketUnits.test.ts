/**
 * marketUnits 단위 테스트 — M1.8 §8.5-a (2026-05-26).
 *
 * 검증 시나리오:
 *   - formatPrice: tickSize 정확 적용 / adaptive fallback / null/NaN graceful
 *   - formatFundingRate: raw decimal → percent + interval 라벨 (D15 정합)
 *   - formatLSR: 소수 4자리
 *   - formatOI: USDM = base asset / COINM = contracts 분기
 *   - formatBasis / formatBasisRate: 부호 + 단위
 *   - formatCountdown: 시간/분/초 적응적 표시
 *
 * 단일 진실 원천: apps/web/lib/format/marketUnits.ts + docs/canonical-metrics.md (8.5-c).
 */

import { describe, expect, it, vi } from "vitest";
import {
  formatBasis,
  formatBasisRate,
  formatCountdown,
  formatFundingRate,
  formatLSR,
  formatOI,
  formatPct,
  formatPrice,
} from "../format/marketUnits";

describe("formatPrice", () => {
  it("tickSize=0.10 → 소수 1자리 (BTCUSDT)", () => {
    expect(formatPrice(45123.456, 0.1)).toBe("45,123.5");
  });

  it("tickSize=0.00001 → 소수 5자리 (DOGEUSDT)", () => {
    expect(formatPrice(0.07831, 0.00001)).toBe("0.07831");
  });

  it("tickSize 미주입 + 작은 값 → adaptive 6자리", () => {
    expect(formatPrice(0.00012)).toBe("0.000120");
  });

  it("tickSize 미주입 + 중간 값 → adaptive 4자리", () => {
    expect(formatPrice(45.6789)).toBe("45.6789");
  });

  it("tickSize 미주입 + 큰 값 → adaptive 2자리 + 천단위 콤마", () => {
    expect(formatPrice(45123.456)).toBe("45,123.46");
  });

  it("null / NaN / Infinity graceful (— 반환)", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
    expect(formatPrice(NaN)).toBe("—");
    expect(formatPrice(Infinity)).toBe("—");
  });

  it("음수 가격도 정상 (이론적 케이스)", () => {
    expect(formatPrice(-45.67)).toBe("-45.6700");
  });
});

describe("formatPct (이미 percent 단위)", () => {
  it("양수 +, 음수 - 부호 자동", () => {
    expect(formatPct(5.3)).toBe("+5.30%");
    expect(formatPct(-2.5)).toBe("-2.50%");
    expect(formatPct(0)).toBe("+0.00%");
  });

  it("소수점 자리 커스텀", () => {
    expect(formatPct(0.8, 4)).toBe("+0.8000%");
  });

  it("null graceful", () => {
    expect(formatPct(null)).toBe("—");
  });
});

describe("formatFundingRate (raw decimal → percent + interval, D15)", () => {
  it("raw decimal → percent 4자리 (×100)", () => {
    expect(formatFundingRate(0.0001, 8)).toBe("+0.0100% (8h)");
    expect(formatFundingRate(-0.00009475, 4)).toBe("-0.0095% (4h)");
  });

  it("interval 미주입 시 라벨 생략", () => {
    expect(formatFundingRate(0.0001)).toBe("+0.0100%");
  });

  it("0 도 + 부호", () => {
    expect(formatFundingRate(0, 8)).toBe("+0.0000% (8h)");
  });

  it("null graceful", () => {
    expect(formatFundingRate(null, 8)).toBe("—");
  });
});

describe("formatLSR (소수 4자리)", () => {
  it("BTCUSDT 실측 케이스", () => {
    expect(formatLSR(1.1322)).toBe("1.1322");
    expect(formatLSR(0.5266)).toBe("0.5266");
  });

  it("null graceful", () => {
    expect(formatLSR(null)).toBe("—");
  });
});

describe("formatOI (USDM=base asset / COINM=contracts)", () => {
  it("USDM + baseAsset → 'X.XX BTC' 형식", () => {
    expect(formatOI(123.45, "futures_usdm", "BTC")).toBe("123.45 BTC");
  });

  it("USDM + baseAsset 미주입 → 숫자만", () => {
    expect(formatOI(123.45, "futures_usdm")).toBe("123.45");
  });

  it("COINM → 'X,XXX contracts' 형식 (천단위 콤마)", () => {
    expect(formatOI(1234, "futures_coinm")).toBe("1,234 contracts");
  });

  it("null graceful", () => {
    expect(formatOI(null, "futures_usdm", "BTC")).toBe("—");
  });
});

describe("formatBasis (USD 절대값)", () => {
  it("BTCUSDT 실측 backwardation 케이스", () => {
    expect(formatBasis(-35.682)).toBe("-35.68 USDT");
  });

  it("contango (positive) + 다른 quote", () => {
    expect(formatBasis(15.61325, "USDC")).toBe("+15.61 USDC");
  });

  it("null graceful", () => {
    expect(formatBasis(null)).toBe("—");
  });
});

describe("formatBasisRate (raw decimal → percent 4자리)", () => {
  it("BTCUSDT 실측 케이스 (×100)", () => {
    expect(formatBasisRate(-0.0006)).toBe("-0.0600%");
    expect(formatBasisRate(0.0002)).toBe("+0.0200%");
  });

  it("null graceful", () => {
    expect(formatBasisRate(null)).toBe("—");
  });
});

describe("formatCountdown (next funding time 카운트다운)", () => {
  it("2시간+ 남음 → 'Xh Ym' 형식", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T08:00:00Z"));
    // 다음 정산이 2시간 14분 후
    const nextFundingTime = Date.now() + 2 * 3600 * 1000 + 14 * 60 * 1000;
    expect(formatCountdown(nextFundingTime)).toBe("2h 14m");
    vi.useRealTimers();
  });

  it("1시간 미만 → 'Ym Zs' 형식", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T08:00:00Z"));
    const nextFundingTime = Date.now() + 2 * 60 * 1000 + 30 * 1000;
    expect(formatCountdown(nextFundingTime)).toBe("2m 30s");
    vi.useRealTimers();
  });

  it("이미 정산 시점 또는 지남 → 'now'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T08:00:00Z"));
    expect(formatCountdown(Date.now() - 5000)).toBe("now");
    expect(formatCountdown(Date.now())).toBe("now");
    vi.useRealTimers();
  });

  it("null graceful", () => {
    expect(formatCountdown(null)).toBe("—");
  });
});

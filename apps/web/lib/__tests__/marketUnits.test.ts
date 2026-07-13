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
  formatAmount,
  formatBasis,
  formatBasisRate,
  formatCountdown,
  formatEventTime,
  formatFundingRate,
  formatLSR,
  formatOI,
  formatPct,
  formatPrice,
  formatUsdCompact,
} from "../format/marketUnits";

describe("formatEventTime — 절대 시각 = UTC 통일 ([10-99], 2026-07-13)", () => {
  // ★ 종전(로컬 표기)엔 머신 TZ 의존이라 핀 테스트 자체가 불가능했음 — UTC 고정의 부수 이득.
  it("ISO Z → UTC HH:MM:SS (머신 TZ 무관 결정적)", () => {
    expect(formatEventTime("2026-07-05T12:34:56Z")).toBe("12:34:56");
  });

  it("오프셋 표기(+09:00)도 UTC 로 환산", () => {
    expect(formatEventTime("2026-07-05T21:34:56+09:00")).toBe("12:34:56");
  });

  it("epoch ms(number) 수용", () => {
    expect(formatEventTime(Date.UTC(2026, 6, 10, 8, 0, 5))).toBe("08:00:05");
  });

  it("invalid graceful (— 반환)", () => {
    expect(formatEventTime("not-a-date")).toBe("—");
    expect(formatEventTime(null)).toBe("—");
  });
});

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
  // 정밀도 5자리 (2026-06-10 사용자 실측: Binance 사이트 -0.00403% — 4자리는 -0.0040% 로 불일치)
  it("raw decimal → percent 5자리 (×100)", () => {
    expect(formatFundingRate(0.0001, 8)).toBe("+0.01000% (8h)");
    expect(formatFundingRate(-0.0000403, 4)).toBe("-0.00403% (4h)");
  });

  it("1h 주기도 라벨 부착 (Binance 가변 주기 대응)", () => {
    expect(formatFundingRate(0.0001, 1)).toBe("+0.01000% (1h)");
  });

  it("interval 미주입 시 라벨 생략", () => {
    expect(formatFundingRate(0.0001)).toBe("+0.01000%");
  });

  it("0 도 + 부호", () => {
    expect(formatFundingRate(0, 8)).toBe("+0.00000% (8h)");
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

describe("formatAmount (라벨 없는 거래량/수량)", () => {
  it("작은 값 → 소수 2자리 (taker buy vol)", () => {
    expect(formatAmount(119.087)).toBe("119.09");
    expect(formatAmount(68.5)).toBe("68.50");
  });

  it("큰 값 → 소수 생략 + 천단위 콤마", () => {
    expect(formatAmount(1234567)).toBe("1,234,567");
  });

  it("null/NaN graceful", () => {
    expect(formatAmount(null)).toBe("—");
    expect(formatAmount(Number.NaN)).toBe("—");
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

// ff#2 재개 Step 3 (2026-07-05) — 청산 notional 등 compact USD 표기 ([10-72] 표시 헬퍼).
describe("formatUsdCompact", () => {
  it("B/M/K 축약 + 1000 미만은 2자리", () => {
    expect(formatUsdCompact(2_100_000_000)).toBe("$2.10B");
    expect(formatUsdCompact(1_234_567)).toBe("$1.23M");
    expect(formatUsdCompact(45_600)).toBe("$45.6K");
    expect(formatUsdCompact(987.65)).toBe("$987.65");
  });

  it("음수 부호 보존 (이론상 방어 — notional 은 항상 양수)", () => {
    expect(formatUsdCompact(-1_500_000)).toBe("-$1.50M");
  });

  it("null/undefined/NaN graceful", () => {
    expect(formatUsdCompact(null)).toBe("—");
    expect(formatUsdCompact(undefined)).toBe("—");
    expect(formatUsdCompact(Number.NaN)).toBe("—");
  });
});

// ============================================================
// normalize/historyFutures.ts 단위 테스트 (M1.8.5 Step 3, 2026-05-31).
//
// 검증 시나리오 (crypto-domain-expert 자문 §5 sanity guard 정합):
//   OI    : happy / sumOpenInterest ≤ 0 → null / timestamp ≤ 0 → row 폐기
//   LSR   : top-accounts happy / out-of-range(>10) warn / top-positions 컬럼 분리 / global 컬럼
//   taker : happy + symbol 주입
//   basis : happy(pair→symbol) / annualizedBasisRate "" → null / 가격 이상 폐기 / basis_rate >5% warn
//
// 단일 진실 원천:
//   docs/task-record/M1.8.5-step3-fetchers.md
//   .claude/agent-memory/crypto-domain-expert/project_m1_8_5_step3_history_consult.md
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeUsdmBasisHist,
  normalizeUsdmGlobalLongShortHist,
  normalizeUsdmOpenInterestHist,
  normalizeUsdmTakerLongShortHist,
  normalizeUsdmTopLongShortAccountHist,
  normalizeUsdmTopLongShortPositionHist,
} from "../normalize/historyFutures.js";
import type {
  BinanceUsdmBasis,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterestHist,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "../types.js";

// 2026-04-26T09:00:00.000Z 근처 — 검증용 고정 epoch ms.
const TS = 1777971600000;
const TS_ISO = new Date(TS).toISOString();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeUsdmOpenInterestHist", () => {
  it("happy: sumOpenInterest → open_interest + recorded_at ISO + interval 주입", () => {
    const raw: BinanceUsdmOpenInterestHist = {
      symbol: "BTCUSDT",
      sumOpenInterest: "82900.123",
      sumOpenInterestValue: "6371000000.0",
      timestamp: TS,
    };
    const result = normalizeUsdmOpenInterestHist(raw, "1h");
    expect(result).not.toBeNull();
    expect(result?.exchange).toBe("binance");
    expect(result?.market_type).toBe("futures_usdm");
    expect(result?.symbol).toBe("BTCUSDT");
    expect(result?.interval).toBe("1h");
    expect(result?.recorded_at).toBe(TS_ISO);
    expect(result?.open_interest).toBeCloseTo(82900.123);
  });

  it("sanity: sumOpenInterest ≤ 0 → open_interest null (값 폐기, row 는 유지)", () => {
    const raw: BinanceUsdmOpenInterestHist = {
      symbol: "BTCUSDT",
      sumOpenInterest: "0",
      sumOpenInterestValue: "0",
      timestamp: TS,
    };
    const result = normalizeUsdmOpenInterestHist(raw, "5m");
    expect(result).not.toBeNull();
    expect(result?.open_interest).toBeNull();
  });

  it("폐기: timestamp ≤ 0 → recorded_at 유도 불가 → row 전체 null", () => {
    const raw: BinanceUsdmOpenInterestHist = {
      symbol: "BTCUSDT",
      sumOpenInterest: "100",
      sumOpenInterestValue: "1000",
      timestamp: 0,
    };
    expect(normalizeUsdmOpenInterestHist(raw, "5m")).toBeNull();
  });
});

describe("normalizeUsdmTopLongShortAccountHist", () => {
  it("happy: longShortRatio → top_ls_ratio_accounts", () => {
    const raw: BinanceUsdmTopLongShortAccount = {
      symbol: "BTCUSDT",
      longShortRatio: "1.8521",
      longAccount: "0.6494",
      shortAccount: "0.3506",
      timestamp: TS,
    };
    const result = normalizeUsdmTopLongShortAccountHist(raw, "4h");
    expect(result?.top_ls_ratio_accounts).toBeCloseTo(1.8521);
    expect(result?.interval).toBe("4h");
    // history 테이블은 분해 컬럼 미보유 — ratio 만 매핑
    expect(result).not.toHaveProperty("top_long_account");
  });

  it("sanity warn: longShortRatio > 10 (정상 범위 밖) → console.warn, 값은 저장", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw: BinanceUsdmTopLongShortAccount = {
      symbol: "MEMEUSDT",
      longShortRatio: "42.5",
      longAccount: "0.977",
      shortAccount: "0.023",
      timestamp: TS,
    };
    const result = normalizeUsdmTopLongShortAccountHist(raw, "5m");
    expect(result?.top_ls_ratio_accounts).toBeCloseTo(42.5); // 저장은 유지
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("normalizeUsdmTopLongShortPositionHist", () => {
  it("happy: longShortRatio → top_ls_ratio_positions (accounts 와 컬럼 분리)", () => {
    const raw: BinanceUsdmTopLongShortPosition = {
      symbol: "ETHUSDT",
      longShortRatio: "2.1033",
      longAccount: "0.6778",
      shortAccount: "0.3222",
      timestamp: TS,
    };
    const result = normalizeUsdmTopLongShortPositionHist(raw, "1d");
    expect(result?.top_ls_ratio_positions).toBeCloseTo(2.1033);
    expect(result?.top_ls_ratio_accounts).toBeUndefined(); // 분리 확인
  });
});

describe("normalizeUsdmGlobalLongShortHist", () => {
  it("happy: longShortRatio → global_ls_ratio", () => {
    const raw: BinanceUsdmGlobalLongShortAccount = {
      symbol: "BTCUSDT",
      longShortRatio: "1.1322",
      longAccount: "0.5310",
      shortAccount: "0.4690",
      timestamp: TS,
    };
    const result = normalizeUsdmGlobalLongShortHist(raw, "2h");
    expect(result?.global_ls_ratio).toBeCloseTo(1.1322);
    expect(result?.interval).toBe("2h");
  });
});

describe("normalizeUsdmTakerLongShortHist", () => {
  it("happy: buy/sell vol + ratio + symbol 주입 (응답에 symbol 없음)", () => {
    const raw: BinanceUsdmTakerLongShort = {
      buySellRatio: "1.0521",
      buyVol: "12345.6",
      sellVol: "11734.2",
      timestamp: TS,
    };
    const result = normalizeUsdmTakerLongShortHist(raw, "SOLUSDT", "15m");
    expect(result?.symbol).toBe("SOLUSDT"); // ★ 주입
    expect(result?.taker_buy_sell_ratio).toBeCloseTo(1.0521);
    expect(result?.taker_buy_vol).toBeCloseTo(12345.6);
    expect(result?.taker_sell_vol).toBeCloseTo(11734.2);
    expect(result?.interval).toBe("15m");
  });
});

describe("normalizeUsdmBasisHist", () => {
  it("happy: pair → symbol + basis 3종 매핑", () => {
    const raw: BinanceUsdmBasis = {
      indexPrice: "76796.48675",
      contractType: "PERPETUAL",
      basisRate: "0.0002",
      futuresPrice: "76812.10",
      annualizedBasisRate: "",
      basis: "15.61325",
      pair: "BTCUSDT",
      timestamp: TS,
    };
    const result = normalizeUsdmBasisHist(raw, "1h");
    expect(result?.symbol).toBe("BTCUSDT"); // ★ pair → symbol
    expect(result?.basis).toBeCloseTo(15.61325);
    expect(result?.basis_rate).toBeCloseTo(0.0002);
  });

  it("annualizedBasisRate '' (PERPETUAL) → null", () => {
    const raw: BinanceUsdmBasis = {
      indexPrice: "76796.48675",
      contractType: "PERPETUAL",
      basisRate: "-0.0006",
      futuresPrice: "76750.10",
      annualizedBasisRate: "",
      basis: "-46.38675",
      pair: "BTCUSDT",
      timestamp: TS,
    };
    const result = normalizeUsdmBasisHist(raw, "1h");
    expect(result?.annualized_basis_rate).toBeNull();
  });

  it("폐기: futuresPrice ≤ 0 (가격 이상) → row null + warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw: BinanceUsdmBasis = {
      indexPrice: "76796.48",
      contractType: "PERPETUAL",
      basisRate: "0.0002",
      futuresPrice: "0",
      annualizedBasisRate: "",
      basis: "0",
      pair: "BTCUSDT",
      timestamp: TS,
    };
    expect(normalizeUsdmBasisHist(raw, "1h")).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("sanity warn: basis_rate |raw| > 5% → console.warn, 값은 저장", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw: BinanceUsdmBasis = {
      indexPrice: "100",
      contractType: "PERPETUAL",
      basisRate: "0.08", // 8% — 정상 PERPETUAL 범위 밖
      futuresPrice: "108",
      annualizedBasisRate: "",
      basis: "8",
      pair: "BTCUSDT",
      timestamp: TS,
    };
    const result = normalizeUsdmBasisHist(raw, "1h");
    expect(result?.basis_rate).toBeCloseTo(0.08); // 저장 유지
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("파싱 경계 (code-reviewer W4 보강)", () => {
  it("num: 빈 문자열 → null (OI sumOpenInterest '')", () => {
    const raw: BinanceUsdmOpenInterestHist = {
      symbol: "BTCUSDT",
      sumOpenInterest: "",
      sumOpenInterestValue: "",
      timestamp: TS,
    };
    const result = normalizeUsdmOpenInterestHist(raw, "1h");
    expect(result).not.toBeNull();
    expect(result?.open_interest).toBeNull();
  });

  it("epochMsToIso: timestamp 누락(undefined) → recorded_at 유도 불가 → row 폐기", () => {
    const raw = {
      symbol: "BTCUSDT",
      longShortRatio: "1.5",
      longAccount: "0.6",
      shortAccount: "0.4",
      timestamp: undefined as unknown as number,
    };
    expect(normalizeUsdmTopLongShortAccountHist(raw, "1h")).toBeNull();
  });
});

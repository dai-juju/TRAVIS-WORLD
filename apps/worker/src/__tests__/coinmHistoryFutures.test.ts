// ============================================================
// normalize/coinmHistoryFutures.ts 단위 테스트 (M1.9 Step 2-C, 2026-06-04).
//
// historyFutures.test.ts(USDM) 미러 — 단, COINM ★상이 지점을 명시 검증:
//   OI    : sumOpenInterest(=contract 수) → open_interest / symbol ← pair+"_PERP" / ≤0 → null / ts 폐기
//   LSR   : top-accounts(pair→_PERP symbol) / out-of-range warn / top-positions(longPosition 필드) / global
//   taker : ★ ratio 직접 계산 (buySellRatio 없음) / sellVol=0 → ratio null / symbol ← pair+"_PERP"
//   basis : pair → _PERP symbol / annualizedBasisRate "" → null / 가격 이상 폐기 / >5% warn
//
// ★ symbol 규약 = pair+"_PERP" (= BTCUSD_PERP) — symbols/now_futures_* 와 일치(위생 #9, 2026-06-04 실측).
// market_type 은 전부 "futures_coinm" 하드코딩 — mixed-batch 자연 분리 검증.
//
// 단일 진실 원천:
//   docs/task-record/M1.9-step2c-coinm.md
//   .claude/agent-memory/crypto-domain-expert/project_m1_9_step2c_coinm_history.md
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCoinmBasisHist,
  normalizeCoinmGlobalLongShortHist,
  normalizeCoinmOpenInterestHist,
  normalizeCoinmTakerHist,
  normalizeCoinmTopLongShortAccountHist,
  normalizeCoinmTopLongShortPositionHist,
} from "@travis/exchange-collectors";
import type {
  BinanceCoinmBasis,
  BinanceCoinmGlobalLongShortAccount,
  BinanceCoinmOpenInterestHist,
  BinanceCoinmTakerBuySellVol,
  BinanceCoinmTopLongShortAccount,
  BinanceCoinmTopLongShortPosition,
} from "@travis/exchange-collectors";

// 2026-04-26T09:00:00.000Z 근처 — 검증용 고정 epoch ms.
const TS = 1777971600000;
const TS_ISO = new Date(TS).toISOString();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeCoinmOpenInterestHist", () => {
  it("happy: sumOpenInterest(=contract 수) → open_interest + symbol ← pair + market_type coinm", () => {
    const raw: BinanceCoinmOpenInterestHist = {
      pair: "BTCUSD", // ★ 실응답엔 pair 만 (symbol 없음) — normalize 가 pair+"_PERP" 재구성
      contractType: "PERPETUAL",
      sumOpenInterest: "1250000", // ★ contract 수
      sumOpenInterestValue: "1562.5", // base asset(BTC)
      timestamp: TS,
    };
    const result = normalizeCoinmOpenInterestHist(raw, "1h");
    expect(result).not.toBeNull();
    expect(result?.exchange).toBe("binance");
    expect(result?.market_type).toBe("futures_coinm");
    expect(result?.symbol).toBe("BTCUSD_PERP"); // ★ pair → _PERP (symbols/now 와 일치, 위생 #9)
    expect(result?.interval).toBe("1h");
    expect(result?.recorded_at).toBe(TS_ISO);
    expect(result?.open_interest).toBeCloseTo(1250000);
  });

  it("sanity: sumOpenInterest ≤ 0 → open_interest null (row 유지)", () => {
    const raw: BinanceCoinmOpenInterestHist = {
      pair: "BTCUSD",
      contractType: "PERPETUAL",
      sumOpenInterest: "0",
      sumOpenInterestValue: "0",
      timestamp: TS,
    };
    const result = normalizeCoinmOpenInterestHist(raw, "5m");
    expect(result).not.toBeNull();
    expect(result?.open_interest).toBeNull();
  });

  it("폐기: timestamp ≤ 0 → row 전체 null", () => {
    const raw: BinanceCoinmOpenInterestHist = {
      pair: "BTCUSD",
      contractType: "PERPETUAL",
      sumOpenInterest: "100",
      sumOpenInterestValue: "1",
      timestamp: 0,
    };
    expect(normalizeCoinmOpenInterestHist(raw, "5m")).toBeNull();
  });
});

describe("normalizeCoinmTopLongShortAccountHist", () => {
  it("happy: longShortRatio → top_ls_ratio_accounts + symbol ← pair", () => {
    const raw: BinanceCoinmTopLongShortAccount = {
      pair: "BTCUSD", // ★ request·response 모두 pair (6개 동일, 라이브 실측)
      longShortRatio: "1.8521",
      longAccount: "0.6494",
      shortAccount: "0.3506",
      timestamp: TS,
    };
    const result = normalizeCoinmTopLongShortAccountHist(raw, "4h");
    expect(result?.symbol).toBe("BTCUSD_PERP");
    expect(result?.market_type).toBe("futures_coinm");
    expect(result?.top_ls_ratio_accounts).toBeCloseTo(1.8521);
    expect(result?.interval).toBe("4h");
    expect(result).not.toHaveProperty("top_long_account");
  });

  it("sanity warn: longShortRatio > 10 → console.warn, 값은 저장", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw: BinanceCoinmTopLongShortAccount = {
      pair: "MEMEUSD",
      longShortRatio: "42.5",
      longAccount: "0.977",
      shortAccount: "0.023",
      timestamp: TS,
    };
    const result = normalizeCoinmTopLongShortAccountHist(raw, "5m");
    expect(result?.top_ls_ratio_accounts).toBeCloseTo(42.5);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("normalizeCoinmTopLongShortPositionHist", () => {
  it("happy: longShortRatio → top_ls_ratio_positions (★ longPosition/shortPosition 필드)", () => {
    const raw: BinanceCoinmTopLongShortPosition = {
      pair: "ETHUSD",
      longShortRatio: "2.1033",
      longPosition: "0.6778", // ★ USDM 의 longAccount 가 아니라 longPosition
      shortPosition: "0.3222",
      timestamp: TS,
    };
    const result = normalizeCoinmTopLongShortPositionHist(raw, "1d");
    expect(result?.symbol).toBe("ETHUSD_PERP");
    expect(result?.top_ls_ratio_positions).toBeCloseTo(2.1033);
    expect(result?.top_ls_ratio_accounts).toBeUndefined(); // 컬럼 분리
  });
});

describe("normalizeCoinmGlobalLongShortHist", () => {
  it("happy: longShortRatio → global_ls_ratio + symbol ← pair", () => {
    const raw: BinanceCoinmGlobalLongShortAccount = {
      pair: "BTCUSD",
      longShortRatio: "1.1322",
      longAccount: "0.5310",
      shortAccount: "0.4690",
      timestamp: TS,
    };
    const result = normalizeCoinmGlobalLongShortHist(raw, "2h");
    expect(result?.global_ls_ratio).toBeCloseTo(1.1322);
    expect(result?.symbol).toBe("BTCUSD_PERP");
    expect(result?.interval).toBe("2h");
  });
});

describe("normalizeCoinmTakerHist (★ ratio 직접 계산)", () => {
  it("happy: takerBuyVol/takerSellVol → ratio 직접 계산 + symbol ← pair", () => {
    const raw: BinanceCoinmTakerBuySellVol = {
      pair: "SOLUSD",
      contractType: "PERPETUAL",
      takerBuyVol: "12000", // contract 수
      takerSellVol: "10000",
      takerBuyVolValue: "150.5",
      takerSellVolValue: "125.4",
      timestamp: TS,
    };
    const result = normalizeCoinmTakerHist(raw, "15m");
    expect(result?.symbol).toBe("SOLUSD_PERP"); // ★ 응답 pair → _PERP (USDM 은 주입이었음)
    expect(result?.taker_buy_vol).toBeCloseTo(12000);
    expect(result?.taker_sell_vol).toBeCloseTo(10000);
    expect(result?.taker_buy_sell_ratio).toBeCloseTo(1.2); // ★ 12000/10000 직접 계산
    expect(result?.interval).toBe("15m");
  });

  it("0 나눗셈 guard: takerSellVol = 0 → ratio null (vol 값은 유지)", () => {
    const raw: BinanceCoinmTakerBuySellVol = {
      pair: "XRPUSD",
      contractType: "PERPETUAL",
      takerBuyVol: "500",
      takerSellVol: "0", // ★ 0 나눗셈
      takerBuyVolValue: "10",
      takerSellVolValue: "0",
      timestamp: TS,
    };
    const result = normalizeCoinmTakerHist(raw, "1h");
    expect(result?.taker_buy_sell_ratio).toBeNull();
    expect(result?.taker_buy_vol).toBeCloseTo(500);
    expect(result?.taker_sell_vol).toBeCloseTo(0);
  });

  it("빈 문자열 sellVol → ratio null", () => {
    const raw: BinanceCoinmTakerBuySellVol = {
      pair: "DOGEUSD",
      contractType: "PERPETUAL",
      takerBuyVol: "500",
      takerSellVol: "",
      takerBuyVolValue: "10",
      takerSellVolValue: "",
      timestamp: TS,
    };
    const result = normalizeCoinmTakerHist(raw, "1h");
    expect(result?.taker_buy_sell_ratio).toBeNull();
    expect(result?.taker_sell_vol).toBeNull();
  });

  it("폐기: timestamp ≤ 0 → row null", () => {
    const raw: BinanceCoinmTakerBuySellVol = {
      pair: "SOLUSD",
      contractType: "PERPETUAL",
      takerBuyVol: "1",
      takerSellVol: "1",
      takerBuyVolValue: "1",
      takerSellVolValue: "1",
      timestamp: 0,
    };
    expect(normalizeCoinmTakerHist(raw, "1h")).toBeNull();
  });
});

describe("normalizeCoinmBasisHist", () => {
  it("happy: pair → symbol + basis 3종 매핑 + market_type coinm", () => {
    const raw: BinanceCoinmBasis = {
      indexPrice: "76796.48675",
      contractType: "PERPETUAL",
      basisRate: "0.0002",
      futuresPrice: "76812.10",
      annualizedBasisRate: "",
      basis: "15.61325",
      pair: "BTCUSD",
      timestamp: TS,
    };
    const result = normalizeCoinmBasisHist(raw, "1h");
    expect(result?.symbol).toBe("BTCUSD_PERP"); // ★ pair → _PERP symbol
    expect(result?.market_type).toBe("futures_coinm");
    expect(result?.basis).toBeCloseTo(15.61325);
    expect(result?.basis_rate).toBeCloseTo(0.0002);
  });

  it("annualizedBasisRate '' → null", () => {
    const raw: BinanceCoinmBasis = {
      indexPrice: "76796.48675",
      contractType: "PERPETUAL",
      basisRate: "-0.0006",
      futuresPrice: "76750.10",
      annualizedBasisRate: "",
      basis: "-46.38675",
      pair: "BTCUSD",
      timestamp: TS,
    };
    const result = normalizeCoinmBasisHist(raw, "1h");
    expect(result?.annualized_basis_rate).toBeNull();
  });

  it("폐기: futuresPrice ≤ 0 (가격 이상) → row null + warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw: BinanceCoinmBasis = {
      indexPrice: "76796.48",
      contractType: "PERPETUAL",
      basisRate: "0.0002",
      futuresPrice: "0",
      annualizedBasisRate: "",
      basis: "0",
      pair: "BTCUSD",
      timestamp: TS,
    };
    expect(normalizeCoinmBasisHist(raw, "1h")).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("sanity warn: basis_rate |raw| > 5% → console.warn, 값은 저장", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw: BinanceCoinmBasis = {
      indexPrice: "100",
      contractType: "PERPETUAL",
      basisRate: "0.08",
      futuresPrice: "108",
      annualizedBasisRate: "",
      basis: "8",
      pair: "BTCUSD",
      timestamp: TS,
    };
    const result = normalizeCoinmBasisHist(raw, "1h");
    expect(result?.basis_rate).toBeCloseTo(0.08);
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

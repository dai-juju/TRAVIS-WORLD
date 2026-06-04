// ============================================================
// Binance COINM (/futures/data/*, dapi) raw 응답 → HistoryFuturesIndicatorInsert
// 변환 (M1.9 Step 2-C, 2026-06-04).
//
// USDM(historyFutures.ts) 의 단순 미러링이 아니다 — crypto-domain-expert 자문
// (2026-06-04, project_m1_9_step2c_coinm_history.md) 의 분기 5가지를 정확히 반영:
//
//   1. market_type = "futures_coinm" 하드코딩 (mixed-batch 자연 분리 보장).
//   2. OI 단위 반전: COINM sumOpenInterest = **contract 수** → open_interest 매핑
//      (USDM 은 base asset 수량). DB 같은 컬럼·단위만 market_type 로 구분.
//   3. Taker: COINM 응답에 buySellRatio 없음 → takerBuyVol/takerSellVol 직접 계산
//      (0 나눗셈 guard, sellVol ≤ 0 → ratio null). now-adapter normalizeCoinmTaker 패턴 동일.
//   4. Top Position 응답 필드 = longPosition/shortPosition (USDM 과 다름) — raw 타입은
//      분리하나 DB 는 ratio 만 저장이라 normalize 출력은 USDM 과 동형.
//   5. 응답 식별자는 대부분 pair(BTCUSD) — OI 만 symbol(BTCUSD_PERP)+pair 둘 다.
//      ★ DB symbol 규약 = pair + "_PERP" (= 전체 PERPETUAL 심볼, 예: BTCUSD_PERP).
//      근거(위생 #9 site=DB): symbols / now_futures_ticker / now_futures_indicator 가
//      COINM 을 전부 "BTCUSD_PERP" 로 저장(2026-06-04 DB 실측). history 가 bare pair("BTCUSD")
//      면 카드/AI 가 'BTCUSD_PERP' 로 조회 시 history 0행 = 테이블 간 키 불일치. → _PERP 재구성.
//      2-C scope = PERPETUAL 전용이라 _PERP 접미 항상 정확.
//
// recorded_at 폐기 규약 + sanity guard 는 USDM 과 100% 동일 (자문 §5). 공통 helper 공유.
//
// 자문 영구 기록:
//   .claude/agent-memory/crypto-domain-expert/project_m1_9_step2c_coinm_history.md
//   docs/canonical-metrics.md §2.2 (COINM OI = contract count)
// ============================================================

import type {
  BinanceCoinmBasis,
  BinanceCoinmGlobalLongShortAccount,
  BinanceCoinmOpenInterestHist,
  BinanceCoinmTakerBuySellVol,
  BinanceCoinmTopLongShortAccount,
  BinanceCoinmTopLongShortPosition,
  BinanceHistoryPeriod,
} from "../types";
import {
  type HistoryRow,
  epochMsToIso,
  num,
  warnIfRatioOutOfRange,
} from "./_historyHelpers";

/**
 * COINM history symbol 규약 — pair(BTCUSD) → 전체 PERPETUAL 심볼(BTCUSD_PERP).
 * symbols / now_futures_* 가 전부 _PERP 형식(2026-06-04 실측)이라 history 도 동일해야
 * site=DB 일치(위생 #9). 2-C scope = PERP 전용 → _PERP 접미 항상 정확.
 * (분기물 history 는 deferred — _PERP 가정이 깨지는 유일 경우.)
 */
function coinmPerpSymbol(pair: string): string {
  return `${pair}_PERP`;
}

/**
 * openInterestHist (COINM) → open_interest 컬럼만.
 * ★ sumOpenInterest = **contract 수** 매핑 (USDM 의 base asset 수량과 의미 반전).
 *   sumOpenInterestValue(base asset) 는 현재 schema 미저장.
 * ★ symbol ← raw.pair (BTCUSD) — LSR/basis/taker 와 자연키 일관 유지 (raw.symbol 은 BTCUSD_PERP).
 * sanity: sumOpenInterest ≤ 0 → null (정상 거래 심볼은 OI > 0).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Open-Interest-Statistics (2026-06-04 조회)
 */
export function normalizeCoinmOpenInterestHist(
  raw: BinanceCoinmOpenInterestHist,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  // ★ contract 수. USDM 과 같은 open_interest 컬럼에 들어가나 단위가 다름 — market_type 로 구분.
  const oiRaw = num(raw.sumOpenInterest);
  const openInterest = oiRaw !== null && oiRaw <= 0 ? null : oiRaw;
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: coinmPerpSymbol(raw.pair), // ★ pair → _PERP (OI 응답의 raw.symbol 도 _PERP 이나 6 metric 일관 위해 pair 경유)
    interval,
    recorded_at: recordedAt,
    open_interest: openInterest,
  };
}

/**
 * topLongShortAccountRatio (COINM) → top_ls_ratio_accounts.
 * ★ pair 키(6개 동일, 라이브 실측). response pair 필드 → symbol ← pair+"_PERP".
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio-Accounts (2026-06-04 조회)
 */
export function normalizeCoinmTopLongShortAccountHist(
  raw: BinanceCoinmTopLongShortAccount,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const ratio = num(raw.longShortRatio);
  warnIfRatioOutOfRange("normalizeCoinmTopLongShortAccountHist", raw.pair, ratio);
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: coinmPerpSymbol(raw.pair),
    interval,
    recorded_at: recordedAt,
    top_ls_ratio_accounts: ratio,
  };
}

/**
 * topLongShortPositionRatio (COINM) → top_ls_ratio_positions.
 * ★ raw 필드 = longPosition/shortPosition (USDM 의 longAccount/shortAccount 와 다름) —
 *   DB 는 ratio 만 저장이라 출력은 USDM 과 동형. raw 타입만 분리.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Top-Trader-Long-Short-Ratio-Positions (2026-06-04 조회)
 */
export function normalizeCoinmTopLongShortPositionHist(
  raw: BinanceCoinmTopLongShortPosition,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const ratio = num(raw.longShortRatio);
  warnIfRatioOutOfRange("normalizeCoinmTopLongShortPositionHist", raw.pair, ratio);
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: coinmPerpSymbol(raw.pair),
    interval,
    recorded_at: recordedAt,
    top_ls_ratio_positions: ratio,
  };
}

/**
 * globalLongShortAccountRatio (COINM) → global_ls_ratio.
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Long-Short-Ratio (2026-06-04 조회)
 */
export function normalizeCoinmGlobalLongShortHist(
  raw: BinanceCoinmGlobalLongShortAccount,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const ratio = num(raw.longShortRatio);
  warnIfRatioOutOfRange("normalizeCoinmGlobalLongShortHist", raw.pair, ratio);
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: coinmPerpSymbol(raw.pair),
    interval,
    recorded_at: recordedAt,
    global_ls_ratio: ratio,
  };
}

/**
 * takerBuySellVol (COINM) → taker 3종.
 * ★ endpoint·필드 USDM 과 완전 상이. buySellRatio 없음 →
 *   taker_buy_sell_ratio = takerBuyVol/takerSellVol 직접 계산 (0 나눗셈 guard, sellVol ≤ 0 → null).
 * ★ takerBuyVol/takerSellVol = contract 수. takerBuyVolValue/takerSellVolValue(명목가) 는 미저장.
 * ★ 응답에 pair 필드 있음 → symbol ← raw.pair (USDM 은 symbol 주입이었으나 COINM 은 응답에 존재).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Taker-Buy-Sell-Volume (2026-06-04 조회)
 */
export function normalizeCoinmTakerHist(
  raw: BinanceCoinmTakerBuySellVol,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const buy = num(raw.takerBuyVol);
  const sell = num(raw.takerSellVol);
  // ★ COINM 은 ratio 미제공 — 직접 계산. sell ≤ 0 (또는 null) 이면 0 나눗셈 회피 위해 null.
  const ratio = buy !== null && sell !== null && sell > 0 ? buy / sell : null;
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: coinmPerpSymbol(raw.pair),
    interval,
    recorded_at: recordedAt,
    taker_buy_sell_ratio: ratio,
    taker_buy_vol: buy,
    taker_sell_vol: sell,
  };
}

/**
 * basis (COINM) → basis 3종.
 * 필드 구성은 USDM 동일 (자문 §5 동일 sanity).
 * ★ symbol ← raw.pair. annualizedBasisRate "" → null.
 * sanity:
 *   - futuresPrice/indexPrice ≤ 0 → row 폐기 (가격 깨진 응답).
 *   - basis_rate |raw| > 0.05 (±5%) → console.warn (값은 저장).
 * docs: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Basis (2026-06-04 조회)
 */
export function normalizeCoinmBasisHist(
  raw: BinanceCoinmBasis,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const futuresPrice = num(raw.futuresPrice);
  const indexPrice = num(raw.indexPrice);
  // 가격 sanity — 둘 중 하나라도 ≤ 0 이면 깨진 응답 → row 폐기.
  if (
    futuresPrice === null ||
    indexPrice === null ||
    futuresPrice <= 0 ||
    indexPrice <= 0
  ) {
    console.warn(
      `[normalizeCoinmBasisHist] ${raw.pair} futuresPrice=${raw.futuresPrice} indexPrice=${raw.indexPrice} — 가격 이상, row 폐기`,
    );
    return null;
  }
  const basisRate = num(raw.basisRate);
  if (basisRate !== null && Math.abs(basisRate) > 0.05) {
    console.warn(
      `[normalizeCoinmBasisHist] ${raw.pair} basisRate=${basisRate} > 5% — 의심 (정상 PERPETUAL 범위 외)`,
    );
  }
  return {
    exchange: "binance",
    market_type: "futures_coinm",
    symbol: coinmPerpSymbol(raw.pair), // ★ basis 응답 pair → _PERP
    interval,
    recorded_at: recordedAt,
    basis: num(raw.basis),
    basis_rate: basisRate,
    annualized_basis_rate: num(raw.annualizedBasisRate), // "" → null
  };
}

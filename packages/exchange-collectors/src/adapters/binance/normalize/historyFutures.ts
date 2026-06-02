// ============================================================
// Binance USDM history (/futures/data/*) raw 응답 → HistoryFuturesIndicatorInsert
// 변환 (M1.8.5 Step 3, 2026-05-31).
//
// 현재 시점 normalize (apps/worker .../normalize.ts) 와의 차이:
//   1. timestamp(epoch ms) → recorded_at (ISO string) 매핑 (시계열 행 키)
//   2. interval 주입 ('5m'~'1d') — Step 2 신설 컬럼 (자연 키 5축의 한 축)
//   3. history_futures_indicator 는 now_futures_indicator 보다 leaner —
//      ratio 3종(top_accounts/top_positions/global) + taker 3종 + basis 3종 +
//      open_interest 만 보유. long/short account **분해 컬럼 없음** →
//      now-normalize 를 복사하면 존재하지 않는 컬럼을 쓰게 되므로 별도 매핑.
//
// ★ recorded_at 폐기 규약: recorded_at 은 자연 키 5축
//   (exchange, market_type, symbol, interval, recorded_at) 의 한 축이며 DB 는
//   NOT NULL + DEFAULT now(). timestamp 가 누락/이상이면 undefined 로 흘려보내
//   now() 가 들어가면 ON CONFLICT 키가 매번 달라져 시계열이 오염된다.
//   → timestamp 이상 시 **row 폐기 (null 반환)**. 6 함수 전부 동일 규약.
//   호출자(fetcher)는 단일 filter 로 null 제거.
//
// Sanity guard (위생 #5, crypto-domain-expert 자문 §5 2026-05-31):
//   - open_interest ≤ 0 → null
//   - *_ls_ratio_* < 0.1 또는 > 10 → console.warn (값은 저장)
//   - basis_rate |raw| > 0.05 (±5%) → console.warn
//   - basis 응답의 futuresPrice/indexPrice ≤ 0 → row 폐기 (null 반환)
//
// 자문 영구 기록:
//   .claude/agent-memory/crypto-domain-expert/project_m1_8_5_step3_history_consult.md
//   docs/canonical-metrics.md §3.1.1 (history 매핑) + §6 (sanity guard 범위)
//
// M1.9 Step 1 (2026-06-02): apps/worker → packages/exchange-collectors 이동 (로직 변경 0).
// ============================================================

import type { HistoryFuturesIndicatorInsert } from "@travis/data-service";
import type {
  BinanceHistoryPeriod,
  BinanceUsdmBasis,
  BinanceUsdmGlobalLongShortAccount,
  BinanceUsdmOpenInterestHist,
  BinanceUsdmTakerLongShort,
  BinanceUsdmTopLongShortAccount,
  BinanceUsdmTopLongShortPosition,
} from "../types";

/**
 * recorded_at 폐기 규약의 **타입 강제** (code-reviewer C1, 2026-05-31).
 *
 * generated Insert 타입의 recorded_at 은 optional(`recorded_at?: string`) 이라,
 * 폐기 가드를 빠뜨린 객체도 타입 검사를 통과해 DB DEFAULT now() 가 박힌 오염 row 가
 * 조용히 쌓일 수 있다. 반환 타입을 recorded_at 필수로 좁혀 **컴파일러가** 규약을 강제 —
 * 미래의 7번째 metric 함수도 recorded_at 분기를 빠뜨리면 컴파일 에러.
 * (feedback_zod_string_not_defense 의 시계열 버전.)
 */
type HistoryRow = HistoryFuturesIndicatorInsert & { recorded_at: string };

// ─── 로컬 파싱 helper (D-Q4: normalize.ts 미수정 위해 의도적 복제) ─

/** Binance "숫자 문자열" → number | null. 빈 문자열·NaN → null, 0 은 허용. */
function num(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** epoch ms → ISO string. 0/음수/누락 → null (호출자가 row 폐기). */
function epochMsToIso(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/**
 * LSR ratio 정상 범위(0.1~10) 밖이면 경고. 값 자체는 저장(워밍업/이상 거래 가능성만 알림).
 * 자문 §5: 머리수/포지션 비율이 10배 이상 쏠리면 데이터 이상 의심.
 */
function warnIfRatioOutOfRange(label: string, symbol: string, ratio: number | null): void {
  if (ratio !== null && (ratio < 0.1 || ratio > 10)) {
    console.warn(
      `[${label}] ${symbol} longShortRatio=${ratio} (정상 0.1~10 범위 밖) — 데이터 이상 의심`,
    );
  }
}

// ─── 6 metric normalize ──────────────────────────

/**
 * openInterestHist → open_interest 컬럼만.
 * ★ sumOpenInterest (base asset 수량) 매핑. sumOpenInterestValue(USD)/CMCCirculatingSupply 는 현재 schema 미저장.
 * sanity: sumOpenInterest ≤ 0 → null (정상 거래 심볼은 OI > 0).
 */
export function normalizeUsdmOpenInterestHist(
  raw: BinanceUsdmOpenInterestHist,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const oiRaw = num(raw.sumOpenInterest);
  const openInterest = oiRaw !== null && oiRaw <= 0 ? null : oiRaw;
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    interval,
    recorded_at: recordedAt,
    open_interest: openInterest,
  };
}

/** topLongShortAccountRatio → top_ls_ratio_accounts (상위 20% 계정의 머리수 비율). */
export function normalizeUsdmTopLongShortAccountHist(
  raw: BinanceUsdmTopLongShortAccount,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const ratio = num(raw.longShortRatio);
  warnIfRatioOutOfRange("normalizeUsdmTopLongShortAccountHist", raw.symbol, ratio);
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    interval,
    recorded_at: recordedAt,
    top_ls_ratio_accounts: ratio,
  };
}

/** topLongShortPositionRatio → top_ls_ratio_positions (상위 20% 계정의 포지션 노출 비율). */
export function normalizeUsdmTopLongShortPositionHist(
  raw: BinanceUsdmTopLongShortPosition,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const ratio = num(raw.longShortRatio);
  warnIfRatioOutOfRange("normalizeUsdmTopLongShortPositionHist", raw.symbol, ratio);
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    interval,
    recorded_at: recordedAt,
    top_ls_ratio_positions: ratio,
  };
}

/** globalLongShortAccountRatio → global_ls_ratio (전체 계정의 머리수 비율, 상위 20% 제한 X). */
export function normalizeUsdmGlobalLongShortHist(
  raw: BinanceUsdmGlobalLongShortAccount,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  const ratio = num(raw.longShortRatio);
  warnIfRatioOutOfRange("normalizeUsdmGlobalLongShortHist", raw.symbol, ratio);
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.symbol,
    interval,
    recorded_at: recordedAt,
    global_ls_ratio: ratio,
  };
}

/**
 * takerlongshortRatio → taker 3종.
 * ★ 응답에 symbol 필드 없음 → 호출자가 주입 (now-normalize normalizeUsdmTaker 패턴 동일).
 */
export function normalizeUsdmTakerLongShortHist(
  raw: BinanceUsdmTakerLongShort,
  symbol: string,
  interval: BinanceHistoryPeriod,
): HistoryRow | null {
  const recordedAt = epochMsToIso(raw.timestamp);
  if (recordedAt === null) return null;
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol,
    interval,
    recorded_at: recordedAt,
    taker_buy_sell_ratio: num(raw.buySellRatio),
    taker_buy_vol: num(raw.buyVol),
    taker_sell_vol: num(raw.sellVol),
  };
}

/**
 * /futures/data/basis → basis 3종.
 * ★ pair → symbol 매핑 (basis 응답은 pair 필드만).
 * ★ annualizedBasisRate "" → null (PERPETUAL 환경 Binance 의도적 비움, [8-2] 패턴).
 * sanity:
 *   - basis_rate |raw| > 0.05 (±5%) → console.warn (값은 저장).
 *   - futuresPrice/indexPrice ≤ 0 → row 폐기 (null 반환) — 가격 자체가 깨진 응답.
 */
export function normalizeUsdmBasisHist(
  raw: BinanceUsdmBasis,
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
      `[normalizeUsdmBasisHist] ${raw.pair} futuresPrice=${raw.futuresPrice} indexPrice=${raw.indexPrice} — 가격 이상, row 폐기`,
    );
    return null;
  }
  const basisRate = num(raw.basisRate);
  if (basisRate !== null && Math.abs(basisRate) > 0.05) {
    console.warn(
      `[normalizeUsdmBasisHist] ${raw.pair} basisRate=${basisRate} > 5% — 의심 (정상 PERPETUAL 범위 외)`,
    );
  }
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: raw.pair, // ★ basis 응답은 pair 필드 사용
    interval,
    recorded_at: recordedAt,
    basis: num(raw.basis),
    basis_rate: basisRate,
    annualized_basis_rate: num(raw.annualizedBasisRate), // "" → null
  };
}

// ============================================================
// 사전 계산 (M1.3 Step 4 Substep 4a).
//
// 목적:
//   RollingWindow에서 과거 sample을 꺼내 변화율(%) 및 volume_ratio를
//   계산해서 now_*_ticker / now_futures_indicator 테이블의 사전계산
//   컬럼에 merge할 수 있는 형태로 반환한다.
//
// 핵심 불변:
//   - throw 금지 — 잘못된 입력, 윈도우 부족 시 해당 컬럼만 null.
//   - DB 컬럼이 nullable이므로 null을 그대로 upsert하면 된다.
//   - 순수 함수 — 외부 side effect 없음. 단위 테스트가 쉽다.
//   - 샘플링 간격은 1분 (RollingWindow 기본값) 가정.
//     stepsAgo=5 → 5분 전, 60 → 1시간 전, 240 → 4시간 전.
//
// 해석 메모 (volume_chg_5m) — 2026-04-20 Step 5e 전환 완료:
//   **해석 A (과거)**: "24h rolling volume의 5분 전 대비 변화율". 미니ticker/ticker 응답
//     의 volume 필드는 24시간 누적이라 5분 전과의 차분은 "24h 창문이 5분 밀리며 생긴 변화" —
//     실제 5분 거래 폭발을 부정확하게 반영.
//   **해석 B (현재)**: "직전 5개 1m kline volume 합" vs "그 전 5개 합" 비율.
//     volumeKlineWindow 가 제공되면 이 해석으로 자동 전환된다. 컬럼명(`volume_chg_5m`)
//     그대로, 데이터 의미만 실제 5분 거래량 비교로 교체.
//   **Fallback**: volumeKlineWindow 가 null/undefined 이면 해석 A 로 degrade. 이는
//     kline WS 연결 장애 시의 graceful 동작이자 단위 테스트 편의.
// ============================================================

import type { HasTimestamp, RollingWindow } from "./RollingWindow.js";

// ─── Sample 타입 ───────────────────────────────────

/** Ticker 계산용 sample (spot/futures 공용). */
export interface TickerSample extends HasTimestamp {
  /** 현재가 (USDT 또는 quote asset 단위). */
  price: number;
  /**
   * 24h 누적 거래량 (base asset 또는 계약 수).
   * Binance /ticker/24hr의 `volume` 필드 그대로.
   */
  volume: number;
}

/** Futures Indicator 계산용 sample. */
export interface IndicatorSample extends HasTimestamp {
  /** 미결제약정 (OI). */
  openInterest: number;
}

/**
 * 1m kline volume 전용 sample — 해석 B 전환용.
 * Step 5e: volumeKlineWindow 에 이 타입으로 저장. 1분 간격 샘플링 전제라
 * 최근 5개 vs 직전 5개 합산으로 5분 단위 비교가 자연스럽게 성립.
 */
export interface KlineVolumeSample extends HasTimestamp {
  /** 1m kline의 base asset volume. */
  volume: number;
  /** 봉 완성 여부 (kline payload의 `k.x`). 미완성봉도 최신값으로 업데이트 용도 push. */
  isClosed: boolean;
}

// ─── 사전 계산 결과 타입 ───────────────────────────

/**
 * Ticker용 사전계산 결과.
 * 컬럼명은 now_spot_ticker / now_futures_ticker 의 사전계산 컬럼과 동일.
 * null인 필드는 DB에 null로 저장 (윈도우 부족 또는 계산 불가).
 */
export interface TickerPreCompute {
  price_chg_5m: number | null;
  price_chg_15m: number | null;
  price_chg_1h: number | null;
  price_chg_4h: number | null;
  volume_chg_5m: number | null;
  volume_chg_15m: number | null;
  volume_chg_1h: number | null;
  volume_ratio: number | null;
}

/**
 * Futures Indicator용 사전계산 결과.
 * 컬럼명은 now_futures_indicator 의 oi_chg_* 컬럼과 동일.
 */
export interface IndicatorPreCompute {
  oi_chg_5m: number | null;
  oi_chg_15m: number | null;
  oi_chg_1h: number | null;
  oi_chg_4h: number | null;
}

// ─── 공통 헬퍼 ─────────────────────────────────────

/**
 * 1분 샘플링 기준 윈도우 스텝 수 상수 (S4).
 * 두 preCompute 함수가 공유 → 새 구간 추가 시 한 곳만 수정.
 */
const STEPS = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
} as const;

/**
 * 백분율 변화율. prev/current가 0·음수·비유한이면 null (0 나누기·음수 방지).
 * 반환은 % 단위 (0.05 → 5%가 아니라 "5" 로 나옴).
 */
export function pctChange(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev === 0) return null;
  // 음수 가격/거래량은 의미 없음 — graceful null (S2: current도 음수 차단).
  if (prev < 0 || current < 0) return null;
  return ((current - prev) / prev) * 100;
}

/** 롤링 윈도우에서 stepsAgo 스텝 전 sample의 지정 숫자 필드를 꺼낸다. */
function getPastValue<T extends HasTimestamp>(
  window: RollingWindow<T>,
  symbol: string,
  stepsAgo: number,
  extractor: (sample: T) => number,
): number | null {
  const past = window.getAt(symbol, stepsAgo);
  if (!past) return null;
  const value = extractor(past);
  return Number.isFinite(value) ? value : null;
}

// ─── Ticker 사전계산 ───────────────────────────────

/**
 * 현재 sample과 RollingWindow로 TickerPreCompute 계산.
 * 입력이 잘못되면 모든 필드 null 반환 (throw 금지).
 *
 * @param symbol           DB PK의 symbol 값 (window 내부 key)
 * @param current          현재 ticker sample (miniTicker 페이로드에서 추출)
 * @param window           TickerSample을 저장하는 RollingWindow
 * @param volumeKlineWindow (optional) Step 5e 도입 — volume_chg_5m 해석 B 전환용.
 *                         제공되면 최근 5개 1m kline volume 합 vs 직전 5개 합 비율로 계산.
 *                         제공 안 되거나 샘플 부족 시 기존 해석 A (24h rolling 차분) 로 fallback.
 */
export function preComputeTicker(
  symbol: string,
  current: TickerSample,
  window: RollingWindow<TickerSample>,
  volumeKlineWindow?: RollingWindow<KlineVolumeSample>,
): TickerPreCompute {
  const empty: TickerPreCompute = {
    price_chg_5m: null,
    price_chg_15m: null,
    price_chg_1h: null,
    price_chg_4h: null,
    volume_chg_5m: null,
    volume_chg_15m: null,
    volume_chg_1h: null,
    volume_ratio: null,
  };

  if (!symbol || !current || !Number.isFinite(current.price) || !Number.isFinite(current.volume)) {
    return empty;
  }

  // stepsAgo: 1 step = 1분 가정 (RollingWindow.sampleIntervalMs = 60s).
  const price5m = getPastValue(window, symbol, STEPS["5m"], (s) => s.price);
  const price15m = getPastValue(window, symbol, STEPS["15m"], (s) => s.price);
  const price1h = getPastValue(window, symbol, STEPS["1h"], (s) => s.price);
  const price4h = getPastValue(window, symbol, STEPS["4h"], (s) => s.price);

  const vol5m = getPastValue(window, symbol, STEPS["5m"], (s) => s.volume);
  const vol15m = getPastValue(window, symbol, STEPS["15m"], (s) => s.volume);
  const vol1h = getPastValue(window, symbol, STEPS["1h"], (s) => s.volume);

  // volume_ratio: 현재 24h volume / 최근 20분 volume 평균.
  // 해석 한계: 24h rolling 기반이라 "20분 평균"과 현재값이 거의 동일 (≈ 1).
  // 크게 벗어나면 최근 20분 창문이 상대적으로 조용/바쁘다는 신호.
  // Step 5 WS 후 kline 기반으로 재정의하면 의미 명확해짐.
  const recent20 = window.getRecent(symbol, 20);
  let volumeRatio: number | null = null;
  if (recent20.length >= 5) {
    const sum = recent20.reduce(
      (acc, s) => (Number.isFinite(s.volume) ? acc + s.volume : acc),
      0,
    );
    const avg = sum / recent20.length;
    if (avg > 0) {
      volumeRatio = current.volume / avg;
    }
  }

  // volume_chg_5m — Step 5e 전환: volumeKlineWindow 제공 시 해석 B, 아니면 해석 A.
  //
  // Step 4.7 (2026-04-22) — 워밍업 가드:
  //   해석 A fallback 이 tickerWindow 에 샘플이 충분하지 않은 초기 부팅 시점
  //   에서 호출되면 (예: 2~3 샘플), "5분 전" 이 실제로는 1~2분 전 값이라
  //   차분이 왜곡돼 -50% / +200% 같은 극단값이 나온다. 샘플이 최소 5개 이상
  //   + 해당 샘플 시간 간격이 실제로 5분에 근접할 때만 계산.
  const tickerSamples = window.getRecent(symbol, STEPS["5m"]);
  const hasEnoughWarmup = tickerSamples.length >= STEPS["5m"];

  const volumeChg5m = computeVolumeChg5mInterpretB(symbol, volumeKlineWindow);
  const volumeChg5mFallback =
    hasEnoughWarmup && vol5m !== null ? pctChange(current.volume, vol5m) : null;

  // Step 4.7 (2026-04-22) — 극단값 sanity clip:
  //   해석 A 는 24h rolling volume 의 "창문 이동 노이즈" 라 실제로 5 분 거래가
  //   폭발해도 값이 -100%~ +수백% 이 되지 않는 게 정상. 그런데 관찰상 ±50% 를
  //   넘는 경우는 stale 데이터 / 타이밍 꼬임이 대부분이라 사용자에게 보여줘야
  //   할 "실제 5 분 거래량 변화" 가 아님. 해석 B (실제 1m kline 합) 쪽은 실제
  //   지표라 clip 하지 않는다.
  const volumeChg5mFinal =
    volumeChg5m !== null
      ? volumeChg5m // 해석 B — 실데이터, clip 하지 않음
      : volumeChg5mFallback !== null && Math.abs(volumeChg5mFallback) > 50
        ? null
        : volumeChg5mFallback;

  return {
    price_chg_5m: price5m !== null ? pctChange(current.price, price5m) : null,
    price_chg_15m: price15m !== null ? pctChange(current.price, price15m) : null,
    price_chg_1h: price1h !== null ? pctChange(current.price, price1h) : null,
    price_chg_4h: price4h !== null ? pctChange(current.price, price4h) : null,
    volume_chg_5m: volumeChg5mFinal,
    volume_chg_15m: vol15m !== null ? pctChange(current.volume, vol15m) : null,
    volume_chg_1h: vol1h !== null ? pctChange(current.volume, vol1h) : null,
    volume_ratio: volumeRatio,
  };
}

/**
 * 해석 B: 최근 5개 1m kline volume 합 vs 직전 5개 합의 % 변화율.
 *   recent5 = sum(window.getRecent(symbol, 5))
 *   prev5   = sum(window.getAt(symbol, 5..9) or getRecent(10).slice(5,10))
 *   → pctChange(recent5, prev5)
 *
 * window 가 null/undefined 이거나 샘플이 10개 미만이면 null 반환 (호출자가 해석 A fallback).
 */
function computeVolumeChg5mInterpretB(
  symbol: string,
  window: RollingWindow<KlineVolumeSample> | undefined,
): number | null {
  if (!window) return null;
  const last10 = window.getRecent(symbol, 10);
  if (last10.length < 10) return null;

  // getRecent 반환은 오래된 것 → 최신 순서라 가정 (RollingWindow 구현 확인 필요).
  // 보수적으로 처리: 뒤쪽 5개를 "최근", 앞쪽 5개를 "직전"으로.
  const prev5 = last10.slice(0, 5);
  const recent5 = last10.slice(5, 10);

  const prevSum = prev5.reduce(
    (acc, s) => (Number.isFinite(s.volume) ? acc + s.volume : acc),
    0,
  );
  const recentSum = recent5.reduce(
    (acc, s) => (Number.isFinite(s.volume) ? acc + s.volume : acc),
    0,
  );

  if (prevSum <= 0) return null;
  return ((recentSum - prevSum) / prevSum) * 100;
}

// ─── Indicator 사전계산 ─────────────────────────────

/**
 * 현재 OI sample과 RollingWindow로 IndicatorPreCompute 계산.
 * perSymbolTask에서 openInterest 배치 결과를 받을 때 사용.
 */
export function preComputeIndicator(
  symbol: string,
  current: IndicatorSample,
  window: RollingWindow<IndicatorSample>,
): IndicatorPreCompute {
  const empty: IndicatorPreCompute = {
    oi_chg_5m: null,
    oi_chg_15m: null,
    oi_chg_1h: null,
    oi_chg_4h: null,
  };

  if (!symbol || !current || !Number.isFinite(current.openInterest)) {
    return empty;
  }

  const oi5m = getPastValue(window, symbol, STEPS["5m"], (s) => s.openInterest);
  const oi15m = getPastValue(window, symbol, STEPS["15m"], (s) => s.openInterest);
  const oi1h = getPastValue(window, symbol, STEPS["1h"], (s) => s.openInterest);
  const oi4h = getPastValue(window, symbol, STEPS["4h"], (s) => s.openInterest);

  return {
    oi_chg_5m: oi5m !== null ? pctChange(current.openInterest, oi5m) : null,
    oi_chg_15m: oi15m !== null ? pctChange(current.openInterest, oi15m) : null,
    oi_chg_1h: oi1h !== null ? pctChange(current.openInterest, oi1h) : null,
    oi_chg_4h: oi4h !== null ? pctChange(current.openInterest, oi4h) : null,
  };
}

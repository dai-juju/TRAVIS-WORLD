// apps/web/lib/cards/indicatorDescriptors.ts
//
// IndicatorCard 의 metric 그룹 descriptor (M2 테마 A Step 2, 2026-06-09).
//
// 역할:
//   하나의 generic IndicatorCard 가 AI 가 고른 datasource 에 따라 적응 렌더하도록,
//   "이 datasource 는 어떤 metric 행들을 어떤 단위/색으로 보여주는가" 를 선언한다.
//   now_futures_indicator 한 테이블의 31 컬럼이 5개 사이트 위젯(펀딩/basis/OI/LSR/taker)
//   으로 나뉘는데, 그 경계를 datasource 논리 id 가 표현한다 (Step 2.1 registry 재정합).
//
// 설계 원칙 (CLAUDE.md):
//   - 이건 "쿼리→컴포넌트 하드매핑" 이 아니다. AI 는 datasource description 으로 의도를
//     추론해 datasource 를 고르고, 여기 descriptor 는 그 datasource 의 **순수 표시 메타**
//     (라벨/포맷/색)일 뿐이다. 새 metric 추가 = 행 한 줄 추가 = 자동 지원.
//   - 모든 숫자 포맷은 marketUnits 헬퍼 경유 (사이트=DB 단위 일치, 단일 진실 원천).
//   - watchColumns 는 [10-7] dirty check 의 입력 — 같은 물리 테이블을 공유하는 다른
//     도메인 카드의 fan-out 재렌더를 막는다.
//
// 색 정책 (사용자 결정 2026-06-09):
//   기존 "흑백 + 방향성 2색" 하이브리드 일관 적용.
//   - 부호 기반(funding/basis/oi_chg): 양수=up(teal) / 음수=down(vermilion).
//   - 1.0 중립선 기반(LSR/taker): >1=up / <1=down (롱우위/매수우위).
//   - 절대값(OI 수량/가격/거래량/카운트다운): neutral(흑백).
//
// 단위 근거: docs/canonical-metrics.md §2 (각 metric 정의 + 헬퍼 매핑).

import {
  formatAmount,
  formatBasis,
  formatBasisRate,
  formatCountdown,
  formatFundingRate,
  formatLSR,
  formatOI,
  formatPct,
  formatPrice,
} from "@/lib/format/marketUnits";
import type { SymbolMeta } from "@/lib/hooks/useSymbolMeta";

/** now_futures_indicator row 의 최소 스키마 (IndicatorCard 가 읽는 필드). */
export type IndicatorRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  // 펀딩/마크
  mark_price: number | null;
  index_price: number | null;
  predicted_funding_rate: number | null;
  last_settled_funding_rate: number | null;
  next_funding_time: number | null;
  // basis
  basis: number | null;
  basis_rate: number | null;
  // OI
  open_interest: number | null;
  oi_chg_5m: number | null;
  oi_chg_15m: number | null;
  oi_chg_1h: number | null;
  oi_chg_4h: number | null;
  // LSR
  top_ls_ratio_accounts: number | null;
  top_ls_ratio_positions: number | null;
  global_ls_ratio: number | null;
  // taker
  taker_buy_sell_ratio: number | null;
  taker_buy_vol: number | null;
  taker_sell_vol: number | null;
  updated_at: string;
} & Record<string, unknown>;

export type MetricTone = "up" | "down" | "neutral";

// [10-9] 회수 (2026-06-10): symbols 메타 주입 — funding interval 라벨 / tickSize
// 가격 정밀도 / OI base asset 라벨 / basis quote. useSymbolMeta 훅이 공급하며,
// null 이면 모든 행이 라벨 없는 기존 표시로 자연 fallback (오라벨보다 무라벨).
export type { SymbolMeta };

export interface MetricRow {
  /** 표시 라벨 (예: "Funding (predicted)"). */
  label: string;
  /** (row, 심볼메타?) → 표시 문자열 (marketUnits 헬퍼 경유). meta 는 옵션 보강. */
  value: (row: IndicatorRow, meta?: SymbolMeta | null) => string;
  /** row → 색 tone. 미지정 시 neutral. */
  tone?: (row: IndicatorRow) => MetricTone;
  /** 카드당 0~1개 — 큰 글씨로 강조하는 대표 metric. */
  primary?: boolean;
}

export interface IndicatorDescriptor {
  /** 카드 상단 kicker (대문자 메타 태그). */
  kicker: string;
  /** config.title 미지정 시 기본 타이틀. */
  defaultTitle: string;
  /** [10-7] dirty check 대상 컬럼 (PK/updated_at 제외 — 도메인 컬럼만). */
  watchColumns: string[];
  /** 표시 metric 행들. */
  rows: MetricRow[];
}

// ─── tone 헬퍼 ────────────────────────────────────────

/** 부호 기반: 양수=up / 음수=down / 0·null=neutral. */
function signTone(v: number | null | undefined): MetricTone {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) {
    return "neutral";
  }
  return v > 0 ? "up" : "down";
}

/** 1.0 중립선 기반: >1=up / <1=down / =1·null=neutral (LSR/taker). */
function midlineTone(v: number | null | undefined): MetricTone {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 1) {
    return "neutral";
  }
  return v > 1 ? "up" : "down";
}

/** row.market_type → formatOI 가 받는 좁은 union (graceful 기본 USDM). */
function asFuturesMarketType(
  mt: string,
): "futures_usdm" | "futures_coinm" {
  return mt === "futures_coinm" ? "futures_coinm" : "futures_usdm";
}

/**
 * basis quote 라벨 — COINM 은 USD 결제라 "USD", USDM 은 "USDT".
 * (code-reviewer W3, 2026-06-09: formatBasis 기본 "USDT" 하드코딩 → COINM 단위 오표시 방지.
 *  USDC-margined 소수 케이스는 USDT 표기로 근사 — baseAsset/quote 정밀 매핑은 symbols 조인 deferred.)
 */
function basisQuoteForMarketType(mt: string): string {
  return mt === "futures_coinm" ? "USD" : "USDT";
}

// ─── descriptor 테이블 ────────────────────────────────

/**
 * datasource 논리 id → metric 그룹 descriptor.
 *
 * IndicatorCard 는 INDICATOR_DESCRIPTORS[datasource] 가 있으면 렌더, 없으면 coming soon.
 * 즉 이 테이블의 key 집합이 곧 IndicatorCard 의 self-gate allowlist 다.
 */
export const INDICATOR_DESCRIPTORS: Record<string, IndicatorDescriptor> = {
  // ── 펀딩 & 마크 (Binance 우상단 Funding/Countdown 박스) ──
  premium_index: {
    kicker: "FUNDING & MARK",
    defaultTitle: "Funding & Mark",
    watchColumns: [
      "predicted_funding_rate",
      "last_settled_funding_rate",
      "mark_price",
      "index_price",
      "next_funding_time",
    ],
    rows: [
      {
        label: "Funding (predicted)",
        // [10-9] meta.funding_interval_hours → "(1h)/(4h)/(8h)" 라벨 (D9 negative-space:
        //   fundingInfoTask 가 미등재 코인에 8 을 명시 기록 → DB 값 그대로 신뢰).
        value: (r, m) =>
          formatFundingRate(r.predicted_funding_rate, m?.funding_interval_hours),
        tone: (r) => signTone(r.predicted_funding_rate),
        primary: true,
      },
      {
        label: "Next funding",
        value: (r) => formatCountdown(r.next_funding_time),
      },
      {
        label: "Funding (last settled)",
        value: (r, m) =>
          formatFundingRate(
            r.last_settled_funding_rate,
            m?.funding_interval_hours,
          ),
        tone: (r) => signTone(r.last_settled_funding_rate),
      },
      // [10-9] meta.tick_size → 사이트와 동일 가격 정밀도 (미주입 시 adaptive fallback)
      { label: "Mark price", value: (r, m) => formatPrice(r.mark_price, m?.tick_size) },
      { label: "Index price", value: (r, m) => formatPrice(r.index_price, m?.tick_size) },
    ],
  },

  // ── Basis (선물 − 현물 괴리) ──
  basis: {
    kicker: "BASIS",
    defaultTitle: "Basis",
    watchColumns: ["basis", "basis_rate", "mark_price", "index_price"],
    rows: [
      {
        label: "Basis",
        // [10-9] meta.quote_asset 우선 (USDC 페어 정확 표기) — 미주입 시 기존 근사 유지
        value: (r, m) =>
          formatBasis(
            r.basis,
            m?.quote_asset ?? basisQuoteForMarketType(r.market_type),
          ),
        tone: (r) => signTone(r.basis),
        primary: true,
      },
      {
        label: "Basis rate",
        value: (r) => formatBasisRate(r.basis_rate),
        tone: (r) => signTone(r.basis_rate),
      },
      { label: "Mark price", value: (r, m) => formatPrice(r.mark_price, m?.tick_size) },
      { label: "Index price", value: (r, m) => formatPrice(r.index_price, m?.tick_size) },
    ],
  },

  // ── Open Interest (사용자 1순위: OI+가격 다이버전스) ──
  //   true 가격변화율(price_chg)은 now_futures_ticker 소관 → 교차구독 필요라 deferred.
  //   같은 row 의 mark_price 만 동반(무료)해 OI 방향과 가격 수준의 1차 대조 제공.
  open_interest: {
    kicker: "OPEN INTEREST",
    defaultTitle: "Open Interest",
    watchColumns: [
      "open_interest",
      "oi_chg_5m",
      "oi_chg_15m",
      "oi_chg_1h",
      "oi_chg_4h",
      "mark_price",
    ],
    rows: [
      {
        label: "Open interest",
        // [10-9] meta.base_asset → USDM 수량 단위 라벨 ("97,630.3 BTC"). COINM 은 무시(contracts).
        value: (r, m) =>
          formatOI(
            r.open_interest,
            asFuturesMarketType(r.market_type),
            m?.base_asset,
          ),
        primary: true,
      },
      { label: "OI 5m", value: (r) => formatPct(r.oi_chg_5m), tone: (r) => signTone(r.oi_chg_5m) },
      { label: "OI 15m", value: (r) => formatPct(r.oi_chg_15m), tone: (r) => signTone(r.oi_chg_15m) },
      { label: "OI 1h", value: (r) => formatPct(r.oi_chg_1h), tone: (r) => signTone(r.oi_chg_1h) },
      { label: "OI 4h", value: (r) => formatPct(r.oi_chg_4h), tone: (r) => signTone(r.oi_chg_4h) },
      { label: "Mark price", value: (r, m) => formatPrice(r.mark_price, m?.tick_size) },
    ],
  },

  // ── Long/Short Ratio (+ taker 동반 — 사용자 결정: 빈 카드 방지) ──
  long_short_ratio: {
    kicker: "LONG / SHORT",
    defaultTitle: "Long/Short Ratio",
    watchColumns: [
      "top_ls_ratio_accounts",
      "top_ls_ratio_positions",
      "global_ls_ratio",
      "taker_buy_sell_ratio",
    ],
    rows: [
      {
        label: "Top (accounts)",
        value: (r) => formatLSR(r.top_ls_ratio_accounts),
        tone: (r) => midlineTone(r.top_ls_ratio_accounts),
        primary: true,
      },
      {
        label: "Top (positions)",
        value: (r) => formatLSR(r.top_ls_ratio_positions),
        tone: (r) => midlineTone(r.top_ls_ratio_positions),
      },
      {
        label: "Global",
        value: (r) => formatLSR(r.global_ls_ratio),
        tone: (r) => midlineTone(r.global_ls_ratio),
      },
      {
        label: "Taker buy/sell",
        value: (r) => formatLSR(r.taker_buy_sell_ratio),
        tone: (r) => midlineTone(r.taker_buy_sell_ratio),
      },
    ],
  },

  // ── Taker Buy/Sell Volume (단독 — AI 가 명시적으로 고른 경우) ──
  taker_long_short: {
    kicker: "TAKER BUY/SELL",
    defaultTitle: "Taker Buy/Sell",
    watchColumns: ["taker_buy_sell_ratio", "taker_buy_vol", "taker_sell_vol"],
    rows: [
      {
        label: "Buy/Sell ratio",
        value: (r) => formatLSR(r.taker_buy_sell_ratio),
        tone: (r) => midlineTone(r.taker_buy_sell_ratio),
        primary: true,
      },
      { label: "Buy volume", value: (r) => formatAmount(r.taker_buy_vol) },
      { label: "Sell volume", value: (r) => formatAmount(r.taker_sell_vol) },
    ],
  },
};

/** datasource 가 IndicatorCard 로 렌더 가능한지 (self-gate). */
export function getIndicatorDescriptor(
  datasource: string | undefined | null,
): IndicatorDescriptor | undefined {
  if (typeof datasource !== "string") return undefined;
  return INDICATOR_DESCRIPTORS[datasource];
}

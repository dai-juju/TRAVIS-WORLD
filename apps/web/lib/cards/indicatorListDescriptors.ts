// apps/web/lib/cards/indicatorListDescriptors.ts
//
// IndicatorListCard 의 리스트 컬럼 descriptor (M2 테마 A Step 3, 2026-06-11).
//
// 역할:
//   하나의 generic IndicatorListCard 가 AI 가 고른 datasource 에 따라
//   "심볼 + 주 metric 1~3 컬럼" 의 정렬 랭킹 리스트로 적응 렌더하도록 선언한다.
//   단일 심볼 카드(indicatorDescriptors.ts)와 분리한 이유: 단일 카드는 "세로
//   metric 행 + 장황한 라벨 + 심볼메타 보강" 구조, 리스트는 "가로 좁은 컬럼 +
//   정렬키 + 메타 없음" 구조 — 욱여넣으면 양쪽 인터페이스가 다 흐려진다.
//
// 설계 원칙 (CLAUDE.md):
//   - "쿼리→컴포넌트 하드매핑" 아님 — AI 는 datasource description 으로 의도를
//     추론하고, 이 테이블은 그 datasource 의 순수 표시 메타일 뿐.
//   - columns[].key / defaultSort.field 는 해당 datasource 의 queryableFields 에
//     실존해야 한다 (registry↔표시계층 drift 차단 — 테스트로 박제).
//   - 숫자 포맷은 marketUnits 헬퍼 경유 (사이트=DB 단위 일치).
//   - 심볼메타(funding interval 라벨 등)는 리스트에서 생략 — 랭킹 스캔에 필수가
//     아니고 N 심볼 bulk 조회는 비용 대비 과함 (YAGNI, deferred 등재).
//     formatFundingRate 는 interval 미주입 시 라벨 없는 표시로 자연 fallback
//     ("오라벨보다 무라벨", [10-9] 원칙).
//
// 색 정책: indicatorDescriptors.ts 와 동일 (signTone / midlineTone 재사용).

import {
  asFuturesMarketType,
  basisQuoteForMarketType,
  midlineTone,
  signTone,
  type IndicatorRow,
  type MetricTone,
} from "@/lib/cards/indicatorDescriptors";
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

/** 리스트의 데이터 컬럼 1개 (심볼 컬럼 제외). */
export interface ListColumn {
  /**
   * now_futures_indicator 컬럼명 — 정렬키 후보이자 Step 4 flash 비교 대상.
   * 반드시 해당 datasource 의 queryableFields 에 등록된 이름이어야 한다.
   */
  key: string;
  /** 좁은 컬럼 헤더 (대문자 약어, 예: "FUNDING" / "ΔOI 1H"). */
  header: string;
  /** row → 표시 문자열 (marketUnits 헬퍼 경유, 심볼메타 없음). */
  value: (row: IndicatorRow) => string;
  /** row → 색 tone. 미지정 시 neutral(흑백). */
  tone?: (row: IndicatorRow) => MetricTone;
}

export interface IndicatorListDescriptor {
  /** 카드 상단 kicker (대문자 메타 태그). */
  kicker: string;
  /** config.title 미지정 시 기본 타이틀. */
  defaultTitle: string;
  /**
   * AI 가 sort 를 생략했을 때의 기본 정렬 — "top OI" 처럼 정렬 의도가 암묵적인
   * 쿼리에서도 의미 있는 랭킹을 보장. field 는 queryableFields 의 sortable 컬럼.
   */
  defaultSort: { field: string; direction: "asc" | "desc" };
  /** Step 4 flash 비교 대상 컬럼 (columns[].key 합집합). */
  watchColumns: string[];
  /** 데이터 컬럼들 (1~3개 — 좁은 카드 폭 기준). */
  columns: ListColumn[];
}

// ─── descriptor 테이블 ────────────────────────────────

/**
 * datasource 논리 id → 리스트 descriptor.
 * key 집합이 곧 IndicatorListCard 의 self-gate allowlist (단일 카드와 동일 패턴).
 */
export const INDICATOR_LIST_DESCRIPTORS: Record<string, IndicatorListDescriptor> = {
  // ── 펀딩 랭킹 — "highest/lowest funding" ──
  premium_index: {
    kicker: "FUNDING RANKING",
    defaultTitle: "Funding Rates",
    defaultSort: { field: "predicted_funding_rate", direction: "desc" },
    watchColumns: ["predicted_funding_rate", "mark_price", "next_funding_time"],
    columns: [
      {
        key: "predicted_funding_rate",
        header: "FUNDING",
        value: (r) => formatFundingRate(r.predicted_funding_rate),
        tone: (r) => signTone(r.predicted_funding_rate),
      },
      {
        key: "mark_price",
        header: "MARK",
        value: (r) => formatPrice(r.mark_price),
      },
      {
        key: "next_funding_time",
        header: "NEXT",
        value: (r) => formatCountdown(r.next_funding_time),
      },
    ],
  },

  // ── Basis 랭킹 — contango/backwardation 스캔 ──
  basis: {
    kicker: "BASIS RANKING",
    defaultTitle: "Basis",
    defaultSort: { field: "basis_rate", direction: "desc" },
    watchColumns: ["basis", "basis_rate"],
    columns: [
      {
        key: "basis_rate",
        header: "BASIS %",
        value: (r) => formatBasisRate(r.basis_rate),
        tone: (r) => signTone(r.basis_rate),
      },
      {
        key: "basis",
        header: "BASIS",
        value: (r) => formatBasis(r.basis, basisQuoteForMarketType(r.market_type)),
        tone: (r) => signTone(r.basis),
      },
    ],
  },

  // ── OI 랭킹 — "top open interest" (사용자 1순위 메트릭) ──
  open_interest: {
    kicker: "OPEN INTEREST RANKING",
    defaultTitle: "Open Interest",
    defaultSort: { field: "open_interest", direction: "desc" },
    watchColumns: ["open_interest", "oi_chg_1h"],
    columns: [
      {
        key: "open_interest",
        header: "OI",
        // USDM=base 수량 / COINM=계약수 — 혼합 정렬 왜곡은 component description 의
        // market_type 필터 가이드로 방지 (카드 하드코딩 아님).
        value: (r) => formatOI(r.open_interest, asFuturesMarketType(r.market_type)),
      },
      {
        key: "oi_chg_1h",
        header: "ΔOI 1H",
        value: (r) => formatPct(r.oi_chg_1h),
        tone: (r) => signTone(r.oi_chg_1h),
      },
    ],
  },

  // ── LSR 랭킹 — 쏠림 스캔 ──
  long_short_ratio: {
    kicker: "LONG / SHORT RANKING",
    defaultTitle: "Long/Short Ratio",
    defaultSort: { field: "top_ls_ratio_accounts", direction: "desc" },
    watchColumns: [
      "top_ls_ratio_accounts",
      "top_ls_ratio_positions",
      "global_ls_ratio",
    ],
    columns: [
      {
        key: "top_ls_ratio_accounts",
        header: "TOP ACC",
        value: (r) => formatLSR(r.top_ls_ratio_accounts),
        tone: (r) => midlineTone(r.top_ls_ratio_accounts),
      },
      {
        key: "top_ls_ratio_positions",
        header: "TOP POS",
        value: (r) => formatLSR(r.top_ls_ratio_positions),
        tone: (r) => midlineTone(r.top_ls_ratio_positions),
      },
      {
        key: "global_ls_ratio",
        header: "GLOBAL",
        value: (r) => formatLSR(r.global_ls_ratio),
        tone: (r) => midlineTone(r.global_ls_ratio),
      },
    ],
  },

  // ── Taker 랭킹 — 공격적 체결 우위 스캔 ──
  taker_long_short: {
    kicker: "TAKER BUY/SELL RANKING",
    defaultTitle: "Taker Buy/Sell",
    defaultSort: { field: "taker_buy_sell_ratio", direction: "desc" },
    watchColumns: ["taker_buy_sell_ratio", "taker_buy_vol"],
    columns: [
      {
        key: "taker_buy_sell_ratio",
        header: "B/S RATIO",
        value: (r) => formatLSR(r.taker_buy_sell_ratio),
        tone: (r) => midlineTone(r.taker_buy_sell_ratio),
      },
      {
        key: "taker_buy_vol",
        header: "BUY VOL",
        value: (r) => formatAmount(r.taker_buy_vol),
      },
    ],
  },
};

/** datasource 가 IndicatorListCard 로 렌더 가능한지 (self-gate). */
export function getIndicatorListDescriptor(
  datasource: string | undefined | null,
): IndicatorListDescriptor | undefined {
  if (typeof datasource !== "string") return undefined;
  return INDICATOR_LIST_DESCRIPTORS[datasource];
}

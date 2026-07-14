// apps/web/lib/cards/marketSemantics.ts
//
// 시장 데이터 공유 시맨틱 — tone 헬퍼 + 공용 row 타입의 단일 진실 원천
// (Composable Stage 1b Step 1, 2026-07-14 — [10-74] descriptor 수렴의 일부).
//
// 배경:
//   tone 헬퍼(signTone/midlineTone)와 IndicatorRow 는 원래 indicatorDescriptors.ts
//   에 살았고 tableDescriptors 등 4개 파일이 거기서 import 했다. Stage 1b Step 1
//   에서 이 파일로 먼저 분리했고, Step 4(2026-07-14)에서 indicatorDescriptors.ts
//   는 recordDescriptors.ts 로 흡수되며 삭제됨(과도기 re-export 종료) — 현재 이
//   파일이 공유 시맨틱의 유일 원천이다.
//
// 색 정책 (사용자 결정 2026-06-09, 이관 무변경):
//   기존 "흑백 + 방향성 2색" 하이브리드 일관 적용.
//   - 부호 기반(funding/basis/oi_chg): 양수=up(teal) / 음수=down(vermilion).
//   - 1.0 중립선 기반(LSR/taker): >1=up / <1=down (롱우위/매수우위).
//   - 절대값(OI 수량/가격/거래량/카운트다운): neutral(흑백).
//
// 원칙: 여기는 "의미 → 신호"(방향 tone)까지만. 신호 → 픽셀(실제 색/불투명도)은
//   각 form 컴포넌트가 소유한다 (tone/intensity 직교 — Heatmap 재사용 대비).

/** 의미상 방향 신호 — form 이 색으로 번역한다 (up=teal / down=vermilion / neutral=흑백). */
export type MetricTone = "up" | "down" | "neutral";

/** 부호 기반: 양수=up / 음수=down / 0·null=neutral. */
export function signTone(v: number | null | undefined): MetricTone {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) {
    return "neutral";
  }
  return v > 0 ? "up" : "down";
}

/** 1.0 중립선 기반: >1=up / <1=down / =1·null=neutral (LSR/taker). */
export function midlineTone(v: number | null | undefined): MetricTone {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 1) {
    return "neutral";
  }
  return v > 1 ? "up" : "down";
}

/** row.market_type → formatOI 가 받는 좁은 union (graceful 기본 USDM). */
export function asFuturesMarketType(
  mt: string,
): "futures_usdm" | "futures_coinm" {
  return mt === "futures_coinm" ? "futures_coinm" : "futures_usdm";
}

/**
 * basis quote 라벨 — COINM 은 USD 결제라 "USD", USDM 은 "USDT".
 * (code-reviewer W3, 2026-06-09: formatBasis 기본 "USDT" 하드코딩 → COINM 단위 오표시 방지.
 *  USDC-margined 소수 케이스는 USDT 표기로 근사 — baseAsset/quote 정밀 매핑은 symbols 조인 deferred.)
 */
export function basisQuoteForMarketType(mt: string): string {
  return mt === "futures_coinm" ? "USD" : "USDT";
}

/** now_futures_indicator row 의 최소 스키마 (지표 descriptor 들이 읽는 필드). */
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

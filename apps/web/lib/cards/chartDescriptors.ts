// apps/web/lib/cards/chartDescriptors.ts
//
// 모양-제네릭 Chart form 의 시맨틱 레시피 (Composable 사이클 2 Step 3, 2026-07-08).
// tableDescriptors(set)/feedDescriptors(events) 와 동형의 세 번째 팩 — series 소비.
//
// 계약 요지: descriptor 는 "무엇을 어떤 의미로 그리나"(주 플롯 컬럼·기준선·방향색
// 정책·값 포맷)만 선언하고, 픽셀(uPlot 옵션·실제 색·다운샘플)은 form(Step 4
// chartFormat/ChartCard) 소유 — tone/intensity 직교 원칙 그대로.
//
// ─── 6-metric 차트 시맨틱 (crypto-domain-expert 자문 2026-07-08) ───
//   OI       = area, ★모노크롬 강제(방향색 금지 — OI 상승은 그 자체로 롱/숏이 아님:
//              가격 상승 중 OI↑=신규 롱, 하락 중 OI↑=신규 숏 → 방향색은 오정보),
//              단위는 축 제목에 1회 병기(USDM=base/COINM=contracts), 0 앵커 금지.
//   LSR 3종  = line + 1.0 midline(롱숏 균형 — 없으면 시계열 의미 상실). 방향색은
//              "쏠림 방향" 중립 표시로만(군중 롱=역발상 연료일 수 있어 매매신호 아님).
//   taker    = ratio line + 1.0 midline. >1=적극 매수 체결 우세 — 체결 방향이라
//              방향색 정당(LSR 보다 직접적).
//   basis    = basis_rate(%) 주 플롯 + 0 midline(contango/backwardation 경계).
//              색은 carry 상태이지 압력이 아님 → 모노크롬+0선이 안전. USD 절대값
//              basis 는 가격 수준 비례라 시계열 부적합(주 플롯 아님).
//   공통     = null 은 gap(spanGaps:false — COINM global 미제공 구간 등), 절대 0
//              으로 plot/연결 금지. 계단(step)은 "값 유지" 함의라 스냅샷 지표에 오정보.
//
// ★ 값 컬럼(valueField)은 datasource queryableFields 에 **없다** — 정렬/필터 대상이
//   아닌 플롯 대상이라 의도적 제외(silent-wrong 필터 차단, zod 자문). 따라서
//   tableDescriptors 의 "columns ⊆ queryableFields" 불변식을 여기 미러하지 않는다 —
//   대신 테스트가 history 테이블 실컬럼 리터럴에 대해 핀한다.

import type { SeriesStyle } from "@travis/shared";
import {
  formatAmount,
  formatBasisRate,
  formatFundingRate,
  formatLSR,
} from "@/lib/format/marketUnits";

/**
 * 이 차트 form 이 소비하는 shape — 'series'(시간축 위의 값).
 * chart-card 의 registry acceptsShapes=['series'] 와 등치 불변식으로 동기됨
 * (chartDescriptors.test, TABLE/FEED_CONSUMES_SHAPE 동형 — Step 5 등록 2026-07-09).
 */
export const CHART_CONSUMES_SHAPE = "series" as const;

/** 방향색 정책 — "neutral"=모노크롬 강제 / "directional"=midline 위아래 tone. */
export type ChartTone = "neutral" | "directional";

/**
 * 시리즈 렌더 형태 (픽셀 구현은 form 소유 — uPlot paths 매핑은 chartFormat).
 * "bars" = 이산 이벤트 관례 (사이클 2 Step 6 신설 — 펀딩 정산이 첫 사용자, 미래의
 * 청산 집계([10-84])·거래량 등 어떤 이벤트성 series 도 선언만으로 재사용).
 * ★ 오버레이(다중 심볼) 시 bars 는 겹침 판독 불가 → form 이 stepped 로 자동 전환
 *   (데이터별 하드코딩 아닌 form 픽셀 정책 — 사용자 결정 2026-07-09).
 * ★ 사이클 4a [10-101] (2026-07-12): enum 의 단일 진실은 shared SeriesStyleSchema —
 *   descriptor 의 seriesStyle 은 **default(도메인 관례)** 이고, AI 계약 top-level
 *   `style.series` 가 유저 명시 요구 시 override (ChartCard 가 파생 descriptor 생성).
 */
export type ChartSeriesStyle = SeriesStyle;

export interface ChartDescriptor {
  /** 카드 kicker (AI 미지정 시 안전망). */
  kicker: string;
  /** 카드 기본 타이틀 (AI 미지정 시 안전망). */
  defaultTitle: string;
  /**
   * 주 플롯 값 컬럼 — history 테이블 실컬럼. ★ queryableFields 아님(표시 전용 계약,
   * 파일 헤더 참조). 한 차트 = 한 라인, metric 선택 = datasource id 선택.
   */
  valueField: string;
  /** 시간축 컬럼 (useDataServiceSeries timeField 와 동일 값). */
  timeField: string;
  /** 렌더 형태 (도메인 관례 — 헤더 표). */
  seriesStyle: ChartSeriesStyle;
  /**
   * 기준선 값 — LSR/taker=1.0(균형점), basis_rate=0(contango 경계).
   * undefined = 기준선 없음(OI 레벨 지표, 0 앵커도 금지 = auto-scale).
   */
  midline?: number;
  /** 방향색 정책 (헤더 표 — OI/basis 는 neutral 강제). */
  tone: ChartTone;
  /** y축 tick/툴팁 값 포맷 — marketUnits 파생, null 은 "—" (graceful). */
  formatValue: (value: number | null | undefined) => string;
  /**
   * 축 제목 단위 병기 (market_type 별 단위가 다른 metric 만 — OI).
   * 매 tick 이 아닌 축 제목 1회 (crypto-domain 판정).
   */
  axisUnitLabel?: (marketType: string) => string;
  /**
   * AI 가 interval 을 생략했을 때 카드 기본값 (graceful 필수 축).
   * ★ defaultLimit 사고(feedback_card_default_overrides_ai_intent, Stage 1 Step 5)와
   *   다름: limit 생략="전부"라는 의도가 있었지만 interval 생략은 의미 자체가
   *   없어(fetch 불가) 기본값이 AI 의도를 덮어쓰지 않는다.
   * ★ optional (사이클 2 Step 6): interval 축이 없는 이벤트 datasource(funding_history —
   *   정산 이벤트)는 defaultInterval 자체가 무의미. "datasource 에 interval queryableField
   *   가 있으면 필수, 없으면 부재" 양방향 등치는 chartDescriptors.test 가 박제.
   */
  defaultInterval?: string;
  /**
   * 주기 pull 간격 직접 지정(ms, 옵션) — interval 없는 이벤트 datasource 용
   * (사이클 2 Step 6). 미지정 시 form 이 refreshMsForInterval(interval/2 비례) 사용.
   * 펀딩: 정산이 최빈 1h + collector 폴링 20분 → 60초 폴백은 순수 낭비라 10분.
   */
  defaultRefreshMs?: number;
}

// ─── 6 descriptor (history datasource 논리 id 와 1:1) ─────────────────────

const OPEN_INTEREST_HISTORY: ChartDescriptor = {
  kicker: "OPEN INTEREST",
  defaultTitle: "Open interest trend",
  valueField: "open_interest",
  timeField: "recorded_at",
  seriesStyle: "area", // 레벨(stock) 지표 — 면적이 규모 전달 (도메인 관례)
  // midline 없음 + 모노크롬 — OI 상승 ≠ 롱/숏 (방향색은 오정보, 헤더 참조)
  tone: "neutral",
  formatValue: formatAmount, // 축 tick 은 라벨 없는 수량 — 단위는 축 제목(아래)
  axisUnitLabel: (marketType) =>
    marketType === "futures_coinm" ? "contracts" : "base asset",
  defaultInterval: "1h",
};

const LSR_BASE = {
  timeField: "recorded_at",
  seriesStyle: "line" as const,
  midline: 1, // 롱숏 균형점 — 도메인 정석 (CoinGlass/Binance 공통)
  tone: "directional" as const, // >1 롱 우세 / <1 숏 우세 — "쏠림" 표시(신호 아님)
  formatValue: formatLSR,
  defaultInterval: "1h",
};

const TOP_LS_ACCOUNTS_HISTORY: ChartDescriptor = {
  ...LSR_BASE,
  kicker: "LONG/SHORT · TOP ACCOUNTS",
  defaultTitle: "Top trader L/S ratio (accounts)",
  valueField: "top_ls_ratio_accounts",
};

const TOP_LS_POSITIONS_HISTORY: ChartDescriptor = {
  ...LSR_BASE,
  kicker: "LONG/SHORT · TOP POSITIONS",
  defaultTitle: "Top trader L/S ratio (positions)",
  valueField: "top_ls_ratio_positions",
};

const GLOBAL_LS_HISTORY: ChartDescriptor = {
  ...LSR_BASE,
  kicker: "LONG/SHORT · GLOBAL",
  defaultTitle: "Global L/S ratio",
  valueField: "global_ls_ratio",
  // COINM 은 global 미제공 — null 구간은 gap 으로 (form 의 spanGaps:false 가 처리).
};

const TAKER_HISTORY: ChartDescriptor = {
  ...LSR_BASE,
  kicker: "TAKER BUY/SELL",
  defaultTitle: "Taker buy/sell ratio",
  valueField: "taker_buy_sell_ratio",
  // 체결 방향이라 방향색 정당 (LSR 보다 직접적) — LSR_BASE 의 directional 그대로.
};

const BASIS_HISTORY: ChartDescriptor = {
  kicker: "BASIS",
  defaultTitle: "Basis rate trend",
  valueField: "basis_rate", // USD 절대값 basis 는 가격 수준 비례라 주 플롯 부적합
  timeField: "recorded_at",
  seriesStyle: "line",
  midline: 0, // contango(>0) / backwardation(<0) 경계
  tone: "neutral", // carry 상태이지 상승/하락 압력 아님 — 모노크롬+0선이 안전
  formatValue: formatBasisRate,
  defaultInterval: "1h",
};

/**
 * 펀딩 정산 이벤트 (사이클 2 Step 6, crypto-domain 자문 2026-07-09):
 * - interval 개념 없음 — x축 = funding_time (정산 시각 그대로). 실제 간격은 8h/4h
 *   + cap/floor 도달 시 동적 1h — 데이터가 그대로 반영 (명목 주기로 재구성 금지).
 * - bars(부호색) = CoinGlass 관례 · 정산 1회 = 막대 1개가 가장 정직. 0 midline 필수
 *   (양수 = 롱이 숏에 지불 / 음수 = 반대). 오버레이는 form 이 stepped 전환.
 * - 값 포맷 = percent 5자리 (canonical §2.1). ★ 고정 "(8h)" 라벨 금지 — 실간격이
 *   혼재 가능해 오정보 (interval 라벨은 now 카드 전용). 정산 시각은 툴팁이 표시.
 */
const FUNDING_HISTORY: ChartDescriptor = {
  kicker: "FUNDING · SETTLED",
  defaultTitle: "Funding rate history",
  valueField: "funding_rate",
  timeField: "funding_time",
  seriesStyle: "bars",
  midline: 0, // 롱→숏 지불 / 숏→롱 지불 경계
  tone: "directional", // 부호 = 지불 방향 — 방향색 정당 (bars 부호색은 form 픽셀)
  formatValue: (v) => formatFundingRate(v), // interval 라벨 없는 5자리 % (의도적 생략)
  // defaultInterval 없음 — 이벤트 datasource (registry 에 interval 필드 자체가 없음).
  defaultRefreshMs: 600_000, // 10분 — 정산 최빈 1h + collector 20분 폴링에 정합
};

/**
 * datasource 논리 id → chart descriptor. key 집합 ≡ chart-card.dataShapes 등치는
 * 불변식 테스트로 박제됨 (chartDescriptors.test, tableDescriptors 동형).
 */
export const CHART_DESCRIPTORS: Record<string, ChartDescriptor> = {
  open_interest_history: OPEN_INTEREST_HISTORY,
  top_ls_ratio_accounts_history: TOP_LS_ACCOUNTS_HISTORY,
  top_ls_ratio_positions_history: TOP_LS_POSITIONS_HISTORY,
  global_ls_ratio_history: GLOBAL_LS_HISTORY,
  taker_long_short_history: TAKER_HISTORY,
  basis_history: BASIS_HISTORY,
  funding_history: FUNDING_HISTORY,
};

/** 표시 lookup — 미지원 datasource 는 undefined (렌더 게이트는 registry dataShapes). */
export function getChartDescriptor(
  datasource: string | undefined | null,
): ChartDescriptor | undefined {
  if (typeof datasource !== "string" || datasource.length === 0) return undefined;
  return CHART_DESCRIPTORS[datasource];
}

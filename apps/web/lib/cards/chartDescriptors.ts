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
  formatUsdCompact,
} from "@/lib/format/marketUnits";
import { liqSideLabel } from "@/lib/cards/liquidationSemantics";

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
  /**
   * 카드에 **상시 표시**할 데이터 한계 고지 ([10-84] M3-step3a, 2026-07-19).
   *
   * ★ 왜 AI subtitle 위임으로 충분하지 않은가: 피드는 낱장 사건을 보여줘 각 행이
   *   참이고 "전체"를 주장하지 않지만, **차트는 y축 자체가 "이 구간의 총액"을
   *   암시**한다. 같은 데이터라도 form 이 바뀌면 오독 위험이 올라간다
   *   (crypto-domain 판정 2026-07-19). AI 가 subtitle 에 고지를 빠뜨리는 부분
   *   실패가 여기선 대가가 크므로 시맨틱 레이어가 바닥선을 보장한다.
   * ★ form 하드코딩이 아님 — 어떤 datasource 가 고지를 갖는지는 descriptor 선언이고,
   *   ChartCard 는 "있으면 그린다"만 안다. 미래의 sampled 소스가 이 칸만 채우면 된다.
   */
  disclosure?: string;
  /**
   * "이 데이터 포인트가 불완전한가"를 세는 컬럼 (code-reviewer C2, 2026-07-19).
   *
   * ★ 왜 필요한가: 버킷의 값이 **전부** 결측이면 SUM 이 NULL → gap 으로 정직하게
   *   그려진다. 그런데 **일부만** 결측이면 SUM 이 나머지만 더해 **막대가 그려지되
   *   조용히 과소 표시**된다 — 화면에 아무 단서가 없다(2026-07-06 rollout 경계
   *   버킷, COINM contractSize 미보유 행, sanity 상한 초과 행에서 발현).
   *   이건 이 사이클이 DB 집계를 택한 이유(무증상 절단 회피)와 같은 종류의 결함이라
   *   방어 신호를 만들고 안 읽는 것으로 끝내면 안 된다.
   * ★ form 하드코딩 0 — 어떤 컬럼이 무결성 신호인지는 descriptor 가 선언하고,
   *   ChartCard 는 "선언돼 있으면 세어보고 고지를 승격"만 안다.
   */
  integrityField?: string;
  /**
   * 성분분해 계약 ([10-121] M3-step3b, 2026-07-20) — 4b dynamicColumns 의 차트판.
   *
   * 한 집계가 도메인 정의된 성분들(롱/숏 청산액 등)을 갖는 metric 만 선언한다.
   * 어느 형태를 그릴지는 AI 계약(`style.breakdown` + `filters side=`)에서 파생하고
   * (chart/plotSpec.resolvePlotSpecs — 큐레이션 0), 여기는 성분의 **의미**(컬럼·
   * 라벨·시장영향 방향·대향 배치)만 소유한다. `default` 는 AI 가 breakdown 을
   * 생략했을 때의 도메인 관례이며 AI 명시값을 절대 덮지 않는다(defaultInterval 동형).
   *
   * ★ "다이버징"은 여기 enum 값이 아니다 — invert(성분을 0 아래로 반전)를 선언하면
   *   form 이 대향 막대로 그린다. "stepped 가 enum 에 없고 form 이 자동 전환"과 동형.
   */
  breakdown?: {
    /** AI 생략 시 도메인 기본 — 청산 = "components"(롱:숏 비대칭이 진짜 신호). */
    default: "total" | "components";
    components: ReadonlyArray<{
      /** RPC 반환 실컬럼 (long_notional 등). */
      field: string;
      /** 범례/툴팁 라벨 — liquidationSemantics 등 시맨틱 단일 진실에서 파생. */
      label: string;
      /** 시장 영향 방향 → 색 (up=teal/down=vermilion — UI-3 2색 예외의 본래 용도). */
      direction: "up" | "down";
      /** true = 표시층에서 부호 반전(0 아래 대향). 값 자체는 불변 — 툴팁은 원값. */
      invert?: boolean;
    }>;
  };
  /**
   * 툴팁 보조 메타 ([10-120]⑥(b), 2026-07-20) — "N events" 병기용.
   * field 의 행 값을 시각별로 세어 툴팁 마지막 줄에 `{value} {noun}` 로 표시 —
   * sampled 하한이 "왜 하한인지"(몇 건을 합쳤는지)를 직관화. 단일 그룹일 때만
   * (오버레이는 그룹별 카운트 혼동 방지 — form 픽셀 정책).
   */
  tooltipMeta?: { field: string; noun: string };
  /**
   * disclosure 의 짧은형 ([10-120]⑥(a)) — 좁은 카드 truncate 대비. 지정 시 상시
   * 오버레이는 이걸 그리고 full 문구는 title(hover)로. 결론-우선 어순 유지.
   */
  disclosureShort?: string;
  /**
   * y축 tick 전용 포맷 ([10-120]⑥(c)) — 눈금 5~6개가 반복되는 축은 툴팁(전체
   * 자리)보다 짧은 표기가 읽기 좋다. 미지정 = formatValue 그대로.
   */
  formatAxisValue?: (value: number | null | undefined) => string;
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
 * y축 전용 USD compact — 눈금은 1자리(M/B)·정수(K)로 짧게 ([10-120]⑥(c)).
 * 툴팁/정밀 표시는 formatUsdCompact(2자리) 그대로 — 축만 시각 소음을 줄인다.
 * 부호는 보존(호출층이 대향 표시에서 abs 를 결정 — 포맷터는 값에 정직).
 */
function formatUsdCompactAxis(value: number | null | undefined): string {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * 청산 규모 시간버킷 집계 ([10-84] M3-step3a, 2026-07-19 — crypto-domain 판정):
 * - bars = 이산 버킷 집계의 정직한 형태(펀딩 정산과 동형). 구간 합계를 선으로
 *   이으면 "연속 변화"라는 없는 함의가 생긴다.
 * - valueField = `total_notional`: RPC 가 side 를 pushdown 하므로 `filters
 *   side=SELL` 이면 total ≡ 롱 청산액, `=BUY` 면 ≡ 숏, 생략이면 양쪽 합.
 * - ★ breakdown ([10-121] Phase 2, 2026-07-20): side·style 모두 생략 시 도메인
 *   기본 = **성분분해(다이버징)** — 청산의 진짜 신호는 절대량이 아니라 롱:숏
 *   비대칭의 전환이고, 두 카드를 따로 띄우면 y축 자동 스케일이 달라 "$30M vs $2M"
 *   이 비슷한 높이로 보인다(crypto-trader 판정 — 못 보는 것보다 나쁜 오독).
 *   라벨은 liqSideLabel(시맨틱 단일 진실) / direction 은 liqSideTone 과 동일 매핑
 *   (SELL=롱 청산=하락압력=down / BUY=숏 청산=상승압력=up — canonical §7.2).
 * - midline 은 total 모드에선 없음(금액 ≥ 0) — components 모드에서만 form 이 0
 *   대향 경계를 파생(원본 불변, style override 파생 선례 동형).
 *   tone=neutral: **총량은 그 자체로 방향이 아니다** (성분 색은 breakdown 소관).
 * - ★ disclosure 상시 표시 — sampled 하한임을 y축 옆에서 못박는다(아래 필드 주석).
 */
const LIQUIDATION_VOLUME_HISTORY: ChartDescriptor = {
  kicker: "LIQUIDATIONS",
  defaultTitle: "Liquidation volume",
  valueField: "total_notional",
  timeField: "bucket_time",
  seriesStyle: "bars",
  // midline 없음 (금액 ≥ 0) / 방향색 없음 (총량 = 무방향)
  tone: "neutral",
  formatValue: formatUsdCompact,
  formatAxisValue: formatUsdCompactAxis,
  defaultInterval: "1h", // ★ AI 생략 시에만 — 명시값은 절대 덮지 않는다
  breakdown: {
    default: "components", // 도메인 기본 = 롱·숏 대향 (M3-step3a Step 1 결정 3)
    components: [
      // SELL = 롱 포지션 강제청산 → 하락 압력(vermilion) → 위쪽 막대.
      { field: "long_notional", label: liqSideLabel("SELL"), direction: "down" },
      // BUY = 숏 포지션 강제청산 → 상승 압력(teal) → 0 아래 대향(invert).
      { field: "short_notional", label: liqSideLabel("BUY"), direction: "up", invert: true },
    ],
  },
  // sampled 하한이 "왜 하한인지"를 직관화 — 버킷이 몇 건을 합쳤는지 툴팁 병기.
  tooltipMeta: { field: "event_count", noun: "events" },
  // ★ 결론-우선 어순 (crypto-trader 자문 2026-07-19): 이 문구는 form 에서
  //   truncate 로 렌더된다 — 좁은 카드에서 뒤가 잘린다. 옛 어순("Sampled — Binance
  //   sends ≤1 … ; totals are a lower bound")은 잘렸을 때 **메커니즘 설명이 남고
  //   결론이 죽었다**. 유저의 행동을 바꾸는 단 하나의 정보는 "하한값"이다
  //   (제3자 집계와 나란히 놓고 "왜 우리 게 작지?" 할 때 필요한 답).
  disclosure: "Lower bound — sampled feed (≤1 largest liquidation per symbol per second).",
  // 짧은형 — 좁은 카드에서도 결론(하한·표본)이 살아남는다. full 은 title(hover).
  disclosureShort: "Lower bound · sampled feed",
  // 2026-07-06 notional rollout 이전 이벤트 + COINM contractSize 미보유 + sanity
  //   상한 초과 행이 여기 잡힌다. 부분 결측 버킷의 무음 과소 표시를 가시화.
  integrityField: "null_notional_count",
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
  liquidation_volume_history: LIQUIDATION_VOLUME_HISTORY,
};

/** 표시 lookup — 미지원 datasource 는 undefined (렌더 게이트는 registry dataShapes). */
export function getChartDescriptor(
  datasource: string | undefined | null,
): ChartDescriptor | undefined {
  if (typeof datasource !== "string" || datasource.length === 0) return undefined;
  return CHART_DESCRIPTORS[datasource];
}

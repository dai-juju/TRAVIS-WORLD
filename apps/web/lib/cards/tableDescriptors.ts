// apps/web/lib/cards/tableDescriptors.ts
//
// 모양-제네릭 TableCard 의 레시피(descriptor) 계약 — Composable Expressiveness Stage 1.
// 단일 진실: docs/task-record/M2-composable-expressiveness.md / Architecture.md §8 Form↔Data 직교.
//
// 역할:
//   하나의 모양-제네릭 Table(`set` shape 소비)이 AI 가 고른 datasource 에 따라
//   "식별 컬럼 + 데이터 컬럼 1~3개" 의 정렬 랭킹/스크리닝 표로 적응 렌더하도록 선언한다.
//   coin-list-card(티커 전용)와 indicator-list-card(지표 전용)를 하나로 수렴 — "표는
//   어떤 데이터든 받는다" 비전의 첫 실현. 컬럼/색/단위는 전부 이 레시피에서 파생하며
//   form(컴포넌트)은 데이터 필드명을 모른다.
//
// 설계 원칙 (CLAUDE.md / 자문 zod·nextjs 2026-06-29):
//   - "쿼리→컴포넌트 하드매핑" 아님 — AI 는 datasource description 으로 의도를 추론하고,
//     이 테이블은 그 datasource 의 **순수 표시 메타**(라벨/포맷/색/식별)일 뿐이다.
//   - columns[].key / labelColumn.key / rowKeyFields / flashColumn / defaultSort.field 는
//     해당 datasource 의 queryableFields 에 실존해야 한다 (registry↔표시계층 drift 차단,
//     테스트로 박제). 숫자 포맷은 marketUnits 헬퍼 경유 (사이트=DB 단위 일치).
//   - 색 계약(방향/농도 분리): descriptor 는 의미 신호(tone=방향, intensity=크기 0..1)만
//     반환하고, 색·불투명도 매핑(바닥값 포함)은 form 이 소유한다 → 미래 Heatmap 재사용.
//   - 단일 self-gate: 렌더 가능 판정의 권한 있는 진실은 registry dataShapes
//     (renderableDatasource.isDatasourceSupportedByComponent). 이 레시피 맵은 "어떻게
//     그릴지" 의 거울일 뿐 — 둘의 등치는 Step 3(table-card 등록 시) 불변식 테스트가 박제.
//
// Stage 1: TableCard(Step 2)가 이 레시피를 소비하고, table-card 가 양쪽 레지스트리에
//   등록됨(Step 3+4, 2026-06-30) — 라이브 경로. 옛 indicatorListDescriptors.ts 는 삭제됨.
//
// 색 정책: indicatorDescriptors.ts 와 동일 (signTone / midlineTone 재사용 — 단일 진실 원천).

import {
  asFuturesMarketType,
  basisQuoteForMarketType,
  midlineTone,
  signTone,
  type IndicatorRow,
  type MetricTone,
} from "@/lib/cards/indicatorDescriptors";
import {
  liqNotionalIntensity,
  liqSideLabel,
  liqSideTone,
} from "@/lib/cards/liquidationSemantics";
import {
  formatAmount,
  formatBasis,
  formatBasisRate,
  formatCountdown,
  formatEventTime,
  formatFundingRate,
  formatLSR,
  formatOI,
  formatPct,
  formatPrice,
  formatUsdCompact,
} from "@/lib/format/marketUnits";

/** 표 form 이 다루는 최소 행 — 식별 3축 + 임의 metric 컬럼(`set` shape 의 한 행). */
export type TableRow = {
  exchange: string;
  market_type: string;
  symbol: string;
} & Record<string, unknown>;

/** now_{spot|futures}_ticker row 의 최소 스키마 (티커 descriptor 의 value 함수 전용). */
type TickerRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  last_price: number | null;
  price_change_pct: number | null;
} & Record<string, unknown>;

/** history_futures_liquidation row 의 최소 스키마 (청산 표 descriptor 전용). */
type LiquidationTableRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  side: string;
  trade_time: string;
  notional: number | null;
} & Record<string, unknown>;

/** 데이터 컬럼 1개 (선두 식별 컬럼 제외). */
export interface TableColumn<Row extends TableRow = TableRow> {
  /**
   * datasource queryableFields 실존 컬럼 — 정렬키 후보이자 flash 비교 대상.
   * 반드시 해당 datasource 의 queryableFields 에 등록된 이름 (테스트 박제).
   */
  key: string;
  /** 좁은 컬럼 헤더 (대문자 약어, 예: "FUNDING" / "24H %"). */
  header: string;
  /**
   * 가상 스크롤(grid) 경로 전용 컬럼 폭 (예: "6rem"). <table> 경로는 무시(auto-size).
   * 가변 컬럼 수에서 grid-template-columns 조립용 — 미지정 시 form 이 "auto" fallback.
   */
  width?: string;
  /** row → 표시 문자열 (순수 함수, marketUnits 헬퍼 경유). */
  value: (row: Row) => string;
  /** 의미상 "방향" → form 이 색으로 매핑. 미지정=neutral. */
  tone?: (row: Row) => MetricTone;
  /**
   * 의미상 "크기" 0..1 → form 이 불투명도로 매핑. 미지정=1(풀 불투명).
   * 정규화(데이터 스케일)는 여기서, opacity 바닥/범위는 form 이 소유(직교 — Heatmap 재사용).
   */
  intensity?: (row: Row) => number;
}

export interface TableDescriptor<Row extends TableRow = TableRow> {
  /** 카드 상단 kicker (대문자 메타 태그). */
  kicker: string;
  /** config.title 미지정 시 기본 타이틀. */
  defaultTitle: string;
  /**
   * 선두 식별/라벨 컬럼 — "이 행이 무엇인가" (symbol 특수처리 제거, 미래 비-티커 set
   * 일반화). key 는 queryableFields 실존 (기본 symbol — COMMON_QUERYABLE_FIELDS 공통).
   */
  labelColumn: { key: string; header: string };
  /**
   * React 재조정 / FLIP / 가상화 key 조립 필드 — 표시(labelColumn)와 분리한다.
   * ★ symbol 단독 금지: 혼합 market_type(spot/futures 같은 BTCUSDT)에서 같은 symbol
   *   문자열 충돌 → key 충돌 → FLIP 깜빡임/오재조정. 복합키 필수 (테마 B 교훈).
   *   각 필드는 queryableFields 실존.
   */
  rowKeyFields: readonly string[];
  /**
   * AI 가 sort 를 생략했을 때의 기본 정렬 — "top OI" 처럼 정렬 의도가 암묵적인
   * 쿼리에서도 의미 있는 랭킹을 보장. field 는 queryableFields 의 sortable 컬럼.
   */
  defaultSort?: { field: string; direction: "asc" | "desc" };
  /**
   * 행 flash 를 유발하는 컬럼. 지정 시 그 값 변동에 flash(티커=last_price 가격 박동),
   * 생략 시 활성 sort field 로 fallback(지표=랭킹 신호). 다중 flash 는 YAGNI.
   */
  flashColumn?: string;
  /**
   * subtitle 분모의 행 단위 명사 (기본 "symbols"). 심볼-스냅샷이 아닌 set
   * (청산=events, 미래 뉴스=stories 등)이 "N of M symbols" 오표기를 피하게 한다.
   */
  countNoun?: string;
  /** 데이터 컬럼들 (1~3개 — 좁은 카드 폭 기준. dynamicColumns 사용 시 [] 허용). */
  columns: TableColumn<Row>[];
  /**
   * (사이클 4b [10-102](a), 2026-07-12 — **통합 스크리너 1곳 한정 기능**, 전역
   * TableCard 능력 아님) AI 계약의 filters/sort 가 참조한 필드에서 표시 컬럼을
   * 파생한다 — "내가 필터 건 숫자가 곧 화면에 뜬다"(crypto-trader). ★ 큐레이션
   * 아님: 무엇을 보여줄지는 AI 계약이 결정, 여기는 참조→컬럼 번역만. 반환 [] =
   * 참조 metric 없음 → form 이 graceful 안내(기본 컬럼 폴백 금지 —
   * feedback_card_default_overrides_ai_intent, 사용자 재강조 2026-07-12).
   */
  dynamicColumns?: (binding: DynamicColumnsBinding) => TableColumn<Row>[];
}

/** dynamicColumns 입력 — AI 계약(config.data)의 참조 필드 축만 (구조적 최소 계약). */
export interface DynamicColumnsBinding {
  filters?: ReadonlyArray<{ field: string }>;
  sort?: { field: string } | undefined;
}

/**
 * 이 표 form 이 소비하는 shape — 'set'(여러 대상 × 필드 스냅샷).
 *
 * ★ Stage 2 Step 1 반영 (2026-07-08): registry 에 `DatasourceEntry.servableShapes`(복수)
 *   + `ComponentEntry.acceptsShapes` 가 신설됐고, 이 상수는 table-card 의
 *   acceptsShapes=['set'] 와 **등치 불변식 테스트로 동기**된다 (cross-package 라
 *   collapse 대신 테스트 동기). 렌더/스키마 게이트는 **dataShapes 멤버십 유지** —
 *   순수 shape 게이트로 바꾸면 descriptor 팩 없는 새 set datasource 가 새어 빈 표가
 *   된다(F3 재발). shape 는 그 위의 호환성 불변식 레이어다 (zod 자문 2026-07-08,
 *   shared/registries/shapeCompat.ts 헤더 참조).
 */
export const TABLE_CONSUMES_SHAPE = "set" as const;

// ─── 공통 상수 (심볼-스냅샷 7 datasource 는 거래소:시장:심볼 키 — 청산(8번째)만
//     사건 행이라 [...PK_FIELDS, trade_time, recorded_at] 증강 키 사용, W2 정정) ──────────
const SYMBOL_LABEL = { key: "symbol", header: "SYMBOL" } as const;
const PK_FIELDS = ["exchange", "market_type", "symbol"] as const;

/**
 * descriptor 를 자기 row 타입으로 안전 저작한 뒤, 이종 row 레지스트리
 * (Record<string, TableDescriptor>)에 담기 위해 base 로 1회 erase 한다.
 * 런타임엔 form 이 항상 매칭 datasource 의 row 만 넘기므로 건전
 * (authoring-time 타입 안전 + boundary 에서만 erasure, 캐스트 1곳에 격리).
 */
function defineTable<Row extends TableRow>(
  d: TableDescriptor<Row>,
): TableDescriptor {
  return d as unknown as TableDescriptor;
}

// ─── 티커 descriptor (CoinListCard 의 하드코딩 색농도를 레시피로 외부화) ──────
//   now_spot_ticker + now_futures_ticker 두 datasource 공유 (동일 컬럼/색 정책).
//   ★ 0.00%·null 변화율은 signTone 으로 neutral(회색) — 기존 CoinListCard 의 ">=0=teal"
//     대비 0 의 방향 의미를 바로잡은 의도적 미세 개선 (G2 에서 고지).
const TICKER_DESCRIPTOR: TableDescriptor = defineTable<TickerRow>({
  kicker: "MARKET BOARD",
  defaultTitle: "Market board",
  labelColumn: SYMBOL_LABEL,
  rowKeyFields: PK_FIELDS,
  // 기본 정렬: 24h 변동률 내림차순 — "지금 뜨거운 코인 위로".
  defaultSort: { field: "price_change_pct", direction: "desc" },
  // 표시 개수는 descriptor 가 강제하지 않는다 — AI 가 결정(생략=전부 · 숫자=그 수).
  //   카드 기본 cap 금지(하드코딩 금지, 사용자 결정 2026-06-30 defaultLimit 필드 제거). 티커·지표 동일.
  flashColumn: "last_price", // sort(pct)와 독립한 가격 박동
  columns: [
    {
      key: "last_price",
      header: "PRICE",
      width: "6rem",
      // != null: 제네릭 row(& Record<string, unknown>)라 키 누락(undefined) 가능 →
      //   null·undefined 둘 다 "—" graceful (일반화로 약해진 입력 보장 방어, code-reviewer W2).
      value: (r) =>
        r.last_price != null ? `$${formatPrice(r.last_price)}` : "—",
    },
    {
      key: "price_change_pct",
      header: "24H %",
      width: "4.5rem",
      value: (r) => formatPct(r.price_change_pct ?? 0),
      tone: (r) => signTone(r.price_change_pct),
      // 데이터 스케일 정규화 — |pct| 가 10% 면 포화(1.0). opacity 바닥/범위는 form 소유.
      intensity: (r) => Math.min(1, Math.abs(r.price_change_pct ?? 0) / 10),
    },
  ],
});

// ─── 통합 스크리너 컬럼 카탈로그 (사이클 4b [10-102](a), 2026-07-12) ──────────
//
// futures_indicators(27 값필드)의 표시 메타 전체 — dynamicColumns 가 AI 의
// filters/sort 참조 필드를 여기서 lookup 해 컬럼을 파생한다. ★ 큐레이션 아님:
// "무엇을 보여줄지"는 AI 계약(filters/sort)이 결정하고 이 카탈로그는 "어떻게
// 그릴지"(포맷/색/폭)만 소유 (CLAUDE.md §카드 기본값·폴백 큐레이션 금지).
// 포맷터/tone 은 family descriptor 와 같은 marketUnits/indicatorDescriptors 헬퍼
// 재사용 = 단위·자릿수 site=DB 정합 유지. 카탈로그 key ≡ registry 값필드 27종
// 등치는 tableDescriptors.test 불변식이 박제.

/** 제네릭 row 에서 숫자 필드 안전 추출 — 비숫자/누락은 null(포맷터가 "—" 처리). */
function num(row: IndicatorRow, key: string): number | null {
  const v = (row as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

/** 0..1 분수 → % 표시 (예: 0.62 → "+62.00%"): 분수 필드는 필터 술어 그대로 표시. */
function formatFraction(value: number | null): string {
  return formatPct(value == null ? null : value * 100);
}

/** 식별/스코프 축 — 값 컬럼이 아니므로 dynamicColumns 파생에서 제외. */
const SCREENER_EXCLUDED_KEYS = new Set(["exchange", "market_type", "symbol"]);
/** 카드 폭 물리 상한 (기존 표 1~3 + 여유 1) — 표시만 자름, 필터링은 전 필드 적용. */
const SCREENER_MAX_COLUMNS = 4;

export const SCREENER_COLUMN_CATALOG: Record<string, TableColumn<IndicatorRow>> = {
  // ── 마크/펀딩 family ──
  mark_price: {
    key: "mark_price", header: "MARK", width: "6rem",
    value: (r) => formatPrice(num(r, "mark_price")),
  },
  index_price: {
    key: "index_price", header: "INDEX", width: "6rem",
    value: (r) => formatPrice(num(r, "index_price")),
  },
  estimated_settle_price: {
    key: "estimated_settle_price", header: "EST SETTLE", width: "6rem",
    value: (r) => formatPrice(num(r, "estimated_settle_price")),
  },
  predicted_funding_rate: {
    key: "predicted_funding_rate", header: "FUNDING", width: "6rem",
    value: (r) => formatFundingRate(num(r, "predicted_funding_rate")),
    tone: (r) => signTone(num(r, "predicted_funding_rate")),
  },
  last_settled_funding_rate: {
    key: "last_settled_funding_rate", header: "SETTLED", width: "6rem",
    value: (r) => formatFundingRate(num(r, "last_settled_funding_rate")),
    tone: (r) => signTone(num(r, "last_settled_funding_rate")),
  },
  last_settled_funding_time: {
    key: "last_settled_funding_time", header: "SETTLED AT", width: "5rem",
    value: (r) => formatEventTime(num(r, "last_settled_funding_time")),
  },
  interest_rate: {
    key: "interest_rate", header: "INT RATE", width: "5.5rem",
    value: (r) => formatFundingRate(num(r, "interest_rate")),
  },
  next_funding_time: {
    key: "next_funding_time", header: "NEXT", width: "5rem",
    value: (r) => formatCountdown(num(r, "next_funding_time")),
  },
  // ── basis family ──
  basis: {
    key: "basis", header: "BASIS", width: "5.5rem",
    value: (r) => formatBasis(num(r, "basis"), basisQuoteForMarketType(r.market_type)),
    tone: (r) => signTone(num(r, "basis")),
  },
  basis_rate: {
    key: "basis_rate", header: "BASIS %", width: "5.5rem",
    value: (r) => formatBasisRate(num(r, "basis_rate")),
    tone: (r) => signTone(num(r, "basis_rate")),
  },
  // ── OI family ──
  open_interest: {
    key: "open_interest", header: "OI", width: "9rem",
    value: (r) => formatOI(num(r, "open_interest"), asFuturesMarketType(r.market_type)),
  },
  oi_chg_5m: {
    key: "oi_chg_5m", header: "ΔOI 5M", width: "5rem",
    value: (r) => formatPct(num(r, "oi_chg_5m")),
    tone: (r) => signTone(num(r, "oi_chg_5m")),
  },
  oi_chg_15m: {
    key: "oi_chg_15m", header: "ΔOI 15M", width: "5rem",
    value: (r) => formatPct(num(r, "oi_chg_15m")),
    tone: (r) => signTone(num(r, "oi_chg_15m")),
  },
  oi_chg_1h: {
    key: "oi_chg_1h", header: "ΔOI 1H", width: "5rem",
    value: (r) => formatPct(num(r, "oi_chg_1h")),
    tone: (r) => signTone(num(r, "oi_chg_1h")),
  },
  oi_chg_4h: {
    key: "oi_chg_4h", header: "ΔOI 4H", width: "5rem",
    value: (r) => formatPct(num(r, "oi_chg_4h")),
    tone: (r) => signTone(num(r, "oi_chg_4h")),
  },
  // ── LSR family (비율 = 1.0 균형 midline / 분수 0..1 = % 표시 — 필터 술어 그대로) ──
  top_ls_ratio_accounts: {
    key: "top_ls_ratio_accounts", header: "TOP ACC", width: "4.5rem",
    value: (r) => formatLSR(num(r, "top_ls_ratio_accounts")),
    tone: (r) => midlineTone(num(r, "top_ls_ratio_accounts")),
  },
  top_long_account: {
    key: "top_long_account", header: "TOP LONG %", width: "5rem",
    value: (r) => formatFraction(num(r, "top_long_account")),
  },
  top_short_account: {
    key: "top_short_account", header: "TOP SHORT %", width: "5.5rem",
    value: (r) => formatFraction(num(r, "top_short_account")),
  },
  top_ls_ratio_positions: {
    key: "top_ls_ratio_positions", header: "TOP POS", width: "4.5rem",
    value: (r) => formatLSR(num(r, "top_ls_ratio_positions")),
    tone: (r) => midlineTone(num(r, "top_ls_ratio_positions")),
  },
  top_long_position: {
    key: "top_long_position", header: "POS LONG %", width: "5rem",
    value: (r) => formatFraction(num(r, "top_long_position")),
  },
  top_short_position: {
    key: "top_short_position", header: "POS SHORT %", width: "5.5rem",
    value: (r) => formatFraction(num(r, "top_short_position")),
  },
  global_ls_ratio: {
    key: "global_ls_ratio", header: "GLOBAL", width: "4.5rem",
    value: (r) => formatLSR(num(r, "global_ls_ratio")),
    tone: (r) => midlineTone(num(r, "global_ls_ratio")),
  },
  global_long_account: {
    key: "global_long_account", header: "GLB LONG %", width: "5rem",
    value: (r) => formatFraction(num(r, "global_long_account")),
  },
  global_short_account: {
    key: "global_short_account", header: "GLB SHORT %", width: "5.5rem",
    value: (r) => formatFraction(num(r, "global_short_account")),
  },
  // ── taker family ──
  taker_buy_sell_ratio: {
    key: "taker_buy_sell_ratio", header: "B/S RATIO", width: "5rem",
    value: (r) => formatLSR(num(r, "taker_buy_sell_ratio")),
    tone: (r) => midlineTone(num(r, "taker_buy_sell_ratio")),
  },
  taker_buy_vol: {
    key: "taker_buy_vol", header: "BUY VOL", width: "7rem",
    value: (r) => formatAmount(num(r, "taker_buy_vol")),
  },
  taker_sell_vol: {
    key: "taker_sell_vol", header: "SELL VOL", width: "7rem",
    value: (r) => formatAmount(num(r, "taker_sell_vol")),
  },
};

// ─── descriptor 테이블 ────────────────────────────────
//   지표 5종(옛 indicatorListDescriptors 에서 이관 + 식별/가상화폭 보강) + 티커 2종.
//   Step 4(2026-06-30)에서 옛 indicatorListDescriptors.ts + IndicatorListCard 삭제 — 이
//   파일이 표 form 의 단일 descriptor 진실 ([10-74] 3중 중복 → indicatorDescriptors 와 2중).

/**
 * datasource 논리 id → 모양-제네릭 표 descriptor.
 * (Step 3 에서 table-card.dataShapes 와 key 집합 등치를 불변식 테스트로 박제.)
 */
export const TABLE_DESCRIPTORS: Record<string, TableDescriptor> = {
  // ── 펀딩 랭킹 — "highest/lowest funding" ──
  premium_index: defineTable<IndicatorRow>({
    kicker: "FUNDING RANKING",
    defaultTitle: "Funding Rates",
    labelColumn: SYMBOL_LABEL,
    rowKeyFields: PK_FIELDS,
    defaultSort: { field: "predicted_funding_rate", direction: "desc" },
    columns: [
      {
        key: "predicted_funding_rate",
        header: "FUNDING",
        width: "6rem",
        value: (r) => formatFundingRate(r.predicted_funding_rate),
        tone: (r) => signTone(r.predicted_funding_rate),
      },
      {
        key: "mark_price",
        header: "MARK",
        width: "6rem",
        value: (r) => formatPrice(r.mark_price),
      },
      {
        key: "next_funding_time",
        header: "NEXT",
        width: "5rem",
        value: (r) => formatCountdown(r.next_funding_time),
      },
    ],
  }),

  // ── Basis 랭킹 — contango/backwardation 스캔 ──
  basis: defineTable<IndicatorRow>({
    kicker: "BASIS RANKING",
    defaultTitle: "Basis",
    labelColumn: SYMBOL_LABEL,
    rowKeyFields: PK_FIELDS,
    defaultSort: { field: "basis_rate", direction: "desc" },
    columns: [
      {
        key: "basis_rate",
        header: "BASIS %",
        width: "5.5rem",
        value: (r) => formatBasisRate(r.basis_rate),
        tone: (r) => signTone(r.basis_rate),
      },
      {
        key: "basis",
        header: "BASIS",
        width: "5.5rem",
        value: (r) => formatBasis(r.basis, basisQuoteForMarketType(r.market_type)),
        tone: (r) => signTone(r.basis),
      },
    ],
  }),

  // ── OI 랭킹 — "top open interest" (사용자 1순위 메트릭) ──
  open_interest: defineTable<IndicatorRow>({
    kicker: "OPEN INTEREST RANKING",
    defaultTitle: "Open Interest",
    labelColumn: SYMBOL_LABEL,
    rowKeyFields: PK_FIELDS,
    defaultSort: { field: "open_interest", direction: "desc" },
    columns: [
      {
        key: "open_interest",
        header: "OI",
        // COINM "contracts" 접미사 포함 폭 (USDM base 수량보다 넓음, 가상화 정렬용 [10-75]).
        //   9rem = "200,000,000 contracts" 급 대형 COINM 수용 (code-reviewer S1, 라이브 미세조정 여지).
        width: "9rem",
        // USDM=base 수량 / COINM=계약수 — 혼합 정렬 왜곡은 component description 의
        // market_type 필터 가이드로 방지 (카드 하드코딩 아님).
        value: (r) => formatOI(r.open_interest, asFuturesMarketType(r.market_type)),
      },
      {
        key: "oi_chg_1h",
        header: "ΔOI 1H",
        width: "5rem",
        value: (r) => formatPct(r.oi_chg_1h),
        tone: (r) => signTone(r.oi_chg_1h),
      },
    ],
  }),

  // ── LSR 랭킹 — 쏠림 스캔 ──
  long_short_ratio: defineTable<IndicatorRow>({
    kicker: "LONG / SHORT RANKING",
    defaultTitle: "Long/Short Ratio",
    labelColumn: SYMBOL_LABEL,
    rowKeyFields: PK_FIELDS,
    defaultSort: { field: "top_ls_ratio_accounts", direction: "desc" },
    columns: [
      {
        key: "top_ls_ratio_accounts",
        header: "TOP ACC",
        width: "4.5rem",
        value: (r) => formatLSR(r.top_ls_ratio_accounts),
        tone: (r) => midlineTone(r.top_ls_ratio_accounts),
      },
      {
        key: "top_ls_ratio_positions",
        header: "TOP POS",
        width: "4.5rem",
        value: (r) => formatLSR(r.top_ls_ratio_positions),
        tone: (r) => midlineTone(r.top_ls_ratio_positions),
      },
      {
        key: "global_ls_ratio",
        header: "GLOBAL",
        width: "4.5rem",
        value: (r) => formatLSR(r.global_ls_ratio),
        tone: (r) => midlineTone(r.global_ls_ratio),
      },
    ],
  }),

  // ── Taker 랭킹 — 공격적 체결 우위 스캔 ──
  taker_long_short: defineTable<IndicatorRow>({
    kicker: "TAKER BUY/SELL RANKING",
    defaultTitle: "Taker Buy/Sell",
    labelColumn: SYMBOL_LABEL,
    rowKeyFields: PK_FIELDS,
    defaultSort: { field: "taker_buy_sell_ratio", direction: "desc" },
    columns: [
      {
        key: "taker_buy_sell_ratio",
        header: "B/S RATIO",
        width: "5rem",
        value: (r) => formatLSR(r.taker_buy_sell_ratio),
        tone: (r) => midlineTone(r.taker_buy_sell_ratio),
      },
      {
        key: "taker_buy_vol",
        header: "BUY VOL",
        width: "7rem",
        value: (r) => formatAmount(r.taker_buy_vol),
      },
    ],
  }),

  // ── 통합 선물 지표 스크리너 — 크로스 family 필터/정렬 (사이클 4b, 2026-07-12) ──
  //   컬럼은 정적 큐레이션 없이 dynamicColumns 가 AI 의 filters/sort 참조에서 파생.
  //   defaultSort 도 없음 — 크로스 스크리너의 정렬·표시는 전부 AI 계약 소유.
  futures_indicators: defineTable<IndicatorRow>({
    kicker: "FUTURES SCREENER",
    defaultTitle: "Futures Screener",
    labelColumn: SYMBOL_LABEL,
    rowKeyFields: PK_FIELDS,
    columns: [], // 정적 컬럼 없음 — dynamicColumns 가 유일 공급원 (큐레이션 금지)
    dynamicColumns: ({ filters, sort }) => {
      // 순서 = sort 먼저(랭킹 세로 검증 스캔과 일치 — crypto-trader/사용자 확정
      //   2026-07-12) → 나머지 filters 등장순. 식별/스코프 축은 값 컬럼이 아니라 제외.
      const ordered: string[] = [];
      if (sort?.field) ordered.push(sort.field);
      for (const f of filters ?? []) ordered.push(f.field);
      const seen = new Set<string>();
      const cols: TableColumn<IndicatorRow>[] = [];
      for (const key of ordered) {
        if (seen.has(key) || SCREENER_EXCLUDED_KEYS.has(key)) continue;
        seen.add(key);
        const col = SCREENER_COLUMN_CATALOG[key];
        if (!col) continue; // 미지 필드 graceful (스키마 화이트리스트가 1차 차단)
        cols.push(col);
        // 카드 폭 물리 상한 — 표시만 자름(필터/정렬 자체는 전 필드 온전 적용).
        if (cols.length >= SCREENER_MAX_COLUMNS) break;
      }
      return cols;
    },
  }),

  // ── 티커 2종 (동일 descriptor 공유) ──
  now_spot_ticker: TICKER_DESCRIPTOR,
  now_futures_ticker: TICKER_DESCRIPTOR,

  // ── 청산 이벤트 표 — "recent/biggest liquidations" (ff#2 재개 Step 4, 2026-07-05) ──
  //   같은 청산 데이터의 다른 모양: Feed(흐름 지켜보기, events) vs Table(범위·정렬 질의,
  //   set) — AI 가 의도로 form 을 자율 선택 (Form↔Data 직교의 실증).
  //   데이터원 = history_futures_liquidation (초기 SELECT + Realtime INSERT 구독 =
  //   기존 테이블 훅 그대로 라이브, publication 추가 마이그레이션 20260705000002).
  //   notional null(2026-07 rollout 이전 행)은 "—" graceful. side 도메인 결정은
  //   feedDescriptors 청산 팩과 동일 (SELL=LONG LIQ down / BUY=SHORT LIQ up).
  liquidation: defineTable<LiquidationTableRow>({
    kicker: "LIQUIDATIONS",
    defaultTitle: "Liquidations",
    labelColumn: SYMBOL_LABEL,
    // 이벤트 행 식별 — 심볼 3축 + 시각 2축(같은 ms 동일 심볼 재청산 희귀 충돌까지 완화).
    rowKeyFields: [...PK_FIELDS, "trade_time", "recorded_at"],
    // 기본 = 최신순 (ISO 문자열 비교 = 시간순, compareByField 문자열 경로).
    defaultSort: { field: "trade_time", direction: "desc" },
    countNoun: "events",
    columns: [
      {
        key: "trade_time",
        header: "TIME",
        width: "5rem",
        value: (r) => formatEventTime(r.trade_time),
      },
      {
        key: "side",
        header: "SIDE",
        width: "5.5rem",
        // 라벨/색 = liquidationSemantics 단일 진실 (Feed 와 공유 — 드리프트 구조적 차단).
        value: (r) => liqSideLabel(r.side),
        tone: (r) => liqSideTone(r.side),
      },
      {
        key: "notional",
        header: "VALUE",
        width: "4.5rem",
        value: (r) => formatUsdCompact(r.notional),
        intensity: (r) => liqNotionalIntensity(r.notional),
      },
    ],
  }),
};

/**
 * datasource 의 표 descriptor 조회 (render-detail lookup).
 * ⚠️ 렌더 가능 판정의 권한 있는 게이트는 registry dataShapes
 * (renderableDatasource.isDatasourceSupportedByComponent) — 이 함수는 그 거울이며,
 * Step 3 불변식 테스트가 둘의 등치를 박제한다 (coming-soon drift 차단).
 */
export function getTableDescriptor(
  datasource: string | undefined | null,
): TableDescriptor | undefined {
  if (typeof datasource !== "string") return undefined;
  return TABLE_DESCRIPTORS[datasource];
}

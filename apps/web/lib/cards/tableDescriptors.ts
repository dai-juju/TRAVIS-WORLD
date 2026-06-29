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
  /** 데이터 컬럼들 (1~3개 — 좁은 카드 폭 기준). */
  columns: TableColumn<Row>[];
}

/**
 * 이 표 form 이 소비하는 shape — 'set'(여러 대상 × 필드 스냅샷).
 * Stage 2: 이 상수가 component.acceptsShapes=['set'] 로 승격되고, 렌더/스키마 게이트가
 *   "datasource ∈ component.dataShapes" → "datasource.shape ∈ acceptsShapes" 로 이동한다.
 * 지금 per-datasource `shape:'set'` 태그를 레시피에 박지 않는 이유: Stage 2 에서 shape 의
 *   정당한 거처가 DatasourceEntry.shape 라 N개 삭제 재작업이 됨 (zod 자문 2026-06-29).
 */
export const TABLE_CONSUMES_SHAPE = "set" as const;

// ─── 공통 상수 (현행 7 set datasource 가 전부 거래소:시장:심볼 키) ──────────
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

  // ── 티커 2종 (동일 descriptor 공유) ──
  now_spot_ticker: TICKER_DESCRIPTOR,
  now_futures_ticker: TICKER_DESCRIPTOR,
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

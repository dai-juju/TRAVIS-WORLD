// apps/web/lib/cards/recordDescriptors.ts
//
// 모양-제네릭 단일-record form(BigValue/Detail)의 레시피(descriptor) 계약 —
// Composable Expressiveness Stage 1b (2026-07-14).
// 단일 진실: docs/task-record/M2-cycle5-stage1b.md / Architecture.md §8 Form↔Data 직교.
//
// 역할:
//   `record` shape(한 대상의 여러 필드 스냅샷)를 소비하는 두 form —
//   BigValue(대표값 강조) / Detail(전 필드 리스트) — 이 AI 가 고른 datasource 에
//   따라 적응 렌더하도록 "이 datasource 의 필드들을 어떤 라벨/단위/색/중요도로
//   보여주는가" 를 선언한다. ticker-card(티커 전용)와 indicator-card(지표 전용)를
//   이 계약 하나로 수렴 — [10-74](단일심볼 descriptor 이중화) 회수.
//
// ★ form 별 맵 금지 (datasource 당 1 pack):
//   BigValue 용/Detail 용 descriptor 를 각각 만들면 [10-74] 가 3중으로 되돌아간다.
//   대신 필드마다 `role`(의미상 중요도)을 태깅하고 두 form 이 같은 pack 을 다르게
//   소비한다 — BigValue 는 primary/badge/secondary 만, Detail 은 전 필드.
//
// role 소비 규약 (form 소유 픽셀의 "의미" 입력일 뿐, 렌더 힌트 아님):
//   | role      | Detail            | BigValue                          |
//   |-----------|-------------------|-----------------------------------|
//   | primary   | 큰 metric 줄       | huge 값 (+ flashField 변동 flash)  |
//   | badge     | 일반 줄            | 테두리 뱃지 (표시문자열 변경 flash)  |
//   | secondary | 일반 줄            | 하단 mono 보조 라인                 |
//   | detail    | 일반 줄            | 표시 안 함                          |
//
// 설계 원칙 (CLAUDE.md / tableDescriptors 계약과 동형):
//   - "쿼리→컴포넌트 하드매핑" 아님 — AI 는 datasource/component description 으로
//     의도를 추론하고, 이 테이블은 그 datasource 의 **순수 표시 메타**일 뿐이다.
//   - fields[].key / watchColumns / flashField 는 해당 datasource 의 queryableFields
//     에 실존해야 한다 (registry↔표시계층 drift 차단, 테스트로 박제). 숫자 포맷은
//     marketUnits 헬퍼 경유 (사이트=DB 단위 일치).
//   - 색 계약: descriptor 는 의미 신호(tone=방향, intensity=크기 0..1)만 반환하고
//     실제 색/불투명도는 form 이 소유 (tone/intensity 직교 — tableDescriptors 동일).
//   - role 은 "이 datasource 에서 무엇이 headline 인가"라는 데이터 의미까지만 —
//     그것을 몇 px 로 어떤 뱃지로 그릴지는 form 소유 (계약 오염 금지).
//   - 단일 self-gate: 렌더 가능 판정의 권한 있는 진실은 registry dataShapes
//     (renderableDatasource.isDatasourceSupportedByComponent). 이 맵은 "어떻게
//     그릴지" 의 거울 — 등치는 Step 4(두 form 등록 시) 불변식 테스트가 박제.
//
// 색 정책: marketSemantics.ts (signTone / midlineTone — 단일 진실 원천).
// 단위 근거: docs/canonical-metrics.md §2 (각 metric 정의 + 헬퍼 매핑).

import {
  asFuturesMarketType,
  basisQuoteForMarketType,
  midlineTone,
  signTone,
  type IndicatorRow,
  type MetricTone,
} from "@/lib/cards/marketSemantics";
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
  marketTypeLabel,
} from "@/lib/format/marketUnits";
import type { SymbolMeta } from "@/lib/hooks/useSymbolMeta";

/** 단일-record form 이 다루는 최소 행 — 식별 3축 + freshness + 임의 metric 필드. */
export type RecordRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  updated_at: string;
} & Record<string, unknown>;

/** now_{spot|futures}_ticker row 의 최소 스키마 (티커 pack 의 value 함수 전용). */
type TickerRecordRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  last_price: number | null;
  price_change_pct: number | null;
  high_price: number | null;
  low_price: number | null;
  volume_chg_5m: number | null;
  open_price: number | null;
  weighted_avg_price: number | null;
  quote_volume: number | null;
  volume: number | null;
  trade_count: number | null;
  price_chg_1h: number | null;
  updated_at: string;
} & Record<string, unknown>;

/**
 * 필드의 의미상 중요도 — form 이 픽셀로 번역한다 (tone/intensity 와 같은 의미-신호 계층).
 * 기본값(미지정) = "detail".
 */
export type RecordFieldRole = "primary" | "badge" | "secondary" | "detail";

/** record 의 표시 필드 1개. */
export interface RecordField<Row extends RecordRow = RecordRow> {
  /**
   * datasource queryableFields 실존 컬럼 (테스트 박제). value 가 보조 컬럼을 함께
   * 읽더라도(예: 24h range 가 low+high) 대표 1개를 key 로 삼는다.
   */
  key: string;
  /** 표시 라벨 (예: "Funding (predicted)"). pack 안에서 유일해야 한다 (React key). */
  label: string;
  /** (row, 심볼메타?) → 표시 문자열 (marketUnits 헬퍼 경유). meta 는 옵션 보강. */
  value: (row: Row, meta?: SymbolMeta | null) => string;
  /** 의미상 "방향" → form 이 색으로 매핑. 미지정=neutral. */
  tone?: (row: Row) => MetricTone;
  /**
   * 의미상 "크기" 0..1 → form 이 불투명도 등으로 매핑. 미지정=1(풀 강도).
   * (tableDescriptors 와 계약 동형 — 현 pack 은 미사용, 미래 강도 표현 대비.)
   */
  intensity?: (row: Row) => number;
  /** 의미상 중요도 — role 소비 규약(파일 헤더) 참조. 미지정="detail". */
  role?: RecordFieldRole;
  /** 값 옆 보조 뱃지 텍스트 (예: "approx" — 근사값 고지). */
  hint?: string;
  /** hint 뱃지의 tooltip (근사 사유 등 데이터 의미 설명). */
  hintTitle?: string;
  /**
   * Detail form 의 시각 그룹 라벨 (M3-step1 웜업 [10-111]④, 2026-07-16).
   * 연속한 같은 group 필드 앞에 섹션 헤더 1줄 삽입 — 필드 순서는 여전히 fields
   * 배열이 소유하므로 같은 group 은 인접 배치가 규약. 미지정 = 그룹 없음
   * (지표 pack 전부 — 옛 IndicatorCard 평면 렌더 보존). BigValue 는 미소비.
   */
  group?: string;
}

export interface RecordDescriptor<Row extends RecordRow = RecordRow> {
  /**
   * 카드 상단 kicker (대문자 메타 태그) — config.kicker 미지정 시 기본.
   * 함수형 허용 (M3-step1 웜업 [10-111]①) — 티커는 마켓타입(PERP/SPOT/COINM)이
   * 자연 kicker 라 카드 스코프(marketType)에서 파생한다. defaultTitle 과 동형 규약.
   */
  kicker: string | ((ctx: { marketType?: string }) => string);
  /**
   * config.title 미지정 시 기본 타이틀. 함수형 허용 — 티커는 symbol 이 자연 타이틀.
   * (descriptor 순수성: config 타입에 의존하지 않는 최소 ctx 만 받는다.)
   */
  defaultTitle: string | ((ctx: { symbol?: string }) => string);
  /**
   * [10-7] dirty check 대상 컬럼 (PK/updated_at 제외 — 도메인 컬럼만).
   * 같은 물리 테이블(now_futures_indicator)을 공유하는 지표 pack 은 필수 —
   * 다른 family 컬럼만 바뀐 push 의 fan-out 재렌더를 막는다.
   * ★ 티커 pack 은 생략(전용 테이블 = fan-out 없음 + 매 push 가 freshness 갱신 신호
   *   — 옛 TickerCard 거동 보존: watchColumns 를 걸면 가격 정지 심볼의
   *   "updated Ns ago" 가 push 생존 신호를 잃는다).
   */
  watchColumns?: string[];
  /**
   * BigValue 의 primary 값 flash 를 유발하는 컬럼 (raw 값 변동 비교 — 옛 TickerCard
   * 가격 flash 이식). 생략 = primary flash 없음 (지표 pack — 옛 IndicatorCard 동형).
   */
  flashField?: string;
  /** 표시 필드들 — Detail 은 전부, BigValue 는 role 로 선별 소비. */
  fields: RecordField<Row>[];
}

/**
 * 이 단일-record form 들이 소비하는 shape — 'record'(한 대상의 여러 필드).
 *
 * ★ scalar 판정 (사용자 확정 2026-07-14): "큰 숫자 하나" 는 데이터 모양이 아니라
 *   표현 강조(role=primary)다 — BigValue 도 record 소비 form 이며 scalar shape 는
 *   정식 도입하지 않는다 (진짜 단일값 datasource 등장 시 활성, shapeKind.ts 참조).
 *   registry 의 두 form acceptsShapes=['record'] 와 등치 불변식 테스트로 동기(Step 4).
 */
export const RECORD_CONSUMES_SHAPE = "record" as const;

/**
 * descriptor 를 자기 row 타입으로 안전 저작한 뒤, 이종 row 레지스트리
 * (Record<string, RecordDescriptor>)에 담기 위해 base 로 1회 erase 한다.
 * 런타임엔 form 이 항상 매칭 datasource 의 row 만 넘기므로 건전
 * (authoring-time 타입 안전 + boundary 에서만 erasure — tableDescriptors 동형).
 */
function defineRecord<Row extends RecordRow>(
  d: RecordDescriptor<Row>,
): RecordDescriptor {
  return d as unknown as RecordDescriptor;
}

// ─── 티커 pack (옛 TickerCard 의 하드코딩 필드/포맷을 레시피로 외부화) ──────
//   now_spot_ticker + now_futures_ticker 두 datasource 공유 (동일 컬럼/색 정책).
//   role 매핑 = 옛 TickerCard 시각 재현: last_price=huge / 24h%=뱃지 /
//   range·vol5m=보조 라인. detail 필드(open/VWAP/volume/trades/1h)는 옛 카드에
//   없던 순증 — Detail form(티커 상세)이 처음 여는 조합이라 회귀 아님.
//   ★ "$" 접두는 옛 TickerCard verbatim (비 USD-quote 페어 표기는 기존 한계 그대로 —
//     quote 통화별 접두 정밀화는 별도 사안, 신작 금지 원칙).
//   [10-111]①④ (M3-step1 웜업, 2026-07-16 사용자 채택):
//   - kicker = 마켓타입 파생(PERP/SPOT/COINM) — 잉여 "TICKER" 대체. 스코프 미상
//     (marketType 없음 — 스키마상 사실상 불가) 시에만 "TICKER" 폴백.
//   - Detail 그룹 3블록: DIRECTION(변화율) → LEVELS(가격대) → LIQUIDITY(거래량) —
//     vol5m 이 가격 지표 사이에 끼던 순서를 정리. BigValue 소비(role 선별)는
//     그룹/순서 재배치와 무관 (badge/secondary 상대 순서 보존 — range 가 첫 secondary).
const TICKER_RECORD_DESCRIPTOR: RecordDescriptor = defineRecord<TickerRecordRow>({
  kicker: (ctx) => marketTypeLabel(ctx.marketType) ?? "TICKER",
  // 티커의 자연 타이틀 = 심볼 (옛 TickerCard: config.title ?? symbol).
  defaultTitle: (ctx) => ctx.symbol ?? "Ticker",
  // watchColumns 의도적 생략 — 전용 테이블(fan-out 없음) + 매 push freshness 보존.
  flashField: "last_price",
  fields: [
    {
      key: "last_price",
      label: "Last price",
      role: "primary",
      value: (r) => (r.last_price !== null ? `$${formatPrice(r.last_price)}` : "—"),
    },
    // ── DIRECTION — 방향/모멘텀 (변화율) ──
    {
      key: "price_change_pct",
      label: "24h change",
      role: "badge",
      group: "direction",
      value: (r) => formatPct(r.price_change_pct),
      tone: (r) => signTone(r.price_change_pct),
    },
    {
      key: "price_chg_1h",
      label: "1h change",
      group: "direction",
      value: (r) => formatPct(r.price_chg_1h),
      tone: (r) => signTone(r.price_chg_1h),
    },
    // ── LEVELS — 가격대 ──
    {
      // 대표 key = high_price (value 는 low+high 를 함께 읽는 range 표기 — 옛 formatRange).
      key: "high_price",
      label: "24h range",
      role: "secondary",
      group: "levels",
      value: (r) =>
        r.low_price !== null && r.high_price !== null
          ? `L ${formatPrice(r.low_price)} · H ${formatPrice(r.high_price)}`
          : "—",
    },
    {
      key: "open_price",
      label: "Open (24h)",
      group: "levels",
      value: (r) => (r.open_price !== null ? `$${formatPrice(r.open_price)}` : "—"),
    },
    {
      key: "weighted_avg_price",
      label: "VWAP (24h)",
      group: "levels",
      value: (r) =>
        r.weighted_avg_price !== null ? `$${formatPrice(r.weighted_avg_price)}` : "—",
    },
    // ── LIQUIDITY — 거래량/체결 ──
    {
      key: "volume_chg_5m",
      label: "Vol 5m",
      role: "secondary",
      group: "liquidity",
      value: (r) => formatPct(r.volume_chg_5m),
      tone: (r) => signTone(r.volume_chg_5m),
      // 근사값 고지 (메모리 §volume_chg_5m UI 정책 — 옛 TickerCard 뱃지 이식).
      hint: "approx",
      hintTitle:
        "Approximate — derived from a rolling polling window, not an exact 5m kline aggregation.",
    },
    {
      // COINM 은 quote_volume=NULL (registry 정의) → "—" graceful 이 정확한 표시.
      key: "quote_volume",
      label: "Quote volume (24h)",
      group: "liquidity",
      value: (r) => formatAmount(r.quote_volume),
    },
    {
      // ★ 단위 분기 (code-reviewer W1, 위생 #9 site=DB): registry 정의상 volume 은
      //   USDM/spot=base-asset 수량, COINM=계약 수 — "Base volume" 고정 라벨이면
      //   COINM 에서 계약 수가 base 수량인 척 표시된다. 중립 라벨 + 값에 단위 명시.
      key: "volume",
      label: "Volume (24h)",
      group: "liquidity",
      value: (r, m) => {
        if (r.volume === null) return "—";
        if (r.market_type === "futures_coinm") {
          return `${formatAmount(r.volume)} contracts`;
        }
        return m?.base_asset
          ? `${formatAmount(r.volume)} ${m.base_asset}`
          : formatAmount(r.volume);
      },
    },
    {
      key: "trade_count",
      label: "Trades (24h)",
      group: "liquidity",
      value: (r) => formatAmount(r.trade_count),
    },
  ],
});

// ─── descriptor 테이블 ────────────────────────────────
//   지표 5종 = 옛 indicatorDescriptors.INDICATOR_DESCRIPTORS 이관(rows→fields,
//   primary:true → role:"primary", 라벨/포맷/tone verbatim) + role 태깅 순증.
//   티커 2종 = 위 공유 pack. Step 4 에서 옛 파일 삭제 → 이 파일이 단일-record
//   form 의 유일 descriptor 진실 ([10-74] 2중 → 1중 완결).

/**
 * datasource 논리 id → 단일-record descriptor.
 * (Step 4 에서 big-value-card/detail-card 양쪽 dataShapes 와 key 집합 등치를
 *  불변식 테스트로 박제.)
 */
export const RECORD_DESCRIPTORS: Record<string, RecordDescriptor> = {
  // ── 펀딩 & 마크 (Binance 우상단 Funding/Countdown 박스) ──
  premium_index: defineRecord<IndicatorRow>({
    kicker: "FUNDING & MARK",
    defaultTitle: "Funding & Mark",
    watchColumns: [
      "predicted_funding_rate",
      "last_settled_funding_rate",
      "mark_price",
      "index_price",
      "next_funding_time",
    ],
    fields: [
      {
        key: "predicted_funding_rate",
        label: "Funding (predicted)",
        role: "primary",
        // [10-9] meta.funding_interval_hours → "(1h)/(4h)/(8h)" 라벨.
        value: (r, m) =>
          formatFundingRate(r.predicted_funding_rate, m?.funding_interval_hours),
        tone: (r) => signTone(r.predicted_funding_rate),
      },
      {
        key: "next_funding_time",
        label: "Next funding",
        role: "secondary",
        value: (r) => formatCountdown(r.next_funding_time),
      },
      {
        key: "last_settled_funding_rate",
        label: "Funding (last settled)",
        role: "secondary",
        value: (r, m) =>
          formatFundingRate(r.last_settled_funding_rate, m?.funding_interval_hours),
        tone: (r) => signTone(r.last_settled_funding_rate),
      },
      // [10-9] meta.tick_size → 사이트와 동일 가격 정밀도 (미주입 시 adaptive fallback)
      {
        key: "mark_price",
        label: "Mark price",
        value: (r, m) => formatPrice(r.mark_price, m?.tick_size),
      },
      {
        key: "index_price",
        label: "Index price",
        value: (r, m) => formatPrice(r.index_price, m?.tick_size),
      },
    ],
  }),

  // ── Basis (선물 − 현물 괴리) ──
  basis: defineRecord<IndicatorRow>({
    kicker: "BASIS",
    defaultTitle: "Basis",
    watchColumns: ["basis", "basis_rate", "mark_price", "index_price"],
    fields: [
      {
        key: "basis",
        label: "Basis",
        role: "primary",
        // [10-9] meta.quote_asset 우선 (USDC 페어 정확 표기) — 미주입 시 기존 근사 유지
        value: (r, m) =>
          formatBasis(r.basis, m?.quote_asset ?? basisQuoteForMarketType(r.market_type)),
        tone: (r) => signTone(r.basis),
      },
      {
        key: "basis_rate",
        label: "Basis rate",
        role: "secondary",
        value: (r) => formatBasisRate(r.basis_rate),
        tone: (r) => signTone(r.basis_rate),
      },
      {
        key: "mark_price",
        label: "Mark price",
        value: (r, m) => formatPrice(r.mark_price, m?.tick_size),
      },
      {
        key: "index_price",
        label: "Index price",
        value: (r, m) => formatPrice(r.index_price, m?.tick_size),
      },
    ],
  }),

  // ── Open Interest (사용자 1순위: OI+가격 다이버전스) ──
  //   BigValue role: OI=huge + 1h 변화/마크가 보조 (OI 방향 × 가격 수준 1차 대조).
  open_interest: defineRecord<IndicatorRow>({
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
    fields: [
      {
        key: "open_interest",
        label: "Open interest",
        role: "primary",
        // [10-9] meta.base_asset → USDM 수량 단위 라벨. COINM 은 무시(contracts).
        value: (r, m) =>
          formatOI(r.open_interest, asFuturesMarketType(r.market_type), m?.base_asset),
      },
      {
        key: "oi_chg_5m",
        label: "OI 5m",
        value: (r) => formatPct(r.oi_chg_5m),
        tone: (r) => signTone(r.oi_chg_5m),
      },
      {
        key: "oi_chg_15m",
        label: "OI 15m",
        value: (r) => formatPct(r.oi_chg_15m),
        tone: (r) => signTone(r.oi_chg_15m),
      },
      {
        key: "oi_chg_1h",
        label: "OI 1h",
        role: "secondary",
        value: (r) => formatPct(r.oi_chg_1h),
        tone: (r) => signTone(r.oi_chg_1h),
      },
      {
        key: "oi_chg_4h",
        label: "OI 4h",
        value: (r) => formatPct(r.oi_chg_4h),
        tone: (r) => signTone(r.oi_chg_4h),
      },
      {
        key: "mark_price",
        label: "Mark price",
        role: "secondary",
        value: (r, m) => formatPrice(r.mark_price, m?.tick_size),
      },
    ],
  }),

  // ── Long/Short Ratio (+ taker 동반 — 사용자 결정: 빈 카드 방지) ──
  long_short_ratio: defineRecord<IndicatorRow>({
    kicker: "LONG / SHORT",
    defaultTitle: "Long/Short Ratio",
    watchColumns: [
      "top_ls_ratio_accounts",
      "top_ls_ratio_positions",
      "global_ls_ratio",
      "taker_buy_sell_ratio",
    ],
    fields: [
      {
        key: "top_ls_ratio_accounts",
        label: "Top (accounts)",
        role: "primary",
        value: (r) => formatLSR(r.top_ls_ratio_accounts),
        tone: (r) => midlineTone(r.top_ls_ratio_accounts),
      },
      {
        key: "top_ls_ratio_positions",
        label: "Top (positions)",
        role: "secondary",
        value: (r) => formatLSR(r.top_ls_ratio_positions),
        tone: (r) => midlineTone(r.top_ls_ratio_positions),
      },
      {
        key: "global_ls_ratio",
        label: "Global",
        role: "secondary",
        value: (r) => formatLSR(r.global_ls_ratio),
        tone: (r) => midlineTone(r.global_ls_ratio),
      },
      {
        key: "taker_buy_sell_ratio",
        label: "Taker buy/sell",
        value: (r) => formatLSR(r.taker_buy_sell_ratio),
        tone: (r) => midlineTone(r.taker_buy_sell_ratio),
      },
    ],
  }),

  // ── Taker Buy/Sell Volume (단독 — AI 가 명시적으로 고른 경우) ──
  taker_long_short: defineRecord<IndicatorRow>({
    kicker: "TAKER BUY/SELL",
    defaultTitle: "Taker Buy/Sell",
    watchColumns: ["taker_buy_sell_ratio", "taker_buy_vol", "taker_sell_vol"],
    fields: [
      {
        key: "taker_buy_sell_ratio",
        label: "Buy/Sell ratio",
        role: "primary",
        value: (r) => formatLSR(r.taker_buy_sell_ratio),
        tone: (r) => midlineTone(r.taker_buy_sell_ratio),
      },
      {
        key: "taker_buy_vol",
        label: "Buy volume",
        role: "secondary",
        value: (r) => formatAmount(r.taker_buy_vol),
      },
      {
        key: "taker_sell_vol",
        label: "Sell volume",
        role: "secondary",
        value: (r) => formatAmount(r.taker_sell_vol),
      },
    ],
  }),

  // ── 티커 2종 (동일 pack 공유) ──
  now_spot_ticker: TICKER_RECORD_DESCRIPTOR,
  now_futures_ticker: TICKER_RECORD_DESCRIPTOR,
};

/**
 * datasource 의 단일-record descriptor 조회 (render-detail lookup).
 * ⚠️ 렌더 가능 판정의 권한 있는 게이트는 registry dataShapes
 * (renderableDatasource.isDatasourceSupportedByComponent) — 이 함수는 그 거울이며,
 * Step 4 불변식 테스트가 둘의 등치를 박제한다 (coming-soon drift 차단).
 */
export function getRecordDescriptor(
  datasource: string | undefined | null,
): RecordDescriptor | undefined {
  if (typeof datasource !== "string") return undefined;
  return RECORD_DESCRIPTORS[datasource];
}

/** defaultTitle(문자열|함수) 해석 — form 헤더 조립용 공용 헬퍼. */
export function resolveRecordTitle(
  descriptor: RecordDescriptor | undefined,
  ctx: { symbol?: string },
): string | undefined {
  if (!descriptor) return undefined;
  return typeof descriptor.defaultTitle === "function"
    ? descriptor.defaultTitle(ctx)
    : descriptor.defaultTitle;
}

/** kicker(문자열|함수) 해석 — resolveRecordTitle 동형 (M3-step1 웜업 [10-111]①). */
export function resolveRecordKicker(
  descriptor: RecordDescriptor | undefined,
  ctx: { marketType?: string },
): string | undefined {
  if (!descriptor) return undefined;
  return typeof descriptor.kicker === "function"
    ? descriptor.kicker(ctx)
    : descriptor.kicker;
}

/**
 * 헤더 텍스트 에코 판정 (M3-step1 웜업 [10-111]②) — 지표 카드의
 * kicker("OPEN INTEREST") / title("Open Interest") / primary 라벨("Open interest")
 * 3중 반복을 대소문자·공백 정규화 비교로 감지한다. **코드 폴백끼리 겹칠 때만**
 * 생략에 쓰인다 — AI 가 제공한 텍스트는 원문 보존([10-92]① 원칙), 생략 판단은
 * 호출측(form)이 config 제공 여부를 함께 보고 내린다.
 */
export function recordTextEchoes(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

// apps/web/lib/cards/feedDescriptors.ts
//
// 모양-제네릭 FeedCard 의 레시피(descriptor) 계약 — Composable Expressiveness Stage 3
// (`events` shape 첫 시민 = 청산, ff#2 재개 Step 3, 2026-07-05).
// 단일 진실: docs/task-record/M2-pathA-ff2-liquidation.md / Architecture.md §8 Form↔Data 직교.
//
// 역할:
//   하나의 모양-제네릭 Feed(`events` shape 소비)가 AI 가 고른 datasource 에 따라
//   "시각 + 라벨 + 방향 배지 + 데이터 컬럼 1~3개" 의 시간순 tape 로 적응 렌더하도록
//   선언한다. 옛 계획의 LiquidationFeedCard(데이터-잠금 카드)를 만들지 않는 이유 —
//   Feed 는 청산뿐 아니라 뉴스·체결 등 어떤 events 든 descriptor 팩만 추가하면 받는다.
//
// 설계 원칙 (tableDescriptors 와 동형 — Stage 1 검증된 패턴 미러):
//   - "쿼리→컴포넌트 하드매핑" 아님 — AI 는 datasource description 으로 의도를 추론하고,
//     이 테이블은 그 datasource 의 **순수 표시 메타**일 뿐이다.
//   - timeField / labelField / badge 참조 필드 / columns[].key 는 해당 datasource 의
//     queryableFields 에 실존해야 한다 (drift 차단, 불변식 테스트 박제 — Step 5 등록 시
//     FEED_DESCRIPTORS keys ≡ feed-card.dataShapes 등치 추가).
//   - 색 계약: descriptor 는 의미 신호(tone=방향, intensity=크기 0..1)만 반환하고,
//     색·불투명도 매핑은 form(feedCardFormat → tableCardFormat 재사용)이 소유.
//   - ★ 테이블과의 의도적 비대칭 — rowKeyFields 없음: 피드 행의 React key 는
//     FeedEvent.seq(훅 로컬 단조증가, 불변식 C)가 이미 유일·안정하므로 데이터 필드로
//     재조정 키를 만들 필요가 없다 (같은 ms 다중 청산도 seq 로 구분).
//
// 청산 도메인 결정 (ff#2 Step 1, 2026-06-27 사용자 확정 + canonical-metrics.md §7.2):
//   - side SELL = 롱 청산 = vermilion(하락 압력, tone "down") / BUY = 숏 청산 = teal
//     (상승 압력, tone "up") + LONG/SHORT 텍스트 라벨 병기 (funding 오독 [3-48] 재발 방지).
//   - 표시가 = avg_price(ap, 실제 체결가) 우선, 결측 시 price(p) 폴백.
//   - under-report(sampled) 고지는 카드 하드 뱃지가 아니라 registry description → AI
//     subtitle 자연어 고지 (사용자 결정 2026-07-05).

import type { MetricTone } from "@/lib/cards/marketSemantics";
import {
  liqNotionalIntensity,
  liqSideLabel,
  liqSideTone,
} from "@/lib/cards/liquidationSemantics";
import { formatPrice, formatUsdCompact } from "@/lib/format/marketUnits";

/** 피드 form 이 다루는 최소 행 — 식별 3축 + 임의 이벤트 필드(`events` shape 의 한 사건). */
export type FeedRow = {
  exchange: string;
  market_type: string;
  symbol: string;
} & Record<string, unknown>;

/** 청산 방송 row 의 최소 스키마 (청산 descriptor 의 value 함수 전용). */
type LiquidationRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  side: string;
  price: number | null;
  avg_price: number | null;
  notional: number | null;
} & Record<string, unknown>;

/** 피드 데이터 컬럼 1개 (시각/라벨/배지 제외). */
export interface FeedColumn<Row extends FeedRow = FeedRow> {
  /** datasource queryableFields 실존 컬럼 (불변식 테스트 박제). */
  key: string;
  /** 컬럼 의미 라벨 — tape 는 열머리를 그리지 않으므로 문서/미래 form 용 메타. */
  header: string;
  /** grid 컬럼 폭 (예: "5rem") — 피드 라인 grid-template 조립용. */
  width: string;
  /** row → 표시 문자열 (순수 함수, marketUnits 헬퍼 경유). */
  value: (row: Row) => string;
  /** 의미상 "방향" → form 이 색으로 매핑. 미지정=neutral. */
  tone?: (row: Row) => MetricTone;
  /** 의미상 "크기" 0..1 → form 이 불투명도로 매핑. 미지정=1. */
  intensity?: (row: Row) => number;
}

export interface FeedDescriptor<Row extends FeedRow = FeedRow> {
  /** 카드 상단 kicker (대문자 메타 태그). */
  kicker: string;
  /** config.title 미지정 시 기본 타이틀. */
  defaultTitle: string;
  /**
   * 이벤트 발생 시각 필드 (queryableFields 실존). 값은 ISO 문자열 또는 epoch ms —
   * HH:MM:SS 표기는 form(feedCardFormat.formatFeedTime)이 소유.
   */
  timeField: string;
  /** 행의 대상 식별 필드 (예: "symbol") — 라인의 주인공 라벨. */
  labelField: string;
  /**
   * 방향 배지 — 이벤트의 성격을 한 단어 라벨 + 방향색으로 (예: "LONG LIQ" vermilion).
   * 텍스트 병기 원칙: 색만으로 방향을 전달하지 않는다 ([3-48] 오독 방지).
   */
  badge: {
    text: (row: Row) => string;
    tone: (row: Row) => MetricTone;
  };
  /**
   * 도메인 위생 고지 (선택) — AI 가 subtitle 을 생략했을 때 안전망 subtitle 에 붙는
   * 데이터-특정 고지 문구 (예: 청산 "sampled stream"). ★ form 에 하드코딩하면
   * 두 번째 events datasource(체결 등 비-sampled)에 거짓 고지가 붙는 데이터-잠금
   * 드리프트 — 고지는 시맨틱 레이어(여기)가 선언하고 form 은 조립만 (reviewer W1).
   */
  disclosure?: string;
  /**
   * seed↔라이브 겹침 제거용 사건 동일성 키 필드들 (Step 7, 선택 — queryableFields 실존).
   * 과거 seed(DB 조회)와 첫 라이브 방송이 같은 사건을 양쪽에서 가져오는 창을 제거한다.
   * React key(FeedEvent.seq)와는 목적이 다름 — 이건 "같은 사건인가"의 데이터 동일성.
   */
  dedupeKeyFields?: readonly string[];
  /** 데이터 컬럼들 (1~3개 — 좁은 tape 라인 기준). */
  columns: FeedColumn<Row>[];
}

/**
 * 이 피드 form 이 소비하는 shape — 'events'(시간순 도착 사건, append-only).
 * ★ Stage 2 Step 1 반영 (2026-07-08): feed-card 의 registry acceptsShapes=['events']
 *   와 등치 불변식 테스트로 동기 (TABLE_CONSUMES_SHAPE 동형). 게이트는 dataShapes
 *   멤버십 유지 — shape 는 호환성 불변식 레이어 (shapeCompat.ts 헤더 참조).
 */
export const FEED_CONSUMES_SHAPE = "events" as const;

/** tableDescriptors.defineTable 동형 — authoring-time 타입 안전 후 base 로 1회 erase. */
function defineFeed<Row extends FeedRow>(d: FeedDescriptor<Row>): FeedDescriptor {
  return d as unknown as FeedDescriptor;
}

// ─── 청산 descriptor (events 첫 시민) ────────────────────────────
//   side 는 "청산 주문"의 방향이라 직관과 반대 — SELL=롱 청산/BUY=숏 청산.
//   미지의 side 값(공급자 드리프트)은 중립 라벨 "LIQ" + neutral (graceful, crash 금지).
const LIQUIDATION_DESCRIPTOR: FeedDescriptor = defineFeed<LiquidationRow>({
  kicker: "LIQUIDATIONS",
  defaultTitle: "Liquidation Feed",
  timeField: "trade_time",
  labelField: "symbol",
  // 라벨/색/농도 = liquidationSemantics 단일 진실 (Table 청산 descriptor 와 공유 — W1).
  badge: {
    text: (r) => liqSideLabel(r.side),
    tone: (r) => liqSideTone(r.side),
  },
  // under-report 고지 — 청산 고유 특성(1초/심볼 sampled)이라 descriptor 가 선언.
  disclosure: "sampled stream",
  // 사건 동일성: 심볼당 1초 1건 sampled 라 (symbol, trade_time) 이 사실상 유일 —
  //   side 를 더해 극단 엣지까지 방어 (seed↔라이브 겹침 창 제거).
  dedupeKeyFields: ["symbol", "trade_time", "side"],
  columns: [
    {
      key: "notional",
      header: "VALUE",
      width: "4.5rem",
      // null = rollout 이전/contractSize 미보유 — "—" graceful.
      value: (r) => formatUsdCompact(r.notional),
      intensity: (r) => liqNotionalIntensity(r.notional),
    },
    {
      key: "avg_price",
      header: "PRICE",
      width: "6rem",
      // canonical: 표시가 = ap(실제 체결가) 우선, 결측 시 p 폴백.
      value: (r) => {
        const p = r.avg_price ?? r.price;
        return p != null ? `$${formatPrice(p)}` : "—";
      },
    },
  ],
});

// ─── descriptor 테이블 ────────────────────────────────
//   현재 events datasource = 청산 1종. 뉴스/체결(trade)이 events 로 합류하면 여기에
//   descriptor 팩만 추가 — form(FeedCard)은 무수정 (N+M 확장).

/**
 * datasource 논리 id → 모양-제네릭 피드 descriptor.
 * (Step 5 등록 시 feed-card.dataShapes 와 key 집합 등치를 불변식 테스트로 박제.)
 */
export const FEED_DESCRIPTORS: Record<string, FeedDescriptor> = {
  liquidation: LIQUIDATION_DESCRIPTOR,
};

/** 표시 lookup — 렌더 게이트 아님 (권한 진실 = registry dataShapes, TableCard 동형).
 *  nullish 방어 가드 포함 — getTableDescriptor 와 진짜 동형(미러 오기 함정 방지, reviewer W2). */
export function getFeedDescriptor(
  datasource: string | undefined | null,
): FeedDescriptor | undefined {
  if (typeof datasource !== "string") return undefined;
  return FEED_DESCRIPTORS[datasource];
}

// apps/web/lib/cards/renderableDatasource.ts
//
// 카드가 "현재 직접 렌더 가능한 _now 테이블" 임시 allowlist
// (M2 테마 A Step 0 — F3 즉시 안전망, 2026-06-09).
//
// 배경 ([10-3] / F3):
//   datasourceRegistry 는 open_interest / long_short_ratio / premium_index / taker_long_short
//   같은 "논리 datasource id" 를 AI 에게 약속하지만, 물리 Supabase 테이블은
//   now_futures_indicator 단 1개다 (네 도메인이 같은 row 를 partial UPDATE).
//   그런데 ticker 카드(CoinListCard / TickerCard)는 datasource id 를 그대로 테이블명으로
//   `from(datasource)` 조회하므로, indicator 계열 id 가 오면 "테이블 없음" 에러 →
//   사용자에게 빨간 "! realtime error" 가 노출됐다.
//
//   이 헬퍼는 그 깨진 화면을 graceful "coming soon" 으로 바꾸기 위한 **표시 계층 방어선**이다
//   (CLAUDE.md "절대 crash 금지"). AI 프롬프트 부탁이 아니라 렌더 직전 구조로 막는다
//   (M1.5 의 "id 충돌은 dispatcher 가 구조로 막는다" 와 같은 철학).
//
// ⚠️ 임시: datasource id ≠ 테이블명 근본 분리(fetchKind / tableName)는 테마 A Step 1 에서
//    [8-27] 빚 #1·#4 회수로 처리된다. 그때 본 allowlist 는 registry 파생 매핑으로
//    대체·삭제된다. 새 indicator 카드가 추가되기 전까지의 과도기 가드일 뿐이다.

/**
 * 현재 ticker 카드(CoinListCard / TickerCard)가 직접 렌더할 수 있는 _now 테이블.
 *
 * ⚠️ 이 명단은 "ticker 카드가 직접 렌더 가능한 테이블" 에 한정한다 (W1, 2026-06-09).
 *    - 물리 테이블 now_futures_indicator 는 컬럼 스키마가 달라 ticker 카드로 못 그린다 → 넣지 말 것.
 *    - 새 _now 테이블을 ticker 카드가 아닌 전용 카드로 추가할 땐 여기 넣지 말고
 *      Step 1 의 registry 파생 매핑으로 처리한다 (임시 allowlist 는 누락 시 조용히 가려짐).
 */
export const RENDERABLE_TICKER_TABLES = [
  "now_spot_ticker",
  "now_futures_ticker",
] as const;

/**
 * 렌더 불가 datasource 안내 문구 (단일 진실 원천 — 두 카드가 공유).
 * Step 1 에서 본 모듈과 함께 제거될 때 grep 한 번으로 잡히도록 상수화 (S1).
 */
export const COMING_SOON_LABEL = "this data view is coming soon";

const RENDERABLE_SET: ReadonlySet<string> = new Set(RENDERABLE_TICKER_TABLES);

/**
 * 주어진 datasource 가 ticker 카드가 직접 렌더 가능한 테이블인지.
 *
 * false 면 카드는 구독을 skip 하고 "coming soon" 을 표시해야 한다 — indicator 계열
 * (open_interest 등) 논리 datasource 가 들어온 경우로, 아직 전용 카드가 없다.
 */
export function isRenderableTickerDatasource(
  datasource: string | undefined | null,
): boolean {
  return typeof datasource === "string" && RENDERABLE_SET.has(datasource);
}

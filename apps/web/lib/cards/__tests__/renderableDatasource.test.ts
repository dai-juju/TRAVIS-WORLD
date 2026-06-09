// apps/web/lib/cards/__tests__/renderableDatasource.test.ts
//
// 테마 A Step 0 — F3 즉시 안전망 가드 회귀 테스트.
// ticker 카드가 렌더 가능한 _now 테이블만 통과시키고, indicator 계열 논리
// datasource (open_interest 등) 는 false → 카드가 "coming soon" 으로 graceful 처리.

import { describe, expect, it } from "vitest";
import {
  RENDERABLE_TICKER_TABLES,
  isRenderableTickerDatasource,
} from "../renderableDatasource";

describe("renderableDatasource — F3 즉시 안전망 ([10-3])", () => {
  it("ticker 테이블은 렌더 가능 (true)", () => {
    expect(isRenderableTickerDatasource("now_spot_ticker")).toBe(true);
    expect(isRenderableTickerDatasource("now_futures_ticker")).toBe(true);
  });

  it("indicator 계열 논리 datasource 는 렌더 불가 (false) — 깨진 realtime error 차단", () => {
    // datasourceRegistry 에는 등록됐지만 물리 테이블은 now_futures_indicator 1개 →
    // 직접 from(datasource) 불가. 전용 카드는 테마 A Step 2~3 에서 신설.
    expect(isRenderableTickerDatasource("open_interest")).toBe(false);
    expect(isRenderableTickerDatasource("long_short_ratio")).toBe(false);
    expect(isRenderableTickerDatasource("premium_index")).toBe(false);
    expect(isRenderableTickerDatasource("taker_long_short")).toBe(false);
  });

  it("물리 indicator 테이블도 ticker 카드 명단엔 없음 (W2 — 스키마 불일치 방어)", () => {
    // now_futures_indicator 는 실재하는 테이블이라 그럴듯해 보이지만, 컬럼 스키마가
    // ticker 와 달라 ticker 카드로 렌더 불가. Step 1 리팩터 중 실수로 allowlist 에
    // 들어가면 이 케이스가 잡는다.
    expect(isRenderableTickerDatasource("now_futures_indicator")).toBe(false);
  });

  it("미존재 / nullish datasource 도 graceful false (절대 crash 금지)", () => {
    expect(isRenderableTickerDatasource("nonexistent_table")).toBe(false);
    expect(isRenderableTickerDatasource(undefined)).toBe(false);
    expect(isRenderableTickerDatasource(null)).toBe(false);
    expect(isRenderableTickerDatasource("")).toBe(false);
  });

  it("allowlist 는 ticker 2개 테이블로 한정 (Step 1 에서 registry 파생으로 대체 예정)", () => {
    expect(RENDERABLE_TICKER_TABLES).toEqual([
      "now_spot_ticker",
      "now_futures_ticker",
    ]);
  });
});

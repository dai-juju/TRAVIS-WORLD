// renderableDatasource — registry dataShapes 파생 렌더 가드 테스트
// (테마 A Step 5, 2026-06-11 — Step 0 하드코딩 allowlist 를 registry 파생으로 대체).
//
// 검증: 컴포넌트의 dataShapes 선언이 곧 렌더 허용 명단이다 — 하드코딩 없음.
// schema superRefine(1차, AI 경로)와 같은 단일 진실(componentRegistry)을 공유하는
// 표시 계층 2차 방어선.

import { describe, expect, it } from "vitest";
import {
  getAllComponents,
  getAllDatasources,
  registerDefaults,
} from "@travis/shared";
import { isDatasourceSupportedByComponent } from "../renderableDatasource";

// shared registry 명시 부트스트랩 (테스트 격리).
registerDefaults();

describe("isDatasourceSupportedByComponent — registry dataShapes 파생 가드", () => {
  it("ticker 카드 × ticker 테이블 조합은 허용 (기존 동작 회귀)", () => {
    expect(isDatasourceSupportedByComponent("ticker-card", "now_spot_ticker")).toBe(true);
    expect(isDatasourceSupportedByComponent("ticker-card", "now_futures_ticker")).toBe(true);
    expect(isDatasourceSupportedByComponent("table-card", "now_spot_ticker")).toBe(true);
  });

  it("ticker 카드 × indicator datasource 는 거부 — F3 깨진 화면 차단 (coming soon)", () => {
    expect(isDatasourceSupportedByComponent("ticker-card", "open_interest")).toBe(false);
    expect(isDatasourceSupportedByComponent("ticker-card", "premium_index")).toBe(false);
    // 물리 테이블명도 dataShapes 미선언 → 거부 (스키마 불일치 방어, 구 W2 케이스 승계)
    expect(isDatasourceSupportedByComponent("ticker-card", "now_futures_indicator")).toBe(false);
  });

  it("indicator 카드들 × indicator datasource 는 허용 (Step 2~3 신설 경로)", () => {
    expect(isDatasourceSupportedByComponent("indicator-card", "open_interest")).toBe(true);
    expect(isDatasourceSupportedByComponent("table-card", "premium_index")).toBe(true);
    expect(isDatasourceSupportedByComponent("table-card", "basis")).toBe(true);
  });

  it("미등록 컴포넌트 / nullish 입력은 graceful false (절대 crash 금지)", () => {
    expect(isDatasourceSupportedByComponent("nonexistent-card", "now_spot_ticker")).toBe(false);
    expect(isDatasourceSupportedByComponent(undefined, "now_spot_ticker")).toBe(false);
    expect(isDatasourceSupportedByComponent("ticker-card", undefined)).toBe(false);
    expect(isDatasourceSupportedByComponent("ticker-card", null)).toBe(false);
    expect(isDatasourceSupportedByComponent("", "")).toBe(false);
  });

  it("★ 렌더 매트릭스 byte-identical 스냅샷 — shape 레이어(Stage 2 Step 1)가 거동을 안 바꿈", () => {
    // Composable Stage 2 Step 1 (2026-07-08): servableShapes/acceptsShapes 신설은
    //   호환성 불변식 레이어일 뿐 — 렌더 게이트(dataShapes 멤버십)의 (component,
    //   datasource) 허용 쌍은 Stage 2 전과 정확히 동일해야 한다. 이 스냅샷이 그
    //   증명이자, 미래에 shape 가 게이트로 오배선되는 실수를 잡는 회귀 가드.
    const actual = getAllComponents()
      .flatMap((comp) =>
        getAllDatasources()
          .filter((ds) => isDatasourceSupportedByComponent(comp.id, ds.id))
          .map((ds) => `${comp.id} × ${ds.id}`),
      )
      .sort();
    expect(actual).toEqual(
      [
        "ticker-card × now_spot_ticker",
        "ticker-card × now_futures_ticker",
        "table-card × now_spot_ticker",
        "table-card × now_futures_ticker",
        "table-card × premium_index",
        "table-card × basis",
        "table-card × open_interest",
        "table-card × long_short_ratio",
        "table-card × taker_long_short",
        "table-card × liquidation",
        // 사이클 4b Step 3 (2026-07-12): 통합 스크리너 — 크로스 family 필터/정렬.
        "table-card × futures_indicators",
        "kline-chart-card × kline",
        "indicator-card × premium_index",
        "indicator-card × basis",
        "indicator-card × open_interest",
        "indicator-card × long_short_ratio",
        "indicator-card × taker_long_short",
        "feed-card × liquidation",
        // 사이클 2 Step 5 (2026-07-09): chart-card 등록 — history series 6종 유입.
        "chart-card × open_interest_history",
        "chart-card × top_ls_ratio_accounts_history",
        "chart-card × top_ls_ratio_positions_history",
        "chart-card × global_ls_ratio_history",
        "chart-card × taker_long_short_history",
        "chart-card × basis_history",
        // 사이클 2 Step 6 (2026-07-09): 펀딩 정산 이벤트 — 7번째 series 유입 (24쌍).
        "chart-card × funding_history",
      ].sort(),
    );
  });

  it("schema superRefine 과 동일 판정 — 두 방어선의 단일 진실 정합", async () => {
    // 1차(schema)와 2차(표시 가드)가 다른 답을 내면 한쪽이 drift 한 것.
    const { AiCardConfigSchema } = await import("@travis/shared");
    const base = {
      id: "x",
      size: "md" as const,
      updateMode: "content" as const,
    };
    const bad = AiCardConfigSchema.safeParse({
      ...base,
      componentId: "ticker-card",
      data: { datasource: "open_interest" },
    });
    expect(bad.success).toBe(
      isDatasourceSupportedByComponent("ticker-card", "open_interest"),
    );
    const good = AiCardConfigSchema.safeParse({
      ...base,
      componentId: "table-card",
      data: { datasource: "open_interest" },
    });
    expect(good.success).toBe(
      isDatasourceSupportedByComponent("table-card", "open_interest"),
    );
  });
});

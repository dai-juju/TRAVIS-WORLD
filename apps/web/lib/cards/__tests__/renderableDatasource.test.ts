// renderableDatasource — registry dataShapes 파생 렌더 가드 테스트
// (테마 A Step 5, 2026-06-11 — Step 0 하드코딩 allowlist 를 registry 파생으로 대체.
//  Stage 1b, 2026-07-14 — ticker-card/indicator-card → big-value-card/detail-card 수렴 반영).
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
  it("record form 2종 × record datasource 조합은 허용 (Stage 1b 수렴 경로)", () => {
    expect(isDatasourceSupportedByComponent("big-value-card", "now_spot_ticker")).toBe(true);
    expect(isDatasourceSupportedByComponent("big-value-card", "open_interest")).toBe(true);
    expect(isDatasourceSupportedByComponent("detail-card", "now_futures_ticker")).toBe(true);
    expect(isDatasourceSupportedByComponent("detail-card", "premium_index")).toBe(true);
    expect(isDatasourceSupportedByComponent("table-card", "now_spot_ticker")).toBe(true);
  });

  it("미선언 조합은 거부 — F3 깨진 화면 차단 (coming soon)", () => {
    // 물리 테이블명은 datasource id 가 아님 → 거부 (스키마 불일치 방어, 구 W2 케이스 승계)
    expect(isDatasourceSupportedByComponent("big-value-card", "now_futures_indicator")).toBe(false);
    // events/set 전용 — record form 미선언 (shape 불변식과 정합)
    expect(isDatasourceSupportedByComponent("big-value-card", "liquidation")).toBe(false);
    expect(isDatasourceSupportedByComponent("detail-card", "futures_indicators")).toBe(false);
    expect(isDatasourceSupportedByComponent("feed-card", "open_interest")).toBe(false);
    expect(isDatasourceSupportedByComponent("chart-card", "open_interest")).toBe(false);
  });

  it("미등록 컴포넌트 / nullish 입력은 graceful false (절대 crash 금지)", () => {
    expect(isDatasourceSupportedByComponent("nonexistent-card", "now_spot_ticker")).toBe(false);
    // 폐기된 옛 id 도 미등록 → graceful false (Stage 1b 삭제 전략 안전망)
    expect(isDatasourceSupportedByComponent("ticker-card", "now_spot_ticker")).toBe(false);
    expect(isDatasourceSupportedByComponent("indicator-card", "premium_index")).toBe(false);
    expect(isDatasourceSupportedByComponent(undefined, "now_spot_ticker")).toBe(false);
    expect(isDatasourceSupportedByComponent("big-value-card", undefined)).toBe(false);
    expect(isDatasourceSupportedByComponent("big-value-card", null)).toBe(false);
    expect(isDatasourceSupportedByComponent("", "")).toBe(false);
  });

  it("★ 렌더 매트릭스 byte-identical 스냅샷 — (component × datasource) 허용 쌍 정확값 핀", () => {
    // 허용 쌍 전수를 정확값으로 핀 ([[feedback_compat_invariant_overtag_blindspot]] —
    //   누락뿐 아니라 過선언(오태그)도 잡는다). Stage 1b (2026-07-14): 옛 ticker-card(2쌍)
    //   + indicator-card(5쌍) = 7쌍 → big-value-card(7쌍) + detail-card(7쌍) = 14쌍으로
    //   의도적 갱신 — "record 격자 14칸 개방"의 스냅샷 증명.
    const actual = getAllComponents()
      .flatMap((comp) =>
        getAllDatasources()
          .filter((ds) => isDatasourceSupportedByComponent(comp.id, ds.id))
          .map((ds) => `${comp.id} × ${ds.id}`),
      )
      .sort();
    expect(actual).toEqual(
      [
        "big-value-card × now_spot_ticker",
        "big-value-card × now_futures_ticker",
        "big-value-card × premium_index",
        "big-value-card × basis",
        "big-value-card × open_interest",
        "big-value-card × long_short_ratio",
        "big-value-card × taker_long_short",
        "detail-card × now_spot_ticker",
        "detail-card × now_futures_ticker",
        "detail-card × premium_index",
        "detail-card × basis",
        "detail-card × open_interest",
        "detail-card × long_short_ratio",
        "detail-card × taker_long_short",
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
        "feed-card × liquidation",
        // 사이클 2 Step 5 (2026-07-09): chart-card 등록 — history series 6종 유입.
        "chart-card × open_interest_history",
        "chart-card × top_ls_ratio_accounts_history",
        "chart-card × top_ls_ratio_positions_history",
        "chart-card × global_ls_ratio_history",
        // [10-84] M3-step3a (2026-07-19): 청산 시간버킷 집계 — chart form 코드 0줄로 유입.
        "chart-card × liquidation_volume_history",
        "chart-card × taker_long_short_history",
        "chart-card × basis_history",
        // 사이클 2 Step 6 (2026-07-09): 펀딩 정산 이벤트 — 7번째 series 유입.
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
      componentId: "feed-card",
      data: { datasource: "open_interest" },
    });
    expect(bad.success).toBe(
      isDatasourceSupportedByComponent("feed-card", "open_interest"),
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

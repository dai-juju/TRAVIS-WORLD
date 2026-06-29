// renderableDatasource — registry dataShapes 파생 렌더 가드 테스트
// (테마 A Step 5, 2026-06-11 — Step 0 하드코딩 allowlist 를 registry 파생으로 대체).
//
// 검증: 컴포넌트의 dataShapes 선언이 곧 렌더 허용 명단이다 — 하드코딩 없음.
// schema superRefine(1차, AI 경로)와 같은 단일 진실(componentRegistry)을 공유하는
// 표시 계층 2차 방어선.

import { describe, expect, it } from "vitest";
import { registerDefaults } from "@travis/shared";
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

/**
 * registryRefinements 단위 테스트 (M1.6 Step 4, [3-7] 회수).
 *
 * 검증 포인트:
 *   1. 등록된 id 는 통과
 *   2. 미등록 id 는 reject + 에러 메시지에 등록 목록 dump (AI self-correction
 *      retry 가 정답 후보 즉시 인지 가능한지)
 *   3. 빈 registry 상태 시 별도 메시지 ("registerDefaults() 누락 알림")
 *   4. 3종 helper (component / datasource / interaction) 동일 패턴 일관성
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RegisteredComponentIdSchema,
  RegisteredDatasourceIdSchema,
  RegisteredInteractionIdSchema,
} from "../registryRefinements";
import {
  clearComponents,
  registerComponent,
} from "../../registries/componentRegistry";
import { clearDatasources } from "../../registries/datasourceRegistry";
import { clearInteractions } from "../../registries/interactionRegistry";
import { clearExchanges } from "../../registries/exchangeRegistry";
import { registerDefaults } from "../../registries/defaults";

describe("RegisteredComponentIdSchema", () => {
  // 매 테스트마다 깨끗한 상태로 시작 — 다른 테스트의 clear 부수효과 격리.
  beforeEach(() => {
    clearExchanges();
    clearDatasources();
    clearComponents();
    clearInteractions();
    registerDefaults();
  });

  it("등록된 컴포넌트 id 는 통과", () => {
    const result = RegisteredComponentIdSchema.safeParse("big-value-card");
    expect(result.success).toBe(true);
  });

  it("미등록 id 는 reject + 등록 목록 dump", () => {
    const result = RegisteredComponentIdSchema.safeParse("screener-card");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("unknown componentId");
      expect(message).toContain("screener-card");
      // 등록된 id 들이 메시지에 dump 되는지 (AI 가 retry 시 정답 후보 인지)
      expect(message).toContain("big-value-card");
      expect(message).toContain("table-card");
      expect(message).toContain("kline-chart-card");
    }
  });

  it("빈 registry 시 'registerDefaults() 누락' 메시지", () => {
    clearComponents();
    const result = RegisteredComponentIdSchema.safeParse("big-value-card");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("componentRegistry is empty");
      expect(message).toContain("registerDefaults()");
    }
  });

  it("registry 동적 변경 추적 — clear 후 재등록 시 새 id 인식", () => {
    clearComponents();
    registerComponent({
      id: "custom-card",
      name: "Custom",
      description: "test-only",
      supportedSizes: ["sm"],
      supportedUpdateModes: ["value"],
      dataShapes: [{ datasourceId: "now_spot_ticker", requiredFields: [] }],
      supportedInteractions: [],
      defaultSize: "sm",
    });
    // 새로 등록한 id 가 즉시 통과되는지 (모듈 top-level 캐싱 안 되었는지 검증)
    expect(RegisteredComponentIdSchema.safeParse("custom-card").success).toBe(
      true,
    );
    // 기존 등록되었던 id 는 이제 미등록 (clear 됐으므로) → reject
    expect(RegisteredComponentIdSchema.safeParse("big-value-card").success).toBe(
      false,
    );
  });
});

describe("RegisteredDatasourceIdSchema", () => {
  beforeEach(() => {
    clearExchanges();
    clearDatasources();
    clearComponents();
    clearInteractions();
    registerDefaults();
  });

  it("등록된 datasource id 는 통과", () => {
    expect(
      RegisteredDatasourceIdSchema.safeParse("now_spot_ticker").success,
    ).toBe(true);
    expect(
      RegisteredDatasourceIdSchema.safeParse("now_futures_ticker").success,
    ).toBe(true);
    expect(
      RegisteredDatasourceIdSchema.safeParse("liquidation").success,
    ).toBe(true);
  });

  it("hallucinated datasource id (`ticker_spot`) reject + 메시지", () => {
    // 옛 id (`ticker_spot`) 는 M1.6 Step 0.1 에서 폐기. 현재는 `now_spot_ticker`.
    const result = RegisteredDatasourceIdSchema.safeParse("ticker_spot");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("unknown datasource");
      expect(message).toContain("now_spot_ticker"); // 정답 후보 dump 확인
    }
  });

  it("빈 registry 시 'registerDefaults() 누락' 메시지", () => {
    clearDatasources();
    const result = RegisteredDatasourceIdSchema.safeParse("now_spot_ticker");
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("datasourceRegistry is empty");
    }
  });
});

describe("RegisteredInteractionIdSchema", () => {
  beforeEach(() => {
    clearExchanges();
    clearDatasources();
    clearComponents();
    clearInteractions();
    registerDefaults();
  });

  it("등록된 interaction id (`spawn`) 는 통과", () => {
    expect(RegisteredInteractionIdSchema.safeParse("spawn").success).toBe(true);
  });

  it("미등록 interaction id reject", () => {
    const result = RegisteredInteractionIdSchema.safeParse("drill_down");
    // drill_down 은 InteractionTypeSchema enum 에는 있지만 registry 에 등록 X
    //   (M1 에서는 spawn 만 등록). 그러므로 refinement 에서 reject.
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toContain("unknown interactionId");
    }
  });
});

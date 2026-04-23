// actionDispatcher 단위 테스트.
//
// M1.4 Step 4-3 에서 payload-only 시그니처로 작성됨. M1.5 Step 3 (2026-04-22) 에서
// dispatcher 가 top-level `{ kind: "success" | "fallback" }` 응답을 소비하도록
// 확장되었으므로, 모든 기존 케이스를 `{ kind: "success", payload: {...} }` 로
// 감싸고 fallback / invalid-shape 2개 케이스를 신규 추가한다.

import { describe, it, expect, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { dispatchOrchestrateResponse } from "../actionDispatcher";
import {
  type CanvasStore,
  type TravisNode,
  defaultCanvasState,
} from "../stores/canvasStore";

// 최소한의 mock canvasStore — addNode 만 실제 구현.
function makeMockCanvasStore() {
  return createStore<CanvasStore>()((set, get) => ({
    ...defaultCanvasState,
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    addNode: (node: TravisNode) => set({ nodes: [...get().nodes, node] }),
    removeNode: () => null,
    updateNodeConfig: vi.fn(),
    setViewport: vi.fn(),
    setCanvasReady: vi.fn(),
  }));
}

const validCardA = {
  id: "ticker-1",
  componentId: "ticker-card",
  size: "md" as const,
  updateMode: "value" as const,
  data: {
    datasource: "now_spot_ticker",
    exchange: "binance",
    marketType: "spot" as const,
    symbol: "BTCUSDT",
  },
};

const validCardB = {
  id: "ticker-2",
  componentId: "ticker-card",
  size: "md" as const,
  updateMode: "value" as const,
  data: {
    datasource: "now_futures_ticker",
    exchange: "binance",
    marketType: "futures_usdm" as const,
    symbol: "ETHUSDT",
  },
};

/** 작은 헬퍼 — success wrapper 생성. */
function successEnv(payload: unknown): unknown {
  return { kind: "success", payload };
}

describe("dispatchOrchestrateResponse", () => {
  it("a) 정상 success 응답 — 2개 카드 addNode 호출 + success 반환", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      successEnv({ cards: [validCardA, validCardB] }),
      { canvasStore, showToast },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.addedCount).toBe(2);
    }
    expect(canvasStore.getState().nodes).toHaveLength(2);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("b) payload 내부 Zod 실패 — validation 실패 + 토스트 경고 + crash 없음", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      successEnv({ cards: "not-an-array" }),
      { canvasStore, showToast },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("validation");
    }
    expect(canvasStore.getState().nodes).toHaveLength(0);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("c) 빈 cards 배열 — empty reason + notes 가 있으면 그대로 노출", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      successEnv({ cards: [], notes: "조건에 맞는 카드가 없어요" }),
      { canvasStore, showToast },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("empty");
    }
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "조건에 맞는 카드가 없어요",
      }),
    );
  });

  it("d) 10개 초과 cards — Zod max(10) 거부", () => {
    const canvasStore = makeMockCanvasStore();
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      ...validCardA,
      id: `ticker-${i}`,
    }));

    const result = dispatchOrchestrateResponse(
      successEnv({ cards: tooMany }),
      { canvasStore },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("validation");
    }
    expect(canvasStore.getState().nodes).toHaveLength(0);
  });

  it("e) position 미지정 — layoutSlot 기반 자동 배치 (2개 카드 좌표 다름)", () => {
    const canvasStore = makeMockCanvasStore();

    dispatchOrchestrateResponse(
      successEnv({ cards: [validCardA, validCardB] }),
      { canvasStore },
    );

    const nodes = canvasStore.getState().nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.position.x).not.toBe(nodes[1]!.position.x);
  });

  // ── M1.5 Step 3 신규 케이스 ──────────────────────────

  it("f) fallback 응답 — 토스트 표시 + reason='fallback' + fallbackReason 노출, 카드 생성 없음", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      {
        kind: "fallback",
        reason: "validation_exhausted",
        message: "요청을 처리하지 못했습니다. 다시 표현해 주세요.",
      },
      { canvasStore, showToast },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("fallback");
      expect(result.fallbackReason).toBe("validation_exhausted");
      expect(result.message).toBe(
        "요청을 처리하지 못했습니다. 다시 표현해 주세요.",
      );
    }
    expect(canvasStore.getState().nodes).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "요청을 처리하지 못했습니다. 다시 표현해 주세요.",
      }),
    );
  });

  it("g) 최상위 kind 필드 누락 — 방어적 validation 실패 + crash 없음", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    // `kind` 가 없는 payload-only 모양 — 이전 시그니처를 흉내낸 입력.
    // Step 3 부터는 이 모양을 거부해야 한다.
    const result = dispatchOrchestrateResponse(
      { cards: [validCardA] },
      { canvasStore, showToast },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("validation");
    }
    expect(canvasStore.getState().nodes).toHaveLength(0);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  // ── M1.5 Step 3d 신규 케이스 ──────────────────────────

  it("h) refusal fallback 응답 — Haiku 정책 거부 시 fallbackReason='refusal' 전파", () => {
    // Haiku 가 "투자 조언해줘" 류의 정책 위반 쿼리에 stop_reason="refusal" 로
    // 응답하면 route.ts 가 { kind:"fallback", reason:"refusal", message:... } 로
    // 감싸서 반환한다. dispatcher 는 이를 validation_exhausted 와 **다른 축**으로
    // 구분해 fallbackReason 을 그대로 전파해야 한다.
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      {
        kind: "fallback",
        reason: "refusal",
        message: "해당 요청은 처리할 수 없어요. 다른 방식으로 질문해 주세요.",
      },
      { canvasStore, showToast },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("fallback");
      expect(result.fallbackReason).toBe("refusal");
      expect(result.message).toBe(
        "해당 요청은 처리할 수 없어요. 다른 방식으로 질문해 주세요.",
      );
    }
    expect(canvasStore.getState().nodes).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "해당 요청은 처리할 수 없어요. 다른 방식으로 질문해 주세요.",
      }),
    );
  });
});

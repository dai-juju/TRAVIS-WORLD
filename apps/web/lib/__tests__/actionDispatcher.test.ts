// actionDispatcher 단위 테스트 (M1.4 Step 4-3).

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
  componentId: "ticker",
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
  componentId: "ticker",
  size: "md" as const,
  updateMode: "value" as const,
  data: {
    datasource: "now_futures_ticker",
    exchange: "binance",
    marketType: "futures_usdm" as const,
    symbol: "ETHUSDT",
  },
};

describe("dispatchOrchestrateResponse", () => {
  it("a) 정상 응답 — 2개 카드 addNode 호출 + success 반환", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      { cards: [validCardA, validCardB] },
      { canvasStore, showToast },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.addedCount).toBe(2);
    }
    expect(canvasStore.getState().nodes).toHaveLength(2);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("b) 잘못된 JSON — validation 실패 + 토스트 경고 + crash 없음", () => {
    const canvasStore = makeMockCanvasStore();
    const showToast = vi.fn();

    const result = dispatchOrchestrateResponse(
      { cards: "not-an-array" },
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
      { cards: [], notes: "조건에 맞는 카드가 없어요" },
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
      { cards: tooMany },
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
      { cards: [validCardA, validCardB] },
      { canvasStore },
    );

    const nodes = canvasStore.getState().nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.position.x).not.toBe(nodes[1]!.position.x);
  });
});

/**
 * actionDispatcher — AI 응답 JSON 을 캔버스 노드로 변환하는 단일 진입점 (M1.4 Step 4-3).
 *
 * 책임:
 *   1. 미검증 raw 값(unknown) 을 OrchestrateResponseSchema 로 Zod 검증
 *   2. 통과한 cards 배열 각각을 TravisNode 로 빌드해 addNode 로 주입
 *   3. cards 에 position 이 없으면 겹치지 않는 spawn 좌표 자동 할당
 *   4. 검증 실패 / 빈 cards / 미지원 action 모두 **crash 없이 graceful** 처리 +
 *      (선택) 토스트로 사용자에게 피드백
 *
 * 왜 이 위치 / 이 경계인가:
 *   M1.4 에서는 ChatInputBar 가 dummy parser 로 raw 를 만들어 넘기고, M1.5 에서는
 *   /api/orchestrate 응답이 raw 로 들어온다. 프론트 소비 경로가 동일해야 M1.5
 *   전환 시 코드 수정이 "fetch 한 줄 교체" 로 끝난다. dispatchOrchestrateResponse
 *   가 두 경로의 공통 pipeline 이 된다.
 *
 * spawn action (M2+ 용):
 *   OrchestrateResponse.actions 에 담길 CardAction 은 "row-click → spawn" 같은
 *   인터랙션 정의이며, 본 dispatcher 는 현재 **무시만** 한다(검증 통과만 확인).
 *   실제 인터랙션 바인딩은 M2 drill-down 에서 별도 구현 예정.
 */

import type { StoreApi } from "zustand";
import {
  OrchestrateResponseSchema,
  type AiCardConfig,
  type OrchestrateResponse,
} from "@travis/shared";
import {
  TRAVIS_CARD_NODE_TYPE,
  type CanvasStore,
  type TravisNode,
} from "@/lib/stores/canvasStore";

export type DispatchSuccess = {
  success: true;
  addedCount: number;
  response: OrchestrateResponse;
};

/** Zod 에러 issue 한 건의 최소 shape — ZodIssue 를 shared 에서 재노출하지
 *  않기 위해 actionDispatcher 소비 쪽 관점에서만 필요한 필드를 추려 정의. */
export type DispatchIssue = {
  path: (string | number)[];
  message: string;
  code: string;
};

export type DispatchFailure = {
  success: false;
  reason: "validation" | "empty" | "store-error";
  message: string;
  /** Zod 에러 목록 (검증 실패 시만). */
  issues?: DispatchIssue[];
};

export type DispatchResult = DispatchSuccess | DispatchFailure;

export type DispatchDeps = {
  canvasStore: StoreApi<CanvasStore>;
  /** 선택 — 피드백 토스트. 없으면 조용히 실패. */
  showToast?: (opts: { message: string; durationMs?: number }) => void;
};

/**
 * unknown 입력을 Zod 로 검증하고 통과하면 addNode 연쇄 실행.
 */
export function dispatchOrchestrateResponse(
  raw: unknown,
  deps: DispatchDeps,
): DispatchResult {
  // 1) 스키마 검증.
  const parsed = OrchestrateResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = "orchestrate response validation failed";
    console.error("[actionDispatcher]", msg, parsed.error.issues);
    deps.showToast?.({
      message: "AI 응답 형식이 올바르지 않아요",
      durationMs: 4000,
    });
    return {
      success: false,
      reason: "validation",
      message: msg,
      issues: parsed.error.issues as unknown as DispatchIssue[],
    };
  }

  const response = parsed.data;

  // 2) 빈 cards — 사용자에게 "없다" 고 알려주는 게 UX 적으로 친절.
  if (response.cards.length === 0) {
    deps.showToast?.({
      message: response.notes ?? "생성할 카드가 없어요",
      durationMs: 4000,
    });
    return {
      success: false,
      reason: "empty",
      message: "cards array is empty",
    };
  }

  // 3) addNode 연쇄. 겹침 방지용 jitter 는 per-call randomized.
  try {
    const api = deps.canvasStore.getState();
    response.cards.forEach((config, index) => {
      const node = buildTravisNode(config, index);
      api.addNode(node);
    });
    if (response.notes) {
      deps.showToast?.({ message: response.notes, durationMs: 3000 });
    }
    return {
      success: true,
      addedCount: response.cards.length,
      response,
    };
  } catch (err) {
    // addNode 자체는 set() 만 하므로 throw 할 일이 없지만,
    // 방어적으로 감싸 crash 를 막는다 (CLAUDE.md 규칙).
    const message = err instanceof Error ? err.message : "unknown store error";
    console.error("[actionDispatcher] store error:", err);
    deps.showToast?.({
      message: "카드 추가 중 오류가 발생했어요",
      durationMs: 4000,
    });
    return { success: false, reason: "store-error", message };
  }
}

/**
 * AiCardConfig → React Flow TravisNode 로 변환.
 *   position 이 없으면 index 기반으로 약간씩 어긋나게 배치해 겹침을 줄인다.
 *   devInject 의 randomSpawnPosition 과 달리, index 시드를 써서 동일 응답은
 *   동일 배치 → E2E 테스트 결정성 확보.
 */
function buildTravisNode(config: AiCardConfig, index: number): TravisNode {
  const position = config.position ?? layoutSlot(index);
  return {
    id: config.id,
    type: TRAVIS_CARD_NODE_TYPE,
    position,
    data: { config },
  };
}

/**
 * 간단한 2x3 그리드 레이아웃 슬롯. 더 많은 카드는 자동으로 아래로 이어 붙는다.
 * 카드 사이즈 md(320x220) 기준 + 30px 마진.
 */
function layoutSlot(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 120 + col * 350,
    y: 80 + row * 250,
  };
}

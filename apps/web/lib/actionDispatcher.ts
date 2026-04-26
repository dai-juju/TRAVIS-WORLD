/**
 * actionDispatcher — AI 오케스트레이터 응답을 캔버스 노드로 변환하는 단일 진입점.
 *
 * 책임 (M1.5 Step 3 에서 확장):
 *   1. 미검증 raw 값(unknown) 을 OrchestrateApiResponseSchema 로 **최상위** Zod 검증
 *      (성공/실패 wrapper 포함). unknown 은 항상 의심하고 Zod 로 승격한다.
 *   2. `kind` 분기:
 *        · "success"  → payload.cards 를 TravisNode 로 빌드해 addNode 연쇄
 *        · "fallback" → 사용자 친화 한국어 message 를 토스트로 노출, 카드 생성 없음
 *   3. cards 에 position 이 없으면 겹치지 않는 spawn 좌표 자동 할당
 *   4. 모든 실패 경로는 **crash 없이 graceful** (CLAUDE.md 불변 원칙) +
 *      (선택) 토스트로 사용자 피드백.
 *
 * 왜 최상위 API Response 를 받도록 확장했나 (2026-04-22, Step 3):
 *   Step 2 에서 /api/orchestrate 가 `{ kind: "success" | "fallback" }` 최상위
 *   discriminated union 을 반환하도록 설계했다. 호출자(ChatInputBar)가 switch 를
 *   중복 작성하지 않도록 dispatcher 가 응답 전체를 소비하게 된다. 단일 함수 하나만
 *   보면 "AI 응답을 받아 화면에 반영한다" 는 의미가 완결된다.
 *
 * spawn action (M2+ 용):
 *   OrchestrateResponse.actions 에 담길 CardAction 은 "row-click → spawn" 같은
 *   인터랙션 정의이며, 본 dispatcher 는 현재 **무시만** 한다(검증 통과만 확인).
 *   실제 인터랙션 바인딩은 M2 drill-down 에서 별도 구현 예정.
 */

import type { StoreApi } from "zustand";
import {
  OrchestrateApiResponseSchema,
  type AiCardConfig,
  type OrchestrateFallbackReason,
  type OrchestrateResponse,
} from "@travis/shared";
import {
  TRAVIS_CARD_NODE_TYPE,
  type CanvasStore,
  type TravisNode,
} from "@/lib/stores/canvasStore";
import { CARD_SIZE_PX } from "@/components/canvas/CardContainer";
import { sendBehaviorEvent } from "@/lib/behavior/sessionFlusher";

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
  /**
   * 실패 원인:
   *   - "validation": API 응답 shape 자체가 OrchestrateApiResponseSchema 를 통과 못함
   *     (방어적 검증 — 서버가 죽거나 route.ts 가 잘못 배포된 극단 케이스)
   *   - "fallback":   API 가 정상적으로 `{ kind: "fallback" }` 을 반환함 (AI 가 실패)
   *   - "empty":      success 응답인데 cards 배열이 비어 있음
   *   - "store-error": addNode 연쇄 중 예외 발생 (사실상 도달 불가, 방어용)
   */
  reason: "validation" | "fallback" | "empty" | "store-error";
  message: string;
  /** Zod 에러 목록 (reason === "validation" 시만). */
  issues?: DispatchIssue[];
  /** API fallback 원인 (reason === "fallback" 시만). */
  fallbackReason?: OrchestrateFallbackReason;
};

export type DispatchResult = DispatchSuccess | DispatchFailure;

export type DispatchDeps = {
  canvasStore: StoreApi<CanvasStore>;
  /** 선택 — 피드백 토스트. 없으면 조용히 실패. */
  showToast?: (opts: { message: string; durationMs?: number }) => void;
};

/**
 * unknown 입력을 OrchestrateApiResponseSchema 로 검증하고, kind 별로 분기.
 *
 * 호출자(ChatInputBar)는 fetch 결과(unknown) 를 그대로 넘기면 됨:
 *   const raw = await fetch("/api/orchestrate", ...).then((r) => r.json());
 *   dispatchOrchestrateResponse(raw, { canvasStore, showToast });
 */
export function dispatchOrchestrateResponse(
  raw: unknown,
  deps: DispatchDeps,
): DispatchResult {
  // 1) 최상위 API Response shape 검증.
  //    서버가 정상 동작하면 이 단계는 항상 통과한다. paranoid 방어선.
  const apiParse = OrchestrateApiResponseSchema.safeParse(raw);
  if (!apiParse.success) {
    const msg = "orchestrate api response validation failed";
    console.error("[actionDispatcher]", msg, apiParse.error.issues);
    deps.showToast?.({
      message: "AI response format was invalid.",
      durationMs: 4000,
    });
    // Zod issue → DispatchIssue 명시 매핑 (code-reviewer W4, 2026-04-22):
    //   `as unknown as` 이중 캐스트 대신 필요한 3개 필드만 추려서 계약을 드러냄.
    //   readonly path 도 mutable 배열로 복사.
    const mappedIssues: DispatchIssue[] = apiParse.error.issues.map((iss) => ({
      path: [...iss.path],
      message: iss.message,
      code: iss.code,
    }));
    return {
      success: false,
      reason: "validation",
      message: msg,
      issues: mappedIssues,
    };
  }

  const apiResponse = apiParse.data;

  // 2) fallback 분기 — AI 가 실패했음을 사용자에게 토스트로 알리기만 한다.
  //    캔버스는 전혀 건드리지 않음 (기존 카드 보존).
  if (apiResponse.kind === "fallback") {
    deps.showToast?.({
      message: apiResponse.message,
      durationMs: 5000,
    });
    return {
      success: false,
      reason: "fallback",
      message: apiResponse.message,
      fallbackReason: apiResponse.reason,
    };
  }

  // 3) success 분기 — payload 꺼내 기존 카드 생성 로직 수행.
  const response = apiResponse.payload;

  // 3-a) 빈 cards — 사용자에게 "없다" 고 알려주는 게 UX 적으로 친절.
  if (response.cards.length === 0) {
    deps.showToast?.({
      message: response.notes ?? "No cards to display.",
      durationMs: 4000,
    });
    return {
      success: false,
      reason: "empty",
      message: "cards array is empty",
    };
  }

  // 3-b) addNode 연쇄. 겹침 방지용 jitter 는 per-call randomized.
  //
  // M1.5 Step 4a' (2026-04-23) — id uniqueness 구조적 강제:
  //   LLM 이 결정적 id ("btc-ticker-1") 를 반환하면 동일 쿼리 2회 시 React Flow
  //   가 같은 id 를 덮어쓴다. canvas 무결성은 AI 순응성(프롬프트)이 아니라
  //   dispatcher 레이어에서 구조적으로 보장해야 하므로, 이 시점에서 충돌
  //   감지 후 short nonce suffix 를 자동 부여한다.
  //
  // 동일하게 layoutSlot 도 "기존 카드 수" 를 시드로 써서, 이번 dispatch 가
  //   기존 카드 위에 겹쳐 떨어지지 않도록 한다. 시각적 겹침 방지.
  try {
    const api = deps.canvasStore.getState();
    const takenIds = new Set(api.nodes.map((n) => n.id));
    const seedOffset = api.nodes.length;
    response.cards.forEach((config, index) => {
      const uniqueId = resolveUniqueId(config.id, takenIds);
      takenIds.add(uniqueId);
      const configWithId =
        uniqueId === config.id ? config : { ...config, id: uniqueId };
      const node = buildTravisNode(configWithId, seedOffset + index);
      api.addNode(node);
      // M1.6 Step 3 Substep 3d (2026-04-26): card_added 즉시 INSERT (희귀 + 고가치).
      // datasource 는 일부 카드 (KlineChartCard) 가 안 가질 수 있어 옵셔널 처리.
      void sendBehaviorEvent("card_added", {
        card_id: uniqueId,
        component_id: configWithId.componentId,
        datasource:
          (configWithId.data as { datasource?: string } | undefined)
            ?.datasource ?? null,
      });
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
      message: "Failed to add cards. Please try again.",
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
  // Step 4.6: React Flow NodeResizer 가 작동하려면 노드에 width/height 가
  // 심어져야 한다. 초기값은 size 토큰(sm/md/lg/xl) → px 매핑을 따름.
  const sizePx = CARD_SIZE_PX[config.size];
  return {
    id: config.id,
    type: TRAVIS_CARD_NODE_TYPE,
    position,
    width: sizePx.w,
    height: sizePx.h,
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

/**
 * AI 가 요청한 id 가 canvas 에 이미 존재하면 short base36 nonce 를 붙여 유일화한다.
 *
 * 이 함수는 "AI 표현력 보존(슬러그 의미 유지) + React Flow 무결성(유일 id)" 두
 * 축을 모두 만족. 충돌이 없으면 원본을 그대로 반환해 "cosmic ray 급" 드문
 * 상황에서만 교체가 일어난다.
 *
 * nonce 길이 6 — 36^6 ≈ 2.2B 조합. 동일 베이스 id 에 대해 suffix 가 다시 충돌할
 * 확률은 실사용 규모(카드 수십~수백) 에서 무시 가능. 최악의 경우 `recursive`
 * 호출로 재시도. 무한 루프 방어는 최대 10회 반복 제한.
 */
function resolveUniqueId(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  for (let attempt = 0; attempt < 10; attempt++) {
    const nonce = Math.random().toString(36).slice(2, 8);
    const candidate = `${desired}-${nonce}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 현실적으로 도달 불가 — 마지막 수단으로 timestamp 기반 유일 키
  return `${desired}-${Date.now().toString(36)}`;
}

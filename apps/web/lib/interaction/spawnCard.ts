/**
 * spawnCard — 카드 요소 클릭 → 새 카드 조립 엔진 (M3-step1, 2026-07-16).
 *
 * "AI 사전 선언" 방식의 실행 절반:
 *   AI 가 카드 생성 시점에 CardAction.target 으로 "클릭하면 어떤 카드(form × data)를
 *   띄울지"를 선언해 두면, 클릭 시 여기서 **AI 재호출 없이** 조립만 한다(반응 0초).
 *   무엇을 띄울지는 전적으로 AI 선언에서 오고, 이 모듈은 "어떻게"(행 값 주입·id
 *   유일화·좌표·검증)만 소유한다 — 코드 큐레이션 금지 원칙의 경계선.
 *
 * 🔴 완전 유효 config 불변식:
 *   저장 뷰는 새로고침 시 카드별 AiCardConfigSchema.safeParse 로 재검증하고 실패분을
 *   조용히 skip 한다 (savedView/serialize.ts hydrateSnapshot). 여기서 불완전 config
 *   를 통과시키면 "라이브에선 보이는데 새로고침하면 사라지는" 카드가 되므로,
 *   조립 결과는 반드시 동일 스키마의 최종 게이트를 통과해야 한다.
 *
 * graceful 실패 계약: 어떤 실패든 crash 없이 { ok: false } 반환 — 호출자
 *   (CardContainer)는 안내 토스트만 띄우고 캔버스는 무손상(no-op).
 */

import {
  AiCardConfigSchema,
  getComponent,
  type CardAction,
} from "@travis/shared";
import type { TravisNode } from "@/lib/stores/canvasStore";
import { buildTravisNode, resolveUniqueId } from "@/lib/canvas/nodeFactory";
import { CARD_SIZE_PX } from "@/lib/canvas/cardSizes";

/** 새 카드가 원본 카드와 떨어지는 간격(px) — layoutSlot 의 30px 마진과 동일 감각. */
const SPAWN_GAP = 30;

/** 겹침 판정 여유(px) — 딱 붙는 배치를 "겹침 아님"으로 오판하지 않게 소폭 마진. */
const OVERLAP_MARGIN = 8;

/** 아래로 밀어내는 cascade 최대 횟수 — 초과 시 대각 오프셋 폴백. */
const MAX_CASCADE_ATTEMPTS = 12;

export type SpawnBuildResult =
  | { ok: true; node: TravisNode }
  | {
      ok: false;
      /**
       * - "missing-row-value": parameterMapping 이 가리키는 컬럼이 클릭된 행에
       *   없거나 비어 있음 (예: null 값 행) — 카드 미생성이 정답.
       * - "invalid-config": 조립 결과가 AiCardConfigSchema 불통과 — emit 시점
       *   부분검증을 지난 타겟이라 드물지만, 스코프 미완성 등 최종 게이트 잔여.
       */
      reason: "missing-row-value" | "invalid-config";
      message: string;
    };

export type SpawnBuildInput = {
  /** AI 가 사전 선언한 spawn 액션 (CardActionSchema 통과분). */
  action: CardAction;
  /** 클릭된 요소가 나타내는 원본 레코드 — form 이 손에 쥔 row 를 그대로 전달. */
  sourceRow: Record<string, unknown>;
  /** 클릭이 발생한 원본 카드 노드 — 상대 좌표 계산 기준. */
  sourceNode: TravisNode;
  /** 현재 캔버스의 전체 노드 — id 유일화 + 겹침 회피에 사용. */
  existingNodes: TravisNode[];
};

/**
 * 클릭 컨텍스트로 spawn 될 TravisNode 를 조립한다. 순수 함수 — store 를 만지지
 * 않으므로 mock 없이 단위 테스트 가능. 노드 추가(addNode)는 호출자 책임.
 */
export function buildSpawnedCard(input: SpawnBuildInput): SpawnBuildResult {
  const { action, sourceRow, sourceNode, existingNodes } = input;

  // 1) parameterMapping 해석 — key = 타겟 data 필드 / value = 소스 행 컬럼.
  //    행 파생 값이 target.data 의 동명 고정 선언보다 우선한다 — 클릭된 행이
  //    "지금 이 대상"의 더 구체적인 진실이기 때문 (예: 여러 시장 섞인 표에서
  //    행마다 market_type 이 다른 경우).
  const rowDerived: Record<string, string> = {};
  for (const [targetField, sourceColumn] of Object.entries(
    action.parameterMapping ?? {},
  )) {
    const raw = sourceRow[sourceColumn];
    if (typeof raw !== "string" || raw.length === 0) {
      return {
        ok: false,
        reason: "missing-row-value",
        message:
          `clicked row has no usable value for column "${sourceColumn}" ` +
          `(needed for target field "${targetField}")`,
      };
    }
    rowDerived[targetField] = raw;
  }

  // 2) 후보 config 조립.
  //    - size: AI 미지정 시 registry defaultSize 폴백 — 레이아웃이라 큐레이션 아님
  //      (표시 의도인 updateMode 는 SpawnTargetSchema 가 필수로 강제).
  //    - id: 클릭 시점의 현재 노드 기준 유일화 — AI 선언에 id 를 두면 반복 클릭이
  //      동일 id 로 덮여 addNode 가 무시하므로 여기서 생성한다.
  const component = getComponent(action.target.componentId);
  const size = action.target.size ?? component?.defaultSize ?? "md";
  const data = { ...action.target.data, ...rowDerived };

  const takenIds = new Set(existingNodes.map((n) => n.id));
  const idBase = ["spawn", action.target.componentId, rowDerived.symbol ?? data.symbol]
    .filter(Boolean)
    .join("-");
  const id = resolveUniqueId(idBase, takenIds);

  const candidate = {
    id,
    componentId: action.target.componentId,
    size,
    updateMode: action.target.updateMode,
    data,
    position: computeSpawnPosition(sourceNode, existingNodes, CARD_SIZE_PX[size]),
  };

  // 3) 최종 게이트 — 기존 카드 스키마 재사용 (신규 검증 로직 0).
  //    실패 시 카드 미생성 + 이슈 로그 (저장 뷰 silent 소실 불변식 방어).
  const parsed = AiCardConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    console.error(
      "[spawnCard] assembled config failed schema gate:",
      parsed.error.issues,
    );
    return {
      ok: false,
      reason: "invalid-config",
      message: "assembled spawn config failed AiCardConfigSchema",
    };
  }

  // position 을 위에서 명시했으므로 layoutSlot 인덱스는 사용되지 않는다.
  return { ok: true, node: buildTravisNode(parsed.data, 0) };
}

/** 노드의 현재 사각형 — RF v12 는 실측을 measured 에만 쓴다(width 는 초기값). */
function nodeRect(n: TravisNode): { x: number; y: number; w: number; h: number } {
  return {
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? (typeof n.width === "number" ? n.width : CARD_SIZE_PX.md.w),
    h:
      n.measured?.height ??
      (typeof n.height === "number" ? n.height : CARD_SIZE_PX.md.h),
  };
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w + OVERLAP_MARGIN &&
    a.x + a.w + OVERLAP_MARGIN > b.x &&
    a.y < b.y + b.h + OVERLAP_MARGIN &&
    a.y + a.h + OVERLAP_MARGIN > b.y
  );
}

/**
 * spawn 좌표 — 원본 카드 오른쪽에 배치, 겹치면 아래로 cascade.
 *
 * 클릭 시 1회만 도는 O(노드 수) AABB 스캔이라 저사양(UHD620)에서도 무해.
 * cascade 소진 시 대각 오프셋 폴백 — "원본 근처"라는 인지 사슬은 유지하되
 * 겹침을 감수(드래그로 정돈 가능, layoutSlot 철학과 동일).
 */
export function computeSpawnPosition(
  sourceNode: TravisNode,
  existingNodes: TravisNode[],
  spawnSize: { w: number; h: number },
): { x: number; y: number } {
  const src = nodeRect(sourceNode);
  const x = src.x + src.w + SPAWN_GAP;
  let y = src.y;

  for (let attempt = 0; attempt < MAX_CASCADE_ATTEMPTS; attempt++) {
    const rect = { x, y, w: spawnSize.w, h: spawnSize.h };
    const collides = existingNodes.some((n) => overlaps(rect, nodeRect(n)));
    if (!collides) return { x, y };
    y += spawnSize.h + SPAWN_GAP;
  }
  return { x: src.x + 40, y: src.y + 40 };
}

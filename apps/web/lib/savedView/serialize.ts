/**
 * savedView/serialize — 캔버스 ↔ 저장 스냅샷 변환 (M2 테마 C Step 2).
 *
 * ★ 클라이언트 전용: TravisNode(@xyflow/react 의존)를 다루므로 canvasStore 를
 *   import 한다. 순수 스키마는 `schema.ts` 에 분리(서버 라우트는 그쪽만 사용).
 *
 * 저장 strict / 로드 graceful 비대칭 (의도):
 *   - 저장: 카드는 방금 검증된 유효 config → 그대로 직렬화.
 *   - 로드: 며칠 전 DB 데이터 → 그 사이 registry drift 가능 → 카드별 safeParse 로
 *     깨진 것만 스킵(skipped 반환). AiCardConfigSchema 가 registry-derived 라 drift
 *     를 자동 검출.
 */
import { AiCardConfigSchema } from "@travis/shared";
import {
  TRAVIS_CARD_NODE_TYPE,
  type CanvasState,
  type TravisNode,
} from "@/lib/stores/canvasStore";
import {
  LooseSnapshotSchema,
  type SavedViewSnapshot,
  type SavedViewViewport,
} from "@/lib/savedView/schema";

// 로드 시 zoom clamp 범위 — DB 가 손상/극단값(zoom:1e9 등)을 들고 있어도 화면이
//   깨지지 않게 보정 (로드 graceful 대칭, reviewer W3). React Flow 자체 min/maxZoom
//   (0.2~2)보다 넓게 둬 정상 저장값은 그대로 통과, 극단값만 잘라낸다.
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;

// ─── serialize (캔버스 → 스냅샷) ────────────────────────────────────────

/**
 * 현재 캔버스 상태를 저장 스냅샷으로 변환 (순수 함수).
 * travis-card 노드만 직렬화. width/height 도 함께 저장해 리사이즈된 카드 충실 복원.
 */
export function serializeCanvas(
  state: Pick<CanvasState, "nodes" | "viewport">,
): SavedViewSnapshot {
  const cards = state.nodes
    .filter((n) => n.type === TRAVIS_CARD_NODE_TYPE)
    .map((n) => ({
      config: n.data.config,
      position: { x: n.position.x, y: n.position.y },
      width: typeof n.width === "number" ? n.width : undefined,
      height: typeof n.height === "number" ? n.height : undefined,
    }));

  return {
    cards,
    viewport: {
      x: state.viewport.x,
      y: state.viewport.y,
      zoom: state.viewport.zoom,
    },
  };
}

// ─── hydrate (스냅샷 → 노드) ────────────────────────────────────────────

export type HydrateResult = {
  /** 복원된 노드 (drift 카드는 제외). */
  nodes: TravisNode[];
  /** 복원할 뷰포트 (React Flow setViewport 로 적용). zoom 은 안전 범위로 clamp 됨. */
  viewport: SavedViewViewport;
  /** registry drift / 중복 id 로 스킵된 카드 수. */
  skipped: number;
};

/**
 * DB 스냅샷(unknown) → 복원 결과. 바깥 구조가 깨졌으면 null(전체 포기, graceful).
 * 개별 카드 config 가 drift 면 그 카드만 스킵하고 나머지는 복원.
 *
 * ★ drift 스킵은 AiCardConfigSchema 가 registry-derived(빈 registry 면 전부 실패)
 *   라는 전제에 의존한다 — [M1.6 Step 4] 빈 registry 가드가 깨지면 모든 카드가
 *   스킵되는 silent 손실이 되므로, 그 가드는 불변식이다 (reviewer S4).
 *
 * @param raw - { cards, viewport } 형태 (호출자가 DB row 의 cards_config/canvas_state 로 조립)
 */
export function hydrateSnapshot(raw: unknown): HydrateResult | null {
  const outer = LooseSnapshotSchema.safeParse(raw);
  if (!outer.success) {
    console.warn(
      "[savedView] snapshot 구조 검증 실패 — 복원 불가:",
      outer.error.issues.slice(0, 3),
    );
    return null;
  }

  let skipped = 0;
  const nodes: TravisNode[] = [];
  const seenIds = new Set<string>();

  for (const entry of outer.data.cards) {
    const parsed = AiCardConfigSchema.safeParse(entry.config);
    if (!parsed.success) {
      // registry drift(컴포넌트/데이터소스 제거 등) — 이 카드만 스킵.
      skipped++;
      continue;
    }
    // 저장 데이터에 동일 id 가 두 번 있어도 React Flow 무결성 위해 첫 1개만.
    if (seenIds.has(parsed.data.id)) {
      skipped++;
      continue;
    }
    seenIds.add(parsed.data.id);
    nodes.push({
      id: parsed.data.id,
      type: TRAVIS_CARD_NODE_TYPE,
      position: entry.position,
      width: entry.width,
      height: entry.height,
      data: { config: parsed.data },
    });
  }

  const vp = outer.data.viewport;
  const viewport: SavedViewViewport = {
    x: vp.x,
    y: vp.y,
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.zoom)),
  };

  return { nodes, viewport, skipped };
}

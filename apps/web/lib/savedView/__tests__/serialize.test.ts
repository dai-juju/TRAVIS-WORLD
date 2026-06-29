/**
 * savedView/serialize 테스트 (M2 테마 C Step 2 Sub-step 2).
 *
 * 검증:
 *   (1) serialize → hydrate 라운드트립 (config/position/size/viewport 보존)
 *   (2) registry drift 카드만 스킵 (나머지 복원) — 저장 strict / 로드 graceful
 *   (3) 바깥 구조 깨짐 → null (전체 graceful 포기)
 *   (4) 중복 id 스킵 (React Flow 무결성)
 */
import { describe, it, expect } from "vitest";
import { AiCardConfigSchema, type AiCardConfig } from "@travis/shared";
import { TRAVIS_CARD_NODE_TYPE, type TravisNode } from "@/lib/stores/canvasStore";
import { serializeCanvas, hydrateSnapshot } from "@/lib/savedView/serialize";

/** 유효 config (table-card + open_interest = registry 검증 통과 조합). */
function makeConfig(id: string): AiCardConfig {
  return AiCardConfigSchema.parse({
    id,
    size: "md",
    updateMode: "content",
    componentId: "table-card",
    data: { datasource: "open_interest" },
  });
}

function makeNode(
  id: string,
  position: { x: number; y: number },
  width?: number,
  height?: number,
): TravisNode {
  return {
    id,
    type: TRAVIS_CARD_NODE_TYPE,
    position,
    width,
    height,
    data: { config: makeConfig(id) },
  };
}

const VIEWPORT = { x: 5, y: 6, zoom: 1.5 };

describe("savedView serialize/hydrate", () => {
  it("(1) serialize → hydrate 라운드트립 — config/position/size/viewport 보존", () => {
    const nodes = [
      makeNode("card-a", { x: 10, y: 20 }, 300, 200),
      makeNode("card-b", { x: 30, y: 40 }), // width/height 없음
    ];

    const snap = serializeCanvas({ nodes, viewport: VIEWPORT });
    expect(snap.cards).toHaveLength(2);
    expect(snap.viewport).toEqual(VIEWPORT);

    const result = hydrateSnapshot({
      cards: snap.cards,
      viewport: snap.viewport,
    });
    expect(result).not.toBeNull();
    expect(result!.skipped).toBe(0);
    expect(result!.nodes).toHaveLength(2);
    expect(result!.viewport).toEqual(VIEWPORT);

    const a = result!.nodes.find((n) => n.id === "card-a")!;
    expect(a.position).toEqual({ x: 10, y: 20 });
    expect(a.width).toBe(300);
    expect(a.height).toBe(200);
    expect(a.type).toBe(TRAVIS_CARD_NODE_TYPE);
    expect(a.data.config.componentId).toBe("table-card");

    const b = result!.nodes.find((n) => n.id === "card-b")!;
    expect(b.width).toBeUndefined();
  });

  it("(2) registry drift 카드만 스킵, 유효 카드는 복원", () => {
    const snapshot = {
      cards: [
        { config: makeConfig("valid-1"), position: { x: 0, y: 0 } },
        {
          // coin-list-card = Step 4(2026-06-30)에서 폐기된 옛 카드 id → 미등록 → graceful
          //   skip. 저장뷰 alias 대신 "옛 id 는 조용히 스킵" 안전망을 박제(베타 전 전체 삭제 전략).
          config: {
            id: "drifted",
            size: "md",
            updateMode: "content",
            componentId: "coin-list-card",
            data: { datasource: "open_interest" },
          },
          position: { x: 100, y: 0 },
        },
      ],
      viewport: VIEWPORT,
    };

    const result = hydrateSnapshot(snapshot);
    expect(result).not.toBeNull();
    expect(result!.skipped).toBe(1);
    expect(result!.nodes).toHaveLength(1);
    expect(result!.nodes[0]!.id).toBe("valid-1");
  });

  it("(3) 바깥 구조가 깨지면 null (graceful 전체 포기)", () => {
    expect(hydrateSnapshot(null)).toBeNull();
    expect(hydrateSnapshot({})).toBeNull(); // cards/viewport 누락
    expect(hydrateSnapshot({ cards: [] })).toBeNull(); // viewport 누락
    // 빈 cards + viewport 정상 = 유효(노드 0).
    const empty = hydrateSnapshot({ cards: [], viewport: VIEWPORT });
    expect(empty).not.toBeNull();
    expect(empty!.nodes).toHaveLength(0);
  });

  it("(5) 극단 zoom 은 안전 범위로 clamp (로드 graceful 대칭)", () => {
    const huge = hydrateSnapshot({
      cards: [],
      viewport: { x: 0, y: 0, zoom: 1e9 },
    });
    expect(huge!.viewport.zoom).toBe(8); // ZOOM_MAX

    const tiny = hydrateSnapshot({
      cards: [],
      viewport: { x: 0, y: 0, zoom: 0.0000001 },
    });
    expect(tiny!.viewport.zoom).toBe(0.05); // ZOOM_MIN

    const normal = hydrateSnapshot({
      cards: [],
      viewport: { x: 1, y: 2, zoom: 1.5 },
    });
    expect(normal!.viewport.zoom).toBe(1.5); // 정상값은 통과
  });

  it("(4) 중복 id 는 첫 1개만 복원, 나머지 스킵", () => {
    const snapshot = {
      cards: [
        { config: makeConfig("dup"), position: { x: 0, y: 0 } },
        { config: makeConfig("dup"), position: { x: 50, y: 50 } },
      ],
      viewport: VIEWPORT,
    };
    const result = hydrateSnapshot(snapshot);
    expect(result!.nodes).toHaveLength(1);
    expect(result!.skipped).toBe(1);
    expect(result!.nodes[0]!.position).toEqual({ x: 0, y: 0 });
  });
});

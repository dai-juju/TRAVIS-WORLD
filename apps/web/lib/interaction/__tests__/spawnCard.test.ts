// spawnCard 조립 엔진 단위 테스트 (M3-step1, 2026-07-16).
//
// 순수 함수라 mock store 불필요 — 입력(액션·행·노드)만 조립해 검증한다.
// 핵심 불변식:
//   1. 조립 결과는 AiCardConfigSchema 최종 게이트 통과분만 ok (저장 뷰 재검증
//      silent 소실 방어 — serialize.ts hydrateSnapshot 계약).
//   2. id 는 클릭 시점 유일화 — 같은 행 반복 클릭이 덮어쓰기 없이 새 카드.
//   3. 좌표는 원본 오른쪽, 겹치면 아래 cascade.
//   4. 모든 실패는 crash 없이 { ok: false } (graceful).
//   5. [10-113] (M3-step2): viewportRect 가 주어지면 뷰포트 안 빈자리 우선 배치,
//      만차 시에만 화면 밖 + inViewport=false. 미전달 시 기존 동작 완전 동일.

import { describe, it, expect } from "vitest";
import type { CardAction } from "@travis/shared";
import type { TravisNode } from "@/lib/stores/canvasStore";
import {
  buildSpawnedCard,
  computeSpawnPosition,
  type ViewportRect,
} from "../spawnCard";

/** 소스 카드(스크리너 표) 노드 픽스처 — lg(480x320), (100, 80) 배치. */
function makeSourceNode(): TravisNode {
  return {
    id: "screener-src",
    type: "travis-card",
    position: { x: 100, y: 80 },
    width: 480,
    height: 320,
    data: {
      config: {
        id: "screener-src",
        componentId: "table-card",
        size: "lg",
        updateMode: "content",
        data: {
          datasource: "now_futures_ticker",
          exchange: "binance",
          sort: { field: "price_change_pct", direction: "desc" },
          limit: 10,
        },
      },
    },
  };
}

/** AI 가 사전 선언한 spawn 액션 픽스처 — 행 클릭 → big-value 티커 카드. */
function makeAction(): CardAction {
  return {
    trigger: "row-click",
    type: "spawn",
    target: {
      componentId: "big-value-card",
      updateMode: "value",
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
      },
    },
    parameterMapping: { symbol: "symbol", marketType: "market_type" },
  };
}

const clickedRow = {
  symbol: "ETHUSDT",
  market_type: "futures_usdm",
  last_price: 3400.5,
};

describe("buildSpawnedCard", () => {
  it("정상 조립 — 행 값 주입 + 스키마 통과 + 원본 오른쪽 배치", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { node } = result;
    expect(node.data.config.componentId).toBe("big-value-card");
    expect(node.data.config.data.symbol).toBe("ETHUSDT");
    expect(node.data.config.data.marketType).toBe("futures_usdm");
    expect(node.data.config.updateMode).toBe("value"); // AI 선언 보존
    expect(node.id).toContain("spawn-big-value-card-ETHUSDT");
    // 원본(x=100, w=480) 오른쪽 + GAP(30) = 610
    expect(node.position.x).toBe(610);
    expect(node.position.y).toBe(80);
  });

  it("size 미선언 시 registry defaultSize 폴백 (레이아웃 — 큐레이션 아님)", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // big-value-card 의 registry defaultSize 와 노드 초기 크기가 일치해야 함 —
    // 값 자체를 핀하지 않고(레지스트리 소유) 파생 관계만 검증.
    expect(typeof result.node.width).toBe("number");
    expect(result.node.data.config.size).toBeDefined();
  });

  it("같은 행 반복 클릭 — id 충돌 없이 새 노드 + cascade 배치", () => {
    const sourceNode = makeSourceNode();
    const first = buildSpawnedCard({
      action: makeAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = buildSpawnedCard({
      action: makeAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode, first.node],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.node.id).not.toBe(first.node.id);
    // 첫 카드가 오른쪽 슬롯을 차지했으므로 두 번째는 아래로 밀림.
    expect(second.node.position.y).toBeGreaterThan(first.node.position.y);
  });

  it("행 파생 값이 target.data 고정 선언보다 우선 (클릭된 행 = 더 구체적 진실)", () => {
    const action = makeAction();
    action.target.data.marketType = "spot"; // AI 가 고정 선언했더라도
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action,
      sourceRow: clickedRow, // 행은 futures_usdm
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.data.config.data.marketType).toBe("futures_usdm");
  });

  it("클릭 행에 매핑 컬럼 값이 없으면 missing-row-value (카드 미생성, graceful)", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeAction(),
      sourceRow: { last_price: 3400.5 }, // symbol/market_type 부재
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing-row-value");
  });

  it("★스코프 보충: AI 가 marketType 통로를 안 만들어도 행에 값이 있으면 조립 성공 ([10-114] 실측 계보)", () => {
    const action = makeAction();
    // 2026-07-17 프로덕션 실사고 재현: marketType 이 target.data 고정에도
    // parameterMapping 에도 없음 — 스키마가 지목한 결핍을 행의 canonical
    // 컬럼(market_type)에서 빈 칸 보충 후 재검증하는 3.5 단계가 구제해야 한다.
    action.parameterMapping = { symbol: "symbol" };
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action,
      sourceRow: clickedRow, // market_type: "futures_usdm" 존재
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.data.config.data.marketType).toBe("futures_usdm");
  });

  it("조립 불통과 + 행에도 스코프 값 없음 → invalid-config 유지 (보충 불가 경로)", () => {
    const action = makeAction();
    action.parameterMapping = { symbol: "symbol" };
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action,
      sourceRow: { symbol: "ETHUSDT", last_price: 3400.5 }, // market_type 부재
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid-config");
  });

  it("스코프 보충은 AI 명시값을 덮지 않는다 — 빈 칸만 채움", () => {
    const action = makeAction();
    // AI 가 marketType 을 고정 선언(spot) — 행(futures_usdm)과 달라도 명시값 우선.
    // (매핑에 없는 필드이므로 rowDerived 도 건드리지 않는 경로.)
    action.parameterMapping = { symbol: "symbol" };
    action.target.data.marketType = "spot";
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action,
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.data.config.data.marketType).toBe("spot");
  });
});

describe("computeSpawnPosition", () => {
  const spawnSize = { w: 320, h: 220 };

  it("빈 공간이면 원본 오른쪽 + GAP", () => {
    const src = makeSourceNode();
    const pos = computeSpawnPosition(src, [src], spawnSize);
    expect(pos).toEqual({ x: 610, y: 80, inViewport: true });
  });

  it("오른쪽이 점유되면 아래로 cascade", () => {
    const src = makeSourceNode();
    const occupying: TravisNode = {
      ...makeSourceNode(),
      id: "occupier",
      position: { x: 610, y: 80 },
      width: 320,
      height: 220,
    };
    const pos = computeSpawnPosition(src, [src, occupying], spawnSize);
    expect(pos.x).toBe(610);
    expect(pos.y).toBeGreaterThan(80);
  });

  it("RF v12 measured 실측이 초기 width 보다 우선", () => {
    const src = makeSourceNode();
    // 유저가 NodeResizer 로 넓힌 상황 — measured 가 진실.
    src.measured = { width: 700, height: 320 };
    const pos = computeSpawnPosition(src, [src], spawnSize);
    expect(pos.x).toBe(100 + 700 + 30);
  });
});

// ─── [10-113] 뷰포트 인지 배치 (M3-step2) ───────────────────────────────
describe("computeSpawnPosition — viewportRect", () => {
  const spawnSize = { w: 320, h: 220 };

  /** 노드 픽스처 — 배치 결과를 캔버스에 쌓을 때 사용. */
  function nodeAt(id: string, x: number, y: number): TravisNode {
    return {
      ...makeSourceNode(),
      id,
      position: { x, y },
      width: spawnSize.w,
      height: spawnSize.h,
    };
  }

  it("연속 spawn 12회 전부 뷰포트 안 착지 (핵심 시나리오)", () => {
    const src = makeSourceNode(); // (100,80) 480x320
    const vp: ViewportRect = { x: 0, y: 0, w: 2400, h: 1500 };
    const nodes: TravisNode[] = [src];

    for (let i = 0; i < 12; i++) {
      const pos = computeSpawnPosition(src, nodes, spawnSize, vp);
      expect(pos.inViewport).toBe(true);
      // 뷰포트 완전 내부 (패딩 포함 판정은 구현 소유 — 경계만 검증).
      expect(pos.x).toBeGreaterThanOrEqual(vp.x);
      expect(pos.y).toBeGreaterThanOrEqual(vp.y);
      expect(pos.x + spawnSize.w).toBeLessThanOrEqual(vp.x + vp.w);
      expect(pos.y + spawnSize.h).toBeLessThanOrEqual(vp.y + vp.h);
      // 기존 카드와 비겹침 — 빈자리 배치의 본질.
      for (const n of nodes) {
        const overlapX =
          pos.x < n.position.x + (n.width ?? 0) && pos.x + spawnSize.w > n.position.x;
        const overlapY =
          pos.y < n.position.y + (n.height ?? 0) &&
          pos.y + spawnSize.h > n.position.y;
        expect(overlapX && overlapY).toBe(false);
      }
      nodes.push(nodeAt(`spawned-${i}`, pos.x, pos.y));
    }
  });

  it("팬 해서 다른 곳을 보는 중이면(오른쪽이 뷰포트 밖) 뷰포트 안 빈자리로", () => {
    const src = makeSourceNode(); // 오른쪽 슬롯 x=610
    // 뷰포트가 소스 카드 왼쪽 영역만 보이는 상황 — x 610 은 화면 밖.
    const vp: ViewportRect = { x: -600, y: -100, w: 1100, h: 900 };
    const pos = computeSpawnPosition(src, [src], spawnSize, vp);
    expect(pos.inViewport).toBe(true);
    expect(pos.x + spawnSize.w).toBeLessThanOrEqual(vp.x + vp.w);
  });

  it("만차면 화면 밖 관례 배치 + inViewport=false (토스트 이동 신호)", () => {
    // 소스 카드가 작은 뷰포트를 거의 다 차지 — 뷰포트 안 빈 칸 0.
    const src = nodeAt("big-src", 12, 12);
    src.width = 360;
    src.height = 260;
    const vp: ViewportRect = { x: 0, y: 0, w: 400, h: 300 };
    const pos = computeSpawnPosition(src, [src], spawnSize, vp);
    expect(pos.inViewport).toBe(false);
    // 관례(오른쪽) 폴백 — M3-step1 원행동 보존.
    expect(pos.x).toBe(12 + 360 + 30);
  });

  it("카드가 뷰포트보다 크면(심한 줌인) 폴백 + inViewport=false", () => {
    const src = makeSourceNode();
    const vp: ViewportRect = { x: 0, y: 0, w: 200, h: 150 };
    const pos = computeSpawnPosition(src, [src], spawnSize, vp);
    expect(pos.inViewport).toBe(false);
  });

  it("viewportRect 미전달 시 기존 동작과 동일 (가산 확장 — 회귀 0)", () => {
    const src = makeSourceNode();
    const withVp = computeSpawnPosition(src, [src], spawnSize);
    expect(withVp).toEqual({ x: 610, y: 80, inViewport: true });
  });
});

// ─── [10-115] 재클릭 체인 관통 (M3-step2) ────────────────────────────────
describe("buildSpawnedCard — [10-115] target.actions 체인 관통", () => {
  /** 표 행 클릭 → mid(detail) 카드, mid 헤더 클릭 → leaf(chart) 선언. */
  function makeChainAction(): CardAction {
    return {
      trigger: "row-click",
      type: "spawn",
      target: {
        componentId: "detail-card",
        updateMode: "value",
        data: {
          datasource: "now_futures_ticker",
          exchange: "binance",
        },
        actions: [
          {
            trigger: "header-click",
            type: "spawn",
            target: {
              componentId: "chart-card",
              updateMode: "value",
              data: {
                datasource: "open_interest_history",
                exchange: "binance",
                marketType: "futures_usdm",
                interval: "1h",
              },
            },
            parameterMapping: { symbol: "symbol" },
          },
        ],
      },
      parameterMapping: { symbol: "symbol", marketType: "market_type" },
    };
  }

  it("mid 카드 config 에 actions 관통 — 스폰된 카드가 클릭 표면을 가짐", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeChainAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const midActions = result.node.data.config.actions;
    expect(midActions).toHaveLength(1);
    expect(midActions?.[0]?.target.componentId).toBe("chart-card");
  });

  it("★암묵 스코프 선보충: 스코프 면제 form(kline)도 단일 대상이면 행에서 symbol 보충", () => {
    // 프로덕션 실측: AI 가 leaf(kline)에 symbol 통로 없이 선언 — kline 은 스코프
    // 강제 면제(ds.table 부재)라 스키마가 결핍을 못 잡음 → 2.5 선보충이 유일 방어.
    const leafAction: CardAction = {
      trigger: "header-click",
      type: "spawn",
      target: {
        componentId: "kline-chart-card",
        updateMode: "value",
        data: { datasource: "kline", exchange: "binance", interval: "1d" },
      },
      // parameterMapping 없음 — AI 실선언 재현
    };
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: leafAction,
      sourceRow: { symbol: "LUMIAUSDT", market_type: "spot", last_price: 0.1 },
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.data.config.data.symbol).toBe("LUMIAUSDT");
    expect(result.node.data.config.data.marketType).toBe("spot");
  });

  it("leaf(actions 없는 target) spawn 은 config.actions 미포함 — 말단 카드", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeAction(), // target 에 actions 없음
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.data.config.actions).toBeUndefined();
  });
});

describe("buildSpawnedCard — placedInViewport 전달", () => {
  it("뷰포트 안 배치면 placedInViewport=true", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
      viewportRect: { x: 0, y: 0, w: 2400, h: 1500 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placedInViewport).toBe(true);
  });

  it("viewportRect 미전달이면 placedInViewport=true (토스트 분기 무변화)", () => {
    const sourceNode = makeSourceNode();
    const result = buildSpawnedCard({
      action: makeAction(),
      sourceRow: clickedRow,
      sourceNode,
      existingNodes: [sourceNode],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placedInViewport).toBe(true);
  });
});

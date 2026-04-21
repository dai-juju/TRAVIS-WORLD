"use client";
/**
 * CanvasWorkspace — TRAVIS 무한 2D 캔버스 (M1.4 Step 1 — 빈 뼈대).
 *
 * 책임:
 *   - ReactFlowProvider 로 감싸진 React Flow v12 루트
 *   - Zustand canvasStore 와 양방향 동기화 (nodes/edges/viewport)
 *   - Background (Dots) + Controls (좌하단 줌/팬)
 *
 * Step 1 에서 의도적으로 제외한 것:
 *   - 커스텀 nodeTypes → Step 2 CardContainer 에서 등록
 *   - 채팅 입력바 / 사이드바 → Step 6
 *   - 카드 삭제 UI / 리사이즈 → Step 2 NodeResizer + 헤더
 *   - onNodesDelete 훅 → Step 2
 *
 * 성능 규칙 (nextjs-frontend-specialist §2.2):
 *   - nodeTypes 는 빈 객체지만 컴포넌트 바깥 상수로 선언해 참조 고정
 *   - selective 구독으로 과도한 재렌더 방지
 *
 * Adaptive 렌더링 고려 (Intel UHD 620 기준):
 *   - Background variant="dots" 는 lines 보다 GPU 부담 적음
 *   - panOnDrag + selectionOnDrag 는 Low 티어에서도 안정
 *   - minZoom 0.2 / maxZoom 2.0 으로 극단적 줌에서의 리렌더 억제
 */
import { useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import { useCanvasStore } from "@/lib/providers/CanvasStoreProvider";
import { CardContainer } from "@/components/canvas/CardContainer";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { TRAVIS_CARD_NODE_TYPE, type TravisNode } from "@/lib/stores/canvasStore";

// nodeTypes — 컴포넌트 바깥 상수로 선언해 참조 고정 (React Flow v12 성능 규칙).
// "travis-card" 는 Step 2 에서 도입된 유일한 커스텀 노드 타입. Step 3~5 카드들은
// 별도 노드 타입이 아니라 이 CardContainer 내부에서 config.componentId 로 분기한다.
const nodeTypes: NodeTypes = {
  [TRAVIS_CARD_NODE_TYPE]: CardContainer,
};

/**
 * ReactFlow 본체 — Provider 내부에서 useReactFlow 훅을 쓸 수 있는 자리.
 */
function CanvasInner() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const viewport = useCanvasStore((s) => s.viewport);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setCanvasReady = useCanvasStore((s) => s.setCanvasReady);
  const removeNode = useCanvasStore((s) => s.removeNode);

  // React Flow 는 node 가 제거될 때 onNodesChange 로 "remove" change 를 흘려보낸다.
  // applyNodeChanges 가 자동 처리하지만, onNodesDelete 훅을 별도로 붙여 향후
  // 영속성(M1.6 Supabase user_views) 에 삭제 이벤트를 broadcast 할 여지를 둔다.
  const handleNodesDelete = useCallback(
    (deleted: TravisNode[]) => {
      for (const n of deleted) removeNode(n.id);
    },
    [removeNode],
  );

  // onMove 는 줌/팬 제스처 중 지속적으로 호출되므로 Zustand 로의 flush 는
  // onMoveEnd 시점으로 미뤄 성능 확보 (Low 티어에서 드래그 중 재렌더 폭증 방지).
  const handleMoveEnd = useCallback(
    (_: unknown, vp: Viewport) => {
      setViewport(vp);
    },
    [setViewport],
  );

  const handleInit = useCallback(() => {
    setCanvasReady(true);
  }, [setCanvasReady]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodesDelete={handleNodesDelete}
      onMoveEnd={handleMoveEnd}
      onInit={handleInit}
      defaultViewport={viewport}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: false }}
      // UHD 620 저사양 대응 — 카드가 많아지면 viewport 바깥 노드 렌더 생략.
      onlyRenderVisibleElements
      // 빈 공간 드래그 = 팬. 카드 선택은 Step 2 이후부터 실의미.
      panOnDrag
      selectionOnDrag={false}
      // 캔버스 자체에서 키보드 Delete 로 노드를 지우지 않도록 — 명시적 UI 만 허용.
      deleteKeyCode={null}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls position="bottom-left" showInteractive={false} />
    </ReactFlow>
  );
}

/**
 * 외부로 export 하는 공식 진입점. Provider 가 여기에 박혀있다.
 * 전체 높이를 차지하려면 부모가 h-screen 등을 보장해야 함 (page.tsx 에서 처리).
 */
export default function CanvasWorkspace() {
  return (
    <div className="h-screen w-screen bg-background">
      {/* 좌측 상단 테마 토글 — fixed 포지션이라 ReactFlow 와 충돌 없음. */}
      <ThemeToggle />
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
      {/* 하단 중앙 채팅 입력바 (Step 4-3) — ThemeToggle 과 대칭 배치. */}
      <ChatInputBar />
    </div>
  );
}

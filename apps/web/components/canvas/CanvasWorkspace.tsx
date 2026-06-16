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
import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  type NodeChange,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import { useCanvasStore } from "@/lib/providers/CanvasStoreProvider";
import { useUiShellStore } from "@/lib/providers/UiShellStoreProvider";
import { CardContainer } from "@/components/canvas/CardContainer";
import { ChatInputBar } from "@/components/chat/ChatInputBar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ShellPanel } from "@/components/shell/ShellPanel";
import { PanelRail } from "@/components/shell/PanelRail";
import { LeftPanel } from "@/components/shell/LeftPanel";
import { RailAccount } from "@/components/shell/RailAccount";
import { AuthSessionProvider } from "@/lib/providers/AuthSessionProvider";
import { sessionFlusher } from "@/lib/behavior/sessionFlusher";
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
  const onNodesChangeStore = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setCanvasReady = useCanvasStore((s) => s.setCanvasReady);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const pendingViewport = useCanvasStore((s) => s.pendingViewport);
  const clearPendingViewport = useCanvasStore((s) => s.clearPendingViewport);

  // 저장 뷰 로드 시 viewport 복원 — My Views 패널(Provider 바깥)이 set 한
  //   pendingViewport 신호를 여기(Provider 안)서 실제 RF 인스턴스에 적용 후 소거.
  const { setViewport: rfSetViewport } = useReactFlow();
  useEffect(() => {
    if (!pendingViewport) return;
    void rfSetViewport(pendingViewport);
    clearPendingViewport();
  }, [pendingViewport, rfSetViewport, clearPendingViewport]);

  // React Flow 는 node 가 제거될 때 onNodesChange 로 "remove" change 를 흘려보낸다.
  // applyNodeChanges 가 자동 처리하지만, onNodesDelete 훅을 별도로 붙여 향후
  // 영속성(M1.6 Supabase user_views) 에 삭제 이벤트를 broadcast 할 여지를 둔다.
  const handleNodesDelete = useCallback(
    (deleted: TravisNode[]) => {
      for (const n of deleted) removeNode(n.id);
    },
    [removeNode],
  );

  // M1.6 Step 3 Substep 3d (2026-04-26) — sessionFlusher 인스트루멘트 wrapper.
  //   React Flow NodeChange 중 `position`(드래그) / `dimensions`(리사이즈) 변경의
  //   "종료" 시점만 sessionFlusher 카운터에 기록. 클라이언트 메모리 누적 → 4중
  //   flush 가드 (5min idle / visibility / pagehide / unmount) 시 batch INSERT.
  //
  //   "종료" 판정 (React Flow v12 NodeChange spec):
  //     · position: change.dragging === false 인 마지막 change
  //     · dimensions: change.resizing === false 인 마지막 change
  //   드래그/리사이즈 도중의 미들 change 는 카운트 안 함 — 종료 시 1회만 +1.
  const handleNodesChange = useCallback(
    (changes: NodeChange<TravisNode>[]) => {
      for (const change of changes) {
        if (
          change.type === "position" &&
          change.dragging === false &&
          change.position
        ) {
          sessionFlusher.recordDrag(
            change.id,
            change.position.x,
            change.position.y,
          );
        } else if (
          change.type === "dimensions" &&
          change.resizing === false &&
          change.dimensions
        ) {
          sessionFlusher.recordResize(
            change.id,
            change.dimensions.width,
            change.dimensions.height,
          );
        }
      }
      onNodesChangeStore(changes);
    },
    [onNodesChangeStore],
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
      onNodesChange={handleNodesChange}
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
 * UI 셸 — 좌측 패널 + 가운데 캔버스 (M2 테마 C Step 0).
 *
 * 레이아웃: flex [좌rail | 좌panel | main(flex-1)]
 *   - rail 은 항상 노출(토글 손잡이), panel 은 열림 시에만 폭 차지(Push).
 *   - 패널을 열면 flex-1 캔버스가 실제로 줄어듦 (사용자 결정: Push 방식).
 *   - 기본값 닫힘 → 평소 캔버스 full-width, reflow 0.
 *   - ★ 우측 "Session Log" 패널은 2026-06-15 폐기 (좌측 단일 패널 구조).
 *
 * 고정 2요소(Theme/Chat)를 캔버스 <main> 안 absolute 로 편입한 이유:
 *   기존 fixed(=뷰포트 기준)는 패널을 열면 캔버스가 좁아져도 그대로라 패널 위로
 *   침범한다(특히 ChatInputBar 의 뷰포트-중앙). <main relative> 기준 absolute 로
 *   바꾸면 캔버스 영역을 따라 자동 추종한다.
 *   ★ 계정 위젯(UserMenu)은 2026-06-16 좌측 패널 상단으로 이전 — main 우상단에서
 *   제거됨. 닫힘 시 접근점은 rail 하단 RailAccount.
 */
function CanvasShell() {
  const leftOpen = useUiShellStore((s) => s.leftOpen);
  const toggleLeft = useUiShellStore((s) => s.toggleLeft);

  return (
    <div className="flex h-screen w-screen bg-background">
      {/* 좌측: 항상-노출 rail + 슬라이드 패널 (rail 이 가장 바깥 가장자리).
       *  rail 하단 footer = 계정 점(RailAccount) — 패널 닫힘 시 로그인 접근점. */}
      <PanelRail
        side="left"
        label="My Views"
        open={leftOpen}
        onToggle={toggleLeft}
        footer={<RailAccount />}
      />
      <ShellPanel side="left" open={leftOpen}>
        <LeftPanel />
      </ShellPanel>

      {/* 가운데: 캔버스 영역. relative 가 Theme/User/Chat absolute 의 기준점.
       *  min-w-0 누락 시 Push 가 안 먹는 flexbox 고질 함정 — 반드시 유지.
       *  ⚠️ 불변식: <main> 에 z-index 를 절대 부여하지 말 것. z-* 나 transform/
       *  filter/will-change 를 붙이면 새 stacking context 가 생겨, 내부 패널(z-30)/
       *  rail(z-40) 이 부모 레벨에 갇혀 layout.tsx 의 UndoToast(z-50) 최상위 불변식
       *  이 깨진다 (code-reviewer W1, 2026-06-15). */}
      <main className="relative h-full min-w-0 flex-1">
        {/* 좌상단 테마 토글 — 캔버스 영역 기준 absolute. */}
        <ThemeToggle />
        <ReactFlowProvider>
          <CanvasInner />
        </ReactFlowProvider>
        {/* 하단 중앙 채팅 입력바 (Step 4-3) — 캔버스 영역 중앙 추종. */}
        <ChatInputBar />
      </main>
    </div>
  );
}

/**
 * 외부로 export 하는 공식 진입점.
 * 전체 높이를 차지하려면 부모가 h-screen 등을 보장해야 함 (page.tsx 에서 처리).
 *
 * AuthSessionProvider 로 감싸 계정 위젯(좌패널 UserMenu + rail RailAccount)이
 * 단일 인증 구독을 공유한다. layout.tsx(전역)가 아닌 여기 둔 이유: /login·/signup
 * 에선 세션 구독이 불필요 → 캔버스 스코프로 한정.
 */
export default function CanvasWorkspace() {
  return (
    <AuthSessionProvider>
      <CanvasShell />
    </AuthSessionProvider>
  );
}

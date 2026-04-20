/**
 * 캔버스 스토어 (Zustand vanilla) — TRAVIS 프론트엔드 M1.4 Step 1.
 *
 * 왜 vanilla store + Provider 패턴인가:
 *   Zustand v5 공식 Next.js 가이드 (https://zustand.docs.pmnd.rs/guides/nextjs)
 *   는 module-level `create()` 대신 `createStore` + React Context Provider +
 *   `useStore(ctx, selector)` 를 권장한다. 이유 두 가지:
 *     (1) Next.js 서버가 처리하는 요청 간 module-level 전역 state 가
 *         사용자 A → 사용자 B 로 새어나갈 위험을 제거.
 *     (2) SSR/CSR hydration mismatch 발생 가능성 제거.
 *   현재(M1.4) 는 단일 사용자 로컬 세션만 다루지만, M1.6 auth 도입 시
 *   이 패턴이 그대로 확장 가능하다.
 *
 * 스토어 분리 규칙 (nextjs-frontend-specialist §3.1):
 *   "never one god store" — canvas / chat / view 를 하나로 합치지 않는다.
 *   이 파일은 canvas 전용. M1.4 Step 6 에서 chat 스토어 별도 파일로 추가 예정.
 *
 * 상태 정의:
 *   - nodes / edges : React Flow v12 가 읽는 제어형 상태
 *   - viewport      : 줌/팬 위치 (세션 내에서만 유지, 새로고침 시 초기화)
 *   - isCanvasReady : ReactFlow 마운트 완료 플래그 (Step 2~6 에서 다양한 훅이 활용 예정)
 *
 * 지속성:
 *   M1.4 는 세션 메모리만 사용 — 새로고침 시 초기화. M1.6 auth 도입 시
 *   `user_views` 테이블로 영속화 승격 예정 (Plan 핵심 결정 #4).
 */
import { createStore } from "zustand/vanilla";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange, Viewport } from "@xyflow/react";

/**
 * TRAVIS 카드의 커스텀 노드 data 모양 — Step 2 에서 AiCardConfigSchema 와 연결 예정.
 * Step 1 은 빈 캔버스만 확인하므로 느슨한 object 만 둔다.
 */
export type TravisNodeData = {
  /** 렌더링 대상 컴포넌트 ID (Step 2 cardComponentRegistry 키) */
  componentId?: string;
  /** AI 가 출력할 updateMode (Step 2 에서 사용) */
  updateMode?: "value" | "content" | "reactive";
  /** 자유 payload — Step 3~5 각 카드가 자체 정의 */
  payload?: Record<string, unknown>;
};

export type TravisNode = Node<TravisNodeData>;

export type CanvasState = {
  nodes: TravisNode[];
  edges: Edge[];
  viewport: Viewport;
  isCanvasReady: boolean;
};

export type CanvasActions = {
  /** React Flow onNodesChange 핸들러 — 드래그/선택/삭제 변경을 누적 적용 */
  onNodesChange: (changes: NodeChange<TravisNode>[]) => void;
  /** React Flow onEdgesChange 핸들러 — 엣지 변경 누적 적용 */
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** 노드 추가 — Step 6 actionDispatcher 의 "spawn" 에서 호출 */
  addNode: (node: TravisNode) => void;
  /** 노드 삭제 — CardContainer 헤더 삭제 버튼에서 호출 (Step 2) */
  removeNode: (id: string) => void;
  /** 노드 data 부분 업데이트 — Realtime 훅이 payload 를 주입할 때 사용 (Step 2~5) */
  updateNodeData: (id: string, data: Partial<TravisNodeData>) => void;
  /** viewport 저장 — onMove 핸들러에서 호출 (세션 내 줌/팬 위치 유지) */
  setViewport: (vp: Viewport) => void;
  /** ReactFlow 마운트 완료 플래그 */
  setCanvasReady: (ready: boolean) => void;
};

export type CanvasStore = CanvasState & CanvasActions;

export const defaultCanvasState: CanvasState = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  isCanvasReady: false,
};

/**
 * 스토어 factory — 매 요청마다 새 인스턴스 생성 (Provider 가 useRef 로 단일화).
 */
export const createCanvasStore = (initState: CanvasState = defaultCanvasState) => {
  return createStore<CanvasStore>()((set, get) => ({
    ...initState,

    onNodesChange: (changes) => {
      set({ nodes: applyNodeChanges(changes, get().nodes) });
    },

    onEdgesChange: (changes) => {
      set({ edges: applyEdgeChanges(changes, get().edges) });
    },

    addNode: (node) => {
      // 동일 id 가 이미 있으면 무시 (graceful — crash 금지)
      const exists = get().nodes.some((n) => n.id === node.id);
      if (exists) return;
      set({ nodes: [...get().nodes, node] });
    },

    removeNode: (id) => {
      set({ nodes: get().nodes.filter((n) => n.id !== id) });
    },

    updateNodeData: (id, data) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      });
    },

    setViewport: (vp) => set({ viewport: vp }),

    setCanvasReady: (ready) => set({ isCanvasReady: ready }),
  }));
};

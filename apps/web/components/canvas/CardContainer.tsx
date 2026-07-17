"use client";
/**
 * CardContainer — React Flow 커스텀 노드 (M1.4 Step 2).
 *
 * 역할:
 *   1. 캔버스 노드 1개당 헤더(제목 + 삭제 버튼) + 리사이저 + 콘텐츠 슬롯.
 *   2. data.config.componentId 로 cardComponentRegistry 조회 → 실제 카드 컴포넌트 렌더.
 *   3. 미등록 componentId / config 파싱 실패 시 crash 없이 fallback UI.
 *
 * React Flow v12 규칙 (@xyflow/react):
 *   - nodeTypes 객체는 컴포넌트 바깥 상수 (CanvasWorkspace.tsx 쪽 책임).
 *   - 커스텀 노드는 memo 로 감싸야 인접 노드 상태 변경 시 재렌더 억제. React.memo
 *     기본은 얕은 prop 비교 — React Flow 는 이미 props 를 최소 단위로 갱신한다.
 *
 * 성능 고려:
 *   카드 내부에서 dataService 의 useDataServiceRow/Table 훅이 돌므로 container 재렌더가
 *   카드 재렌더로 전파되지 않게 memo 가중 요소. 카드 컴포넌트 자체도 필요시 memo 한다
 *   (M1.4 Step 3 각 카드에서). M1.6 Step 3 dataService 도입 후 channel 자체는
 *   datasource 단위 공유 — N 카드 mount 해도 1 channel.
 */

import { createElement, memo, useCallback, useEffect, useMemo } from "react";
import {
  NodeResizer,
  useReactFlow,
  // 프로젝트 자체 useCanvasStoreApi(Zustand)와 다른 store — 혼동 방지 alias.
  useStoreApi as useRfStoreApi,
  type NodeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { AiCardConfigSchema } from "@travis/shared";
import {
  useCanvasStore,
  useCanvasStoreApi,
} from "@/lib/providers/CanvasStoreProvider";
import { useCardComponent } from "@/lib/hooks/useCardComponent";
import { sendBehaviorEvent, sessionFlusher } from "@/lib/behavior/sessionFlusher";
import type { TravisNode } from "@/lib/stores/canvasStore";
import type { CardInteractionHandle } from "@/lib/cardComponentRegistry";
import { buildSpawnedCard, type ViewportRect } from "@/lib/interaction/spawnCard";
import { CARD_SIZE_PX } from "@/lib/canvas/cardSizes";
import { useToastStore } from "@/lib/providers/ToastStoreProvider";
import { cn } from "@/lib/utils";

// CARD_SIZE_PX (사이즈 토큰 → 초기 px) 는 M3-step1 에서 lib/canvas/cardSizes.ts 로
//   이동 — 클릭 spawn 경로(spawnCard)와의 순환 import 방지. 인라인 style 하드코딩
//   금지 근거(NodeResizer 작동 조건, Step 4.6)는 그 파일 헤더 참조.

function CardContainerInner({ id, data, selected }: NodeProps<TravisNode>) {
  const removeNode = useCanvasStore((s) => s.removeNode);
  const addNode = useCanvasStore((s) => s.addNode);
  // Step 4-1 (2026-04-22): toastStore 가 module-level → Provider 패턴으로 승격.
  // show 를 훅으로 구독해 context 의 동일 인스턴스를 보장한다. 선택자 결과(함수
  // 참조)는 ToastStoreProvider 의 useState lazy 결과라 렌더마다 바뀌지 않음 —
  // useCallback 의존 배열 안정성 유지.
  const showToast = useToastStore((s) => s.show);

  // 즉시 삭제 + Undo 토스트 5초 (M1.4 Step 3-5).
  //   M1.4 플랜 결정 (2026-04-21): 확인 팝업 대신 "즉시+Undo" — SaaS 표준 UX.
  //   snapshot 복구는 removeNode 가 반환하는 TravisNode 를 그대로 addNode 로 되돌림.
  // M1.6 Step 3 Substep 3d (2026-04-26): card_deleted 즉시 INSERT — Undo 가 자주
  //   발생하지 않으므로 통계상 충분 (Undo 시 actionDispatcher 의 addNode 가 다시
  //   card_added INSERT 하는 자연 흐름 — 단순화).
  const handleRemove = useCallback(() => {
    const snapshot = removeNode(id);
    if (!snapshot) return;
    void sendBehaviorEvent("card_deleted", {
      card_id: id,
      component_id: snapshot.data.config.componentId,
    });
    showToast({
      message: "Card removed",
      actionLabel: "Undo",
      onAction: () => addNode(snapshot),
      durationMs: 5000,
    });
  }, [removeNode, addNode, id, showToast]);

  // 안전망: 런타임에 data.config 가 손상됐을 가능성에 대비해 한 번 더 검증.
  // __TRAVIS_INJECT__ 단계에서 이미 parse 하지만, 향후 경로가 늘어나면 여기가 최후의 gate.
  // data.config 참조가 바뀔 때만 재검증 — 매 렌더마다 Zod parse 하면 누수(B-2).
  const parsed = useMemo(
    () => AiCardConfigSchema.safeParse(data.config),
    [data.config],
  );
  // useCardComponent 훅은 componentId 가 없을 때도 undefined 를 안전히 반환하도록
  // 설계됐다 — invalid parse 분기에서도 호출해 hooks 순서 규약을 유지한다.
  // 반환된 참조는 아래 콘텐츠 슬롯에서 createElement 로 호출한다
  // (JSX 대신 createElement 사용 근거는 해당 블록 주석 참조).
  const CardComponent = useCardComponent(
    parsed.success ? parsed.data.componentId : "",
  );

  // ─── 인터랙션 핸들 (M3-step1, 2026-07-16) — 카드 요소 클릭 → Spawn 실행 ───
  //
  // AI 가 config.actions 로 사전 선언한 spawn 을 실행하는 유일한 자리. form 은
  //   emit(트리거, 클릭된 레코드)만 부르고, 여기서 buildSpawnedCard(조립·검증) →
  //   addNode → Undo 토스트까지 처리한다 — form 은 캔버스를 모른다(원칙 ⑧).
  // useCanvasStoreApi = 리렌더 없는 StoreApi. 클릭(희귀 이벤트) 시점에만
  //   getState() 로 최신 노드를 읽으므로 렌더 성능 무영향.
  // useMemo 안정화 필수 — 핸들 identity 가 흔들리면 memo 된 행 컴포넌트
  //   (TableCardRow/FeedCardRow)가 매 flush 전 행 리렌더 (UHD620 치명).
  const storeApi = useCanvasStoreApi();
  // [10-113] React Flow 내부 store/인스턴스 — CardContainer 는 커스텀 노드라
  //   ReactFlowProvider 안이므로 안전. useStoreApi 는 구독이 아니라 핸들이라
  //   리렌더 0 — 클릭(희귀 이벤트) 시점에만 getState() 로 뷰포트를 읽는다.
  //   setCenter 는 "Show" 토스트 액션(유저 명시 클릭)에서만 호출 — 자동 팬 없음.
  const rfStoreApi = useRfStoreApi();
  const { setCenter } = useReactFlow();
  const actions = parsed.success ? parsed.data.actions : undefined;
  const interaction = useMemo<CardInteractionHandle | undefined>(() => {
    const spawnActions = (actions ?? []).filter((a) => a.type === "spawn");
    if (spawnActions.length === 0) return undefined;
    return {
      canSpawnOnRowClick: spawnActions.some((a) => a.trigger === "row-click"),
      canSpawnOnHeaderClick: spawnActions.some(
        (a) => a.trigger === "header-click",
      ),
      emit: (trigger, sourceRow) => {
        // actionDispatcher 의 addNode 연쇄와 대칭 방어 (reviewer W2) — store 조작
        //   전체를 try/catch 로 감싸 어떤 실패도 crash 없이 토스트로 수렴.
        try {
          const action = spawnActions.find((a) => a.trigger === trigger);
          if (!action) return;
          const state = storeApi.getState();
          const sourceNode = state.nodes.find((n) => n.id === id);
          if (!sourceNode) return; // 삭제 직후 잔여 이벤트 — 조용히 무시 (graceful)
          // [10-113] 현재 뷰포트를 flow 좌표로 — RF 내부 transform=[tx,ty,zoom]
          //   과 컨테이너 크기에서 역산. 값이 비정상(마운트 직후 0)이면 undefined
          //   로 전달해 기존 배치로 폴백 (graceful).
          const rf = rfStoreApi.getState();
          const [tx, ty, zoom] = rf.transform;
          const viewportRect: ViewportRect | undefined =
            rf.width > 0 && rf.height > 0 && zoom > 0
              ? {
                  x: -tx / zoom,
                  y: -ty / zoom,
                  w: rf.width / zoom,
                  h: rf.height / zoom,
                }
              : undefined;
          const result = buildSpawnedCard({
            action,
            sourceRow,
            sourceNode,
            existingNodes: state.nodes,
            viewportRect,
          });
          if (!result.ok) {
            // 카드 미생성 + 안내만 — 캔버스 무손상 (graceful 실패 계약).
            //   로그 구분 (reviewer W1/W3): invalid-config = AI 선언 결함(진단 필요,
            //   소스 카드 id 필수 — "이 카드의 spawn 이 계속 실패" 추적) /
            //   missing-row-value = 그 행에 값이 없는 정상적 무동작.
            if (result.reason === "invalid-config") {
              console.error(
                `[interaction] spawn 조립 실패 (source card ${id}):`,
                result.message,
              );
            } else {
              console.warn(
                `[interaction] spawn 미발화 (source card ${id}):`,
                result.reason,
                result.message,
              );
            }
            showToast({
              message: "Couldn't open a card from this element.",
              durationMs: 4000,
            });
            return;
          }
          state.addNode(result.node);
          void sendBehaviorEvent("card_added", {
            card_id: result.node.id,
            component_id: result.node.data.config.componentId,
            datasource: result.node.data.config.data.datasource ?? null,
            source: "spawn",
          });
          if (result.placedInViewport) {
            // 오클릭 안전망 (crypto-trader 자문 + 사용자 채택): spawn 은 비파괴적이라
            //   confirm 은 과함 — 삭제 Undo 토스트와 동일 패턴의 되돌리기만 제공.
            showToast({
              message: "Card added",
              actionLabel: "Undo",
              // onAction 은 emit 의 try/catch 밖(토스트 클릭 시점)에서 실행되므로
              //   graceful 대칭을 위해 자체 방어 (reviewer S1).
              onAction: () => {
                try {
                  storeApi.getState().removeNode(result.node.id);
                  void sendBehaviorEvent("card_deleted", {
                    card_id: result.node.id,
                    component_id: result.node.data.config.componentId,
                    source: "spawn-undo",
                  });
                } catch (err) {
                  console.error("[interaction] spawn Undo 실패:", err);
                }
              },
              durationMs: 5000,
            });
          } else {
            // [10-113] 만차 폴백 — 카드가 화면 밖에 배치됨. 자동 팬 대신(스캘퍼
            //   시야 강탈 금지) 토스트의 "Show" 가 유일한 이동 트리거 (해법 (c)).
            //   토스트 액션 슬롯이 1개라 이 경우 Undo 대신 이동을 제공 — 이동 후
            //   카드 삭제 버튼이 되돌리기를 대체한다.
            const node = result.node;
            const w = typeof node.width === "number" ? node.width : CARD_SIZE_PX.md.w;
            const h =
              typeof node.height === "number" ? node.height : CARD_SIZE_PX.md.h;
            showToast({
              message: "Card added outside the current view.",
              actionLabel: "Show",
              onAction: () => {
                // 현재 줌 유지 — setCenter 는 zoom 미지정 시 maxZoom 으로 점프
                //   (12.10.2 소스 실측)하므로 명시 전달. 300ms 팬은 유저가 직접
                //   누른 경우에만 발생. try/catch = graceful 대칭 (reviewer S1).
                try {
                  const currentZoom = rfStoreApi.getState().transform[2];
                  void setCenter(node.position.x + w / 2, node.position.y + h / 2, {
                    zoom: currentZoom,
                    duration: 300,
                  });
                } catch (err) {
                  console.error("[interaction] spawn Show 이동 실패:", err);
                }
              },
              durationMs: 5000,
            });
          }
        } catch (err) {
          console.error(`[interaction] spawn 처리 중 예외 (source card ${id}):`, err);
          showToast({
            message: "Couldn't open a card from this element.",
            durationMs: 4000,
          });
        }
      },
    };
  }, [actions, id, storeApi, rfStoreApi, setCenter, showToast]);

  // M1.6 Step 3 Substep 3d (2026-04-26): sessionFlusher 카드별 카운터 등록.
  //   mount 시 trackCardMount → drag/resize 누적 시작.
  //   unmount 시 trackCardUnmount → 4중 flush 가드 중 (4) "unmount" trigger 발화.
  //   parsed.success 가 false 면 등록 스킵 (정상 카드만 트래킹).
  const componentId = parsed.success ? parsed.data.componentId : "";
  const datasource = parsed.success
    ? ((parsed.data.data as { datasource?: string } | undefined)?.datasource ?? "")
    : "";
  useEffect(() => {
    if (!parsed.success) return;
    sessionFlusher.trackCardMount({
      cardId: id,
      componentId,
      datasource,
    });
    return () => {
      sessionFlusher.trackCardUnmount(id);
    };
  }, [id, componentId, datasource, parsed.success]);

  if (!parsed.success) {
    return (
      <FallbackCard title="잘못된 카드 설정" onClose={handleRemove}>
        <p className="text-xs text-muted-foreground">
          AiCardConfig 검증 실패 — console 로그 참조.
        </p>
      </FallbackCard>
    );
  }
  const config = parsed.data;

  // Step 4.6: 인라인 width/height 제거. 초기 크기는 actionDispatcher/devInject 가
  // React Flow 노드 `width`/`height` 로 직접 심고, 이후 NodeResizer 드래그로
  // React Flow 가 관리한다. CardContainer 는 부모(React Flow node wrapper) 의
  // 크기를 100% 로 따르기만 한다.
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        selected && "ring-2 ring-ring",
      )}
      // M1.5 Step 4a (2026-04-23): Playwright 테스트 친화성 — 카드 componentId 를
      //   attribute 로 노출해 `[data-card-type="big-value-card"]` selector 사용 가능.
      //   프로덕션 렌더에도 포함되나 CSS/스타일에 영향 없음. UI 노이즈 0.
      data-card-type={config.componentId}
      data-card-id={config.id}
      data-update-mode={config.updateMode}
    >
      {/* Step 4.6: handle/line 크기 확대 — 기본 5x5 / 1px 은 마우스로 잡기 어려워
       * 실사용 트레이더가 카드 리사이즈를 시도해도 놓치는 문제 해결. */}
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={120}
        color="var(--ring)"
        handleStyle={{ width: 10, height: 10, borderRadius: 2 }}
        lineStyle={{ borderWidth: 2 }}
      />

      {/* 헤더 — 드래그 핸들 + × 버튼 전용.
       *
       * Step 4-2a (2026-04-22): 이전의 개발자 라벨("{componentId} #{id}") 을 제거.
       *   이유: 카드 자체가 AI 자유 텍스트 kicker/title/subtitle 을 렌더하므로
       *   상단 좌측에 컴포넌트 id 를 중복 노출하면 시선 잡음. 디버깅이 필요하면
       *   React DevTools 의 node data.config 필드로 확인 가능.
       *
       * 좌측은 aria-hidden 스페이서 — × 버튼이 우측 정렬 유지되도록 flex 균형을 잡기 위함. */}
      <div className="flex items-center justify-end border-b border-border/60 bg-popover/80 px-2 py-1.5">
        <button
          type="button"
          onClick={handleRemove}
          aria-label="카드 삭제"
          className="rounded-sm p-1 text-muted-foreground outline-none hover:bg-destructive/20 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* 콘텐츠 슬롯 — 실제 카드 또는 fallback.
       *
       * createElement 사용 근거:
       *   `<CardComponent />` JSX 로 쓰면 react-hooks/static-components 규칙이
       *   대문자 변수의 JSX 사용을 "렌더 중 생성된 컴포넌트" 로 오판해 false
       *   positive 가 발생한다. createElement 로 호출하면 이 정적 분석을 우회
       *   하면서도 런타임 동작은 동일하다. registry lookup 기반 dispatch 에서
       *   React 팀 공식 가이드가 아직 없어 실무 표준 우회법으로 채택. */}
      <div className="flex-1 overflow-hidden">
        {CardComponent ? (
          createElement(CardComponent, { config, interaction })
        ) : (
          <UnknownComponentFallback componentId={config.componentId} />
        )}
      </div>
    </div>
  );
}

/** 레지스트리에 없는 componentId 일 때의 fallback. */
function UnknownComponentFallback({ componentId }: { componentId: string }) {
  return (
    <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
      <div>
        <div className="font-mono text-foreground">{componentId}</div>
        <div className="mt-1">등록되지 않은 컴포넌트</div>
      </div>
    </div>
  );
}

/** 파싱 실패 등 치명적 오류 시 최소한의 카드 껍데기만 그려 삭제 가능하게 유지. */
function FallbackCard({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="flex w-56 flex-col overflow-hidden rounded-lg border border-destructive/60 bg-card shadow-sm"
      style={{ height: 140 }}
    >
      <div className="flex items-center justify-between border-b border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <span>{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="카드 삭제"
          className="rounded-sm p-1 hover:bg-destructive/20"
        >
          <X className="size-3" />
        </button>
      </div>
      <div className="flex-1 p-3">{children}</div>
    </div>
  );
}

export const CardContainer = memo(CardContainerInner);
CardContainer.displayName = "CardContainer";

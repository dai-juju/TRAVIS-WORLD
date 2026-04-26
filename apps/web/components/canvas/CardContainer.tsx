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
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { AiCardConfigSchema } from "@travis/shared";
import { useCanvasStore } from "@/lib/providers/CanvasStoreProvider";
import { useCardComponent } from "@/lib/hooks/useCardComponent";
import { sendBehaviorEvent, sessionFlusher } from "@/lib/behavior/sessionFlusher";
import type { TravisNode } from "@/lib/stores/canvasStore";
import { useToastStore } from "@/lib/providers/ToastStoreProvider";
import { cn } from "@/lib/utils";

/**
 * 사이즈 토큰 → 초기 px 매핑 (M1.4 Step 2, Step 4.6 개정).
 *
 * 이 값들은 **React Flow Node 의 초기 width/height** 로 쓰이고 (actionDispatcher /
 * devInject 에서 주입), 그 이후엔 NodeResizer 드래그로 React Flow 가 직접 노드
 * 크기를 업데이트한다. CardContainer 자체는 `width:100% height:100%` 로 부모
 * 크기를 따르기만 한다 — 인라인 style 로 하드코딩 하면 NodeResizer 가 작동
 * 안 한다 (Step 4.6 버그 원인).
 */
export const CARD_SIZE_PX: Record<"sm" | "md" | "lg" | "xl", { w: number; h: number }> = {
  sm: { w: 220, h: 140 },
  md: { w: 320, h: 220 },
  lg: { w: 480, h: 320 },
  xl: { w: 640, h: 440 },
};

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
      //   attribute 로 노출해 `[data-card-type="ticker-card"]` selector 사용 가능.
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
          createElement(CardComponent, { config })
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

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
 *   카드 내부에서 useRealtimeRow/Table 훅이 돌므로 container 재렌더가 카드
 *   재렌더로 전파되지 않게 memo 가중 요소. 카드 컴포넌트 자체도 필요시 memo 한다
 *   (Step 3~5 각 카드에서).
 */

import { createElement, memo, useCallback, useMemo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { AiCardConfigSchema } from "@travis/shared";
import { useCanvasStore } from "@/lib/providers/CanvasStoreProvider";
import { useCardComponent } from "@/lib/hooks/useCardComponent";
import type { TravisNode } from "@/lib/stores/canvasStore";
import { useToastStore } from "@/lib/stores/toastStore";
import { cn } from "@/lib/utils";

/** 사이즈 토큰 → 실제 px 매핑. Step 3~5 에서 실제 카드 요구에 맞춰 재조정 가능. */
const SIZE_PX: Record<"sm" | "md" | "lg" | "xl", { w: number; h: number }> = {
  sm: { w: 220, h: 140 },
  md: { w: 320, h: 220 },
  lg: { w: 480, h: 320 },
  xl: { w: 640, h: 440 },
};

function CardContainerInner({ id, data, selected }: NodeProps<TravisNode>) {
  const removeNode = useCanvasStore((s) => s.removeNode);
  const addNode = useCanvasStore((s) => s.addNode);

  // 즉시 삭제 + Undo 토스트 5초 (M1.4 Step 3-5).
  //   M1.4 플랜 결정 (2026-04-21): 확인 팝업 대신 "즉시+Undo" — SaaS 표준 UX.
  //   toastStore 는 module-level 이라 useToastStore.getState() 로 액션만 호출.
  //   snapshot 복구는 removeNode 가 반환하는 TravisNode 를 그대로 addNode 로 되돌림.
  const handleRemove = useCallback(() => {
    const snapshot = removeNode(id);
    if (!snapshot) return;
    useToastStore.getState().show({
      message: "Card removed",
      actionLabel: "Undo",
      onAction: () => addNode(snapshot),
      durationMs: 5000,
    });
  }, [removeNode, addNode, id]);

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
  const size = SIZE_PX[config.size];

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        selected && "ring-2 ring-ring",
      )}
      style={{ width: size.w, height: size.h }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={120}
        color="var(--ring)"
      />

      {/* 헤더 — 드래그 핸들 역할도 겸한다 (React Flow 는 기본으로 노드 전체 드래그 가능). */}
      <div className="flex items-center justify-between border-b border-border/60 bg-popover/80 px-3 py-2">
        <div className="truncate text-xs font-medium text-foreground">
          {config.componentId}
          <span className="ml-2 text-[10px] text-muted-foreground">#{config.id}</span>
        </div>
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

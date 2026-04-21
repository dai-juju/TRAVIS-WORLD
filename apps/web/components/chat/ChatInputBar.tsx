"use client";
/**
 * ChatInputBar — 하단 중앙 플로팅 채팅 입력바 (M1.4 Step 4-3).
 *
 * 역할 (M1.4 범위):
 *   사용자가 자연어를 입력 → 내부 dummy parser 가 mock OrchestrateResponse 생성
 *   → actionDispatcher 로 캔버스에 카드 생성. AI 는 아직 연결되지 않음.
 *
 * 설계 의도:
 *   M1.5 에서는 dummy parser 대신 `fetch("/api/orchestrate", { body: { text } })`
 *   응답을 그대로 dispatchOrchestrateResponse 에 넘기게 된다. 즉 Step 4 의 UI/UX
 *   와 actionDispatcher 경계는 그대로 유지되고 파이프의 중간 블록만 바뀐다.
 *
 * UI 스타일 (UI-3 Monochrome 연장):
 *   - 하단 중앙 고정 — ThemeToggle(좌측 상단) 과 대칭 배치
 *   - paper 배경 + ink 테두리 + 4px hard shadow — UndoToast 와 시각적 친족
 *   - placeholder 에 예시 3종 노출해 사용자 학습 비용 절감
 *
 * 포지셔닝 / z-index:
 *   - fixed bottom-10 left-1/2 -translate-x-1/2 (좌우 중앙)
 *   - z-40 — UndoToast(z-50) 보다 낮게 두어 삭제 토스트가 위에 뜨도록
 */

import { useCallback, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { dispatchOrchestrateResponse } from "@/lib/actionDispatcher";
import { useChatStore } from "@/lib/providers/ChatStoreProvider";
import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import { useToastStore } from "@/lib/providers/ToastStoreProvider";
import { buildDummyOrchestrateResponse } from "@/lib/dummyChatParser";

export function ChatInputBar() {
  const input = useChatStore((s) => s.input);
  const setInput = useChatStore((s) => s.setInput);
  const recordSubmission = useChatStore((s) => s.recordSubmission);
  const setStatus = useChatStore((s) => s.setStatus);

  const canvasStoreApi = useCanvasStoreApi();
  const showToast = useToastStore((s) => s.show);

  const [focused, setFocused] = useState(false);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    recordSubmission(text);
    setStatus("loading");

    // M1.4 dummy path — text → mock OrchestrateResponse.
    // M1.5 에서 이 블록이 `await fetch("/api/orchestrate")` 로 교체됨.
    const raw = buildDummyOrchestrateResponse(text);
    const result = dispatchOrchestrateResponse(raw, {
      canvasStore: canvasStoreApi,
      showToast: (opts) =>
        showToast({ message: opts.message, durationMs: opts.durationMs }),
    });

    if (result.success) {
      setStatus("idle");
    } else {
      setStatus("error", result.message);
      // validation / empty 이유는 dispatcher 내부에서 토스트로 이미 보고됨.
    }
  }, [input, recordSubmission, setStatus, canvasStoreApi, showToast]);

  const lastError = useChatStore((s) => s.lastError);

  return (
    <div
      className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2"
      role="search"
    >
      {/* 시각 외 채널로도 에러를 전달 — 스크린리더 + 음성 피드백 사용자 대응.
       * code-reviewer H-3 (2026-04-22): role="search" + aria-live 보조 영역 추가. */}
      <span className="sr-only" aria-live="polite">
        {lastError ?? ""}
      </span>
      <div
        className="pointer-events-auto flex items-center gap-2 border border-foreground bg-background px-3 py-2"
        style={{
          boxShadow: focused ? "6px 6px 0 var(--ink)" : "4px 4px 0 var(--ink)",
          transition: "box-shadow 120ms ease-out",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder='Try: "BTCUSDT price" · "top gainers" · "ETHUSDT 15m chart"'
          className="w-[560px] max-w-[70vw] bg-transparent font-sans text-[13px] leading-tight text-foreground outline-none placeholder:text-[color:var(--ink-4)]"
          aria-label="카드 생성 프롬프트"
        />
        <button
          type="button"
          onClick={handleSubmit}
          aria-label="제출"
          className="flex items-center justify-center border border-foreground px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground hover:bg-foreground hover:text-background"
        >
          <CornerDownLeft className="size-3" />
        </button>
      </div>
    </div>
  );
}

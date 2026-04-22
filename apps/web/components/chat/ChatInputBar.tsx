"use client";
/**
 * ChatInputBar — 하단 중앙 플로팅 채팅 입력바.
 *
 * 역할 (M1.5 Step 3 이후):
 *   사용자가 자연어를 입력 → `fetch("/api/orchestrate")` 로 Haiku 오케스트레이터
 *   호출 → `dispatchOrchestrateResponse` 가 `{ kind }` 로 success/fallback 분기.
 *
 * 이력:
 *   - M1.4 Step 4-3: `dummyChatParser` 기반 mock 파서로 첫 구현.
 *   - M1.5 Step 3 (2026-04-22): fetch 교체 + dummyChatParser 삭제.
 *     dispatcher 가 top-level API response 를 소비하도록 확장되었으므로
 *     handleSubmit 은 "네트워크 경계" 방어만 맡는다.
 *
 * 에러 방어 전략 (Q5=(C), 2026-04-22):
 *   - try/catch: 네트워크 단절 / HTTP 5xx / JSON parse 실패 → "네트워크 오류" 토스트
 *   - dispatcher: shape 검증 / kind 분기 → 자체 토스트 + 상세 reason 반환
 *   - 두 층을 모두 통과하지 못한 값은 **절대 캔버스에 도달 못함** = 크래시 금지 원칙 충족.
 *
 * 로딩 UX (Q3=(A), 2026-04-22):
 *   - status === "loading" 동안 input + button `disabled`
 *   - placeholder 를 "AI 에게 물어보는 중..." 으로 교체
 *   - aria-live 보조 영역에도 동일 문구 → 스크린리더 사용자도 인지
 *   - 스피너 / 취소 버튼 / 스트리밍 응답은 전부 M2+ 스코프
 *
 * UI 스타일 (UI-3 Monochrome):
 *   하단 중앙 고정, paper + ink 테두리 + 4px hard shadow. UndoToast(z-50)보다
 *   낮은 z-40 로 배치해 삭제 토스트가 위에 뜨게 한다.
 */

import { useCallback, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { dispatchOrchestrateResponse } from "@/lib/actionDispatcher";
import { useChatStore } from "@/lib/providers/ChatStoreProvider";
import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import { useToastStore } from "@/lib/providers/ToastStoreProvider";

/** Route Handler 경로 — 동일 origin 호출이므로 절대 URL 불필요. */
const ORCHESTRATE_ENDPOINT = "/api/orchestrate";

export function ChatInputBar() {
  const input = useChatStore((s) => s.input);
  const setInput = useChatStore((s) => s.setInput);
  const recordSubmission = useChatStore((s) => s.recordSubmission);
  const setStatus = useChatStore((s) => s.setStatus);
  const status = useChatStore((s) => s.status);
  const lastError = useChatStore((s) => s.lastError);

  const canvasStoreApi = useCanvasStoreApi();
  const showToast = useToastStore((s) => s.show);

  const [focused, setFocused] = useState(false);
  const isLoading = status === "loading";

  const handleSubmit = useCallback(async () => {
    // 중복 제출 방지 — 로딩 중에는 Enter/클릭 모두 무시.
    if (isLoading) return;

    const text = input.trim();
    if (!text) return;

    recordSubmission(text);
    setStatus("loading");

    try {
      const res = await fetch(ORCHESTRATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });

      // /api/orchestrate 는 설계상 200 + { kind } JSON 을 보장하지만,
      // 서버 번들링 실패(Turbopack module resolve 등) 시 500 HTML 이 올 수 있다.
      // code-reviewer W5 (2026-04-22): 500 을 "네트워크 오류" 로 묶으면 사용자가
      // "인터넷 끊겼나?" 오해하므로 HTTP 에러와 네트워크 에러를 메시지 레벨에서 분리.
      if (!res.ok) {
        const isServerError = res.status >= 500;
        console.error("[ChatInputBar] API error:", res.status);
        showToast({
          message: isServerError
            ? "서버에 일시적 문제가 발생했어요. 잠시 후 다시 시도해 주세요."
            : "요청을 처리하지 못했어요. 다시 시도해 주세요.",
          durationMs: 5000,
        });
        setStatus("error", `HTTP ${res.status}`);
        return;
      }

      const raw: unknown = await res.json();

      // dispatcher 가 shape 검증 + kind 분기 + 토스트까지 모두 처리.
      // 여기서는 결과만 받아 입력바 상태를 idle / error 로 돌린다.
      const result = dispatchOrchestrateResponse(raw, {
        canvasStore: canvasStoreApi,
        showToast: (opts) =>
          showToast({ message: opts.message, durationMs: opts.durationMs }),
      });

      if (result.success) {
        setStatus("idle");
      } else {
        // validation / empty / fallback / store-error 모두 dispatcher 가
        // 내부 토스트로 이미 사용자에게 피드백. 입력바 상태만 반영.
        setStatus("error", result.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown fetch error";
      // 네트워크/JSON-parse/HTTP 에러 경로. 콘솔 로그 + 사용자 토스트.
      console.error("[ChatInputBar] fetch error:", err);
      showToast({
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        durationMs: 5000,
      });
      setStatus("error", msg);
    }
  }, [
    isLoading,
    input,
    recordSubmission,
    setStatus,
    canvasStoreApi,
    showToast,
  ]);

  return (
    <div
      className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2"
      role="search"
    >
      {/* 시각 외 채널로도 상태/에러를 전달 — 스크린리더 사용자 대응. */}
      <span className="sr-only" aria-live="polite">
        {isLoading ? "AI 에게 물어보는 중..." : (lastError ?? "")}
      </span>
      <div
        className="pointer-events-auto flex items-center gap-2 border border-foreground bg-background px-3 py-2"
        style={{
          boxShadow: focused ? "6px 6px 0 var(--ink)" : "4px 4px 0 var(--ink)",
          transition: "box-shadow 120ms ease-out, opacity 120ms ease-out",
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        <input
          type="text"
          value={input}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter 는 제출로 보지 않는다 — 트레이더가
            // 한국어 쿼리를 타이핑하는 중 의도치 않은 제출을 막는 방어.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={
            isLoading
              ? "AI 에게 물어보는 중..."
              : 'Try: "BTCUSDT price" · "top gainers" · "ETHUSDT 15m chart"'
          }
          className="w-[560px] max-w-[70vw] bg-transparent font-sans text-[13px] leading-tight text-foreground outline-none placeholder:text-[color:var(--ink-4)] disabled:cursor-not-allowed"
          aria-label="카드 생성 프롬프트"
        />
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void handleSubmit()}
          aria-label="제출"
          className="flex items-center justify-center border border-foreground px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground"
        >
          <CornerDownLeft className="size-3" />
        </button>
      </div>
    </div>
  );
}

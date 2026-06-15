"use client";
/**
 * ChatInputBar — 하단 중앙 플로팅 채팅 입력바.
 *
 * 역할 (M1.6 Step 3 Substep 3e 리팩터, 2026-04-26):
 *   사용자가 자연어를 입력 → submitOrchestrate (`/api/orchestrate` 호출 + dispatcher 위임)
 *   에 위임. 본 컴포넌트는 input 검증 + state 갱신 + UX (토스트 / 로딩 / disabled) 만 책임.
 *
 * 이력:
 *   - M1.4 Step 4-3: dummyChatParser 기반 mock 파서로 첫 구현.
 *   - M1.5 Step 3 (2026-04-22): fetch 교체 + dummyChatParser 삭제.
 *     dispatcher 가 top-level API response 를 소비하도록 확장.
 *   - M1.6 Step 1 C1 (2026-04-24): 401 분기 + Please sign in 토스트 추가.
 *   - M1.6 Step 3 Substep 3e (2026-04-26):
 *     · `[2-8]` handleSubmit 57줄 multi-responsibility → submitOrchestrate 추출
 *     · `[2-6]` stale closure 방어 → submittingRef 동기 race guard 추가
 *     · user_query_hash 채움 시작 — Web Crypto sha256 클라이언트 계산
 *     · `chat_submit` logBehavior 인스트루멘트 통합 (Substep 3d 4종 중 1번째)
 *
 * 에러 방어 전략 (Q5=(C), 2026-04-22):
 *   - submitOrchestrate: 네트워크 / HTTP / dispatcher 분기 → 자체 토스트 + SubmitResult enum
 *   - 본 컴포넌트: SubmitResult enum 만 보고 status / lastError 갱신 — 토스트 중복 호출 없음
 *
 * 로딩 UX (Q3=(A), 2026-04-22):
 *   - status === "loading" 동안 input + button `disabled`
 *   - placeholder 를 "Asking AI..." 로 교체
 *   - aria-live 보조 영역에도 동일 문구 → 스크린리더 사용자도 인지
 *
 * UI 스타일 (UI-3 Monochrome):
 *   캔버스 <main relative> 기준 하단 중앙 absolute, paper + ink 테두리 + 4px
 *   hard shadow. M2 테마 C Step 0 에서 fixed→absolute (패널 Push 시 캔버스 중앙
 *   을 따라 추종 — 뷰포트 중앙 고정이면 패널 위로 침범). z-20 으로 패널(z-30)/
 *   토스트(z-50) 아래에 둔다.
 */

import { useCallback, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { sendBehaviorEvent } from "@/lib/behavior/sessionFlusher";
import { submitOrchestrate } from "@/lib/chat/submitOrchestrate";
import { sha256Hex } from "@/lib/crypto/sha256";
import { useChatStore } from "@/lib/providers/ChatStoreProvider";
import { useCanvasStoreApi } from "@/lib/providers/CanvasStoreProvider";
import { useToastStore } from "@/lib/providers/ToastStoreProvider";

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

  /**
   * M1.6 Step 3 Substep 3e [2-6] 회수 — submittingRef 동기 race guard.
   *
   * 배경: useCallback 의 isLoading dep 는 store 갱신 시점 기반이라 1차 fetch 직후~
   * setStatus("loading") 까지 microtask 사이 빈틈 가능. 빠른 이중 Enter 키는 두 번째
   * fetch 가 발생할 수 있는 race window. ref mutation 은 동기라 즉시 차단.
   * isLoading 검사도 그대로 유지 (1차 방어선) → 두 겹 가드.
   */
  const submittingRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current || isLoading) return;
    const text = input.trim();
    if (!text) return;
    submittingRef.current = true;

    recordSubmission(text);
    setStatus("loading");

    // chat_submit logBehavior — Substep 3d 4종 이벤트 중 즉시 INSERT 1번째.
    // query_text 자체는 PII 우려로 payload 에 안 담음 (logChat 만 query_text 보유).
    // payload 는 query_length 만 — admin 분석 시 "long query 비율" 같은 메트릭만.
    void sendBehaviorEvent("chat_submit", {
      query_length: text.length,
    });

    // user_query_hash 계산 — Substep 3e 핵심.
    // crypto.subtle 미지원 환경 (구버전 브라우저 / jsdom 테스트) 안전하게 try/catch.
    let queryHash: string | null = null;
    try {
      queryHash = await sha256Hex(text);
    } catch (err) {
      console.warn("[ChatInputBar] sha256 실패 (graceful):", err);
    }

    const result = await submitOrchestrate(text, queryHash, {
      canvasStore: canvasStoreApi,
      showToast: (opts) =>
        showToast({ message: opts.message, durationMs: opts.durationMs }),
    });

    submittingRef.current = false;

    switch (result.kind) {
      case "ok":
        setStatus("idle");
        break;
      case "unauthorized":
        setStatus("error", "unauthorized");
        break;
      case "http_error":
        setStatus("error", `HTTP ${result.status}`);
        break;
      case "network_error":
      case "dispatch_failure":
        setStatus("error", result.message);
        break;
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
      className="pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2"
      role="search"
    >
      {/* 시각 외 채널로도 상태/에러를 전달 — 스크린리더 사용자 대응. */}
      <span className="sr-only" aria-live="polite">
        {isLoading ? "Asking AI..." : (lastError ?? "")}
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
              ? "Asking AI..."
              : 'Try: "BTCUSDT price" · "top gainers" · "ETHUSDT 15m chart"'
          }
          className="w-[560px] max-w-[70vw] bg-transparent font-sans text-[13px] leading-tight text-foreground outline-none placeholder:text-[color:var(--ink-4)] disabled:cursor-not-allowed"
          aria-label="AI prompt"
        />
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void handleSubmit()}
          aria-label="Submit"
          className="flex items-center justify-center border border-foreground px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground"
        >
          <CornerDownLeft className="size-3" />
        </button>
      </div>
    </div>
  );
}

// apps/web/lib/chat/submitOrchestrate.ts
//
// orchestrate API 호출 + 응답 파싱 + dispatcher 위임 순수 함수
// (M1.6 Step 3 Substep 3e, 2026-04-26).
//
// ─── 회수 항목 ─────────────────────────────────────
// [2-8] ChatInputBar.handleSubmit 57줄 multi-responsibility — 본 함수가 네트워크
//   호출 + 응답 파싱 + dispatcher 호출까지 책임. ChatInputBar 는 input 검증 +
//   state 갱신 + UX 처리만.
//
// ─── 절대 throw 금지 ──────────────────────────────
// 모든 실패 경로를 SubmitResult enum 으로 반환. 호출자(ChatInputBar) 는 SubmitResult
// 만 보고 status / lastError 갱신. 순수 함수 → 단위 테스트 친화.

"use client";

import type { StoreApi } from "zustand";

import { dispatchOrchestrateResponse } from "@/lib/actionDispatcher";
import type { CanvasStore } from "@/lib/stores/canvasStore";

const ORCHESTRATE_ENDPOINT = "/api/orchestrate";

/** 호출 결과 enum — 호출자가 status/lastError 갱신 시 분기 키. */
export type SubmitResult =
  | { kind: "ok" }
  | { kind: "unauthorized"; message: string }
  | { kind: "http_error"; status: number; isServerError: boolean }
  | { kind: "network_error"; message: string }
  | { kind: "dispatch_failure"; message: string };

export interface SubmitOrchestrateDeps {
  canvasStore: StoreApi<CanvasStore>;
  showToast: (opts: { message: string; durationMs?: number }) => void;
}

/**
 * orchestrate API 호출 + 응답 파싱 + dispatcher 위임.
 *
 * @param query 검증된 사용자 입력 (trim 된 비어있지 않은 문자열)
 * @param queryHash sha256 hex (64자) — server 가 logChat user_query_hash 컬럼에 저장.
 *                  null 이면 server-side 가 NULL 로 저장.
 * @param deps canvasStore + showToast (dispatcher 의존성)
 */
export async function submitOrchestrate(
  query: string,
  queryHash: string | null,
  deps: SubmitOrchestrateDeps,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch(ORCHESTRATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        // server schema 가 query_hash optional — null 이면 빈 객체로 보내도 OK.
        // 명시적으로 보내야 server 가 "client 가 계산했지만 실패" 와 "보내지 않음"
        // 구분 가능. 단순화: 값 있을 때만 포함.
        ...(queryHash ? { query_hash: queryHash } : {}),
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown fetch error";
    console.error("[submitOrchestrate] fetch error:", err);
    deps.showToast({
      message: "Network error. Please try again shortly.",
      durationMs: 5000,
    });
    return { kind: "network_error", message };
  }

  if (!res.ok) {
    if (res.status === 401) {
      let detail = "Please sign in to use AI features.";
      try {
        const body: unknown = await res.json();
        if (
          body !== null &&
          typeof body === "object" &&
          "message" in body &&
          typeof (body as { message: unknown }).message === "string"
        ) {
          detail = (body as { message: string }).message;
        }
      } catch {
        // body JSON 파싱 실패 시 기본 메시지 유지.
      }
      console.warn("[submitOrchestrate] unauthorized:", res.status);
      deps.showToast({ message: detail, durationMs: 5000 });
      return { kind: "unauthorized", message: detail };
    }

    const isServerError = res.status >= 500;
    console.error("[submitOrchestrate] API error:", res.status);
    deps.showToast({
      message: isServerError
        ? "The server is temporarily unavailable. Please try again shortly."
        : "Request could not be processed. Please try again.",
      durationMs: 5000,
    });
    return { kind: "http_error", status: res.status, isServerError };
  }

  const raw: unknown = await res.json();

  // dispatcher 가 shape 검증 + kind 분기 + 토스트까지 처리.
  const result = dispatchOrchestrateResponse(raw, {
    canvasStore: deps.canvasStore,
    showToast: deps.showToast,
  });

  if (result.success) return { kind: "ok" };
  return { kind: "dispatch_failure", message: result.message };
}

/**
 * OrchestrateResponse + OrchestrateApiResponse
 *
 * M1.4 Step 4-3 에서 AI contract 의 "payload" 스키마를 미리 심어뒀고,
 * M1.5 Step 2 (2026-04-22) 에서 API Route 응답 shape 을 top-level discriminated
 * union 으로 감싸 성공/실패를 명확히 구분한다.
 *
 * 두 층 구조:
 *   1. `OrchestrateResponseSchema` — AI 가 emit 하는 "카드 설정 payload"
 *      (cards + optional actions + optional notes)
 *   2. `OrchestrateApiResponseSchema` — API Route 가 반환하는 응답 wrapper
 *      `{ kind: "success", payload } | { kind: "fallback", reason, message }`
 *
 * 왜 두 층으로 분리하나 (2026-04-22 설계 결정):
 *   - AI emit payload 는 "AI 가 성공적으로 만든 것" 이라는 단일 의미 유지
 *   - fallback 은 "AI 가 실패했음" 이라는 다른 축의 상태 — payload 에 섞으면
 *     모든 consumer 가 `if (resp.fallback)` 가드를 써야 해서 스파게티화
 *   - top-level discriminated union 은 프론트 `dispatchOrchestrateResponse()` 에서
 *     `switch (resp.kind)` 단일 분기로 소비 가능 → Step 3 교체 시 코드 최소화
 *
 * 설계 원칙:
 *   1. `cards` 는 최대 10 개 — 단일 프롬프트로 한 번에 생성되는 카드 수 제한 (UX 보호).
 *   2. `actions` 는 "카드 생성 이후 실행할 추가 인터랙션" 목록 — M1 에서는 보통
 *      비어 있고, M2 drill-down 확장 시 활용 예정. optional 로 두어 생략 허용.
 *   3. `notes` — AI 가 사용자에게 보여줄 짧은 설명(마크다운 아님, plain text).
 *      모호 쿼리 시 clarifying question 을 여기 담는다 (fallback 과는 다른 축).
 *   4. `.strict()` — 알 수 없는 필드가 오면 검증 실패 → AI 환각 조기 감지.
 *   5. fallback reason enum 은 M1.6 rate-limit/quota 확장 여지를 남기도록 설계.
 */

import { z } from "zod";
import { AiCardConfigSchema, CardActionSchema } from "./aiCardConfig";

// ─── 1. AI payload (성공 시 AI 가 만든 카드 설정) ────────

export const OrchestrateResponseSchema = z
  .object({
    cards: z
      .array(AiCardConfigSchema)
      .min(0)
      .max(10)
      .describe("생성할 카드 목록 (0~10장)"),
    actions: z
      .array(CardActionSchema)
      .optional()
      .describe("카드 생성 직후 실행할 인터랙션 (예: spawn chain) — 현재 M1 범위 밖"),
    notes: z
      .string()
      .max(200)
      .optional()
      .describe("사용자에게 보여줄 짧은 메모 (plain text, 200자 이내). 모호 쿼리 clarifying 채널."),
  })
  .strict();

export type OrchestrateResponse = z.infer<typeof OrchestrateResponseSchema>;

// ─── 2. API Route 응답 shape (top-level discriminated union) ──

/**
 * fallback 원인 분류. 프론트에서 원인별 다른 toast 메시지 분기 가능.
 *
 * - `validation_exhausted`: AI 응답 Zod 검증이 재시도까지 모두 실패 (M1.5 주 케이스)
 * - `transient_error`:      Anthropic API 일시 오류 (5xx / 네트워크 / 타임아웃)
 * - `upstream_error`:       요청 본문 자체 오류 (JSON parse / 누락)
 * - `timeout`:              AbortSignal 로 인한 취소 (M2+ 스트리밍 UX 대비 예약)
 *
 * 새 원인 추가 시 이 enum 만 확장하면 consumer 자동 컴파일 에러로 발견.
 */
export const OrchestrateFallbackReasonSchema = z.enum([
  "validation_exhausted",
  "transient_error",
  "upstream_error",
  "timeout",
]);

export type OrchestrateFallbackReason = z.infer<typeof OrchestrateFallbackReasonSchema>;

/** 성공 variant — AI 가 만든 payload 를 그대로 담는다. */
export const OrchestrateSuccessSchema = z
  .object({
    kind: z.literal("success"),
    payload: OrchestrateResponseSchema,
  })
  .strict();

/** 실패 variant — 원인 + 사용자 친화 메시지. */
export const OrchestrateFallbackSchema = z
  .object({
    kind: z.literal("fallback"),
    reason: OrchestrateFallbackReasonSchema,
    message: z
      .string()
      .min(1)
      .max(200)
      .describe("사용자에게 보여줄 한국어 fallback 메시지 (200자 이내)"),
  })
  .strict();

/**
 * API Route 응답의 최상위 shape.
 *
 * 프론트 consumer (M1.5 Step 3 부터):
 *   const raw = await fetch("/api/orchestrate", ...).then((r) => r.json());
 *   dispatchOrchestrateResponse(raw, deps);
 *   // dispatcher 내부에서 safeParse(OrchestrateApiResponseSchema) 후
 *   // switch (resp.kind) 로 success/fallback 분기 처리. 호출자는 switch 불필요.
 */
export const OrchestrateApiResponseSchema = z.discriminatedUnion("kind", [
  OrchestrateSuccessSchema,
  OrchestrateFallbackSchema,
]);

export type OrchestrateApiResponse = z.infer<typeof OrchestrateApiResponseSchema>;
export type OrchestrateApiResponseSuccess = z.infer<typeof OrchestrateSuccessSchema>;
export type OrchestrateApiResponseFallback = z.infer<typeof OrchestrateFallbackSchema>;

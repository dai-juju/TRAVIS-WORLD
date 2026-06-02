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
 * - `parse_error`:     AI 응답 추출 단계 실패 — JSON.parse 실패 / tool_use 블록
 *                      누락 / Anthropic SDK invalid response (응답 자체가 깨짐)
 *                      (M1.6 Step 4, 2026-04-28 추가 — `[3-8]` 회수)
 * - `schema_drift`:    AI 응답 JSON 은 파싱됐으나 Zod 검증 실패 (registry-derived
 *                      refinement 포함 — drift 차단). 재시도까지 모두 실패 시
 *                      이 reason 으로 fallback. (M1.6 Step 4, [3-8] 회수)
 * - `transient_error`: Anthropic API 일시 오류 (5xx / 네트워크 / 타임아웃).
 *                      재시도 권유 톤 — 잠시 후 다시 시도하면 풀릴 수 있음.
 * - `auth_error`:      Anthropic 인증/권한 실패 (HTTP 401 / 403). 키 만료·무효·
 *                      모델 access 거부 — **운영자 책임** (사용자가 재시도해도
 *                      소용 없음). M1.9 Step 0 (2026-06-02, `[3-68]` 회수) 추가.
 * - `quota_error`:     Anthropic 크레딧 소진 / rate limit (HTTP 402 / 429).
 *                      billing 점검 또는 rate-limit window 대기 필요.
 *                      M1.9 Step 0 (2026-06-02, `[3-68]` 회수) 추가.
 * - `upstream_error`:  요청 본문 자체 오류 (JSON parse / 누락)
 * - `timeout`:         AbortSignal 로 인한 취소 (M2+ 스트리밍 UX 대비 예약)
 * - `refusal`:         Haiku 가 정책상 요청 거부 (stop_reason === "refusal").
 *                      재시도해도 같은 결과 — 사용자가 쿼리를 바꿔야 함.
 *                      M1.5 Step 3d (2026-04-23) 추가.
 *
 * 옛 `validation_exhausted` 는 M1.6 Step 4 에서 `parse_error` + `schema_drift`
 * 로 2분할 — 운영 가시성 ↑ (admin 로그에서 "JSON 자체가 깨졌나 vs schema 만
 * 안 맞나" 즉시 구분). 옛 `transient_error` 는 M1.9 Step 0 에서 `auth_error`
 * (401/403) + `quota_error` (402/429) + `transient_error` (5xx/network/timeout)
 * 로 3분할 — DB(`log_chat.fallback_reason`)만 보고 "키 문제 vs 한도 문제 vs
 * 일시 장애" 즉시 구분 (`[3-68]`).
 *
 * 새 원인 추가 시 이 enum 만 확장하면 consumer (messageForReason switch 등) 에서
 * 자동 컴파일 에러로 누락 발견.
 */
export const OrchestrateFallbackReasonSchema = z.enum([
  "parse_error",
  "schema_drift",
  "transient_error",
  "auth_error",
  "quota_error",
  "upstream_error",
  "timeout",
  "refusal",
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

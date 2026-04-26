/**
 * logValidationFailure — AI 검증 실패 로그 기록 래퍼.
 *
 * M1.5 Step 2c (2026-04-22): `log_validation_failure` 테이블 INSERT 를
 * `SupabaseDataService` 경유로 수행한다 (CLAUDE.md "dataService 경유" 원칙).
 *
 * M1.6 Step 3 Substep 3c (2026-04-26): boilerplate 를 createLogger factory 로 위임.
 * 본 모듈은 LogValidationFailureInput 인터페이스 + toRow 매핑만 책임 ([3-27] 회수).
 *
 * 호출 시점:
 *   - `/api/orchestrate/route.ts` 의 self-correction 재시도 2회 모두 실패 시
 *   - (optional) 1차 Zod 실패 시 재시도 전에도 기록 가능 — 현재는 최종 실패만 기록
 *
 * 설계:
 *   - **절대 throw 금지** — factory 의 try/catch 가 보장.
 *   - `fire-and-forget` 패턴으로도 호출 가능 (await 생략) — Step 3 성능 최적화 여지
 *
 * 공식 문서:
 *   - RLS policy 0개 (deny-all) — `log_validation_failure` 에 policy 없음
 *     (supabase/migrations/20260422000001_add_anon_read_policies.sql 주석에 명시)
 *   - service_role 은 RLS bypass 이므로 INSERT 가능
 */

import type { ValidationFailureInsert } from "@travis/data-service";

import { createLogger } from "@/lib/logging/createLogger";

// ─── 입력 타입 ─────────────────────────────────────

/** error_type enum — 향후 확장 여지로 string literal union 유지. */
export type LogValidationErrorType =
  | "zod_parse" // 1차 Zod 실패
  | "retry_failed" // 재시도 2회 모두 실패
  | "parse_failure" // JSON.parse / tool_use extract 실패
  | "haiku_call_failed"; // Anthropic 호출 자체 실패

export interface LogValidationFailureInput {
  /**
   * 호출 주체 user.id. M1.6 Step 2 직접 컬럼 도입.
   * NULL 허용 — 시스템 호출 또는 auth 우회 케이스 (현재 route.ts 는 항상 값).
   */
  userId?: string | null;

  /** 유저 입력 원문 (최대 500자, 검증된 상태) */
  queryText: string;
  /** AI 가 반환한 원본 JSON (tool_use input 또는 파싱된 JSON). null 허용. */
  aiResponse: unknown;
  /** 실패 단계 분류 */
  errorType: LogValidationErrorType;
  /** 에러 상세 — formatZodError 결과 또는 예외 메시지 */
  errorMessage: string;

  /** N차 시도 (1=최초). M1.6 Step 2 직접 컬럼 도입. SMALLINT DEFAULT 1. */
  attemptNumber?: number;
  /** 모델 식별자 (HAIKU_MODEL_ID 등). M1.6 Step 2 직접 컬럼. */
  modelId?: string;
  /** git commit SHA 또는 'dev'. M1.6 Step 2 직접 컬럼. */
  systemPromptVersion?: string;
  /**
   * sha256 hex 64자. M1.6 Step 2 직접 컬럼.
   * Step 3e ChatInputBar 리팩터 시 클라이언트 sha256 채움 시작.
   */
  userQueryHash?: string;

  /**
   * @deprecated M1.6 Step 2 에서 위 직접 필드(attemptNumber/modelId/...) 로 분리.
   * 호환성 위해 유지 — error_message prefix 로 합성된다.
   * 새 호출자는 직접 필드 사용 권장.
   */
  meta?: Record<string, string | number>;
}

// ─── Public API ────────────────────────────────────

/**
 * AI 검증 실패를 DB 에 기록한다.
 *
 * **절대 throw 하지 않는다** — createLogger factory 의 try/catch 가 보장.
 *
 * @returns 기록 성공 시 true, 실패 시 false (factory 가 console.error 후 반환)
 */
export const logValidationFailure = createLogger<
  LogValidationFailureInput,
  ValidationFailureInsert
>({
  name: "logValidationFailure",
  toRow: (input): ValidationFailureInsert => {
    // 메타 정보를 error_message prefix 로 조립 (M1.6 컬럼 확장 전 임시 규약 — deprecated 호환).
    const metaPrefix = input.meta
      ? `[${Object.entries(input.meta)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}] `
      : "";

    // ai_response 를 JSONB 에 넣기 위해 Json 호환 형태로 강제 직렬화.
    // 알려진 부작용 ([3-31] M1.6 Step 2 자문 — code-reviewer M3 2026-04-22 동일):
    //   · undefined / function / Symbol 필드는 silently 제거
    //   · 순환 참조는 throw → catch 로 null 대체
    //   · 현 SDK 0.90.0 ContentBlock 에 그런 필드 없음 (확인 2026-04-22)
    let aiResponseJson: unknown;
    try {
      aiResponseJson = JSON.parse(JSON.stringify(input.aiResponse));
    } catch {
      aiResponseJson = null;
    }

    return {
      user_id: input.userId ?? null,
      query_text: input.queryText.slice(0, 500),
      ai_response: aiResponseJson as ValidationFailureInsert["ai_response"],
      error_type: input.errorType,
      error_message: `${metaPrefix}${input.errorMessage}`.slice(0, 4000),
      attempt_number: input.attemptNumber ?? 1,
      model_id: input.modelId ?? null,
      system_prompt_version: input.systemPromptVersion ?? null,
      user_query_hash: input.userQueryHash ?? null,
    };
  },
  insert: (service, row) => service.insertValidationFailure(row),
});

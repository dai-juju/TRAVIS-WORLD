/**
 * logValidationFailure — AI 검증 실패 로그 기록 래퍼.
 *
 * M1.5 Step 2c (2026-04-22): `log_validation_failure` 테이블 INSERT 를
 * `SupabaseDataService` 경유로 수행한다 (CLAUDE.md "dataService 경유" 원칙).
 *
 * 호출 시점:
 *   - `/api/orchestrate/route.ts` 의 self-correction 재시도 2회 모두 실패 시
 *   - (optional) 1차 Zod 실패 시 재시도 전에도 기록 가능 — 현재는 최종 실패만 기록
 *
 * 설계:
 *   - SupabaseDataService 인스턴스를 lazy singleton 으로 재사용
 *   - **절대 throw 금지** — 로깅 자체가 실패해도 사용자 요청은 graceful fallback 이
 *     이미 반환된 상태. 여기서 throw 하면 route.ts 전체 크래시. console.error 로 기록.
 *   - `fire-and-forget` 패턴으로도 호출 가능 (await 생략) — Step 3 성능 최적화 여지
 *
 * 기존 스키마 재사용 (M1.3 Step 1):
 *   - `log_validation_failure` 테이블: id / query_text / ai_response / error_type / error_message / created_at
 *   - 컬럼 확장 (user_id / attempt_number / model_id / system_prompt_version / user_query_hash) 은 M1.6 이월
 *   - 임시로 `error_message` prefix 로 메타정보 기록: `[attempt=N, model=..., commit=...]`
 *
 * 공식 문서:
 *   - RLS policy 0개 (deny-all) — `log_validation_failure` 에 policy 없음
 *     (supabase/migrations/20260422000001_add_anon_read_policies.sql 주석에 명시)
 *   - service_role 은 RLS bypass 이므로 INSERT 가능
 */

import {
  SupabaseDataService,
  type ValidationFailureInsert,
} from "@travis/data-service";

import {
  getSupabaseServiceRoleClient,
  MissingSupabaseServiceRoleError,
} from "@/lib/supabase/serviceRoleClient";

// ─── Lazy SupabaseDataService 싱글턴 ────────────────

let cachedService: SupabaseDataService | null = null;

function getService(): SupabaseDataService {
  if (cachedService) return cachedService;
  cachedService = new SupabaseDataService(getSupabaseServiceRoleClient());
  return cachedService;
}

// ─── 입력 타입 ─────────────────────────────────────

/** error_type enum — 향후 확장 여지로 string literal union 유지. */
export type LogValidationErrorType =
  | "zod_parse" // 1차 Zod 실패
  | "retry_failed" // 재시도 2회 모두 실패
  | "parse_failure" // JSON.parse / tool_use extract 실패
  | "haiku_call_failed"; // Anthropic 호출 자체 실패

export interface LogValidationFailureInput {
  /** 유저 입력 원문 (최대 500자, 검증된 상태) */
  queryText: string;
  /** AI 가 반환한 원본 JSON (tool_use input 또는 파싱된 JSON). null 허용. */
  aiResponse: unknown;
  /** 실패 단계 분류 */
  errorType: LogValidationErrorType;
  /** 에러 상세 — formatZodError 결과 또는 예외 메시지 */
  errorMessage: string;
  /**
   * 메타 정보 (임시 규약, M1.6 컬럼 확장 후 개별 컬럼으로 이전):
   *   attempt_number / model_id / system_prompt_version 등
   * error_message 앞에 `[key1=val1, key2=val2] <original message>` 로 prefix 조립.
   */
  meta?: Record<string, string | number>;
}

// ─── Public API ────────────────────────────────────

/**
 * AI 검증 실패를 DB 에 기록한다.
 *
 * **절대 throw 하지 않는다** — 모든 에러는 console.error 로 기록하고 무시.
 * 호출자는 fallback 응답을 이미 반환 중이므로 이 함수 실패가 사용자에게
 * 노출되어선 안 됨.
 *
 * @returns 기록 성공 시 true, 실패 시 false (로깅 후 반환)
 */
export async function logValidationFailure(
  input: LogValidationFailureInput,
): Promise<boolean> {
  try {
    const service = getService();

    // 메타 정보를 error_message prefix 로 조립 (M1.6 컬럼 확장 전 임시 규약)
    const metaPrefix = input.meta
      ? `[${Object.entries(input.meta)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}] `
      : "";

    // ai_response 를 JSONB 에 넣기 위해 Json 호환 형태로 강제 직렬화
    // (unknown → string/null via JSON.stringify/parse round-trip)
    //
    // 알려진 부작용 (code-reviewer M3 2026-04-22):
    //   · undefined / function / Symbol 필드는 JSON.stringify 가 silently 제거
    //   · 순환 참조는 throw → catch 로 null 대체
    //   · 현재 Anthropic ContentBlock 타입에는 undefined 필드 없음 (확인 2026-04-22)
    //   · SDK 업데이트 시 손실 가능성 있어 주의 — 관찰 메트릭은 Step 2c 이후 추가 검토
    let aiResponseJson: unknown;
    try {
      aiResponseJson = JSON.parse(JSON.stringify(input.aiResponse));
    } catch {
      aiResponseJson = null;
    }

    const row: ValidationFailureInsert = {
      query_text: input.queryText.slice(0, 500),
      ai_response: aiResponseJson as ValidationFailureInsert["ai_response"],
      error_type: input.errorType,
      error_message: `${metaPrefix}${input.errorMessage}`.slice(0, 4000),
    };

    const result = await service.insertValidationFailure(row);
    if (!result.success) {
      console.error(
        `[logValidationFailure] INSERT 실패: ${result.error}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    // 로깅 자체 실패 — 사용자 요청은 이미 fallback 반환 중이므로 무시
    if (err instanceof MissingSupabaseServiceRoleError) {
      console.error(`[logValidationFailure] ${err.message}`);
    } else {
      console.error(
        `[logValidationFailure] 예외: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return false;
  }
}

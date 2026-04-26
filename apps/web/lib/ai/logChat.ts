/**
 * logChat — AI 채팅 호출 로그 기록 래퍼 (M1.6 Step 2 신규, Step 3 factory 리팩터).
 *
 * 호출 시점:
 *   - `/api/orchestrate/route.ts` POST 핸들러의 success / fallback 양 경로 직전
 *   - 1 row = 1 query = 1 비용 단위 (재시도 attempt 는 합산 — input/output_tokens 누적)
 *
 * 설계 원칙 (M1.6 Step 3 Substep 3c, 2026-04-26):
 *   - **절대 throw 금지** — createLogger factory 의 try/catch 가 보장.
 *   - service_role client 경유 (RLS INSERT policy 0개 → service_role 만 INSERT 가능).
 *   - lazy singleton SupabaseDataService 재사용 (factory 내부 cache).
 *   - fire-and-forget 호출 가능 (await 생략 시 사용자 UX 레이턴시에서 INSERT 왕복 제외).
 *
 * 옵션 B 채택 (1 query = 1 row, 호출 attempt 합산):
 *   M1.7 rate limit 의 의도가 "유저의 의도된 query 횟수 제한" 이므로 재시도가
 *   2 카운트 되면 왜곡. 비용 정확성은 inputTokens/outputTokens 합산 필드로 보존.
 *   재시도 시 호출자가 attempt_number=2 + 합산된 토큰 값 전달.
 *
 * Step 3 변경 (2026-04-26):
 *   - boilerplate 를 createLogger factory 로 위임 ([3-27] 회수)
 *   - 본 모듈은 LogChatInput 인터페이스 + toRow 매핑만 책임
 *
 * 공식 문서 근거:
 *   - Supabase RLS bypass (service_role): https://supabase.com/docs/guides/api/api-keys
 *   - 조회일: 2026-04-25
 */

import type { ChatLogInsert } from "@travis/data-service";

import { createLogger } from "@/lib/logging/createLogger";

// ─── 입력 타입 ─────────────────────────────────────

/** status enum — DB CHECK 제약과 동기화 (status IN ('success','fallback')) */
export type ChatLogStatus = "success" | "fallback";

export interface LogChatInput {
  /**
   * 호출 주체 user.id (auth.users.id). NULL 허용.
   * route.ts 의 0) auth 가드 통과 후라 사실상 항상 값이 있지만,
   * 향후 시스템 호출 / 테스트 경로 대비 NULL 허용.
   */
  userId: string | null;

  /** 유저 입력 원문. route.ts 가 OrchestrateRequestSchema 로 500자 내 검증 후 전달. */
  queryText: string;

  /**
   * AI 응답:
   *   - status='success': OrchestrateResponse payload 객체
   *   - status='fallback': raw.content (Anthropic ContentBlock[]) 또는 null
   */
  aiResponse: unknown;

  status: ChatLogStatus;

  /**
   * status='fallback' 시 reason (OrchestrateFallbackReason).
   * status='success' 시 null/undefined.
   * DB 컬럼은 fallback_reason VARCHAR(40) nullable.
   */
  fallbackReason?: string | null;

  /** 모델 식별자 (HAIKU_MODEL_ID 등). 비용 분석 핵심 키. */
  modelId: string;

  /** Anthropic usage.input_tokens. 재시도 시 누적 합산. */
  inputTokens: number;

  /** Anthropic usage.output_tokens. 재시도 시 누적 합산. */
  outputTokens: number;

  /** Date.now() - startTime (ms). 1 query 의 종단 latency. */
  latencyMs: number;

  /** 1 = 1차만 / 2 = self-correction 재시도까지 갔음. SMALLINT NOT NULL. */
  attemptNumber: number;

  /** git commit SHA 또는 'dev'. 프롬프트 버전별 신뢰성 회귀 추적용. */
  systemPromptVersion?: string;

  /**
   * sha256 hex 64자. PII 의존 없이 동일 query 군집 분석용.
   * Step 3e ChatInputBar 리팩터 시 클라이언트 sha256 채움 시작.
   */
  userQueryHash?: string;
}

// ─── Public API ────────────────────────────────────

/**
 * 채팅 호출 로그를 DB 에 기록한다.
 *
 * **절대 throw 하지 않는다** — createLogger factory 의 try/catch 가 보장.
 *
 * @returns 기록 성공 시 true, 실패 시 false (factory 가 console.error 후 반환)
 */
export const logChat = createLogger<LogChatInput, ChatLogInsert>({
  name: "logChat",
  toRow: (input): ChatLogInsert => {
    // ai_response 를 JSONB 호환 형태로 강제 직렬화.
    // 알려진 부작용 ([3-31] M1.6 Step 2 자문):
    //   · undefined / function / Symbol 필드는 silently 제거
    //   · 순환 참조는 throw → catch 로 null 대체
    //   · 현 SDK 0.90.0 ContentBlock 에 그런 필드 없음 (확인 2026-04-25)
    let aiResponseJson: unknown;
    try {
      aiResponseJson = JSON.parse(JSON.stringify(input.aiResponse));
    } catch {
      aiResponseJson = null;
    }

    return {
      user_id: input.userId,
      query_text: input.queryText.slice(0, 500),
      ai_response: aiResponseJson as ChatLogInsert["ai_response"],
      status: input.status,
      fallback_reason: input.fallbackReason ?? null,
      model_id: input.modelId,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      latency_ms: input.latencyMs,
      attempt_number: input.attemptNumber,
      system_prompt_version: input.systemPromptVersion ?? null,
      user_query_hash: input.userQueryHash ?? null,
    };
  },
  insert: (service, row) => service.insertChatLog(row),
});

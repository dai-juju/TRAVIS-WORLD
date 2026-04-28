/**
 * POST /api/orchestrate — AI 오케스트레이터 엔드포인트 (M1.5 Step 2b).
 *
 * 사용자 쿼리(자연어) → Haiku 4.5 호출 → OrchestrateResponse JSON 생성 → Zod 검증 →
 * 성공 시 { kind: "success", payload } / 실패 시 { kind: "fallback", reason, message }.
 *
 * Step 2b 추가 사항 (Step 2a 대비):
 *   1. tool_use 경로 기본 활성화 (USE_TOOL_USE env 기반, 기본 true)
 *      Step 2a.5 실측: text-only 70% vs tool_use 100% 성공률. 스키마 drift 원천 차단.
 *   2. self-correction 재시도 1회 (Zod 실패 시만, transient 에러는 재시도 없음)
 *      messages 3턴 누적: [user 원쿼리, assistant 원본 응답, user correction]
 *      system prompt 는 재전송하되 M2+ prompt caching 으로 캐시 breakpoint 도입 예정
 *   3. Backoff: Zod 실패는 즉시 재시도 (0ms). transient 5xx/timeout 은 재시도 없음
 *      (호출당 UX 4초 상한 — 재시도 총합 2.5s × 2 = 5s 가 한계).
 *
 * Step 2c 에서 추가될 것:
 *   - `log_validation_failure` INSERT (재시도 실패 시 raw response + zod error 기록)
 *   - service_role client 경유 (Supabase RLS bypass)
 *   - @crypto-trader 자문으로 fallback 메시지 최종 톤
 *
 * 설계 원칙 (CLAUDE.md):
 *   - 크래시 절대 금지 — 모든 에러 경로는 fallback JSON + HTTP 200 으로 graceful
 *   - 외부 API 직접 호출 금지 — Anthropic 만 (haikuClient 경유), 거래소/뉴스 금지
 *   - dataService 경유 — log INSERT 는 Step 2c 에서 SupabaseDataService 위임
 *
 * 공식 문서 근거:
 *   - Next.js 16 App Router Route Handler: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
 *   - Anthropic tool_use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 *   - 조회일: 2026-04-22
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  AnthropicInvalidResponseError,
  AnthropicTransportError,
  MissingAnthropicKeyError,
  buildSystemPrompt,
  callHaiku,
  type CallHaikuResult,
} from "@/lib/ai";

import {
  OrchestrateResponseSchema,
  formatZodError,
  type OrchestrateApiResponse,
  type OrchestrateFallbackReason,
  type OrchestrateResponse,
} from "@travis/shared";

import { logValidationFailure } from "@/lib/ai/logValidationFailure";
import { logChat } from "@/lib/ai/logChat";
import { HAIKU_MODEL_ID } from "@/lib/ai";
import { getSupabaseServerClient } from "@/lib/supabase/serverClient";

// ─── 설정 (env 기반) ────────────────────────────────

/**
 * tool_use 모드 기본 활성화 (Step 2a.5 스파이크 결과 반영).
 * `.env.local` 에 `USE_TOOL_USE=false` 를 명시적으로 설정해야 text-only 로 fallback.
 */
const USE_TOOL_USE = process.env.USE_TOOL_USE !== "false";

/**
 * 시스템 프롬프트 버전 식별자 (M1.6 Step 2 신규).
 * log_chat / log_validation_failure 의 `system_prompt_version` 컬럼에 적재.
 *
 * 우선순위: Vercel 자동 주입 → GIT_COMMIT_SHA → 'dev' fallback.
 * 운영 단계에서 "프롬프트 vX 이후 실패율 변동" 회귀 분석의 anchor key.
 *
 * 공식 문서 (Vercel 자동 환경변수): https://vercel.com/docs/projects/environment-variables/system-environment-variables
 * 조회일: 2026-04-25
 */
const SYSTEM_PROMPT_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT_SHA ??
  "dev";

/** tool_use 모드에서 Haiku 에게 노출할 tool 이름. */
const ORCH_TOOL_NAME = "emit_orchestration";

/**
 * M1.5 Step 4b (2026-04-23): Zod 고의 실패 경로 E2E 검증용 dev-only flag.
 *
 * 활성화 조건 (AND):
 *   1. `NODE_ENV !== 'production'` — 프로덕션 번들에선 절대 켜지지 않음
 *   2. `FORCE_INVALID_RESPONSE === 'true'` — 개발자가 명시적으로 설정해야 함
 *
 * 동작: Haiku 실 호출을 건너뛰고 invalid payload 를 반환해 Zod fail 경로로 유도.
 *   1차도 invalid → 재시도 → 2차도 invalid → fallback. 실 API 비용 0원.
 *
 * 왜 이렇게 설계했나:
 *   · Haiku 는 tool_use input_schema 때문에 실제로는 거의 invalid 를 안 낸다
 *   · Playwright 에서 프롬프트 교란으로 유도하면 `refusal` 분기로 튀기 쉬워 flaky
 *   · dev flag 는 100% 재현 보장 + 재시도 루프 실경로 증명
 *
 * 프로덕션 안전성 (code-reviewer 점검 포인트):
 *   · NODE_ENV 가드로 next build 시 dead-code-elimination 후보
 *   · flag 이름 자체가 의도(FORCE_INVALID) 를 명시 — env 를 실수로 주입할 확률 낮음
 */
const FORCE_INVALID_RESPONSE =
  process.env.NODE_ENV !== "production" &&
  process.env.FORCE_INVALID_RESPONSE === "true";

// ─── tool_use input_schema (JSON Schema draft-7) ──

/**
 * OrchestrateResponseSchema 를 Anthropic tool input_schema 로 변환.
 * module 로드 1회만 수행 (정적 변환).
 *
 * `$refStrategy: "none"` — 중첩 $ref 없이 inline 풀어내 Anthropic tool_use 런타임
 * 검증 호환성 확보 (zod-schema-architect 자문 2026-04-22).
 */
function buildOrchestrateInputSchema(): Record<string, unknown> {
  const raw = zodToJsonSchema(OrchestrateResponseSchema, {
    name: "OrchestrateResponse",
    $refStrategy: "none",
  });
  // zodToJsonSchema 반환 형태: { $ref, definitions: { OrchestrateResponse: {...} } }
  const wrapped = raw as {
    definitions?: Record<string, Record<string, unknown>>;
  };
  if (wrapped.definitions && wrapped.definitions["OrchestrateResponse"]) {
    const def = wrapped.definitions["OrchestrateResponse"];
    const { $schema: _schema, ...rest } = def as {
      $schema?: unknown;
      [k: string]: unknown;
    };
    void _schema;
    return rest;
  }
  return raw as Record<string, unknown>;
}

const ORCHESTRATE_INPUT_SCHEMA = buildOrchestrateInputSchema();

const ORCHESTRATE_TOOL: Anthropic.Tool = {
  name: ORCH_TOOL_NAME,
  description:
    "Emit the structured orchestration payload (cards + optional notes/actions). " +
    "Use exactly once per turn. All cards must match the registered components and datasources.",
  input_schema: ORCHESTRATE_INPUT_SCHEMA as Anthropic.Tool["input_schema"],
};

const ORCHESTRATE_TOOL_CHOICE: Anthropic.ToolChoice = {
  type: "tool",
  name: ORCH_TOOL_NAME,
};

// ─── AI 응답 전처리 (text-only 경로) ───────────────

/**
 * Haiku 의 응답 텍스트에서 JSON 부분만 추출.
 * markdown fence / prose 혼입을 무손실 복구. text-only 모드에서만 사용.
 */
function stripCodeFence(text: string): string {
  let t = text.trim();
  const fenceMatch = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch && fenceMatch[1] !== undefined) t = fenceMatch[1].trim();
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }
  return t.trim();
}

// ─── payload 추출 (mode 별 분기) ────────────────────

/**
 * CallHaikuResult 에서 orchestration payload(unknown JSON) 를 추출한다.
 * tool_use 모드: toolUses[0].input 을 직접 반환
 * text-only 모드: text → stripCodeFence → JSON.parse
 *
 * 실패 시 Error throw (호출자가 catch 해 stage 분류).
 */
function extractPayload(result: CallHaikuResult): unknown {
  if (USE_TOOL_USE) {
    // 명시적 내로잉 — non-null assertion 대신 런타임 체크 (리팩터링 안전성)
    const firstToolUse = result.toolUses[0];
    if (!firstToolUse) {
      throw new Error(
        `Haiku 가 tool_use 블록을 반환하지 않음. stop_reason=${result.stopReason ?? "?"}, text_preview=${result.text.slice(0, 100)}`,
      );
    }
    return firstToolUse.input;
  }
  // text-only
  const cleaned = stripCodeFence(result.text);
  return JSON.parse(cleaned);
}

// ─── 요청 스키마 ────────────────────────────────────

const OrchestrateRequestSchema = z
  .object({
    query: z
      .string()
      .min(1, "query 는 비어있을 수 없습니다")
      .max(500, "query 는 500자를 초과할 수 없습니다"),
    /**
     * sha256 hex 64자 — ChatInputBar 가 클라이언트 측 Web Crypto 로 계산해 전달
     * (M1.6 Step 3 Substep 3e, 2026-04-26). PII 의존 없이 동일 query 군집 분석용.
     * server 는 받기만 하고 logChat user_query_hash 컬럼에 그대로 저장.
     * optional — 구버전 클라이언트 / 테스트 호환성.
     */
    query_hash: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "query_hash 는 sha256 hex 64자여야 합니다")
      .optional(),
  })
  .strict();

// ─── 단일 호출 결과 타입 ───────────────────────────

interface OrchOnceSuccess {
  kind: "success";
  payload: OrchestrateResponse;
  raw: Anthropic.Message;
}

interface OrchOnceFailure {
  kind: "failure";
  /** 어느 단계에서 실패했는가 */
  stage: "haiku_call" | "extract" | "zod";
  /** 재시도 가치 (transient 는 재시도 해도 같은 결과) */
  retryable: boolean;
  /** self-correction feedback 에 쓸 요약 */
  errorSummary: string;
  /** 이전 raw — 재시도 시 assistant 턴에 재사용 */
  raw: Anthropic.Message | null;
  /** fallback reason 매핑 */
  fallbackReason: OrchestrateFallbackReason;
}

type OrchOnceResult = OrchOnceSuccess | OrchOnceFailure;

// ─── 1회 호출 (재시도 피드백 없음 또는 있음) ───────

interface CorrectionContext {
  previousRaw: Anthropic.Message;
  errorSummary: string;
}

/**
 * M1.5 Step 4b: FORCE_INVALID_RESPONSE 가 활성 상태일 때, Haiku 호출을 건너뛰고
 * 의도적으로 Zod 실패가 나는 가짜 응답을 만들어 `OrchOnceFailure` 로 반환.
 *
 * `{ cards: "not-an-array" }` 는 OrchestrateResponseSchema 의 `cards` 가
 * `z.array(...)` 이므로 즉시 Zod fail. retryable=true 로 두어 route.ts 가
 * 재시도 루프를 실제로 타게 한다 (1차 + 2차 모두 같은 실패 → fallback).
 *
 * 실 API 호출 0회 → E2E 매 실행마다 $0 비용. CI 친화적.
 */
function buildForcedInvalidFailure(): OrchOnceFailure {
  const fakePayload = { cards: "not-an-array" };
  const zodParse = OrchestrateResponseSchema.safeParse(fakePayload);
  // 타입 시스템상 zodParse.success 는 false 가 확정되지만, Zod 런타임 계약상
  // safeParse 는 언제나 성공/실패 둘 중 하나를 반환하므로 defensive unwrap.
  const errorSummary = zodParse.success
    ? "FORCE_INVALID_RESPONSE: schema accepted fake payload (should never happen)"
    : formatZodError(zodParse.error);

  // Anthropic SDK 0.90.0 기준 Message/ToolUseBlock/Usage 전체 필드 채움.
  // 필수 필드만 의미가 있고 나머지는 null/0 로 안전 초기화.
  const fakeRaw: Anthropic.Message = {
    id: "msg_forced_invalid",
    type: "message",
    role: "assistant",
    container: null,
    content: [
      {
        type: "tool_use",
        id: "toolu_forced_invalid",
        name: ORCH_TOOL_NAME,
        input: fakePayload,
        caller: { type: "direct" },
      },
    ],
    model: HAIKU_MODEL_ID,
    stop_details: null,
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 0,
      output_tokens: 0,
      server_tool_use: null,
      service_tier: null,
    },
  };

  return {
    kind: "failure",
    stage: "zod",
    retryable: true,
    errorSummary,
    raw: fakeRaw,
    // M1.6 Step 4 (2026-04-28, [3-8] 회수): validation_exhausted → 2분할.
    //   Zod 검증 단계 실패는 schema_drift (JSON 자체는 OK, schema 만 안 맞음).
    fallbackReason: "schema_drift",
  };
}

async function orchestrateOnce(
  query: string,
  correction: CorrectionContext | null,
): Promise<OrchOnceResult> {
  // M1.5 Step 4b (2026-04-23): dev-only 경로 — Haiku 호출 전에 차단.
  //   1차/2차 모두 이 분기를 타므로 "재시도 → 여전히 실패 → fallback" 이 완주.
  //   query/correction 파라미터는 flag OFF 시 정상 경로에서 사용됨.
  if (FORCE_INVALID_RESPONSE) {
    void query;
    void correction;
    return buildForcedInvalidFailure();
  }

  const system = buildSystemPrompt();

  // messages 구성
  //   · 1차: string (callHaiku 내부에서 user 메시지 1개로 래핑)
  //   · 2차(재시도): [user 원쿼리, assistant 원본, user correction] 3턴 누적
  const user: string | Anthropic.MessageParam[] = correction
    ? [
        { role: "user", content: query },
        {
          role: "assistant",
          content:
            correction.previousRaw.content as Anthropic.MessageParam["content"],
        },
        {
          role: "user",
          content:
            `Your previous response failed validation:\n${correction.errorSummary}\n\n` +
            `Re-emit the ${USE_TOOL_USE ? "tool call" : "JSON"} with corrections. ` +
            `Fix only the fields listed above. No prose, no explanation.`,
        },
      ]
    : query;

  // Haiku 호출
  let result: CallHaikuResult;
  try {
    result = await callHaiku({
      system,
      user,
      tools: USE_TOOL_USE ? [ORCHESTRATE_TOOL] : undefined,
      toolChoice: USE_TOOL_USE ? ORCHESTRATE_TOOL_CHOICE : undefined,
    });
  } catch (err) {
    if (err instanceof MissingAnthropicKeyError) {
      return {
        kind: "failure",
        stage: "haiku_call",
        retryable: false,
        errorSummary: "ANTHROPIC_API_KEY 누락",
        raw: null,
        fallbackReason: "upstream_error",
      };
    }
    if (err instanceof AnthropicTransportError) {
      return {
        kind: "failure",
        stage: "haiku_call",
        retryable: false, // Step 2b 는 transient 재시도 미도입 (Zod 재시도만)
        errorSummary: `Anthropic 전송 실패: ${err.message}`,
        raw: null,
        fallbackReason: "transient_error",
      };
    }
    if (err instanceof AnthropicInvalidResponseError) {
      return {
        kind: "failure",
        stage: "haiku_call",
        retryable: false,
        errorSummary: `Anthropic 응답 비정상: ${err.message}`,
        raw: null,
        // M1.6 Step 4 (2026-04-28, [3-8] 회수): SDK 가 던지는 invalid response
        //   는 응답 구조 자체 비정상 — parse_error 영역.
        fallbackReason: "parse_error",
      };
    }
    return {
      kind: "failure",
      stage: "haiku_call",
      retryable: false,
      errorSummary: `예상치 못한 에러: ${err instanceof Error ? err.message : String(err)}`,
      raw: null,
      fallbackReason: "transient_error",
    };
  }

  // M1.5 Step 3d (2026-04-23): Haiku 가 정책상 요청을 거부한 경우
  //   · message.content 에 refusal 블록만 있고 text/tool_use 비어있음
  //   · haikuClient 는 이 경우 throw 하지 않고 stopReason="refusal" 로 통과시킴
  //   · extractPayload 를 호출하면 tool_use 없음으로 Error 로 오분류되므로
  //     그 전에 early return. 재시도해도 같은 이유로 거부 → retryable=false.
  if (result.stopReason === "refusal") {
    // 운영 가시성 — 어떤 쿼리 패턴에서 refusal 이 트리거되는지 단서 확보.
    // query 는 사용자 입력 원문이며 M1.5 단계는 single-user dev 환경이라
    // PII 우려 없음. multi-user 전환(M1.6) 시 마스킹 정책 재검토.
    // code-reviewer W2 (2026-04-23) 반영.
    console.warn(
      `[orchestrate] Haiku refused query: "${query.slice(0, 200)}"`,
    );
    return {
      kind: "failure",
      stage: "haiku_call",
      retryable: false,
      errorSummary: "Haiku refused the request (policy)",
      raw: result.raw,
      fallbackReason: "refusal",
    };
  }

  // payload 추출
  let parsedPayload: unknown;
  try {
    parsedPayload = extractPayload(result);
  } catch (err) {
    return {
      kind: "failure",
      stage: "extract",
      retryable: true,
      errorSummary: `Response parse failure: ${err instanceof Error ? err.message : String(err)}`,
      raw: result.raw,
      // M1.6 Step 4 (2026-04-28, [3-8] 회수): extractPayload 단계 실패 = JSON.parse
      //   실패 또는 tool_use 블록 누락 → parse_error.
      fallbackReason: "parse_error",
    };
  }

  // Zod 검증
  const zodParse = OrchestrateResponseSchema.safeParse(parsedPayload);
  if (!zodParse.success) {
    return {
      kind: "failure",
      stage: "zod",
      retryable: true,
      errorSummary: formatZodError(zodParse.error),
      raw: result.raw,
      // M1.6 Step 4 (2026-04-28, [3-8] 회수): Zod 검증 실패 = JSON 은 OK 인데
      //   shape 만 안 맞음 → schema_drift. registry-derived refinement 도 여기.
      fallbackReason: "schema_drift",
    };
  }

  return { kind: "success", payload: zodParse.data, raw: result.raw };
}

// ─── token 합산 헬퍼 (M1.6 Step 2) ──────────────────
// 1 query 가 1차 + 재시도 시 최대 2 호출 발생. 비용 정확성 보존을 위해 합산.
// raw=null (transient_error 등) 인 호출은 0 으로 흡수.
// "1 query = 1 row" 옵션 B 채택 (rate limit 의도와 일치).
function aggregateTokens(
  ...raws: Array<Anthropic.Message | null>
): { input: number; output: number } {
  return raws.reduce(
    (acc, r) => ({
      input: acc.input + (r?.usage.input_tokens ?? 0),
      output: acc.output + (r?.usage.output_tokens ?? 0),
    }),
    { input: 0, output: 0 },
  );
}

// ─── fallback 헬퍼 ──────────────────────────────────

function fallback(
  reason: OrchestrateFallbackReason,
  message: string,
  status = 200,
): NextResponse<OrchestrateApiResponse> {
  return NextResponse.json<OrchestrateApiResponse>(
    { kind: "fallback", reason, message },
    { status },
  );
}

function success(
  payload: OrchestrateResponse,
): NextResponse<OrchestrateApiResponse> {
  return NextResponse.json<OrchestrateApiResponse>(
    { kind: "success", payload },
    { status: 200 },
  );
}

// ─── POST 핸들러 ────────────────────────────────────

export async function POST(
  req: NextRequest | Request,
): Promise<NextResponse<OrchestrateApiResponse>> {
  // M1.6 Step 2: 1 query 종단 latency 측정 시작.
  // auth 단계도 포함 — 사용자 체감 latency 가 진짜 측정 대상.
  const startTime = Date.now();

  // 0) Auth 두 겹 방어 (M1.6 Step 1d) ────────────────────────────────────────
  // middleware 가 /api/orchestrate 에 이미 401 을 걸지만, matcher 설정 실수 /
  // 다른 경로 경유 접근 등 우회 시나리오를 차단하기 위한 defensive layer.
  // middleware 와 중복이지만 "두 겹 방어" 원칙 — 둘 중 하나라도 통과하면 차단.
  //
  // 성공 시 `userId` 는 Step 2 log_chat INSERT 에서 사용 예정. 지금은 void.
  let _userId: string | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return fallback(
        "upstream_error",
        "Authentication required. Please sign in.",
        401,
      );
    }
    _userId = user.id;
  } catch (err) {
    console.error(
      "[orchestrate] auth verification failed:",
      err instanceof Error ? err.message : String(err),
    );
    return fallback(
      "upstream_error",
      "Authentication service unavailable.",
      401,
    );
  }
  // M1.6 Step 2 회수 완료 (2026-04-25): _userId 는 아래 logChat / logValidationFailure 호출에서
  // 실제 활용된다. void 제거 — 변수가 더 이상 unused 가 아님.

  // 1) 요청 본문 JSON 파싱
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fallback(
      "upstream_error",
      "Request body is not valid JSON.",
      400,
    );
  }

  // 2) 요청 스키마 검증
  const reqParse = OrchestrateRequestSchema.safeParse(rawBody);
  if (!reqParse.success) {
    return fallback(
      "upstream_error",
      "Request is missing the query string or has an invalid shape.",
      400,
    );
  }
  const { query, query_hash: userQueryHash } = reqParse.data;

  // 3) 1차 호출
  const first = await orchestrateOnce(query, null);

  if (first.kind === "success") {
    // M1.6 Step 2: 1차 호출 만에 성공 → log_chat 1 row.
    const tokens = aggregateTokens(first.raw);
    void logChat({
      userId: _userId,
      queryText: query,
      aiResponse: first.payload,
      status: "success",
      modelId: HAIKU_MODEL_ID,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      latencyMs: Date.now() - startTime,
      attemptNumber: 1,
      systemPromptVersion: SYSTEM_PROMPT_VERSION,
      userQueryHash,
    }).catch((err: unknown) => {
      console.error(
        "[orchestrate] logChat (success/1차) 실패:",
        err instanceof Error ? err.message : String(err),
      );
    });
    return success(first.payload);
  }

  // 4) 재시도 판정
  //    transient 에러(API key 누락 / 네트워크 실패)는 재시도 무의미 → 즉시 fallback
  if (!first.retryable || first.raw === null) {
    console.warn(
      `[orchestrate] 재시도 불가 (${first.stage}): ${first.errorSummary.slice(0, 200)}`,
    );
    // M1.6 Step 2: 1차 실패 + 재시도 불가 → log_chat 1 row (status='fallback').
    // raw=null 케이스 (transient_error 등) 는 input/output_tokens=0.
    const tokens = aggregateTokens(first.raw);
    void logChat({
      userId: _userId,
      queryText: query,
      aiResponse: first.raw?.content ?? null,
      status: "fallback",
      fallbackReason: first.fallbackReason,
      modelId: HAIKU_MODEL_ID,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      latencyMs: Date.now() - startTime,
      attemptNumber: 1,
      systemPromptVersion: SYSTEM_PROMPT_VERSION,
      userQueryHash,
    }).catch((err: unknown) => {
      console.error(
        "[orchestrate] logChat (fallback/1차) 실패:",
        err instanceof Error ? err.message : String(err),
      );
    });
    return fallback(first.fallbackReason, messageForReason(first.fallbackReason));
  }

  // 5) self-correction 재시도 (validation 실패 시만)
  console.warn(
    `[orchestrate] 1차 실패 (${first.stage}). self-correction 재시도 중...`,
  );
  console.warn(`[orchestrate] 에러 요약: ${first.errorSummary.slice(0, 300)}`);

  const retry = await orchestrateOnce(query, {
    previousRaw: first.raw,
    errorSummary: first.errorSummary,
  });

  if (retry.kind === "success") {
    console.info("[orchestrate] self-correction 재시도 성공");
    // M1.6 Step 2: 재시도 후 성공 → log_chat 1 row, attempt_number=2.
    // 토큰은 1차 + 재시도 합산 (옵션 B).
    const tokens = aggregateTokens(first.raw, retry.raw);
    void logChat({
      userId: _userId,
      queryText: query,
      aiResponse: retry.payload,
      status: "success",
      modelId: HAIKU_MODEL_ID,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      latencyMs: Date.now() - startTime,
      attemptNumber: 2,
      systemPromptVersion: SYSTEM_PROMPT_VERSION,
      userQueryHash,
    }).catch((err: unknown) => {
      console.error(
        "[orchestrate] logChat (success/2차) 실패:",
        err instanceof Error ? err.message : String(err),
      );
    });
    return success(retry.payload);
  }

  // 6) 2회 실패 → log_validation_failure INSERT + fallback
  console.warn(
    `[orchestrate] 2회 실패 (${retry.stage}): ${retry.errorSummary.slice(0, 200)}`,
  );

  // Step 2c: DB 에 실패 기록 (fire-and-forget — UX 레이턴시에서 제외)
  //   · code-reviewer M1 (2026-04-22): await 하면 사용자 대기시간에 log INSERT 왕복이 포함됨.
  //     Haiku 1차(2s) + Haiku 2차(2s) + log INSERT(300ms) = UX 4.3s → 4s 상한 초과.
  //   · logValidationFailure 는 내부에서 절대 throw 안 하지만, 예방적으로 .catch 감싸기.
  //   · Vercel/Next.js 는 response 반환 후에도 일정 시간 pending Promise 를 유지함.
  //   · 엄격한 "완료 보장" 이 필요하면 Next.js 15+ `after()` API 로 M2+ 에서 전환 고려.
  // M1.6 Step 2 (2026-04-25): meta prefix 방식 폐기 — userId / attemptNumber / modelId /
  //   systemPromptVersion 직접 컬럼 사용. first/retry stage 추적은 errorMessage prefix 로만 유지.
  void logValidationFailure({
    userId: _userId,
    queryText: query,
    aiResponse: retry.raw?.content ?? null,
    errorType: "retry_failed",
    errorMessage: `[first_stage=${first.stage}, retry_stage=${retry.stage}] ${retry.errorSummary}`,
    attemptNumber: 2,
    modelId: HAIKU_MODEL_ID,
    systemPromptVersion: SYSTEM_PROMPT_VERSION,
    userQueryHash,
  }).catch((err: unknown) => {
    console.error(
      "[orchestrate] logValidationFailure 최종 실패 (이중 방어):",
      err instanceof Error ? err.message : String(err),
    );
  });

  // M1.6 Step 2 신규: 2회 실패도 1 query 로 카운트 (rate limit 의도) → log_chat 동시 INSERT.
  // 토큰은 1차+재시도 합산 (옵션 B). status='fallback' + retry 의 reason 기록.
  const tokens = aggregateTokens(first.raw, retry.raw);
  void logChat({
    userId: _userId,
    queryText: query,
    aiResponse: retry.raw?.content ?? null,
    status: "fallback",
    fallbackReason: retry.fallbackReason,
    modelId: HAIKU_MODEL_ID,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    latencyMs: Date.now() - startTime,
    attemptNumber: 2,
    systemPromptVersion: SYSTEM_PROMPT_VERSION,
    userQueryHash, // ← code-reviewer W4 fix (2026-04-26): 5번째 logChat 호출 누락 보정
  }).catch((err: unknown) => {
    console.error(
      "[orchestrate] logChat (fallback/2차) 실패:",
      err instanceof Error ? err.message : String(err),
    );
  });

  return fallback(retry.fallbackReason, messageForReason(retry.fallbackReason));
}

// ─── 사용자 친화 메시지 매핑 ────────────────────────

/**
 * fallback reason 별 사용자 메시지.
 *
 * M1.5 Step 4a' (2026-04-23): English-only 정책 적용 (project_english_only_global).
 *   TRAVIS 는 글로벌 English-only 제품이므로 토스트/fallback UI 는 영어.
 *   @crypto-trader 자문으로 M1 완료 후 실사용 피드백 기반 톤 조정 예정.
 */
function messageForReason(reason: OrchestrateFallbackReason): string {
  switch (reason) {
    // M1.6 Step 4 (2026-04-28, [3-8] 회수): validation_exhausted → 2분할.
    //   parse_error = JSON 자체가 깨짐 (가벼운 retry 권유 톤),
    //   schema_drift = JSON 은 OK 인데 shape 안 맞음 (rephrase 권유 톤).
    case "parse_error":
      return "The AI response wasn't well-formed. Please try again.";
    case "schema_drift":
      return "The AI response didn't match the expected shape. Please rephrase and try again.";
    case "transient_error":
      return "The AI service didn't respond. Please try again shortly.";
    case "upstream_error":
      return "AI service configuration issue. Please contact the operator.";
    case "timeout":
      return "The request took too long and was cancelled. Please try again.";
    case "refusal":
      return "This request can't be fulfilled. Please try a different question.";
  }
}

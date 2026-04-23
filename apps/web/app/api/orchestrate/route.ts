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
import { HAIKU_MODEL_ID } from "@/lib/ai";

// ─── 설정 (env 기반) ────────────────────────────────

/**
 * tool_use 모드 기본 활성화 (Step 2a.5 스파이크 결과 반영).
 * `.env.local` 에 `USE_TOOL_USE=false` 를 명시적으로 설정해야 text-only 로 fallback.
 */
const USE_TOOL_USE = process.env.USE_TOOL_USE !== "false";

/** tool_use 모드에서 Haiku 에게 노출할 tool 이름. */
const ORCH_TOOL_NAME = "emit_orchestration";

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

async function orchestrateOnce(
  query: string,
  correction: CorrectionContext | null,
): Promise<OrchOnceResult> {
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
        fallbackReason: "validation_exhausted",
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
      fallbackReason: "validation_exhausted",
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
      fallbackReason: "validation_exhausted",
    };
  }

  return { kind: "success", payload: zodParse.data, raw: result.raw };
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
  // 1) 요청 본문 JSON 파싱
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fallback(
      "upstream_error",
      "요청 본문이 올바른 JSON 이 아닙니다.",
      400,
    );
  }

  // 2) 요청 스키마 검증
  const reqParse = OrchestrateRequestSchema.safeParse(rawBody);
  if (!reqParse.success) {
    return fallback(
      "upstream_error",
      "요청에 query 문자열이 없거나 형식이 올바르지 않습니다.",
      400,
    );
  }
  const { query } = reqParse.data;

  // 3) 1차 호출
  const first = await orchestrateOnce(query, null);

  if (first.kind === "success") {
    return success(first.payload);
  }

  // 4) 재시도 판정
  //    transient 에러(API key 누락 / 네트워크 실패)는 재시도 무의미 → 즉시 fallback
  if (!first.retryable || first.raw === null) {
    console.warn(
      `[orchestrate] 재시도 불가 (${first.stage}): ${first.errorSummary.slice(0, 200)}`,
    );
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
  void logValidationFailure({
    queryText: query,
    aiResponse: retry.raw?.content ?? null,
    errorType: "retry_failed",
    errorMessage: retry.errorSummary,
    meta: {
      first_stage: first.stage,
      retry_stage: retry.stage,
      model_id: HAIKU_MODEL_ID,
      attempt_number: 2,
    },
  }).catch((err: unknown) => {
    console.error(
      "[orchestrate] logValidationFailure 최종 실패 (이중 방어):",
      err instanceof Error ? err.message : String(err),
    );
  });

  return fallback(retry.fallbackReason, messageForReason(retry.fallbackReason));
}

// ─── 사용자 친화 메시지 매핑 ────────────────────────

/** fallback reason 별 사용자 메시지. @crypto-trader 자문으로 Step 2c 에서 톤 조정 예정. */
function messageForReason(reason: OrchestrateFallbackReason): string {
  switch (reason) {
    case "validation_exhausted":
      return "요청을 처리하지 못했습니다. 다시 표현해 주세요.";
    case "transient_error":
      return "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "upstream_error":
      return "AI 서비스 설정에 문제가 있습니다. 관리자에게 문의하세요.";
    case "timeout":
      return "AI 응답이 너무 오래 걸려 취소되었습니다. 다시 시도해 주세요.";
    case "refusal":
      return "해당 요청은 처리할 수 없어요. 다른 방식으로 질문해 주세요.";
  }
}

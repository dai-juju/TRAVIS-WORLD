/**
 * POST /api/orchestrate — AI 오케스트레이터 엔드포인트 (M1.5 Step 2a).
 *
 * 사용자 쿼리(자연어) 를 받아 Haiku 4.5 에게 시스템 프롬프트와 함께 보내고,
 * AI 가 emit 한 JSON 을 Zod 로 검증하여 `OrchestrateApiResponse` 를 반환한다.
 *
 * Step 2a 범위 (성공 경로만):
 *   - 요청 본문 `{ query: string }` 파싱
 *   - Haiku 1회 호출 (재시도 없음)
 *   - text-only JSON 파싱
 *   - Zod safeParse → 성공 시 `{ kind: "success", payload }`
 *   - 실패 시 일괄 `{ kind: "fallback", reason, message }` (세분화는 Step 2b/2c)
 *
 * Step 2b 에서 추가될 것:
 *   - Zod 실패 시 self-correction 재시도 1회 (messages 3턴 누적)
 *   - transient 에러 retry-after 기반 backoff
 *   - `tool_use` vs text-only 실측 결과 반영 (2a.5 스파이크 이후)
 *
 * Step 2c 에서 추가될 것:
 *   - `log_validation_failure` INSERT (service_role client 경유)
 *   - RLS 정책 재확인 + fallback 메시지 최종 톤 (@crypto-trader 자문)
 *
 * 설계 원칙 (CLAUDE.md):
 *   - 크래시 절대 금지 — 모든 에러 경로는 fallback JSON + HTTP 200 으로 graceful
 *   - 외부 API 직접 호출 금지 — Anthropic 만 (haikuClient 경유), 거래소/뉴스 금지
 *   - dataService 경유 — log INSERT 는 Step 2c 에서 SupabaseDataService 위임
 *
 * 공식 문서 근거:
 *   - Next.js 16 App Router Route Handler: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
 *   - 조회일: 2026-04-22
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AnthropicInvalidResponseError,
  AnthropicTransportError,
  MissingAnthropicKeyError,
  buildSystemPrompt,
  callHaiku,
} from "@/lib/ai";

import {
  OrchestrateResponseSchema,
  type OrchestrateApiResponse,
  type OrchestrateFallbackReason,
} from "@travis/shared";

// ─── AI 응답 전처리 ─────────────────────────────────

/**
 * Haiku 의 응답 텍스트에서 JSON 부분만 추출한다.
 *
 * Haiku 4.5 는 시스템 프롬프트의 "no markdown fences" 지시에도 불구하고
 * 가끔 ```json ... ``` 으로 감싸거나 앞뒤에 prose 를 붙인다 (실측 확인).
 * Step 2b 의 self-correction 재시도로 넘어가기 전에 이 전처리 1회는 무손실
 * 복구 (정상 JSON 은 그대로 통과).
 *
 * 규칙:
 *   1. ```json ... ``` 또는 ``` ... ``` fence 제거
 *   2. 그 외엔 첫 `{` 부터 마지막 `}` 까지 추출 (prose 가 섞인 경우)
 *   3. 양 끝 공백 트림
 */
function stripCodeFence(text: string): string {
  let t = text.trim();

  // Markdown fence 제거
  const fenceMatch = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch && fenceMatch[1] !== undefined) {
    t = fenceMatch[1].trim();
  }

  // prose 혼입 시 첫 `{` ~ 마지막 `}` 슬라이스 (array 응답은 Step 2 범위 밖)
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    t = t.slice(firstBrace, lastBrace + 1);
  }

  return t.trim();
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

// ─── fallback 헬퍼 ──────────────────────────────────

/** 실패 응답을 일관된 shape + HTTP 200 으로 반환. 크래시 절대 금지 원칙. */
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

  // 3) 시스템 프롬프트 합성 (레지스트리 4종 자동 주입)
  const systemPrompt = buildSystemPrompt();

  // 4) Haiku 호출 (Step 2a 는 1회만, 재시도 없음)
  let haikuText: string;
  try {
    const result = await callHaiku({ system: systemPrompt, user: query });
    haikuText = result.text;
  } catch (err) {
    // env 누락은 서버 설정 오류 — upstream_error 로 분류 (사용자 쿼리 문제 아님)
    if (err instanceof MissingAnthropicKeyError) {
      console.error("[orchestrate] ANTHROPIC_API_KEY 누락");
      return fallback(
        "upstream_error",
        "AI 서비스 설정에 문제가 있습니다. 관리자에게 문의하세요.",
      );
    }
    // 네트워크 / 5xx / 타임아웃
    if (err instanceof AnthropicTransportError) {
      console.warn("[orchestrate] Haiku 전송 실패:", err.message);
      return fallback(
        "transient_error",
        "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    // 응답 shape 비정상 (content 빈 경우)
    if (err instanceof AnthropicInvalidResponseError) {
      console.warn("[orchestrate] Haiku 응답 비정상:", err.message);
      return fallback(
        "validation_exhausted",
        "AI 응답이 비어 있습니다. 요청을 다시 표현해 주세요.",
      );
    }
    // 예상 못한 에러 — 크래시 금지, fallback 으로 graceful
    console.error("[orchestrate] 예상치 못한 에러:", err);
    return fallback(
      "transient_error",
      "예기치 않은 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  // 5) AI 텍스트 → JSON 파싱 (text-only 경로 + 경량 전처리)
  const cleanedText = stripCodeFence(haikuText);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleanedText);
  } catch {
    // Step 2b 에서 self-correction 재시도 대상. Step 2a 는 즉시 fallback.
    console.warn(
      "[orchestrate] AI 응답 JSON parse 실패. Step 2b 재시도 예정. preview:",
      haikuText.slice(0, 300).replace(/\n/g, "\\n"),
    );
    return fallback(
      "validation_exhausted",
      "AI 응답 형식을 해석하지 못했습니다. 요청을 다시 표현해 주세요.",
    );
  }

  // 6) Zod payload 검증
  const payloadParse = OrchestrateResponseSchema.safeParse(parsedJson);
  if (!payloadParse.success) {
    // Step 2b 에서 self-correction 재시도 대상 + Step 2c 에서 log INSERT.
    console.warn(
      "[orchestrate] payload Zod 검증 실패. Step 2b 재시도 예정:",
      payloadParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "),
    );
    return fallback(
      "validation_exhausted",
      "AI 응답이 규격에 맞지 않습니다. 요청을 다시 표현해 주세요.",
    );
  }

  // 7) 성공
  return NextResponse.json<OrchestrateApiResponse>(
    { kind: "success", payload: payloadParse.data },
    { status: 200 },
  );
}

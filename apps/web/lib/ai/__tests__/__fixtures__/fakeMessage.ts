/**
 * Fake Anthropic.Message + CallHaikuResult fixture factories.
 *
 * M1.6 Step 5 ([3-9] 회수, 2026-05-03):
 *   `orchestrateOnce` 단위 테스트가 `callHaiku` 의 반환 shape 을 mock 으로 주입하기
 *   위한 helper. route.ts 의 `buildForcedInvalidFailure()` 와 동일한 fakeRaw 패턴
 *   을 추출 — DRY (route.ts 가 향후 SDK 0.91+ 로 업그레이드되어 Message 필드가
 *   추가/변경되면 이 한 곳만 갱신).
 *
 * Anthropic SDK 0.90.0 기준 Message/Usage shape — 모든 필드를 안전 초기화.
 *
 * 공식 문서 근거 (CLAUDE.md 데이터 소스 위생 #8):
 *   - SDK: https://github.com/anthropics/anthropic-sdk-typescript (v0.90.0)
 *   - Messages API: https://docs.anthropic.com/en/api/messages
 *   - 조회일: 2026-05-03
 */

import type Anthropic from "@anthropic-ai/sdk";

import { HAIKU_MODEL_ID, type CallHaikuResult } from "@/lib/ai";
// M1.6 Step 5 (code-reviewer W4 즉시 수정, 2026-05-03): route.ts 의 단일 진실 공급원
//   직접 import — 옛 string 하드코딩 drift 차단.
import { ORCH_TOOL_NAME } from "@/app/api/orchestrate/route";

// ─── Anthropic.Message builder ────────────────────────────

/**
 * Anthropic SDK 0.90 `Message` 의 모든 필드를 default 로 안전 초기화한 fake 객체 반환.
 *
 * `overrides` 로 시나리오별로 stop_reason / content / id 만 갈아 끼우면 충분.
 * usage 는 input/output 토큰 모두 0 으로 두어 token aggregation 단언이 확정적.
 */
export function makeFakeMessage(
  overrides: {
    stop_reason?: Anthropic.Message["stop_reason"];
    content?: Anthropic.Message["content"];
    id?: string;
  } = {},
): Anthropic.Message {
  return {
    id: overrides.id ?? "msg_fake",
    type: "message",
    role: "assistant",
    container: null,
    content: overrides.content ?? [],
    model: HAIKU_MODEL_ID,
    stop_details: null,
    stop_reason: overrides.stop_reason ?? "end_turn",
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
}

// ─── CallHaikuResult factories (시나리오별) ──────────────────

/**
 * Haiku 가 정책상 거부한 응답.
 *   stop_reason="refusal" + content=[] (text/tool_use 모두 비어있음).
 *   route.ts 의 `if (result.stopReason === "refusal")` 분기 trigger.
 */
export function mkRefusalResult(): CallHaikuResult {
  return {
    text: "",
    toolUses: [],
    stopReason: "refusal",
    usage: { inputTokens: 100, outputTokens: 0 },
    raw: makeFakeMessage({ stop_reason: "refusal", content: [] }),
  };
}

/**
 * tool_use 블록이 없는 text-only 응답 (USE_TOOL_USE=true 일 때 extractPayload 가 throw).
 *   route.ts 의 `extractPayload` 안에서 `if (!firstToolUse) throw` 분기 trigger.
 *   stage="extract", fallbackReason="parse_error".
 */
export function mkTextOnlyResult(
  text: string = "Some text without a tool call.",
): CallHaikuResult {
  return {
    text,
    toolUses: [],
    stopReason: "end_turn",
    usage: { inputTokens: 100, outputTokens: 50 },
    raw: makeFakeMessage({ stop_reason: "end_turn" }),
  };
}

/**
 * tool_use 블록 1개 + 임의 input.
 *   - input 이 Zod valid 한 OrchestrateResponse → success 경로
 *   - input 이 Zod invalid (예: `{ cards: "not-array" }`) → schema_drift 경로
 */
export function mkToolUseResult(input: unknown): CallHaikuResult {
  return {
    text: "",
    toolUses: [{ id: "toolu_fake", name: ORCH_TOOL_NAME, input }],
    stopReason: "tool_use",
    usage: { inputTokens: 100, outputTokens: 50 },
    raw: makeFakeMessage({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_fake",
          name: ORCH_TOOL_NAME,
          input,
          caller: { type: "direct" },
        },
      ],
    }),
  };
}

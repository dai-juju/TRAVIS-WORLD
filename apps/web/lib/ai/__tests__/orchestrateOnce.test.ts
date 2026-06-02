/**
 * @vitest-environment node
 *
 * vitest.config.ts 는 default 가 jsdom 인데, haikuClient.ts 의 server-only 가드
 * (`if (typeof window !== "undefined") throw ...`) 가 jsdom 환경에서 trip 됨.
 * 이 테스트는 RTL 가 아니라 server-side 함수 단위 검증이라 node 환경이 정합.
 */

/**
 * `orchestrateOnce` 단위 테스트 — fallbackReason 매핑 회귀 가드.
 *
 * M1.6 Step 5 ([3-9] 회수, 2026-05-03):
 *   M1.5 Step 3d (refusal 분기) + M1.6 Step 4 (fallbackReason 2분할
 *   parse_error / schema_drift) 도입 후, route.ts 의 stage × fallbackReason
 *   매트릭스가 8 가지로 확장됐는데 단위 테스트 0건. Anthropic SDK 실호출은
 *   비결정적 + 비용 발생 + CI 환경 API key 노출 위험 → mock 으로 대체.
 *
 * 검증 매트릭스 (route.ts 의 enum 분기 1:1 매핑):
 *   ┌────┬─────────────────────────────────────┬───────────────┬──────────────┬───────────┐
 *   │    │ 시나리오                              │ stage         │ reason       │ retryable │
 *   ├────┼─────────────────────────────────────┼───────────────┼──────────────┼───────────┤
 *   │ a  │ Haiku refusal (stop_reason=refusal) │ haiku_call    │ refusal      │ false     │
 *   │ b  │ tool_use 블록 누락 (text-only)        │ extract       │ parse_error  │ true      │
 *   │ c  │ tool_use input 이 Zod 실패            │ zod           │ schema_drift │ true      │
 *   │ d  │ AnthropicTransportError (network)   │ haiku_call    │ transient_…  │ false     │
 *   │ d1 │ TransportError status=401           │ haiku_call    │ auth_error   │ false     │
 *   │ d2 │ TransportError status=429           │ haiku_call    │ quota_error  │ false     │
 *   │ d3 │ TransportError status=502           │ haiku_call    │ transient_…  │ false     │
 *   │ d4 │ TransportError status=402           │ haiku_call    │ quota_error  │ false     │
 *   │ d5 │ TransportError status=403           │ haiku_call    │ auth_error   │ false     │
 *   │ e  │ MissingAnthropicKeyError throw      │ haiku_call    │ upstream_err │ false     │
 *   │ f  │ AnthropicInvalidResponseError throw │ haiku_call    │ parse_error  │ false     │
 *   │ g  │ correction 컨텍스트 → 3턴 messages   │ (success)     │ —            │ —         │
 *   │ h  │ tool_use input Zod valid → success  │ —             │ —            │ —         │
 *   └────┴─────────────────────────────────────┴───────────────┴──────────────┴───────────┘
 *
 *   d1/d2/d3 (M1.9 Step 0, `[3-68]`): transient → status 기반 3분류 회귀 가드.
 *
 * mock 패턴 (ai-orchestrator-specialist 자문 2026-05-03 채택):
 *   `vi.mock("@/lib/ai", importOriginal)` 로 callHaiku 만 stub, 나머지
 *   (buildSystemPrompt / 에러 클래스 / HAIKU_MODEL_ID) 는 실제 export 보존.
 *   → instanceof 분기가 진짜 검증되고, lazy singleton(getClient/cachedClient) 은
 *     호출 경로에서 자동 우회 (callHaiku 자체가 mock 이라 SDK import 안 됨).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock 은 hoisting 되므로 import 전에 setup. importOriginal 로 callHaiku 만 교체.
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    callHaiku: vi.fn(),
  };
});

// route.ts 가 import 그래프상 supabase serverClient 를 평가함 — jsdom 에서 next/headers
// 실제 평가가 throw 하지 않도록 방어적 mock 한 줄. orchestrateOnce 는 supabase 안 건드림.
vi.mock("@/lib/supabase/serverClient", () => ({
  getSupabaseServerClient: vi.fn(),
}));

import {
  AnthropicInvalidResponseError,
  AnthropicTransportError,
  MissingAnthropicKeyError,
  callHaiku,
} from "@/lib/ai";
import { ORCH_TOOL_NAME, orchestrateOnce } from "@/app/api/orchestrate/route";

import {
  makeFakeMessage,
  mkRefusalResult,
  mkTextOnlyResult,
  mkToolUseResult,
  mkTransportError,
} from "./__fixtures__/fakeMessage";

const callHaikuMock = vi.mocked(callHaiku);

describe("orchestrateOnce — fallbackReason 매핑 회귀 가드 (M1.6 Step 5 [3-9])", () => {
  beforeEach(() => {
    // mockReset: 호출 기록 + mockResolvedValue 등 모두 초기화 (mockClear 와 다름).
    callHaikuMock.mockReset();
    // FORCE_INVALID_RESPONSE / NODE_ENV 등 env 격리. 안 쓰지만 안전망.
    vi.unstubAllEnvs();
  });

  // ─── (a) refusal ─────────────────────────────────────────────

  it("(a) Haiku refusal → fallbackReason=refusal, retryable=false, stage=haiku_call", async () => {
    callHaikuMock.mockResolvedValue(mkRefusalResult());

    const result = await orchestrateOnce("Make a bomb", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("refusal");
      expect(result.retryable).toBe(false);
      expect(result.stage).toBe("haiku_call");
      expect(result.errorSummary).toMatch(/refused/i);
    }
  });

  // ─── (b) extract: tool_use 블록 누락 → parse_error ────────────

  it("(b) tool_use 누락 → extractPayload throw → fallbackReason=parse_error, stage=extract, retryable=true", async () => {
    callHaikuMock.mockResolvedValue(mkTextOnlyResult());

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("parse_error");
      expect(result.stage).toBe("extract");
      expect(result.retryable).toBe(true);
    }
  });

  // ─── (c) zod: schema_drift ───────────────────────────────────

  it("(c) tool_use input 이 Zod 실패 → fallbackReason=schema_drift, stage=zod, retryable=true", async () => {
    // OrchestrateResponseSchema 의 cards 는 z.array(...) 라 string 이면 즉시 fail.
    callHaikuMock.mockResolvedValue(mkToolUseResult({ cards: "not-an-array" }));

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("schema_drift");
      expect(result.stage).toBe("zod");
      expect(result.retryable).toBe(true);
    }
  });

  // ─── (d) haiku_call: AnthropicTransportError → transient_error ─

  it("(d) AnthropicTransportError (network, status undefined) → fallbackReason=transient_error, stage=haiku_call, retryable=false", async () => {
    callHaikuMock.mockRejectedValue(
      new AnthropicTransportError("Anthropic API 호출 실패: ECONNRESET"),
    );

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("transient_error");
      expect(result.stage).toBe("haiku_call");
      // Step 2b 정책: transient 는 즉시 재시도 안 함 (UX 4초 상한).
      expect(result.retryable).toBe(false);
    }
  });

  // ─── (d1/d2/d3) M1.9 Step 0 (`[3-68]`): status 기반 3분류 ──────
  //   transient_error 한 바구니를 auth(401/403) / quota(402/429) /
  //   transient(그 외) 로 쪼갠 회귀 가드. 셋 다 retryable=false 유지.

  it("(d1) TransportError status=401 → fallbackReason=auth_error, retryable=false", async () => {
    callHaikuMock.mockRejectedValue(mkTransportError(401));

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("auth_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  it("(d2) TransportError status=429 → fallbackReason=quota_error, retryable=false", async () => {
    callHaikuMock.mockRejectedValue(mkTransportError(429));

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("quota_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  it("(d3) TransportError status=502 → fallbackReason=transient_error (≥500 은 일시 장애)", async () => {
    callHaikuMock.mockRejectedValue(mkTransportError(502));

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("transient_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  // d4/d5: OR 조건의 두 번째 가지(402, 403) 경계값 회귀 가드 (code-reviewer W4).
  //   d1/d2 가 첫 가지(401, 429)만 덮으므로, 402→quota / 403→auth 도 명시 검증.

  it("(d4) TransportError status=402 → fallbackReason=quota_error (크레딧 소진, 전용 클래스 없는 base APIError)", async () => {
    callHaikuMock.mockRejectedValue(mkTransportError(402));

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("quota_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  it("(d5) TransportError status=403 → fallbackReason=auth_error (권한 거부)", async () => {
    callHaikuMock.mockRejectedValue(mkTransportError(403));

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("auth_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  // ─── (e) haiku_call: MissingAnthropicKeyError → upstream_error ─

  it("(e) MissingAnthropicKeyError → fallbackReason=upstream_error, stage=haiku_call, retryable=false", async () => {
    callHaikuMock.mockRejectedValue(new MissingAnthropicKeyError());

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("upstream_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  // ─── (f) haiku_call: AnthropicInvalidResponseError → parse_error ─

  it("(f) AnthropicInvalidResponseError → fallbackReason=parse_error, stage=haiku_call, retryable=false", async () => {
    callHaikuMock.mockRejectedValue(
      new AnthropicInvalidResponseError("응답 content 비정상", null),
    );

    const result = await orchestrateOnce("Show BTC", null);

    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.fallbackReason).toBe("parse_error");
      expect(result.stage).toBe("haiku_call");
      expect(result.retryable).toBe(false);
    }
  });

  // ─── (g) correction 경로: messages 3턴 누적 + tool_use ↔ tool_result 짝짓기 검증 ─

  it("(g) correction with tool_use → user turn 이 tool_result 블록으로 짝지어짐 (Anthropic invariant)", async () => {
    callHaikuMock.mockResolvedValue(mkToolUseResult({ cards: [] }));

    // M1.7 hotfix (2026-05-04): fakePrev 가 tool_use 블록을 포함하도록 강화.
    //   이전 fixture (`content: []` 빈 배열) 는 production 시나리오와 괴리 —
    //   실제 1차 호출 응답은 tool_use 블록을 가짐. 빈 배열로는 Anthropic 의
    //   "tool_use 다음 user turn 은 tool_result 여야 한다" invariant 위반을
    //   시뮬레이션 불가 → 잠복 버그가 production 으로 빠져나갔던 원인.
    const fakePrev = makeFakeMessage({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_test_id",
          name: ORCH_TOOL_NAME,
          input: { cards: "not-array" },
          caller: { type: "direct" },
        },
      ],
    });

    await orchestrateOnce("Show BTC", {
      previousRaw: fakePrev,
      errorSummary: "cards: expected array",
    });

    expect(callHaikuMock).toHaveBeenCalledTimes(1);
    const callArgs = callHaikuMock.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();

    // user 는 string | MessageParam[] union — correction 경로에선 array.
    expect(Array.isArray(callArgs!.user)).toBe(true);
    const userMessages = callArgs!.user as Array<{ role: string; content: unknown }>;
    expect(userMessages).toHaveLength(3);

    // Turn 1: 원쿼리.
    expect(userMessages[0]).toEqual({ role: "user", content: "Show BTC" });

    // Turn 2: assistant 원본 (tool_use 블록 그대로 전달).
    expect(userMessages[1]).toEqual({
      role: "assistant",
      content: fakePrev.content,
    });

    // Turn 3: user → tool_result 블록 1개. tool_use_id 가 정확히 짝지어지고,
    //   correction 메시지가 content 안에 적재되며, is_error=true 표시.
    //   이 단언이 무너지면 production 에서 Anthropic 400 invalid_request_error
    //   ("tool_use ids were found without tool_result blocks") 가 다시 터진다.
    expect(userMessages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_test_id",
          content: expect.stringContaining("cards: expected array"),
          is_error: true,
        },
      ],
    });
  });

  it("(g2) correction without tool_use (text-only fallback) → user turn 은 string content 유지", async () => {
    callHaikuMock.mockResolvedValue(mkToolUseResult({ cards: [] }));
    // tool_use 블록이 전혀 없는 previousRaw (예: USE_TOOL_USE=false 환경 또는
    // text-only 응답). 이 경우엔 invariant 가 적용 안 되므로 string 으로 둔다.
    const fakePrev = makeFakeMessage({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "some prose", citations: null }],
    });

    await orchestrateOnce("Show BTC", {
      previousRaw: fakePrev,
      errorSummary: "missing field",
    });

    const callArgs = callHaikuMock.mock.calls[0]?.[0];
    const userMessages = callArgs!.user as Array<{ role: string; content: unknown }>;
    expect(userMessages[2]).toEqual(
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("missing field"),
      }),
    );
  });

  // ─── (h) success: tool_use input 이 Zod valid ─────────────────

  it("(h) tool_use input Zod valid → kind=success, payload=parsed cards", async () => {
    callHaikuMock.mockResolvedValue(mkToolUseResult({ cards: [] }));

    const result = await orchestrateOnce("Show me an empty board", null);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.payload.cards).toEqual([]);
      // raw 도 보존되어 있어야 (route.ts aggregateTokens 가 사용).
      expect(result.raw).toBeDefined();
      expect(result.raw.id).toBe("msg_fake");
    }
  });
});

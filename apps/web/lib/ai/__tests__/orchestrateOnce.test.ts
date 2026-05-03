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
 *   │ d  │ AnthropicTransportError throw       │ haiku_call    │ transient_…  │ false     │
 *   │ e  │ MissingAnthropicKeyError throw      │ haiku_call    │ upstream_err │ false     │
 *   │ f  │ AnthropicInvalidResponseError throw │ haiku_call    │ parse_error  │ false     │
 *   │ g  │ correction 컨텍스트 → 3턴 messages   │ (success)     │ —            │ —         │
 *   │ h  │ tool_use input Zod valid → success  │ —             │ —            │ —         │
 *   └────┴─────────────────────────────────────┴───────────────┴──────────────┴───────────┘
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
import { orchestrateOnce } from "@/app/api/orchestrate/route";

import {
  makeFakeMessage,
  mkRefusalResult,
  mkTextOnlyResult,
  mkToolUseResult,
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

  it("(d) AnthropicTransportError → fallbackReason=transient_error, stage=haiku_call, retryable=false", async () => {
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

  // ─── (g) correction 경로: messages 3턴 누적 검증 ───────────────

  it("(g) correction 컨텍스트 → callHaiku 의 user param 이 [user, assistant, user-correction] 3턴", async () => {
    callHaikuMock.mockResolvedValue(mkToolUseResult({ cards: [] }));
    const fakePrev = makeFakeMessage({ stop_reason: "tool_use" });

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
    expect(userMessages[0]).toEqual(
      expect.objectContaining({ role: "user", content: "Show BTC" }),
    );
    // M1.6 Step 5 (code-reviewer W6 즉시 수정, 2026-05-03):
    //   role 만 단언하지 말고 content 도 명시 — previousRaw.content 가 그대로
    //   전달되는 contract 가 무너지면 (예: previousRaw 통째 전달) 즉시 깨짐.
    expect(userMessages[1]).toEqual({
      role: "assistant",
      content: fakePrev.content,
    });
    expect(userMessages[2]).toEqual(
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("cards: expected array"),
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

/**
 * Haiku 클라이언트 — Anthropic SDK 최소 래퍼.
 *
 * M1.5 Step 1 (2026-04-22): Haiku 4.5 에게 텍스트 보내고 텍스트 받기 최소 경로.
 * Zod 검증 / 재시도 / log_validation_failure / API Route 는 Step 2,
 * Sonnet 실제 호출 분기는 M2+ (여기서는 플래그 상수만 노출).
 *
 * 설계:
 * - Server-only module — 최상단 `typeof window` 런타임 가드 + Next.js 의 NEXT_PUBLIC_
 *   미사용으로 API key 가 클라이언트 번들에 포함되지 않도록 3중 방어 (하단 주석 참고)
 * - Lazy singleton — 최초 호출 시에만 env 검증 + client 생성 (모듈 로드 시 crash 회피)
 * - 에러 3종 — Step 2 의 graceful fallback 이 `error.name` 으로 분기 가능
 *   · MissingAnthropicKeyError — 환경변수 누락
 *   · AnthropicTransportError — 네트워크 / 5xx / 타임아웃
 *   · AnthropicInvalidResponseError — 응답 shape 이상 (text / tool_use 모두 0개)
 * - `extractContent()` 헬퍼 — Step 2 에서 `tool_choice` 전환 시 같은 헬퍼 재사용
 *
 * 공식 문서 근거 (CLAUDE.md 데이터 소스 위생 #8):
 * - SDK: https://github.com/anthropics/anthropic-sdk-typescript (v0.90.0)
 * - Messages API: https://docs.anthropic.com/en/api/messages
 * - Haiku 4.5 model id: `claude-haiku-4-5-20251001`
 * - 조회일: 2026-04-22
 */

// ─── Server-only module 가드 ────────────────────────
//
// 이 모듈은 Anthropic API key 를 다루므로 **절대 클라이언트 번들에 포함되어선 안 된다**.
// 3중 방어선:
//   1. `process.env.ANTHROPIC_API_KEY` 는 `NEXT_PUBLIC_` 접두사 없음 → Next.js 가
//      자동으로 클라이언트 번들에서 제거 (1차).
//   2. 이 파일은 `app/api/orchestrate/route.ts` (서버 전용 라우트) 에서만 import 되도록
//      호출 그래프를 유지한다 — code-reviewer + grep 로 정기 확인 (2차).
//   3. 아래 런타임 가드 — 실수로 클라이언트 컴포넌트에서 import 되면 즉시 throw (3차).
//
// NOTE: Next.js 의 `server-only` 패키지는 tsx 단독 실행(smoke 스크립트) 시 unconditional
// throw 하므로 도입하지 않는다. 빌드타임 차단이 필요해지면 M2+ 에서 재검토.
if (typeof window !== "undefined") {
  throw new Error(
    "haikuClient must not be imported from client code. Use it only from server routes (app/api/**).",
  );
}

import Anthropic from "@anthropic-ai/sdk";

// ─── 모델 상수 ──────────────────────────────────────

/** Haiku 4.5 모델 ID. M1.5 의 기본 모델. */
export const HAIKU_MODEL_ID = "claude-haiku-4-5-20251001" as const;

/** Sonnet 4.6 모델 ID. M1.5 에서는 상수만, 실제 호출은 M2+. */
export const SONNET_MODEL_ID = "claude-sonnet-4-6" as const;

/**
 * Sonnet 에스컬레이션 플래그.
 * M1.5 에서는 항상 false — 실제 분기 로직은 M2+ 에서 복잡 쿼리 판정과 함께 추가.
 */
export const ESCALATE_TO_SONNET_FLAG = false as const;

/** JSON 안정성 확보를 위한 기본 temperature. */
const DEFAULT_TEMPERATURE = 0.2;

/** 카드 10개 + notes 200자 + 헤더 텍스트 커버용 토큰 예산. */
const DEFAULT_MAX_TOKENS = 4096;

// ─── 에러 클래스 ────────────────────────────────────

/** ANTHROPIC_API_KEY 누락. Step 2 fallback 분기 hook. */
export class MissingAnthropicKeyError extends Error {
  override readonly name = "MissingAnthropicKeyError";
  constructor() {
    super(
      "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. apps/web/.env.local 을 확인하세요.",
    );
  }
}

/**
 * 네트워크 / 5xx / 타임아웃 등 Anthropic API 전송 실패.
 * 원인 에러는 ES2022 native `Error.cause` 로 전달 — `err.cause` 로 접근 가능.
 */
export class AnthropicTransportError extends Error {
  override readonly name = "AnthropicTransportError";
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

/** 응답 content 에 text 와 tool_use 블록이 모두 없는 비정상 shape. */
export class AnthropicInvalidResponseError extends Error {
  override readonly name = "AnthropicInvalidResponseError";
  constructor(
    message: string,
    readonly raw: unknown,
  ) {
    super(message);
  }
}

// ─── SDK 인스턴스 (lazy singleton) ──────────────────

let cachedClient: Anthropic | null = null;

/** Anthropic client 를 최초 호출 시 1회 생성. env 누락 시 전용 에러 throw. */
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new MissingAnthropicKeyError();
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── 입력 / 출력 타입 ───────────────────────────────

/** callHaiku 입력. */
export interface CallHaikuParams {
  /** 시스템 프롬프트 텍스트 (buildSystemPrompt() 결과). */
  system: string;
  /** 사용자 쿼리 (예: "BTCUSDT 가격 보여줘"). */
  user: string;
  /** 최대 출력 토큰. 기본 4096. */
  maxTokens?: number;
  /** 취소용 AbortSignal — Step 2 에서 timeout 래핑 대비. */
  signal?: AbortSignal;
  /**
   * tool_use 옵션 (M1.5 Step 2a.5 스파이크 + 이후 선택적 활성화).
   * Anthropic SDK 의 messages.create 에 그대로 통과.
   * 비어있으면 text-only 경로 (현재 Step 2a 기본).
   */
  tools?: Anthropic.Tool[];
  /** tool_choice — `{ type: "tool", name: "..." }` 로 지정 시 해당 tool 강제 */
  toolChoice?: Anthropic.ToolChoice;
}

/** 수집된 tool_use 블록. Step 2 `tool_choice` 전환 대비. */
export interface CollectedToolUse {
  id: string;
  name: string;
  input: unknown;
}

/** callHaiku 반환값. Step 2 재시도 래퍼가 소비. */
export interface CallHaikuResult {
  /** text 블록을 join 한 결과. Step 1 에서는 이 필드만 쓴다. */
  text: string;
  /** tool_use 블록 목록. Step 1 기본은 빈 배열. */
  toolUses: CollectedToolUse[];
  /** end_turn / max_tokens / stop_sequence / tool_use / refusal 등. */
  stopReason: Anthropic.StopReason | null;
  /** 토큰 사용량 — 비용 모니터링 hook. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  /** 원본 메시지. 디버깅 / 고급 파싱용. */
  raw: Anthropic.Message;
}

// ─── content 파싱 헬퍼 ─────────────────────────────

/**
 * message.content (ContentBlock[]) 에서 text 와 tool_use 를 분리 추출.
 *
 * Step 1 의 응답은 대부분 text-only, Step 2 에서 `tool_choice` 전환 시
 * 같은 헬퍼로 tool_use.input 을 꺼낼 수 있도록 shape 통일.
 *
 * thinking / server_tool_use 등 기타 블록은 M1.5 스코프 밖 — 무시.
 */
function extractContent(message: Anthropic.Message): {
  text: string;
  toolUses: CollectedToolUse[];
} {
  const textChunks: string[] = [];
  const toolUses: CollectedToolUse[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      textChunks.push(block.text);
    } else if (block.type === "tool_use") {
      toolUses.push({ id: block.id, name: block.name, input: block.input });
    }
  }
  return {
    text: textChunks.join("\n").trim(),
    toolUses,
  };
}

// ─── Public API ────────────────────────────────────

/**
 * Haiku 4.5 에 단일 메시지를 보내고 응답을 받는다.
 *
 * 이 함수는 재시도 / Zod 검증을 하지 않는다. 실패 시 전용 에러 throw 만 —
 * 호출처 (Step 2 의 /api/orchestrate/route.ts) 가 fallback 분기를 담당.
 *
 * @throws {MissingAnthropicKeyError} env 누락
 * @throws {AnthropicTransportError} 네트워크 / 5xx / 타임아웃
 * @throws {AnthropicInvalidResponseError} 응답 content 블록 비정상
 */
export async function callHaiku(
  params: CallHaikuParams,
): Promise<CallHaikuResult> {
  const {
    system,
    user,
    maxTokens = DEFAULT_MAX_TOKENS,
    signal,
    tools,
    toolChoice,
  } = params;

  let message: Anthropic.Message;
  try {
    const anthropic = getClient();
    message = await anthropic.messages.create(
      {
        model: HAIKU_MODEL_ID,
        max_tokens: maxTokens,
        temperature: DEFAULT_TEMPERATURE,
        system,
        messages: [{ role: "user", content: user }],
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
      },
      { signal },
    );
  } catch (err) {
    // env 누락은 getClient() 에서 이미 전용 에러로 변환됨 — 전송 계열만 감싼다
    if (err instanceof MissingAnthropicKeyError) throw err;
    throw new AnthropicTransportError(
      `Anthropic API 호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const extracted = extractContent(message);
  if (extracted.text.length === 0 && extracted.toolUses.length === 0) {
    throw new AnthropicInvalidResponseError(
      "응답 content 에 text 와 tool_use 블록이 모두 없습니다.",
      message,
    );
  }

  return {
    text: extracted.text,
    toolUses: extracted.toolUses,
    stopReason: message.stop_reason,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? undefined,
      cacheCreationInputTokens:
        message.usage.cache_creation_input_tokens ?? undefined,
    },
    raw: message,
  };
}

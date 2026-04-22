/**
 * apps/web/lib/ai — AI 오케스트레이터 모듈의 public surface.
 *
 * M1.5 Step 1: Haiku 클라이언트 + 시스템 프롬프트 빌더.
 * Step 2 이후: 재시도 래퍼, log_validation_failure, fallback 응답 생성기 등이 추가됨.
 */

export {
  callHaiku,
  HAIKU_MODEL_ID,
  SONNET_MODEL_ID,
  ESCALATE_TO_SONNET_FLAG,
  MissingAnthropicKeyError,
  AnthropicTransportError,
  AnthropicInvalidResponseError,
} from "./haikuClient";

export type {
  CallHaikuParams,
  CallHaikuResult,
  CollectedToolUse,
} from "./haikuClient";

export { buildSystemPrompt } from "./buildSystemPrompt";
export type { BuildSystemPromptOptions } from "./buildSystemPrompt";

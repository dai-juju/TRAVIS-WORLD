/**
 * Haiku 실 호출 스모크 테스트.
 *
 * 실행: `pnpm -F @travis/web smoke:haiku`
 *   → 내부적으로 `tsx --env-file=.env.local scripts/smoke-haiku.ts`
 *
 * 사전 조건:
 *   - apps/web/.env.local 에 ANTHROPIC_API_KEY 설정 (M1.5 Step 0 에서 주입 완료)
 *
 * 검증 (ROADMAP M1.5 Step 1 완료 기준):
 *   1. buildSystemPrompt() 출력에 4개 레지스트리 섹션 전부 포함 (grep assertion)
 *   2. Haiku 에게 짧은 프롬프트 1회 호출 → non-empty text + inputTokens > 0
 *   3. ESCALATE_TO_SONNET_FLAG 상수 존재 (상수 import 로 암묵적 확인)
 *
 * 주의:
 *   - 실제 Anthropic API 호출 + 과금 발생 (호출당 ~$0.003 이하).
 *   - CI 에 포함하지 않음 (수동 실행 전용).
 *   - `@travis/shared` import 시 registerDefaults() 가 자동 실행되어
 *     4개 레지스트리가 채워짐 (packages/shared/src/registries/index.ts).
 */

import {
  buildSystemPrompt,
  callHaiku,
  ESCALATE_TO_SONNET_FLAG,
  HAIKU_MODEL_ID,
} from "../lib/ai";

const REQUIRED_SECTIONS = [
  "## Available Exchanges",
  "## Available Data Sources",
  "## Available Components",
  "## Available Interactions",
] as const;

async function main(): Promise<void> {
  console.log("[smoke] step 1/3 — building system prompt…");
  const systemPrompt = buildSystemPrompt();

  // 1) 4개 레지스트리 섹션 전부 포함 검증 (grep assertion)
  const missing = REQUIRED_SECTIONS.filter((s) => !systemPrompt.includes(s));
  if (missing.length > 0) {
    console.error("[smoke] FAIL — 시스템 프롬프트에서 누락된 섹션:", missing);
    process.exit(1);
  }
  console.log(
    `[smoke] system prompt OK (${systemPrompt.length} chars, ` +
      `${REQUIRED_SECTIONS.length}/${REQUIRED_SECTIONS.length} sections)`,
  );

  // 2) Sonnet 에스컬레이션 플래그 상수 확인 (M1.5 에서는 false 고정)
  console.log(
    `[smoke] step 2/3 — ESCALATE_TO_SONNET_FLAG = ${ESCALATE_TO_SONNET_FLAG}`,
  );
  if (ESCALATE_TO_SONNET_FLAG !== false) {
    console.error(
      "[smoke] FAIL — M1.5 에서는 ESCALATE_TO_SONNET_FLAG 가 false 이어야 합니다.",
    );
    process.exit(1);
  }

  // 3) Haiku 실 호출
  console.log(`[smoke] step 3/3 — calling ${HAIKU_MODEL_ID}…`);
  try {
    const result = await callHaiku({
      system: systemPrompt,
      user: 'Say the single word "ready" and nothing else. No JSON, no punctuation.',
      maxTokens: 32,
    });
    console.log("[smoke] response text:", JSON.stringify(result.text));
    console.log("[smoke] stop_reason :", result.stopReason);
    console.log("[smoke] usage      :", result.usage);
    console.log("[smoke] tool_uses  :", result.toolUses.length, "blocks");

    if (result.text.length === 0) {
      console.error("[smoke] FAIL — empty text");
      process.exit(1);
    }
    if (result.usage.inputTokens <= 0) {
      console.error("[smoke] FAIL — inputTokens <= 0");
      process.exit(1);
    }

    console.log("[smoke] ✅ PASS");
  } catch (err) {
    console.error("[smoke] ❌ FAIL —", err);
    process.exit(1);
  }
}

void main();

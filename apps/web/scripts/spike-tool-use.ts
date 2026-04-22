/**
 * M1.5 Step 2a.5 — tool_use vs text-only 실측 스파이크 (30분 타임박스).
 *
 * 실행: `pnpm -F @travis/web spike:tool-use`
 *
 * 목적:
 *   Step 2b 의 self-correction 재시도 설계 전에 "Haiku 4.5 가 첫 호출에서
 *   OrchestrateResponseSchema 를 통과하는 비율" 을 두 가지 방식으로 실측.
 *
 *   · text-only : 현재 Step 2a 기본 경로. Haiku 가 plain text JSON 응답 → stripCodeFence → JSON.parse → Zod
 *   · tool_use  : Anthropic SDK 의 tool_choice 강제 → message.content 에서 tool_use 블록의 input 직접 소비 → Zod
 *
 * 10 쿼리 × 2 모드 = 20 calls. 대략 $0.08 예상.
 *
 * 결과 활용:
 *   - 성공률 차이 + 평균 지연 시간 차이 확인
 *   - USE_TOOL_USE 기본값 결정 (Step 2b 진입 전)
 *   - 실패 패턴 관찰 → Step 2b self-correction prompt 설계 반영
 *
 * 스파이크는 throwaway — 결과는 task-record 에 기록하고 이 파일은 보존(재실측 용).
 */

import { zodToJsonSchema } from "zod-to-json-schema";

import { buildSystemPrompt, callHaiku } from "../lib/ai";
import { OrchestrateResponseSchema } from "@travis/shared";

// NOTE: Anthropic SDK 의 Tool / ToolChoice 타입은 namespace 접근인데 spike 에서는
// throwaway 코드이므로 any 로 우회 (route.ts / haikuClient.ts 는 정식 타입 사용 중).

// ─── stripCodeFence 복제 (route.ts 의 헬퍼와 동일) ──────

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

// ─── 테스트 쿼리 세트 (10개) ────────────────────────

const TEST_QUERIES = [
  "BTCUSDT 가격 보여줘", // 1. 단일 ticker
  "거래량 상위 10개 코인", // 2. CoinList content mode
  "BTCUSDT 1분봉 차트 보여줘", // 3. KlineChart
  "ETHUSDT 펀딩비 보여줘", // 4. premium_index datasource
  "롱숏 비율 높은 코인", // 5. long_short_ratio + sort
  "BTC 관련 모든 데이터", // 6. 복수 카드 유도
  "오늘 많이 오른 코인", // 7. price_change_pct sort
  "테더마진 거래량 상위 5개", // 8. futures_usdm filter
  "BTCUSDT 와 ETHUSDT 비교", // 9. 2장 카드 요구
  "뭐 좀 보여줘", // 10. 모호 → clarifying 유도
] as const;

// ─── 결과 타입 ─────────────────────────────────────

interface AttemptResult {
  query: string;
  mode: "text" | "tool_use";
  success: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  errorStage?: "haiku_call" | "json_parse" | "zod_parse" | "no_tool_use_block";
  errorSummary?: string;
  notes?: string;
}

// ─── text-only 경로 ────────────────────────────────

async function runText(query: string): Promise<AttemptResult> {
  const start = Date.now();
  const system = buildSystemPrompt();
  let result: Awaited<ReturnType<typeof callHaiku>>;
  try {
    result = await callHaiku({ system, user: query });
  } catch (err) {
    return {
      query,
      mode: "text",
      success: false,
      latencyMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      errorStage: "haiku_call",
      errorSummary: String(err).slice(0, 120),
    };
  }
  const cleaned = stripCodeFence(result.text);
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    return {
      query,
      mode: "text",
      success: false,
      latencyMs: Date.now() - start,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      errorStage: "json_parse",
      errorSummary: String(err).slice(0, 120),
    };
  }
  const zodParse = OrchestrateResponseSchema.safeParse(json);
  if (!zodParse.success) {
    return {
      query,
      mode: "text",
      success: false,
      latencyMs: Date.now() - start,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      errorStage: "zod_parse",
      errorSummary: zodParse.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join(" | ")
        .slice(0, 200),
    };
  }
  return {
    query,
    mode: "text",
    success: true,
    latencyMs: Date.now() - start,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    notes: `cards=${zodParse.data.cards.length}`,
  };
}

// ─── tool_use 경로 ─────────────────────────────────

// zodToJsonSchema 반환 타입은 어떤 root 에 따라 다름 — strict unions + $refs 생략 옵션 사용.
const orchestratePayloadJsonSchema = zodToJsonSchema(OrchestrateResponseSchema, {
  name: "OrchestrateResponse",
  $refStrategy: "none", // 중첩 $ref 없이 flat 하게 — Anthropic tool_use.input_schema 호환
});

// zodToJsonSchema 가 { $ref, definitions } 형태로 반환 — definitions 안의 본체를 꺼낸다
function extractInputSchema(raw: unknown): Record<string, unknown> {
  const obj = raw as { definitions?: Record<string, Record<string, unknown>>; $ref?: string };
  if (obj.definitions && obj.definitions["OrchestrateResponse"]) {
    const def = obj.definitions["OrchestrateResponse"];
    // Anthropic 은 root 가 "object" type 이어야 tools 로 받아줌
    return { ...def, $schema: undefined } as Record<string, unknown>;
  }
  return obj as Record<string, unknown>;
}

const inputSchema = extractInputSchema(orchestratePayloadJsonSchema);

async function runToolUse(query: string): Promise<AttemptResult> {
  const start = Date.now();
  const system = buildSystemPrompt();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [
    {
      name: "emit_orchestration",
      description:
        "Emit the structured orchestration payload (cards + optional notes/actions). Use exactly once.",
      input_schema: inputSchema,
    },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolChoice: any = { type: "tool", name: "emit_orchestration" };

  let result: Awaited<ReturnType<typeof callHaiku>>;
  try {
    result = await callHaiku({
      system,
      user: query,
      tools,
      toolChoice,
    });
  } catch (err) {
    return {
      query,
      mode: "tool_use",
      success: false,
      latencyMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      errorStage: "haiku_call",
      errorSummary: String(err).slice(0, 120),
    };
  }

  if (result.toolUses.length === 0) {
    return {
      query,
      mode: "tool_use",
      success: false,
      latencyMs: Date.now() - start,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      errorStage: "no_tool_use_block",
      errorSummary: `stop_reason=${result.stopReason ?? "?"}, text_preview=${result.text.slice(0, 80)}`,
    };
  }

  const toolUseInput = result.toolUses[0]!.input;
  const zodParse = OrchestrateResponseSchema.safeParse(toolUseInput);
  if (!zodParse.success) {
    return {
      query,
      mode: "tool_use",
      success: false,
      latencyMs: Date.now() - start,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      errorStage: "zod_parse",
      errorSummary: zodParse.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join(" | ")
        .slice(0, 200),
    };
  }

  return {
    query,
    mode: "tool_use",
    success: true,
    latencyMs: Date.now() - start,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    notes: `cards=${zodParse.data.cards.length}`,
  };
}

// ─── 결과 분석 ─────────────────────────────────────

function summarize(label: string, results: AttemptResult[]): void {
  const n = results.length;
  const successCount = results.filter((r) => r.success).length;
  const avgLatency =
    results.reduce((sum, r) => sum + r.latencyMs, 0) / Math.max(n, 1);
  const avgInTok =
    results.reduce((sum, r) => sum + r.inputTokens, 0) / Math.max(n, 1);
  const avgOutTok =
    results.reduce((sum, r) => sum + r.outputTokens, 0) / Math.max(n, 1);

  console.log(`\n─── ${label} ───`);
  console.log(`  success       : ${successCount}/${n} (${((successCount / n) * 100).toFixed(0)}%)`);
  console.log(`  avg latency   : ${avgLatency.toFixed(0)}ms`);
  console.log(`  avg in tokens : ${avgInTok.toFixed(0)}`);
  console.log(`  avg out tokens: ${avgOutTok.toFixed(0)}`);
  console.log(`  per-query:`);
  for (const r of results) {
    const flag = r.success ? "✅" : "❌";
    const stage = r.errorStage ? ` [${r.errorStage}]` : "";
    const note = r.notes ? ` (${r.notes})` : "";
    const err = r.errorSummary ? ` — ${r.errorSummary}` : "";
    console.log(
      `    ${flag} ${r.latencyMs.toString().padStart(5)}ms  ${r.query.padEnd(30)}${stage}${note}${err}`,
    );
  }
}

// ─── main ──────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[spike] 10 queries × 2 modes = 20 Haiku calls`);
  console.log(`[spike] text-only 모드 먼저 실행...\n`);

  const textResults: AttemptResult[] = [];
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const q = TEST_QUERIES[i]!;
    process.stdout.write(`  [text ${i + 1}/${TEST_QUERIES.length}] ${q} ... `);
    const r = await runText(q);
    textResults.push(r);
    console.log(r.success ? `✅ ${r.latencyMs}ms` : `❌ ${r.errorStage ?? "?"}`);
  }

  console.log(`\n[spike] tool_use 모드 실행...\n`);
  const toolResults: AttemptResult[] = [];
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const q = TEST_QUERIES[i]!;
    process.stdout.write(`  [tool ${i + 1}/${TEST_QUERIES.length}] ${q} ... `);
    const r = await runToolUse(q);
    toolResults.push(r);
    console.log(r.success ? `✅ ${r.latencyMs}ms` : `❌ ${r.errorStage ?? "?"}`);
  }

  summarize("text-only 경로", textResults);
  summarize("tool_use 경로", toolResults);

  const textSuccess = textResults.filter((r) => r.success).length;
  const toolSuccess = toolResults.filter((r) => r.success).length;
  const textAvgLatency =
    textResults.reduce((s, r) => s + r.latencyMs, 0) / textResults.length;
  const toolAvgLatency =
    toolResults.reduce((s, r) => s + r.latencyMs, 0) / toolResults.length;

  console.log(`\n─── 최종 요약 ───`);
  console.log(
    `  text-only : ${textSuccess}/${TEST_QUERIES.length} (${((textSuccess / TEST_QUERIES.length) * 100).toFixed(0)}%) | avg ${textAvgLatency.toFixed(0)}ms`,
  );
  console.log(
    `  tool_use  : ${toolSuccess}/${TEST_QUERIES.length} (${((toolSuccess / TEST_QUERIES.length) * 100).toFixed(0)}%) | avg ${toolAvgLatency.toFixed(0)}ms`,
  );

  const diff = toolSuccess - textSuccess;
  if (diff >= 2) {
    console.log(`\n  [recommendation] tool_use 가 ${diff}건 더 성공 → Step 2b 에서 tool_use 기본값 고려`);
  } else if (diff <= -2) {
    console.log(`\n  [recommendation] text-only 가 ${-diff}건 더 성공 → Step 2b 에서 text-only 유지`);
  } else {
    console.log(`\n  [recommendation] 성공률 차이 <2 → text-only 유지 + tool_use 플래그만 준비 (M2+ 재평가)`);
  }
}

void main();

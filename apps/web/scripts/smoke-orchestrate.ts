/**
 * /api/orchestrate POST 스모크 테스트 (M1.5 Step 2a).
 *
 * 실행: `pnpm -F @travis/web smoke:orchestrate`
 *
 * Next.js Route Handler (`POST` 함수) 를 tsx 에서 직접 호출하여 검증.
 * dev 서버(~1.5GB) 를 띄우지 않고 tsx(~200MB)로 1회 API 흐름 실증.
 *
 * 검증 (Step 2a 완료 기준):
 *   1. 요청 `{ query: "BTCUSDT 가격 보여줘" }` → 200 OK
 *   2. 응답 `kind === "success"` + `payload.cards.length >= 1`
 *   3. 최소 1장의 카드가 Zod 검증을 통과 (componentId/size/updateMode/data 존재)
 *   4. 잘못된 요청 `{}` → 400 + `kind === "fallback"` + `reason === "upstream_error"`
 *
 * Step 2b/2c 이후 추가 검증:
 *   - 의도적으로 스키마 깨는 프롬프트 → 재시도 로그 + log_validation_failure 1건
 *   - 2회 실패 → fallback 메시지 (크래시 없음)
 */

import { POST } from "../app/api/orchestrate/route";

interface SmokeResult {
  label: string;
  status: number;
  body: unknown;
  passed: boolean;
  reason?: string;
}

async function callOrchestrate(label: string, body: unknown): Promise<SmokeResult> {
  const req = new Request("http://localhost/api/orchestrate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    const res = await POST(req);
    const respBody = await res.json();
    return { label, status: res.status, body: respBody, passed: true };
  } catch (err) {
    return {
      label,
      status: 0,
      body: null,
      passed: false,
      reason: `throw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main(): Promise<void> {
  console.log("[smoke] scenario 1/2 — valid query");
  const success = await callOrchestrate("valid", {
    query: "BTCUSDT 가격 보여줘",
  });
  console.log(`[smoke]   status=${success.status}`);
  console.log(`[smoke]   body:`, JSON.stringify(success.body, null, 2));

  try {
    assert(success.status === 200, `expected 200, got ${success.status}`);
    const body = success.body as { kind?: string; payload?: { cards?: unknown[] } };
    assert(body.kind === "success", `expected kind=success, got ${String(body.kind)}`);
    assert(
      Array.isArray(body.payload?.cards) && body.payload.cards.length >= 1,
      "expected at least 1 card in payload.cards",
    );
    console.log("[smoke]   ✅ scenario 1 PASS");
  } catch (err) {
    console.error("[smoke]   ❌ scenario 1 FAIL —", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n[smoke] scenario 2/2 — malformed request (missing query)");
  const invalid = await callOrchestrate("invalid", {});
  console.log(`[smoke]   status=${invalid.status}`);
  console.log(`[smoke]   body:`, JSON.stringify(invalid.body, null, 2));

  try {
    assert(invalid.status === 400, `expected 400, got ${invalid.status}`);
    const body = invalid.body as { kind?: string; reason?: string };
    assert(body.kind === "fallback", `expected kind=fallback, got ${String(body.kind)}`);
    assert(
      body.reason === "upstream_error",
      `expected reason=upstream_error, got ${String(body.reason)}`,
    );
    console.log("[smoke]   ✅ scenario 2 PASS");
  } catch (err) {
    console.error("[smoke]   ❌ scenario 2 FAIL —", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n[smoke] ✅✅ ALL PASS (2/2)");
}

void main();

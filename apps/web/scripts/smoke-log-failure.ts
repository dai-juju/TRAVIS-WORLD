/**
 * M1.5 Step 2c — log_validation_failure INSERT + SELECT 실증 스모크.
 *
 * 실행: `pnpm -F @travis/web smoke:log-failure`
 *
 * 검증:
 *   1. logValidationFailure() 1회 호출 → true 반환 (INSERT 성공)
 *   2. service_role client 로 SELECT → 최소 1건 조회 + 방금 넣은 row 확인
 *   3. RLS anon policy 0개 재확인: anon client 로 SELECT → 0건 또는 권한 거부
 *
 * 주의:
 *   - 실제 DB 에 row 를 INSERT 함. dev 환경 전용.
 *   - CI 에는 포함하지 않음.
 */

import { createClient } from "@supabase/supabase-js";

import {
  logValidationFailure,
  type LogValidationErrorType,
} from "../lib/ai/logValidationFailure";
import { getSupabaseServiceRoleClient } from "../lib/supabase/serviceRoleClient";

const TEST_MARKER = `spike-${Date.now()}`;

async function main(): Promise<void> {
  console.log("[smoke] step 1/3 — logValidationFailure() 호출");

  const errorType: LogValidationErrorType = "retry_failed";
  const ok = await logValidationFailure({
    queryText: `smoke-test ${TEST_MARKER}`,
    aiResponse: { test: true, marker: TEST_MARKER, cards: [] },
    errorType,
    errorMessage: `Smoke test run at ${new Date().toISOString()}`,
    meta: {
      model_id: "claude-haiku-4-5-20251001",
      attempt_number: 2,
      first_stage: "zod",
      retry_stage: "zod",
      test_marker: TEST_MARKER,
    },
  });

  if (!ok) {
    console.error("[smoke] ❌ logValidationFailure() 반환 false");
    process.exit(1);
  }
  console.log("[smoke]   ✅ INSERT 성공");

  // ── 2) service_role 로 SELECT (방금 넣은 row 확인)
  console.log(
    "\n[smoke] step 2/3 — service_role 로 SELECT (test_marker 로 조회)",
  );
  const svc = getSupabaseServiceRoleClient();
  const { data: rows, error: selErr } = await svc
    .from("log_validation_failure")
    .select("id, query_text, error_type, error_message, created_at")
    .like("query_text", `%${TEST_MARKER}%`)
    .limit(5);

  if (selErr) {
    console.error("[smoke] ❌ SELECT 실패:", selErr.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.error("[smoke] ❌ 방금 넣은 row 를 찾지 못함");
    process.exit(1);
  }
  console.log(`[smoke]   ✅ ${rows.length}건 조회 — 샘플:`);
  for (const r of rows) {
    console.log(
      `     id=${r.id} type=${r.error_type} query="${r.query_text?.slice(0, 40)}..."`,
    );
  }

  // ── 3) anon client 로 SELECT 시도 (RLS deny-all 검증)
  console.log("\n[smoke] step 3/3 — anon client 로 SELECT (RLS deny-all 검증)");
  const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonUrl || !anonKey) {
    console.warn("[smoke]   ⚠️ anon URL/KEY 누락 — RLS 검증 skip");
  } else {
    const anonClient = createClient(anonUrl, anonKey);
    const { data: anonRows, error: anonErr } = await anonClient
      .from("log_validation_failure")
      .select("id")
      .limit(1);
    if (anonErr) {
      console.log(
        `[smoke]   ✅ anon 접근 거부 — error=${anonErr.message.slice(0, 80)}`,
      );
    } else if (anonRows && anonRows.length > 0) {
      console.error(
        `[smoke]   ❌ anon 이 ${anonRows.length}건 조회 가능 — RLS policy 누락!`,
      );
      process.exit(1);
    } else {
      console.log(
        `[smoke]   ✅ anon 접근 가능하지만 0건 반환 (RLS deny-all 효과와 동일)`,
      );
    }
  }

  console.log("\n[smoke] ✅✅ ALL PASS");
}

void main().catch((err: unknown) => {
  console.error("[smoke] ❌ 예외:", err);
  process.exit(1);
});

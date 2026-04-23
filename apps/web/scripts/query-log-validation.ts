/**
 * M1.5 Step 4c — log_validation_failure 최근 row 조회 (읽기 전용).
 *
 * 실행: `pnpm -F @travis/web smoke:query-log`
 *
 * 목적:
 *   ROADMAP §M1.5 Step 4 완료 기준 (C) "log_validation_failure 에 실패 기록 누적"
 *   증거. (B) FORCE_INVALID_RESPONSE 경로로 Playwright 가 Zod 2회 실패를
 *   유도했을 때 DB 에 INSERT 가 일어났는지 육안으로 확인.
 *
 * 안전성:
 *   - SELECT 만 — INSERT/UPDATE/DELETE 절대 안 함.
 *   - service_role key 사용 (RLS bypass). dev 환경 전용.
 */

import { getSupabaseServiceRoleClient } from "../lib/supabase/serviceRoleClient";

async function main(): Promise<void> {
  const svc = getSupabaseServiceRoleClient();

  const { data: rows, error } = await svc
    .from("log_validation_failure")
    .select(
      "id, query_text, error_type, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[query-log] ❌ SELECT 실패:", error.message);
    process.exit(1);
  }

  const count = rows?.length ?? 0;
  console.log(`[query-log] 최근 ${count} 건 (가장 최신이 맨 위):\n`);

  if (count === 0) {
    console.log("  (아직 쌓인 row 없음 — (B) 시나리오가 아직 실행되지 않았거나 INSERT 실패)");
    process.exit(0);
  }

  for (const r of rows!) {
    const ts = r.created_at ? new Date(r.created_at).toISOString() : "?";
    const queryPreview = (r.query_text ?? "").slice(0, 60);
    const errPreview = (r.error_message ?? "").slice(0, 100);
    console.log(
      `  [${ts}] id=${r.id}\n    type=${r.error_type}\n    query="${queryPreview}"\n    err="${errPreview}"\n`,
    );
  }

  console.log(`[query-log] ✅ ${count}건 조회 완료`);
}

void main().catch((err: unknown) => {
  console.error("[query-log] ❌ 예외:", err);
  process.exit(1);
});

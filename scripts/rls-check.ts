/**
 * RLS 검증 스크립트 — M1.6 Step 5 ([3-4] 회수, 2026-05-03).
 *
 * 사용:
 *   pnpm rls-check
 *
 * 동작:
 *   1. scripts/.env.scripts 에서 SUPABASE_DB_URL 로드 (Node 22+ --env-file 내장)
 *   2. pg 클라이언트로 직접 connection (postgres protocol, pooler URL 6543 권장)
 *   3. scripts/rls-check.sql 실행 → 위반 테이블 markdown table 로 stdout
 *   4. exit code: 0=OK / 1=violation / 2=connection or SQL error
 *
 * 보안 (security-auditor 자문 2026-05-03):
 *   - error message 의 JWT / connection string password 부분 redact
 *     → CI log 누출 방지 (향후 GitHub Actions 승격 시 secret 보호)
 *   - .env.scripts 는 .gitignore 로 차단, .env.scripts.example 만 commit
 *
 * 공식 문서 근거 (CLAUDE.md 데이터 소스 위생 #8):
 *   - node-postgres: https://node-postgres.com/apis/client
 *   - Node --env-file: https://nodejs.org/api/cli.html#--env-fileconfig
 *   - 조회일: 2026-05-03
 */

import { Client } from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(resolve(__dirname, "rls-check.sql"), "utf8");

interface RlsCheckRow {
  tablename: string;
  rls_enabled: boolean;
  policy_count: number;
  status: "OK" | "RLS_OFF" | "RLS_ON_NO_POLICY";
}

/**
 * Error message 에서 민감 정보 (JWT / connection string password) redact.
 * security-auditor 자문 함정 1 — pg 가 connection string 을 그대로 에러에 포함하는 경우 방어.
 */
function redactSensitive(text: string): string {
  return (
    text
      // Supabase JWT (eyJ... 형태 3-segment)
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
      // postgres connection string 의 user:password@ 부분
      .replace(/postgres(?:ql)?:\/\/[^@\s]+@/g, "postgres://[REDACTED]@")
  );
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL;

  if (!url || url.length === 0) {
    console.error(
      "[rls-check] SUPABASE_DB_URL 환경변수가 설정되지 않았습니다.\n" +
        "  - scripts/.env.scripts 파일 생성 후 SUPABASE_DB_URL 설정 (scripts/.env.scripts.example 참고)\n" +
        "  - 또는 pnpm 실행 시 직접 주입: SUPABASE_DB_URL=... pnpm rls-check",
    );
    process.exit(2);
  }

  if (url.includes("REPLACE_ME") || url.includes("YOUR_")) {
    console.error(
      "[rls-check] SUPABASE_DB_URL 이 placeholder 값입니다. 실제 connection string 으로 교체 후 재실행.",
    );
    process.exit(2);
  }

  const client = new Client({ connectionString: url });

  try {
    await client.connect();
    const { rows } = await client.query<RlsCheckRow>(SQL);

    const violations = rows.filter((r) => r.status !== "OK");

    if (violations.length === 0) {
      console.log(
        `[rls-check] OK — ${rows.length} 테이블 모두 protected (RLS enabled + ≥ 1 policy).\n` +
          rows.map((r) => `  · ${r.tablename} (${r.policy_count} policies)`).join("\n"),
      );
      process.exit(0);
    }

    console.error("[rls-check] FAIL — RLS 위반 테이블 발견:\n");
    console.error("| Table | RLS enabled | Policies | Status |");
    console.error("|---|---|---|---|");
    for (const r of violations) {
      console.error(
        `| ${r.tablename} | ${r.rls_enabled} | ${r.policy_count} | ${r.status} |`,
      );
    }
    console.error(
      "\n조치: 위반 테이블에 적절한 RLS policy 추가 후 재실행.\n" +
        "  - user_* / log_* : auth.uid()=user_id 정책\n" +
        "  - now_* / history_* / symbols : anon read 정책\n" +
        "참고: docs/task-record/M1.6-step2-logs-rls.md, supabase/migrations/",
    );
    process.exit(1);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const safe = redactSensitive(raw);
    console.error(`[rls-check] connection / SQL error: ${safe}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {
      // close 실패는 무시 — 이미 다른 path 에서 exit 결정.
    });
  }
}

void main();

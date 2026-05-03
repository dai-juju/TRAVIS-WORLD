# scripts/ — TRAVIS 운영 스크립트

> 모노레포 root 의 운영용 Node.js 스크립트 모음.
> 빌드/배포 의존성 X — 로컬 개발자 또는 CI 환경에서 ad-hoc 실행하는 검증 / 진단 도구.

## 사전 준비

1. `.env.scripts.example` 을 `.env.scripts` 로 복사
2. 값 채우기 (Supabase Dashboard → Project Settings → Database → Connection string)
3. `.gitignore` 가 `.env.*` 를 차단하므로 `.env.scripts` 는 절대 commit 되지 않음

## 사용 가능한 스크립트

### `pnpm rls-check` — RLS 정책 누락 자동 검출 ([3-4] 회수, M1.6 Step 5)

**목적**: Supabase `public` schema 의 protected 테이블 (`user_*` / `log_*` / `now_*` / `history_*` / `symbols`) 중 RLS 가 OFF 이거나 policy 가 0개인 테이블을 발견하면 즉시 `exit 1`. M1.4 Step 4.5 에서 직접 겪은 "RLS enabled + policy 0개 = deny-all" 함정 재발 방지.

**사용**:
```bash
pnpm rls-check
```

**결과**:
- exit `0` — 모든 테이블 OK
- exit `1` — 위반 테이블 1개 이상 (markdown table 로 stdout 출력)
- exit `2` — connection / SQL error (env 누락 / 잘못된 URL 등)

**예시 출력 (성공)**:
```
[rls-check] OK — 12 테이블 모두 protected (RLS enabled + ≥ 1 policy).
  · log_behavior (1 policies)
  · log_chat (1 policies)
  · log_validation_failure (1 policies)
  · now_futures_ticker (1 policies)
  ...
```

**예시 출력 (위반 발견)**:
```
[rls-check] FAIL — RLS 위반 테이블 발견:

| Table | RLS enabled | Policies | Status |
|---|---|---|---|
| user_allowlist | true | 0 | RLS_ON_NO_POLICY |

조치: 위반 테이블에 적절한 RLS policy 추가 후 재실행.
  - user_* / log_* : auth.uid()=user_id 정책
  - now_* / history_* / symbols : anon read 정책
참고: docs/task-record/M1.6-step2-logs-rls.md, supabase/migrations/
```

**검사 SQL 위치**: `scripts/rls-check.sql`

**향후 GitHub Actions 승격** (M1.7 Step 5 security audit 시점):
- Repo Settings → Secrets and variables → Actions 에 `SUPABASE_DB_URL` Secret 등록
- workflow yaml 에서 `${{ secrets.SUPABASE_DB_URL }}` 주입, **echo 금지**
- PR fork 빌드 secret 노출 방지: `pull_request_target` 보다 `pull_request` + `permissions: contents: read` 최소권한
- 자세한 보안 권고: M1.6 Step 5 task-record `docs/task-record/M1.6-step5-test-infra.md`

## 새 protected 테이블 prefix 추가하려면

`scripts/rls-check.sql` 의 `WHERE` 절 마지막 `OR` 절에 prefix 추가:

```sql
AND (
  c.relname LIKE 'user_%'
  OR c.relname LIKE 'log_%'
  ...
  OR c.relname LIKE 'new_prefix_%'  -- ← 추가
)
```

## 보안 함정 (security-auditor 2026-05-03)

- **❌ JWT / connection string password 가 stderr 에 노출되지 않도록** — `rls-check.ts` 의 `redactSensitive()` 가 `eyJ...` JWT + `postgres://user:pass@` 패턴 자동 마스킹
- **❌ `.env.scripts` git commit 금지** — `.gitignore` 의 `.env.*` 패턴이 자동 차단, `.env.scripts.example` 만 예외
- **⚠️ pooler URL vs direct URL** — read-only SELECT 만 하는 script 는 pooler (port 6543) 권장. `SET ROLE` 또는 transaction-scoped 변수 필요한 미래 script 는 direct (port 5432) 사용

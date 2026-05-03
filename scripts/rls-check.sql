-- M1.6 Step 5 ([3-4] 회수, 2026-05-03)
-- RLS 검증 SQL — `pnpm rls-check` 가 실행하는 단일 쿼리.
--
-- 검사 대상:
--   public schema 의 protected 테이블 prefix 모두 (user_*, log_*, now_*, history_*, symbols)
--   - user_*, log_* : auth.uid()=user_id 등 user-scoped policy 필요
--   - now_*, history_*, symbols : anon read policy 필요 (Realtime 200 OK + 빈 결과 함정 회피)
--
-- 분류:
--   RLS_OFF              = ALTER TABLE ENABLE ROW LEVEL SECURITY 가 안 됨 (보호 자체 없음)
--   RLS_ON_NO_POLICY     = RLS 켜져 있지만 policy 0개 (deny-all 함정 — M1.4 Step 4.5 사고)
--   OK                   = RLS 켜짐 + policy ≥ 1
--
-- security-auditor 자문 (2026-05-03):
--   - schemaname='public' 명시 → auth.* / storage.* 시스템 테이블 제외
--   - pg_class.relrowsecurity 조인으로 RLS_OFF vs RLS_ON_NO_POLICY 구분
--   - schema-tablename 두 컬럼 매칭 (미래 schema 확장 안전)
--
-- 공식 문서 근거 (CLAUDE.md 데이터 소스 위생 #8):
--   PostgreSQL pg_class: https://www.postgresql.org/docs/current/catalog-pg-class.html
--   PostgreSQL pg_policies: https://www.postgresql.org/docs/current/view-pg-policies.html
--   조회일: 2026-05-03

SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  COALESCE(p.policy_count, 0) AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN 'RLS_OFF'
    WHEN COALESCE(p.policy_count, 0) = 0 THEN 'RLS_ON_NO_POLICY'
    ELSE 'OK'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT schemaname, tablename, COUNT(*)::int AS policy_count
  FROM pg_policies
  GROUP BY schemaname, tablename
) p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (
    c.relname LIKE 'user_%'
    OR c.relname LIKE 'log_%'
    OR c.relname LIKE 'now_%'
    OR c.relname LIKE 'history_%'
    OR c.relname = 'symbols'
  )
ORDER BY status DESC, c.relname;

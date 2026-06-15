-- ============================================================
-- M2 테마 C Step 1 — user_preferences (첫 "유저 소유 쓰기" 테이블)
--
-- 목적:
--   유저별 설정(프리퍼런스)을 저장하는 첫 번째 유저 소유 테이블.
--
-- ★ 다른 유저 테이블(log_chat / log_behavior / log_validation_failure)과의
--   결정적 차이:
--     - 로그 테이블: service_role 만 INSERT/UPDATE (RLS bypass).
--                    유저는 본인 row SELECT 만 가능.
--     - 본 테이블:   유저가 자기 row 를 직접 INSERT / UPDATE.
--                    → SELECT/INSERT/UPDATE policy 3개를 명시적으로 부여.
--                    → WITH CHECK 로 "남의 user_id 위장/바꿔치기" 차단이 핵심.
--
-- 설계 결정(사용자 확정):
--   - PK = user_id (유저당 정확히 1행). 별도 surrogate id 없음.
--   - ON DELETE CASCADE: 계정 삭제 시 설정도 함께 삭제.
--       (로그 테이블의 ON DELETE SET NULL 익명화와 다름 —
--        설정은 통계 가치가 없으므로 익명 보존 불필요.)
--   - preferences = 스키마리스 JSONB blob 한 칸.
--       내부 키(default chart interval 등)는 테마 C Step 4 소비 시점에 결정.
--       지금은 "칸"만 만들고 키는 선확정하지 않음 (deferred decision 규율).
--   - updated_at: 기존 set_updated_at_now() 트리거 재사용 (새 함수 X).
--
-- 공식 문서 근거:
--   Supabase RLS:    https://supabase.com/docs/guides/database/postgres/row-level-security
--   Postgres ON DELETE: https://www.postgresql.org/docs/current/ddl-constraints.html
--   조회일: 2026-06-15
--
-- 참고 기존 마이그레이션:
--   20260420000001_add_updated_at_triggers.sql  (set_updated_at_now() 함수 정의)
--   20260425000001_m1_6_step2_logs.sql           (RLS 정책 스타일 / 주석 톤)
-- ============================================================


-- ============================================================
-- (A) 테이블 정의
--
-- 멱등성: CREATE TABLE IF NOT EXISTS 로 재실행 안전.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
  -- user_id: PK 겸 FK. 유저당 정확히 1행.
  -- ON DELETE CASCADE: auth.users row 삭제 시 본 row 도 자동 삭제.
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- preferences: 스키마리스 설정 blob.
  -- NOT NULL + DEFAULT '{}' → row 는 항상 유효한 JSON 객체를 보유.
  --   (NULL blob vs 빈 객체 분기 고민을 application 에서 제거)
  -- ⚠️ 내부 키 구조는 의도적으로 미정의 — Step 4 에서 소비 시 결정.
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- updated_at: 마지막 갱신 시각. BEFORE UPDATE 트리거로 자동 갱신.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- (B) updated_at 자동 갱신 트리거
--
-- 기존 공용 함수 set_updated_at_now() 재사용 (새 함수 만들지 않음).
-- 정의: 20260420000001_add_updated_at_triggers.sql
--
-- 멱등성: DROP TRIGGER IF EXISTS 로 재실행 안전.
-- ============================================================

DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();


-- ============================================================
-- (C) RLS — Row Level Security (★ 본 마이그레이션의 핵심)
--
-- 정책 방향:
--   대상 role = authenticated (로그인 유저).
--   anon 은 어떤 policy 도 부여하지 않음 → deny-all (읽기/쓰기 전부 차단).
--   service_role 은 RLS bypass (서버측 관리 작업 가능).
--
--   SELECT: 본인 row 만 (auth.uid() = user_id).
--   INSERT: WITH CHECK (auth.uid() = user_id)
--           → 삽입하려는 row 의 user_id 가 본인 것이어야만 통과.
--           → 남의 user_id 로 위장 삽입 차단.
--   UPDATE: USING (본인 row 만 수정 대상으로 선택) +
--           WITH CHECK (수정 결과의 user_id 도 여전히 본인 것)
--           → user_id 를 남의 것으로 바꿔치기 차단.
--
--   DELETE: 정책 없음(의도적).
--           단일 행 설정은 UPDATE 로 관리하고,
--           행 제거는 계정 삭제 시 CASCADE 가 처리.
--           → authenticated 에게 DELETE policy 0개 = DELETE deny.
--
--   성능: auth.uid() 를 (select auth.uid()) 로 감싸 initPlan 캐싱
--         (Supabase lint 0003_auth_rls_initplan, security-auditor W-1).
--         본 테이블은 유저당 1행이라 실측 영향 ~0 이지만, 다행 테이블
--         (saved_views, 테마 C Step 2)로 재사용될 RLS 템플릿 정합성 위해 적용.
--   참조: https://supabase.com/docs/guides/database/postgres/row-level-security
-- ============================================================

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- (C-1) SELECT — 본인 row 만 읽기
DROP POLICY IF EXISTS "authenticated can read own preferences" ON public.user_preferences;
CREATE POLICY "authenticated can read own preferences"
  ON public.user_preferences
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- (C-2) INSERT — 본인 user_id 로만 삽입 (위장 삽입 차단)
DROP POLICY IF EXISTS "authenticated can insert own preferences" ON public.user_preferences;
CREATE POLICY "authenticated can insert own preferences"
  ON public.user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- (C-3) UPDATE — 본인 row 만 수정 + user_id 바꿔치기 차단
DROP POLICY IF EXISTS "authenticated can update own preferences" ON public.user_preferences;
CREATE POLICY "authenticated can update own preferences"
  ON public.user_preferences
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================
-- (D) 인덱스
--
-- 별도 인덱스 불필요:
--   PK(user_id) 가 곧 유일 lookup 키이며, PRIMARY KEY 가 자동으로
--   유니크 인덱스를 생성한다. 모든 쿼리 패턴(본인 row 1건 조회/upsert)이
--   이 인덱스를 그대로 사용 → 추가 인덱스는 쓰기/저장 비용만 발생.
-- ============================================================


-- ============================================================
-- (E) 검증 쿼리 (참고, 적용 후 자기검토용 — 실행은 메인 세션)
--
-- (E-1) RLS 활성 + policy 3개 존재 확인:
--   SELECT polname, cmd, roles::regrole[]
--     FROM pg_policy
--    WHERE polrelid = 'public.user_preferences'::regclass;
--   → SELECT/INSERT/UPDATE 3행, roles 가 {authenticated} 인지 확인.
--   → DELETE 행이 없는지 확인.
--
-- (E-2) anon deny-all 확인 (policy 0개여야 함):
--   위 (E-1) 결과에 anon 이 포함되지 않으면 OK.
--
-- (E-3) 트리거 존재 확인:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.user_preferences'::regclass
--      AND NOT tgisinternal;
--   → trg_user_preferences_updated_at 1행.
-- ============================================================

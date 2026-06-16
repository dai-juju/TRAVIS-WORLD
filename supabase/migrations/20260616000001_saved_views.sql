-- ============================================================
-- M2 테마 C Step 2 Sub-step 1 — saved_views (저장 뷰 영속화)
--
-- 목적:
--   유저가 캔버스 레이아웃("뷰")을 저장/복원하는 두 번째 "유저 소유 쓰기"
--   테이블. PRD §5 "My Views" 좌측 패널의 데이터 토대.
--   "탭 닫으면 다 사라지는 생성기" → "매일 돌아오는 워크플로 도구" 전환의 핵심.
--
-- ★ user_preferences(Step 1)와의 차이 (유저당 1행 → N행):
--   1. surrogate id PK 추가 — user_id 는 더 이상 PK 가 될 수 없다(유저당 N개 뷰).
--   2. DELETE 정책 추가 — 뷰 삭제는 필수 기능(user_preferences 는 DELETE 없음).
--   3. (user_id, created_at DESC) 복합 인덱스 — 본인 뷰 목록 정렬 조회용
--      (PK lookup 만으론 "내 뷰 최신순 목록" 을 못 받침).
--   공통: 본인 SELECT/INSERT/UPDATE RLS + (select auth.uid()) initplan +
--         WITH CHECK 위장/바꿔치기 차단 + updated_at 트리거 재사용.
--
-- 설계 결정(사용자 확정):
--   - cards_config / canvas_state = 스키마리스 JSONB. ★ 내부 키 구조는 의도적으로
--     미정의 — Sub-step 2(canvasStore 직렬화 헬퍼) 작성 시 결정(deferred decision).
--       · cards_config : AiCardConfig[] (카드 설정 배열) — 로드 시 safeParse 재검증.
--       · canvas_state : 뷰포트({zoom,x,y} 등) — Sub-step 2 확정.
--   - name : 뷰 이름. NOT NULL + 길이 가드(1~200자).
--   - ON DELETE CASCADE : 계정 삭제 시 저장 뷰도 함께 삭제.
--   - updated_at : 기존 set_updated_at_now() 트리거 재사용(뷰 rename/덮어쓰기 시 갱신).
--
-- 공식 문서 근거:
--   Supabase RLS:    https://supabase.com/docs/guides/database/postgres/row-level-security
--   Postgres ON DELETE: https://www.postgresql.org/docs/current/ddl-constraints.html
--   조회일: 2026-06-16
--
-- 참고 기존 마이그레이션:
--   20260615000001_user_preferences.sql           (user-owned-write RLS 템플릿)
--   20260420000001_add_updated_at_triggers.sql     (set_updated_at_now() 함수 정의)
-- ============================================================


-- ============================================================
-- (A) 테이블 정의
--
-- 멱등성: CREATE TABLE IF NOT EXISTS 로 재실행 안전.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.saved_views (
  -- id: surrogate PK. 유저당 여러 뷰를 가지므로 user_id 를 PK 로 쓸 수 없다.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- user_id: 소유자 FK. ON DELETE CASCADE → 계정 삭제 시 본 row 도 자동 삭제.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- name: 뷰 이름(좌측 목록 표시). 빈 문자열/과도 길이 차단.
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),

  -- cards_config: 저장 시점 카드 설정 배열(AiCardConfig[]).
  --   NOT NULL + DEFAULT '[]' → 항상 유효한 JSON 배열 보유.
  --   ⚠️ 내부 구조는 Sub-step 2 직렬화 헬퍼에서 확정(지금 키 선확정 안 함).
  cards_config JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- canvas_state: 저장 시점 뷰포트(줌/팬 등).
  --   ⚠️ 내부 구조는 Sub-step 2 에서 확정.
  canvas_state JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- created_at / updated_at: 정렬 키 + 갱신 추적.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- (B) 인덱스 — 본인 뷰 목록 최신순 조회
--
-- "SELECT ... WHERE user_id = $me ORDER BY created_at DESC" 가 좌측 패널의
-- 유일한 조회 패턴. (user_id, created_at DESC) 복합 인덱스로 정렬까지 인덱스에서
-- 해결(추가 sort 단계 제거).
--
-- 멱등성: CREATE INDEX IF NOT EXISTS.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_saved_views_user_created
  ON public.saved_views (user_id, created_at DESC);


-- ============================================================
-- (C) updated_at 자동 갱신 트리거
--
-- 기존 공용 함수 set_updated_at_now() 재사용(새 함수 X).
-- 멱등성: DROP TRIGGER IF EXISTS.
-- ============================================================

DROP TRIGGER IF EXISTS trg_saved_views_updated_at ON public.saved_views;
CREATE TRIGGER trg_saved_views_updated_at
  BEFORE UPDATE ON public.saved_views
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();


-- ============================================================
-- (D) RLS — Row Level Security (★ 핵심)
--
-- 정책 방향(user_preferences 템플릿 + DELETE 추가):
--   대상 role = authenticated. anon = policy 0개 → deny-all.
--   service_role = RLS bypass(서버 API 의 service_role 쓰기 경로용).
--
--   SELECT: 본인 row 만.
--   INSERT: WITH CHECK 본인 user_id 로만(위장 삽입 차단).
--   UPDATE: USING 본인 row + WITH CHECK 결과도 본인(user_id 바꿔치기 차단).
--   DELETE: USING 본인 row 만(남의 뷰 삭제 차단). ← user_preferences 와 차이.
--
--   성능: auth.uid() → (select auth.uid()) initplan 캐싱
--         (Supabase lint 0003, N행 테이블이라 user_preferences 보다 효과 실질적).
-- ============================================================

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

-- (D-1) SELECT — 본인 뷰만 읽기
DROP POLICY IF EXISTS "authenticated can read own saved_views" ON public.saved_views;
CREATE POLICY "authenticated can read own saved_views"
  ON public.saved_views
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- (D-2) INSERT — 본인 user_id 로만 저장(위장 삽입 차단)
DROP POLICY IF EXISTS "authenticated can insert own saved_views" ON public.saved_views;
CREATE POLICY "authenticated can insert own saved_views"
  ON public.saved_views
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- (D-3) UPDATE — 본인 뷰만 수정 + user_id 바꿔치기 차단
DROP POLICY IF EXISTS "authenticated can update own saved_views" ON public.saved_views;
CREATE POLICY "authenticated can update own saved_views"
  ON public.saved_views
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- (D-4) DELETE — 본인 뷰만 삭제(남의 뷰 삭제 차단)
DROP POLICY IF EXISTS "authenticated can delete own saved_views" ON public.saved_views;
CREATE POLICY "authenticated can delete own saved_views"
  ON public.saved_views
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);


-- ============================================================
-- (E) 검증 쿼리 (참고, 적용 후 자기검토용 — 실행은 메인 세션 MCP read-only)
--
-- (E-1) RLS 활성 + policy 4개(SELECT/INSERT/UPDATE/DELETE), roles={authenticated}:
--   ⚠️ pg_policies(뷰)를 쓸 것 — pg_policy(카탈로그 테이블)엔 cmd/roles 컬럼이 없다
--      (그쪽은 polname/polcmd/polroles). 2026-06-16 확인.
--   SELECT policyname, cmd, roles, qual, with_check
--     FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'saved_views' ORDER BY cmd;
--
-- (E-2) 인덱스 존재:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'saved_views';
--   → idx_saved_views_user_created + saved_views_pkey.
--
-- (E-3) 트리거 존재:
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.saved_views'::regclass AND NOT tgisinternal;
--   → trg_saved_views_updated_at.
--
-- (E-4) initplan 경고 0 (get_advisors).
-- ============================================================

-- ============================================================
-- M1.6 Step 2 — 로그 테이블 정비 + 신규 도입
--
-- 목적:
--   M1.6 Step 1 에서 Supabase Auth 가 도입되면서, 운영 단계에서 "유저별
--   행동 추적 + 비용 계측 + AI 신뢰성 측정" 을 위한 로그 인프라 정비.
--
-- 본 마이그레이션 범위:
--   (A) log_validation_failure 정리(기존 dev 디버깅 row 삭제) + 컬럼 5개 확장
--   (B) log_chat 신규 (AI 호출 1회 = 1 row, 비용/토큰/지연 포함)
--   (C) log_behavior 신규 (운영 이벤트 자유 적재 — UI 클릭 등)
--   (D) RLS policies — 본인 row 만 SELECT (service_role 은 RLS bypass)
--   (E) 인덱스 — (user_id, created_at DESC) 만 선제 도입
--
-- 공식 문서 근거:
--   Supabase RLS:    https://supabase.com/docs/guides/database/postgres/row-level-security
--   Postgres ON DELETE: https://www.postgresql.org/docs/current/ddl-constraints.html
--   조회일: 2026-04-25
--
-- 참고 기존 마이그레이션:
--   20260418000001_create_symbols_and_log.sql  (log_validation_failure 최초 생성)
--   20260422000001_add_anon_read_policies.sql (now_*/history_* SELECT policy)
-- ============================================================


-- ============================================================
-- (A) log_validation_failure — 정리 + 컬럼 5개 확장
-- ============================================================

-- (A-1) 기존 row 5건 삭제.
-- 사유: M1.5 dev 디버깅 단계에서 적재된 row 들이며 user_id 가 없어
-- 신규 RLS policy(`auth.uid() = user_id`) 적용 시 어차피 anon 에게는
-- 안 보임. 운영 가치 0 → 깨끗한 출발을 위해 DELETE.
DELETE FROM public.log_validation_failure;

-- (A-2) 컬럼 5개 추가.
-- 모든 컬럼이 NULLABLE 또는 DEFAULT 를 가지므로 기존 row 가 있더라도
-- ALTER 가 즉시 성공한다. (방금 DELETE 했으므로 더더욱 안전)
ALTER TABLE public.log_validation_failure
  -- user_id: 호출 주체. NULL 허용 (M1.5 시절 또는 시스템 호출 케이스).
  -- ON DELETE SET NULL: 유저가 계정 삭제하면 로그는 익명화하여 보존.
  --   (운영 통계는 살리되, 개인 식별성은 제거 — GDPR/PIPL 친화)
  --   참조: https://www.postgresql.org/docs/current/ddl-constraints.html
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- attempt_number: AI self-correction 시 N번째 시도인지. 1 = 최초.
  -- DEFAULT 1 NOT NULL: 항상 명시적 의미를 보장.
  ADD COLUMN attempt_number SMALLINT NOT NULL DEFAULT 1,

  -- model_id: 어떤 Claude 모델에서 실패했는지 (예: 'claude-haiku-4-5').
  -- NULL 허용: 향후 라우팅 변경 가능성 대비 자유도 확보.
  ADD COLUMN model_id VARCHAR(50),

  -- system_prompt_version: AI 신뢰성 회귀 추적용 (예: 'v1.5.3').
  -- buildSystemPrompt 출력 해시 또는 시맨틱 버전 둘 다 허용.
  ADD COLUMN system_prompt_version VARCHAR(40),

  -- user_query_hash: query_text PII 의존 없이 동일 질의 군집 분석용.
  -- SHA-256 hex 64자 가정. NULL 허용 (Step 3 에서 채움 시작).
  ADD COLUMN user_query_hash VARCHAR(64);


-- ============================================================
-- (B) log_chat — 신규
--
-- 1 호출 = 1 row. 비용/토큰/지연/모델/시도 횟수까지 한 줄로 봉합.
-- M1.7 closed-beta rate-limit 이 본 테이블의 (user_id, created_at) 인덱스를
-- 직접 read 하므로 인덱스 선제 도입.
-- ============================================================

CREATE TABLE public.log_chat (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- 호출 주체. NULL 허용 + ON DELETE SET NULL (위 (A-2) 동일 사유).
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- query_text: 유저 입력 원문.
  -- CHECK (length(query_text) <= 500) 은 [3-19] 로 deferred-task 이월.
  -- 500자 상한이 UX 와 충돌 가능성 검토 필요해서 본 마이그레이션 미적용.
  query_text TEXT NOT NULL,

  -- ai_response: 최종 응답 JSON (정상 응답 또는 fallback 페이로드).
  -- nullable: 모델 호출 자체가 throw 한 경우 NULL.
  ai_response JSONB,

  -- status: 비즈니스 결과만 표현 — 'success' | 'fallback' 2값.
  -- 기술적 실패(network 등)도 fallback 으로 흡수 (UX 일관성).
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'fallback')),

  -- fallback_reason: status='fallback' 일 때만 채움.
  -- enum 값은 lib/ai/fallbackReason.ts 와 동기화. nullable.
  -- (status='success' 인데 reason 채우는 잘못된 INSERT 는 application 레이어에서 가드)
  fallback_reason VARCHAR(40),

  -- model_id: 'claude-haiku-4-5' 등. 비용 분석 핵심 키.
  model_id VARCHAR(50) NOT NULL,

  -- 토큰 회계. 0 도 유효 (캐시 히트 등). NOT NULL.
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,

  -- latency_ms: 호출 시작~응답 완료. p95/p99 SLA 측정용.
  latency_ms INTEGER NOT NULL,

  -- attempt_number: self-correction 재시도 횟수.
  attempt_number SMALLINT NOT NULL DEFAULT 1,

  -- system_prompt_version / user_query_hash — log_validation_failure 와 동일 의미.
  system_prompt_version VARCHAR(40),
  user_query_hash VARCHAR(64),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- (C) log_behavior — 신규
--
-- 운영 이벤트 자유 적재 슬롯. event_type 을 enum 으로 굳히지 않고
-- VARCHAR 자유 문자열로 둔 사유:
--   - M1.6~M1.7 동안 어떤 이벤트를 추적할지 빠르게 변동 예정
--   - DB 마이그레이션 비용 없이 application 코드에서 즉시 새 event_type 도입
--   - Step 3 에서 어느 정도 굳어진 후 enum 또는 lookup 테이블로 승격 검토
-- ============================================================

CREATE TABLE public.log_behavior (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- 호출 주체. NULL 허용 (익명 또는 시스템 이벤트 케이스).
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- event_type: 'card_added', 'card_removed', 'login_success' 등.
  -- 자유 문자열 — Step 3 에서 enum 결정.
  event_type VARCHAR(50) NOT NULL,

  -- payload: 이벤트별 자유 부속 데이터. nullable.
  -- 예: { "componentId": "ticker-card", "symbol": "BTCUSDT" }
  payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- (D) RLS — Row Level Security
--
-- 정책 방향:
--   SELECT: authenticated 본인만 (auth.uid() = user_id).
--           user_id IS NULL row 는 자동 차단(NULL = NULL → false).
--   INSERT: 명시 policy 0개 → service_role 전용 (RLS bypass).
--           프론트(anon/authenticated) 는 절대 직접 INSERT 못 함.
--           AI 라우트(/api/orchestrate)·워커는 service_role client 사용.
--
--   참조: https://supabase.com/docs/guides/database/postgres/row-level-security
-- ============================================================

-- (D-1) log_validation_failure
ALTER TABLE public.log_validation_failure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read own validation failures"
  ON public.log_validation_failure
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- (D-2) log_chat
ALTER TABLE public.log_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read own chat logs"
  ON public.log_chat
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- (D-3) log_behavior
ALTER TABLE public.log_behavior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read own behavior logs"
  ON public.log_behavior
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================
-- (E) 인덱스
--
-- (user_id, created_at DESC) 만 선제 도입한 사유:
--   - M1.7 rate-limit: "최근 N분 동안 user X 가 몇 번 호출했나?"
--     → WHERE user_id = ? AND created_at > now() - interval '1 minute'
--     이 쿼리 패턴이 가장 빈번. 복합 인덱스 leading column 이 user_id 라
--     선택도 압도적으로 좋음.
--   - 사용자별 최근 로그 조회 UI(/admin) 도 동일 인덱스 활용 가능.
--
-- 기타 후보 인덱스(model_id, status, event_type 등) 는 EXPLAIN-ANALYZE
-- 로 필요 입증된 후 추가 — 선제 도입 금지(쓰기 비용·저장 비용 vs 사용 빈도).
-- ============================================================

CREATE INDEX idx_log_validation_failure_user_created
  ON public.log_validation_failure (user_id, created_at DESC);

CREATE INDEX idx_log_chat_user_created
  ON public.log_chat (user_id, created_at DESC);

CREATE INDEX idx_log_behavior_user_created
  ON public.log_behavior (user_id, created_at DESC);


-- ============================================================
-- 향후 확장 메모 (M1.7 ~ M2)
--
-- - admin role 전용 SELECT policy:
--     CREATE POLICY "admin can read all chat logs"
--       ON public.log_chat FOR SELECT TO authenticated
--       USING (auth.jwt() ->> 'role' = 'admin');
--   → M1.7 closed-beta 운영 도구에서 도입 검토.
--
-- - query_text length CHECK (<= 500) — deferred-task [3-19].
-- - event_type enum 승격 — Step 3 결정 후.
-- - log_chat 월별 partition — 적재량 1M+ row 도달 시 검토 (M2+).
-- ============================================================

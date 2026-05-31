-- M1.8.5 Step 2: history_futures_indicator interval 컬럼 + 자연 키 UNIQUE INDEX
--
-- 마일스톤: M1.8.5 history backfill (2026-05-31 진입)
-- 사용자 결정: D22=A (interval VARCHAR(5) ADD + 자연 키 UNIQUE INDEX 신설), 2026-05-27 확정
--
-- 사전 확인 (Supabase MCP, 2026-05-31):
--   - SELECT COUNT(*) FROM history_futures_indicator = 0 row (backfill 안전)
--   - 기존 INDEX 2개: history_futures_indicator_pkey (UNIQUE on id) + idx_hist_futures_indicator_lookup (4축 non-unique)
--   - 신규 5축 자연 키 INDEX 와 충돌 0 — id PK 그대로 유지 (surrogate PK + natural key 공존, fact-table 패턴)
--
-- 단일 진실 원천 정합:
--   - docs/canonical-metrics.md §3.1 (Binance USDM 9 interval 시계열 매핑)
--   - docs/task-record/M1.8.5-RESUME-PLAN.md §2 Step 2
--   - docs/ROADMAP.md §M1.8.5
--   - docs/DB_SCHEMA.md §history_futures_indicator (본 step 동시 갱신)
--
-- 관련 deferred:
--   - [8-15] M1.8.5 history backfill (본 step)
--   - [8-5] Supabase MCP migrations 빈 상태 → 본 파일이 git 추적 + Dashboard 수동 실행 패턴 (기존 7 파일 동일)

-- ========================================================================
-- 1. interval 컬럼 추가 (NOT NULL + 임시 DEFAULT '1d')
--    row 0건이라 DEFAULT 의 backfill 효과 0. 단 OLAP fact table 표준 패턴 준수.
-- ========================================================================
ALTER TABLE public.history_futures_indicator
  ADD COLUMN interval VARCHAR(5) NOT NULL DEFAULT '1d';

-- ========================================================================
-- 2. 자연 키 5축 UNIQUE INDEX 신설
--    (exchange, market_type, symbol, interval, recorded_at) 자연 키 = fact table 표준
--    효과:
--      - 동일 timestamp 의 5m / 15m / 1h 봉이 충돌 없이 공존
--      - ON CONFLICT (...) DO UPDATE 자연 upsert 가능 (fetcher 코드 단순화)
--      - 기존 id PK + idx_hist_futures_indicator_lookup 와 공존 (Realtime row identity 유지)
-- ========================================================================
CREATE UNIQUE INDEX history_futures_indicator_natural_pk
  ON public.history_futures_indicator (exchange, market_type, symbol, interval, recorded_at);

-- ========================================================================
-- 3. interval DEFAULT 제거
--    이후 INSERT 시 interval 명시 강제 — Step 3 fetcher/normalize 가 반드시 9 interval enum
--    중 하나 매핑 (5m / 15m / 30m / 1h / 2h / 4h / 6h / 12h / 1d).
--    CLAUDE.md §위생 #1 (lifecycle invariant) 정합.
-- ========================================================================
ALTER TABLE public.history_futures_indicator
  ALTER COLUMN interval DROP DEFAULT;

-- ========================================================================
-- 검증 쿼리 (Dashboard 실행 후 별도 확인용 — 본 파일에는 미포함):
--   (a) SELECT column_name, data_type, is_nullable, column_default
--       FROM information_schema.columns
--       WHERE table_name = 'history_futures_indicator' AND column_name = 'interval';
--       기대: VARCHAR(5), NOT NULL, DEFAULT 없음
--
--   (b) SELECT indexname, indexdef
--       FROM pg_indexes
--       WHERE tablename = 'history_futures_indicator' AND schemaname = 'public'
--       ORDER BY indexname;
--       기대: 3 INDEX (history_futures_indicator_natural_pk + history_futures_indicator_pkey + idx_hist_futures_indicator_lookup)
--
--   (c) SELECT COUNT(*) FROM history_futures_indicator;
--       기대: 0 row (Step 3 backfill 시작 전 상태)
-- ========================================================================

-- ========================================================================
-- M2 Disk Retention 묶음 S2 — surrogate id PK 제거 + natural_pk PRIMARY KEY 승격
-- ========================================================================
-- 작성일: 2026-06-13 (M2 확장 루프, deferred [10-15] 잔여 회수)
-- 단일 진실 원천: docs/task-record/M2-history-retention.md + docs/DB_SCHEMA.md
--
-- 실행: 3 ALTER 를 **한 트랜잭션**(원자성 필수). Supabase MCP apply_migration 또는
--   Dashboard SQL Editor 에서 BEGIN/COMMIT 으로 감싸 실행. DROP CONSTRAINT 만 적용되고
--   ADD PRIMARY KEY 가 실패하면 PK 없는 상태가 되므로 반드시 원자적.
--
-- 배경 (deferred [10-15] 잔여):
--   history_futures_indicator_pkey (id BIGINT GENERATED ALWAYS AS IDENTITY) = 337MB.
--   id 는 surrogate — 실측으로 ① FK 참조 0건 ② 코드 read 0건(normalize 미주입,
--   유일 SELECT 인 getMaxRecordedAt 은 recorded_at 만) ③ Realtime publication 미포함
--   → 제거해도 무손실. natural_pk(5축 UNIQUE)를 PRIMARY KEY 로 승격해 중복 인덱스 해소.
--
-- ⚠️ ADD ... USING INDEX 동작: natural_pk UNIQUE 인덱스가 PK backing 으로 재사용되며
--   (891MB full rebuild 회피) 인덱스 이름이 제약명 history_futures_indicator_pk 로 rename 됨.
--   natural_pk 5컬럼(exchange/market_type/symbol/interval/recorded_at)은 전부 NOT NULL 확인됨
--   (PK 승격 전제 충족, 2026-06-13 information_schema 실측).
--
-- 효과: pkey 인덱스 337MB + heap id 약 60MB 회수. upsert onConflict(natural key 5축)는
--   id 없이 정상 동작(PostgREST insert payload 에 id 미포함, defaultToNull:false 무관).
-- RLS/보안 영향: 없음 (policy 무변경). 데이터 무손실(id 컬럼/인덱스만 제거).
--
-- 사후 의무: database.generated.ts 재생성(generate_typescript_types) — id 컬럼 제거 반영.
-- ========================================================================

SET LOCAL lock_timeout = '15s';  -- 라이브 upsert lock 충돌 시 무한대기 대신 실패→롤백(재시도 안전)

ALTER TABLE public.history_futures_indicator
  DROP CONSTRAINT history_futures_indicator_pkey;

ALTER TABLE public.history_futures_indicator
  ADD CONSTRAINT history_futures_indicator_pk
  PRIMARY KEY USING INDEX history_futures_indicator_natural_pk;

ALTER TABLE public.history_futures_indicator
  DROP COLUMN id;

-- 검증 (적용 후):
--   (a) SELECT conname, contype FROM pg_constraint
--       WHERE conrelid='public.history_futures_indicator'::regclass AND contype='p';
--       기대: history_futures_indicator_pk (PRIMARY KEY).
--   (b) SELECT indexname FROM pg_indexes WHERE tablename='history_futures_indicator';
--       기대: history_futures_indicator_pk + idx_hist_futures_indicator_freshness (2개).
--   (c) id 컬럼 부재: SELECT column_name FROM information_schema.columns
--       WHERE table_name='history_futures_indicator' AND column_name='id'; → 0 rows.
--   (d) collector upsert 정상: forward-fill freshness lag 회귀 없음(5m age 정상).

-- ========================================================================
-- 사이클 2 Step 6 — funding_history (펀딩 정산 이벤트 테이블 신설 + 죽은 컬럼 정리)
-- ========================================================================
-- 작성일: 2026-07-09. 단일 진실: docs/task-record/M2-cycle2-genericchart.md §4h + docs/DB_SCHEMA.md
--
-- 실행: Supabase Dashboard SQL Editor 에서 통째 실행 (MCP read-only → apply_migration 불가,
--   retention 선례 20260613000003 동일). 전부 트랜잭션 안전 — 원자적 실행 무방.
--
-- 배경 (crypto-domain 자문 2026-07-09, 사용자 결정 5건):
--   펀딩은 interval 버킷 지표가 아니라 **정산 이벤트**(8h/4h + cap/floor 도달 시 동적 1h,
--   Binance 2025-05-02 발효). history_futures_indicator 의 funding 컬럼 2개(0행)에
--   버킷 복제로 채우는 원안은 가짜 포인트(site=DB 위반)라 기각 → 별도 이벤트 테이블.
--   정산 1회 = 1행 = Binance "Funding Rate History" 페이지와 1:1.
--
-- Binance USDM realized funding rate history ref:
--   https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History
--   COINM: https://developers.binance.com/docs/derivatives/coin-margined-futures/market-data/rest-api/Get-Funding-Rate-History-of-Perpetual-Futures
--   (조회 2026-07-09. COINM 은 markPrice 필드 문서 미등재 → mark_price NULL 허용)
-- ========================================================================

-- 1) 펀딩 정산 이벤트 테이블 — 자연키 직PK (kline 선례 20260418000003 + retention S2 방향).
--    interval 축 없음: 실제 정산 간격은 funding_time 델타로만 확정 (동적 1h 전환 신호 보존).
CREATE TABLE public.history_futures_funding (
  exchange      VARCHAR(20)  NOT NULL,
  market_type   VARCHAR(20)  NOT NULL,   -- 'futures_usdm' / 'futures_coinm'
  symbol        VARCHAR(40)  NOT NULL,
  funding_time  TIMESTAMPTZ  NOT NULL,   -- 정산 시각 (Binance fundingTime epoch ms → ISO)
  funding_rate  NUMERIC      NOT NULL,   -- realized settled rate (raw decimal, canonical §2.1)
  mark_price    NUMERIC,                 -- 정산 시점 mark price (USDM 제공 / COINM 미보장)

  PRIMARY KEY (exchange, market_type, symbol, funding_time)
);

-- 2) RLS — 시장 공개 데이터 public read (20260422000001 동형).
ALTER TABLE public.history_futures_funding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon and authenticated can read history_futures_funding"
  ON public.history_futures_funding
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3) retention — 60일 단일 cutoff (사용자 결정 2026-07-09, backfill 깊이와 정합).
--    기존 prune_history_futures_indicator 확장 기각(테이블 전용 이름/책임 + interval 차등
--    로직이 funding 과 무관) → 신규 PROCEDURE + 별도 cron job (선례 IO 안전 설계 동형:
--    배치 COMMIT / ctid LIMIT / advisory lock / pg_sleep).
--    행수 규모: 심볼당 일 3~6행 (이벤트) — indicator(일 ~25만) 대비 미미하나 정책 부재 금지.
CREATE OR REPLACE PROCEDURE public.prune_history_futures_funding()
LANGUAGE plpgsql AS $$
DECLARE
  deleted_count int;
  total_deleted bigint := 0;
BEGIN
  -- 동시 실행 방지 (lock id 는 indicator 의 774411001 과 별도)
  IF NOT pg_try_advisory_lock(774411002) THEN
    RAISE NOTICE 'prune_history_futures_funding: already running — skip';
    RETURN;
  END IF;

  LOOP
    DELETE FROM public.history_futures_funding
    WHERE ctid IN (
      SELECT ctid FROM public.history_futures_funding
      WHERE funding_time < now() - interval '60 days'
      LIMIT 8000
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    COMMIT;                        -- 배치 단위 커밋 (WAL/lock 분산)
    EXIT WHEN deleted_count = 0;
    PERFORM pg_sleep(0.5);
  END LOOP;

  PERFORM pg_advisory_unlock(774411002);
  RAISE NOTICE 'prune_history_futures_funding: done, % rows deleted', total_deleted;
END;
$$;

-- 매일 UTC 18:15 (indicator prune 18:00 과 시차 — IO 겹침 회피, 어차피 소량)
SELECT cron.schedule(
  'prune-hist-futures-funding',
  '15 18 * * *',
  $$CALL public.prune_history_futures_funding()$$
);

-- 4) history_futures_indicator 죽은 펀딩 컬럼 2개 DROP (사용자 결정 2026-07-09).
--    M1.8 §8.1 에서 "펀딩 이력도 여기에" 가정으로 예비했으나 0행 확정(2026-07-09 실측)
--    + 본 이벤트 테이블이 역할 대체. 참조는 generated 타입 + 테스트 핀 1곳뿐(grep 전수).
ALTER TABLE public.history_futures_indicator
  DROP COLUMN IF EXISTS predicted_funding_rate,
  DROP COLUMN IF EXISTS last_settled_funding_rate;

-- ========================================================================
-- 검증 (적용 후):
--   (a) SELECT * FROM pg_policies WHERE tablename = 'history_futures_funding';
--       → SELECT policy 1행 (anon, authenticated) — 위생 #7 deny-all 함정 확인
--   (b) SELECT jobname, schedule FROM cron.job WHERE jobname = 'prune-hist-futures-funding';
--   (c) SELECT column_name FROM information_schema.columns
--        WHERE table_name='history_futures_indicator' AND column_name LIKE '%funding%';
--       → 0행 (DROP 확인, 23→21 컬럼)
-- ========================================================================

-- M2 테마 B Step 1: now_spot_ticker / now_futures_ticker quote_asset 컬럼 + backfill
--
-- 마일스톤: M2 테마 B — 데이터 정합 (2026-06-11 진입)
-- 배경: 실사용 F2 / deferred [10-2] — "spot USDT pairs" 쿼리에 TRY/BNB/USDC 페어 혼입.
--   ticker 테이블에 quote_asset 컬럼이 없어 AI 가 필터를 생성할 수 없었음
--   (registry description 은 이미 "filter by quote_asset" 약속 중 — 구현과 모순 해소).
--
-- 사전 확인 (Supabase MCP, 2026-06-11):
--   - now_spot_ticker 1,441 row / now_futures_ticker 719 row (usdm 689 + coinm 30)
--   - symbols 조인 고아 row 0건 (양 테이블 100% 매칭) → backfill 후 NULL 잔존 0 예상
--   - 라이브 quote 분포: spot = USDT 444 / TRY 320 / USDC 293 / BTC 87 / ... (F2 오염 실증)
--     futures_usdm = USDT 649 / USDC 38 / BTC 1 / USD1 1, futures_coinm = USD 30
--
-- 설계 결정:
--   - NULL 허용 (NOT NULL 금지): ticker24hrBatchTask 의 partial upsert 가 WS 보다 먼저
--     신규 row 를 INSERT 할 수 있고, 구워커 가동 중 과도기(신규 상장) row 보호.
--     NOT NULL 승격은 워커 안정화 후 별도 마이그레이션 (deferred).
--   - 단일 진실 = symbols.quote_asset (syncSymbolsTask 24h 동기화).
--     본 컬럼은 프론트 필터 + Realtime 페이로드를 위한 최소 denormalization.
--   - 지속 채움 = worker tickerWsHandler 가 매 upsert 에 포함 (테마 B Step 2).
--   - history_* / kline 테이블엔 의도적 미추가 — 정적 속성의 시계열 중복 저장 금지
--     ([10-15] Disk IO 절감 방향과 정합. 필요 시 symbols 조인).
--
-- 단일 진실 원천 정합:
--   - docs/task-record/M2-themeB-quote-asset.md (테마 B 추적처, 본 step 신설)
--   - docs/DB_SCHEMA.md §now_spot_ticker / §now_futures_ticker (본 step 동시 갱신)
--   - docs/deferred-task.md [10-2]
--
-- ========================================================================
-- 1. quote_asset 컬럼 추가 (양 ticker 테이블)
-- ========================================================================
ALTER TABLE public.now_spot_ticker
  ADD COLUMN quote_asset VARCHAR(20) NULL;

ALTER TABLE public.now_futures_ticker
  ADD COLUMN quote_asset VARCHAR(20) NULL;

COMMENT ON COLUMN public.now_spot_ticker.quote_asset IS
  '페어 견적통화 (예: USDT/TRY/USDC/BTC). 단일 진실은 symbols.quote_asset — 본 컬럼은 AI 필터 + Realtime 페이로드용 복제. 채움: backfill(2026-06-11) + worker tickerWsHandler 매 upsert.';

COMMENT ON COLUMN public.now_futures_ticker.quote_asset IS
  '페어 견적통화 (USDM: USDT/USDC 등, COINM: USD). 단일 진실은 symbols.quote_asset — 본 컬럼은 AI 필터 + Realtime 페이로드용 복제. 채움: backfill(2026-06-11) + worker tickerWsHandler 매 upsert.';

-- ========================================================================
-- 2. backfill — symbols 마스터 조인 (PK 3축 완전 매칭)
--    사전 확인에서 고아 row 0건 → 전 row 채움 기대.
-- ========================================================================
UPDATE public.now_spot_ticker t
SET quote_asset = s.quote_asset
FROM public.symbols s
WHERE t.exchange = s.exchange
  AND t.market_type = s.market_type
  AND t.symbol = s.symbol;

UPDATE public.now_futures_ticker t
SET quote_asset = s.quote_asset
FROM public.symbols s
WHERE t.exchange = s.exchange
  AND t.market_type = s.market_type
  AND t.symbol = s.symbol;

-- ========================================================================
-- 검증 쿼리 (적용 후 별도 확인용 — 본 파일에는 미포함):
--   (a) SELECT count(*) FROM now_spot_ticker WHERE quote_asset IS NULL;   -- 기대: 0
--       SELECT count(*) FROM now_futures_ticker WHERE quote_asset IS NULL; -- 기대: 0
--   (b) SELECT market_type, quote_asset, count(*) FROM now_futures_ticker
--       GROUP BY 1,2 ORDER BY 1,3 DESC;
--       기대: usdm = USDT/USDC/BTC/USD1, coinm = USD 단일
--   (c) (구워커 비파괴 실측) 1~2분 후 재조회 — WS full upsert 가 돌아도 quote_asset
--       이 NULL 로 덮이지 않음 (PostgREST ON CONFLICT SET 절은 payload 컬럼 한정).
-- ========================================================================

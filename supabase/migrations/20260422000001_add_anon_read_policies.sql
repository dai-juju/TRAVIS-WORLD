-- M1.4 Step 4.5 (2026-04-22)
--
-- now_* / history_* / symbols 테이블의 RLS SELECT 정책 추가.
--
-- 배경:
--   M1.3 에서 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 는 켜졌으나 SELECT
--   policy 가 단 하나도 없어 기본 deny-all 로 anon 사용자가 아무것도 읽지
--   못하는 상태였음. REST 는 200 OK 를 돌려주면서 빈 배열(또는 maybeSingle()
--   에서 null) 을 반환하고, 프론트는 "로딩 중" 상태에 영구 고착.
--
-- 정책 방향 (M1.4~M1.5):
--   - 시장 데이터(now_* / history_*) 는 public read 로 누구나 조회 가능.
--     바이낸스·OKX 등 원 거래소에서 이미 공개된 데이터라 RLS 보호 대상 아님.
--   - symbols 마스터도 public read.
--   - log_validation_failure 는 anon 에게 공개 금지 — auth 도입(M1.6) 후
--     authenticated 에게만 허용할 예정이라 이 마이그레이션 범위 밖.
--
-- M1.6 에 추가될 것:
--   - user_views 등 사용자 개인 데이터 테이블에 `auth.uid() = user_id` 제약
--   - log_validation_failure 에 `authenticated` role 허용

-- ------------------------------------------------------------
-- now_* 실시간 테이블 (TickerCard / CoinListCard 소비)
-- ------------------------------------------------------------
CREATE POLICY "anon and authenticated can read now_spot_ticker"
  ON public.now_spot_ticker
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read now_futures_ticker"
  ON public.now_futures_ticker
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read now_futures_indicator"
  ON public.now_futures_indicator
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ------------------------------------------------------------
-- symbols 마스터 (미래 UI 에서 심볼 목록 자동완성 시 사용)
-- ------------------------------------------------------------
CREATE POLICY "anon and authenticated can read symbols"
  ON public.symbols
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ------------------------------------------------------------
-- history_* 테이블 — 미래 KlineCard 자체 차트 구현 시 소비 예정
-- ------------------------------------------------------------
CREATE POLICY "anon and authenticated can read history_spot_ticker"
  ON public.history_spot_ticker
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read history_futures_ticker"
  ON public.history_futures_ticker
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read history_futures_indicator"
  ON public.history_futures_indicator
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read history_spot_kline"
  ON public.history_spot_kline
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read history_futures_kline"
  ON public.history_futures_kline
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon and authenticated can read history_futures_liquidation"
  ON public.history_futures_liquidation
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ------------------------------------------------------------
-- log_validation_failure 는 의도적으로 policy 추가 안 함.
-- M1.6 auth 도입 시 authenticated 에게만 허용할 예정.
-- ------------------------------------------------------------

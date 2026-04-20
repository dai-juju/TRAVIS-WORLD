-- ============================================================
-- M1.3 Step 4 Verify — updated_at 자동 갱신 트리거
--
-- 배경:
--   기존 now_* 테이블은 `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` 로
--   선언되어 있음. 하지만 PostgreSQL의 `DEFAULT NOW()` 는 **INSERT 시점에만**
--   적용되고 UPDATE(upsert의 ON CONFLICT branch)에서는 기존 값이 유지됨.
--   → upsert 반복 시 updated_at 이 최초 INSERT 시각에 고정되어 신선도 파악 불가.
--
-- 조치:
--   3개 _now 테이블에 BEFORE UPDATE 트리거를 걸어, 어떤 컬럼이든 UPDATE 일어날
--   때마다 NEW.updated_at = NOW() 로 덮어쓴다.
--
-- 적용 영향:
--   - tickerTask / premiumTask / perSymbolTask 의 upsert 가 이제부터는 자동으로
--     updated_at 을 실제 쓰기 시각으로 갱신.
--   - Supabase Realtime 구독자는 "updated_at > now()-'N초'" 형태의 신선도 필터를
--     신뢰할 수 있게 됨 (M1.4 카드 신선도 뱃지 구현 시 필수).
--   - 기존 데이터 및 _history 테이블은 영향 없음 (_history 는 INSERT only).
-- ============================================================

-- ─── 공용 트리거 함수 ────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── now_spot_ticker ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_now_spot_ticker_updated_at ON now_spot_ticker;
CREATE TRIGGER trg_now_spot_ticker_updated_at
  BEFORE UPDATE ON now_spot_ticker
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

-- ─── now_futures_ticker ──────────────────────────────
DROP TRIGGER IF EXISTS trg_now_futures_ticker_updated_at ON now_futures_ticker;
CREATE TRIGGER trg_now_futures_ticker_updated_at
  BEFORE UPDATE ON now_futures_ticker
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

-- ─── now_futures_indicator ───────────────────────────
DROP TRIGGER IF EXISTS trg_now_futures_indicator_updated_at ON now_futures_indicator;
CREATE TRIGGER trg_now_futures_indicator_updated_at
  BEFORE UPDATE ON now_futures_indicator
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

-- ─── 검증 쿼리 (참고, 실행 후 확인용) ─────────────────
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_now_%';

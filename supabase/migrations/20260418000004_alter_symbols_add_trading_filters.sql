-- ============================================================
-- M1.3 Step 1 — 보완 마이그레이션
-- code-reviewer W1: symbols에 거래 필터 컬럼 추가
-- tick_size, step_size, min_notional은 exchangeInfo의 filters에서 추출
-- TRAVIS는 거래 실행 안 하지만 (read-only), 스크리닝에서
-- "최소 주문 금액 이상인 코인만" 같은 필터링에 활용 가능
-- ============================================================

ALTER TABLE symbols ADD COLUMN IF NOT EXISTS tick_size NUMERIC;
ALTER TABLE symbols ADD COLUMN IF NOT EXISTS step_size NUMERIC;
ALTER TABLE symbols ADD COLUMN IF NOT EXISTS min_notional NUMERIC;

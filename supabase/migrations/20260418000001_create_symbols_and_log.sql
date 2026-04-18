-- ============================================================
-- M1.3 Step 1 — 마이그레이션 1/3
-- symbols (심볼 마스터) + log_validation_failure (AI 검증 로그)
-- ============================================================

-- symbols: 전 거래소 심볼 마스터
-- 1행 = 1거래소 × 1마켓타입 × 1심볼
-- 워커가 exchangeInfo 주기 호출 → upsert로 신규 상장/폐지 자동 반영
CREATE TABLE symbols (
  exchange            VARCHAR(20)   NOT NULL,   -- 'binance', 'okx', ...
  market_type         VARCHAR(20)   NOT NULL,   -- 'spot', 'futures_usdm', 'futures_coinm'
  symbol              VARCHAR(40)   NOT NULL,   -- 'BTCUSDT', 'BTCUSD_PERP'
  base_asset          VARCHAR(20)   NOT NULL,   -- 'BTC'
  quote_asset         VARCHAR(20)   NOT NULL,   -- 'USDT', 'USD'
  status              VARCHAR(20)   NOT NULL DEFAULT 'TRADING', -- 'TRADING'/'HALT'/'BREAK'/'SETTLING'/'CLOSE'
  contract_type       VARCHAR(30),              -- NULL(현물), 'PERPETUAL', 'CURRENT_QUARTER', 'NEXT_QUARTER'
  onboard_date        TIMESTAMPTZ,              -- 상장일 (futures)
  delivery_date       TIMESTAMPTZ,              -- 만기일 (futures, 무기한은 먼 미래)
  price_precision     INT,                      -- 가격 소수점 자릿수
  quantity_precision  INT,                      -- 수량 소수점 자릿수
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (exchange, market_type, symbol)
);

-- base_asset로 "BTC가 어디서 거래되는지" 조회
CREATE INDEX idx_symbols_base_asset ON symbols (base_asset);
-- status로 "현재 거래 가능한 심볼만" 필터링
CREATE INDEX idx_symbols_status ON symbols (status);

-- ============================================================
-- log_validation_failure: AI 출력 Zod 검증 실패 로그
-- M1.5에서 AI 오케스트레이터가 기록, M1.6에서 user_id + RLS 추가
-- ============================================================
CREATE TABLE log_validation_failure (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query_text      TEXT,           -- 유저 입력 원문
  ai_response     JSONB,          -- AI가 반환한 원본 JSON
  error_type      VARCHAR(50),    -- 'zod_parse', 'retry_failed' 등
  error_message   TEXT,           -- 에러 상세 내용
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- M1.3 Step 1 — 마이그레이션 2/3
-- _now 테이블 3개: 최신 스냅샷 (Supabase Realtime 구독 대상)
-- PK = (exchange, market_type, symbol) → 조합당 최신 1행 유지
-- ============================================================

-- ─── now_spot_ticker: 현물 시세 + 사전 계산 ───────────────
CREATE TABLE now_spot_ticker (
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL DEFAULT 'spot',
  symbol              VARCHAR(40)   NOT NULL,

  -- Binance /api/v3/ticker/24hr 원시 필드
  last_price          NUMERIC,        -- 현재가
  price_change        NUMERIC,        -- 24h 가격 변동 (절대값)
  price_change_pct    NUMERIC,        -- 24h 가격 변동률 (%)
  weighted_avg_price  NUMERIC,        -- 24h 가중평균가
  prev_close_price    NUMERIC,        -- 직전 종가
  open_price          NUMERIC,        -- 24h 시가
  high_price          NUMERIC,        -- 24h 고가
  low_price           NUMERIC,        -- 24h 저가
  volume              NUMERIC,        -- 24h 거래량 (base asset, 예: BTC)
  quote_volume        NUMERIC,        -- 24h 거래대금 (quote asset, 예: USDT)
  bid_price           NUMERIC,        -- 최우선 매수호가
  bid_qty             NUMERIC,        -- 최우선 매수 수량
  ask_price           NUMERIC,        -- 최우선 매도호가
  ask_qty             NUMERIC,        -- 최우선 매도 수량
  trade_count         BIGINT,         -- 24h 체결 수
  open_time           BIGINT,         -- 통계 시작 시각 (epoch ms)
  close_time          BIGINT,         -- 통계 종료 시각 (epoch ms)

  -- 사전 계산: 워커 롤링 윈도우에서 계산
  price_chg_5m        NUMERIC,        -- 5분 가격 변화율 (%)
  price_chg_15m       NUMERIC,
  price_chg_1h        NUMERIC,
  price_chg_4h        NUMERIC,
  volume_chg_5m       NUMERIC,        -- 5분 거래량 변화율 (%)
  volume_chg_15m      NUMERIC,
  volume_chg_1h       NUMERIC,
  volume_ratio        NUMERIC,        -- 현재 거래량 / 이동평균 거래량

  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exchange, market_type, symbol)
);

-- ─── now_futures_ticker: 선물 시세 + 사전 계산 ────────────
-- USDM과 COINM 모두 이 테이블에 market_type으로 구분
CREATE TABLE now_futures_ticker (
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL,   -- 'futures_usdm' 또는 'futures_coinm'
  symbol              VARCHAR(40)   NOT NULL,

  -- Binance /fapi/v1/ticker/24hr 원시 필드
  last_price          NUMERIC,
  price_change        NUMERIC,
  price_change_pct    NUMERIC,
  weighted_avg_price  NUMERIC,
  open_price          NUMERIC,
  high_price          NUMERIC,
  low_price           NUMERIC,
  volume              NUMERIC,        -- USDM: base asset 수량, COINM: 계약 수
  quote_volume        NUMERIC,        -- USDM 전용 (COINM은 NULL)
  base_volume         NUMERIC,        -- COINM 전용 (USDM은 NULL)
  trade_count         BIGINT,
  open_time           BIGINT,
  close_time          BIGINT,

  -- 사전 계산
  price_chg_5m        NUMERIC,
  price_chg_15m       NUMERIC,
  price_chg_1h        NUMERIC,
  price_chg_4h        NUMERIC,
  volume_chg_5m       NUMERIC,
  volume_chg_15m      NUMERIC,
  volume_chg_1h       NUMERIC,
  volume_ratio        NUMERIC,

  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exchange, market_type, symbol)
);

-- ─── now_futures_indicator: 선물 지표 통합 ─────────────────
-- 펀딩, 마크가격, OI, 롱숏비율, 테이커볼륨을 심볼당 1행으로 통합
-- 각 데이터 소스가 자기 컬럼만 UPDATE (다른 컬럼 덮어쓰지 않음)
CREATE TABLE now_futures_indicator (
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL,
  symbol              VARCHAR(40)   NOT NULL,

  -- 펀딩 + 마크가격 (premiumIndex 엔드포인트)
  mark_price              NUMERIC,    -- 마크가격
  index_price             NUMERIC,    -- 인덱스가격
  estimated_settle_price  NUMERIC,    -- 추정 정산가 (정산 1h 전에만 유의미)
  last_funding_rate       NUMERIC,    -- 현재 펀딩레이트 (premiumIndex의 lastFundingRate, 8h 주기 정산 기준)
  interest_rate           NUMERIC,    -- 이자율
  next_funding_time       BIGINT,     -- 다음 펀딩 정산 시각 (epoch ms)

  -- 미결제약정 (openInterest 엔드포인트)
  open_interest           NUMERIC,    -- OI 수량

  -- 상위 트레이더 롱숏비율 - 계정 수 기준
  top_ls_ratio_accounts   NUMERIC,    -- longShortRatio
  top_long_account        NUMERIC,    -- longAccount (0~1)
  top_short_account       NUMERIC,    -- shortAccount (0~1)

  -- 상위 트레이더 롱숏비율 - 포지션 크기 기준
  top_ls_ratio_positions  NUMERIC,
  top_long_position       NUMERIC,
  top_short_position      NUMERIC,

  -- 전체 트레이더 롱숏비율
  global_ls_ratio         NUMERIC,
  global_long_account     NUMERIC,
  global_short_account    NUMERIC,

  -- 테이커 매수/매도
  taker_buy_sell_ratio    NUMERIC,    -- buySellRatio
  taker_buy_vol           NUMERIC,    -- 매수 거래량
  taker_sell_vol          NUMERIC,    -- 매도 거래량

  -- 사전 계산
  oi_chg_5m               NUMERIC,    -- OI 5분 변화율 (%)
  oi_chg_15m              NUMERIC,
  oi_chg_1h               NUMERIC,
  oi_chg_4h               NUMERIC,

  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exchange, market_type, symbol)
);

-- ─── Supabase Realtime 활성화 ──────────────────────────────
-- _now 테이블 변경 시 프론트엔드에 자동 푸시
ALTER PUBLICATION supabase_realtime ADD TABLE now_spot_ticker;
ALTER PUBLICATION supabase_realtime ADD TABLE now_futures_ticker;
ALTER PUBLICATION supabase_realtime ADD TABLE now_futures_indicator;

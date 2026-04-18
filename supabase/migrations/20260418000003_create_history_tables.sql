-- ============================================================
-- M1.3 Step 1 — 마이그레이션 3/3
-- _history 테이블 6개: 시계열 축적 (차트, 추이 분석, 패턴 분석)
-- TODO(확장 루프): 파티셔닝(월/분기 단위), 다운샘플링, 보존 정책 추가
-- ============================================================

-- ─── history_spot_ticker: 현물 시세 히스토리 ───────────────
CREATE TABLE history_spot_ticker (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL DEFAULT 'spot',
  symbol              VARCHAR(40)   NOT NULL,

  last_price          NUMERIC,
  price_change_pct    NUMERIC,
  volume              NUMERIC,
  quote_volume        NUMERIC,
  high_price          NUMERIC,
  low_price           NUMERIC,
  trade_count         BIGINT,

  -- 사전 계산 스냅샷 (그 시점의 모멘텀 기록)
  price_chg_5m        NUMERIC,
  price_chg_15m       NUMERIC,
  price_chg_1h        NUMERIC,
  price_chg_4h        NUMERIC,
  volume_chg_5m       NUMERIC,
  volume_chg_15m      NUMERIC,
  volume_chg_1h       NUMERIC,
  volume_ratio        NUMERIC,

  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hist_spot_ticker_lookup
  ON history_spot_ticker (exchange, market_type, symbol, recorded_at DESC);

-- ─── history_futures_ticker: 선물 시세 히스토리 ────────────
CREATE TABLE history_futures_ticker (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL,
  symbol              VARCHAR(40)   NOT NULL,

  last_price          NUMERIC,
  price_change_pct    NUMERIC,
  volume              NUMERIC,
  quote_volume        NUMERIC,
  base_volume         NUMERIC,
  high_price          NUMERIC,
  low_price           NUMERIC,
  trade_count         BIGINT,

  price_chg_5m        NUMERIC,
  price_chg_15m       NUMERIC,
  price_chg_1h        NUMERIC,
  price_chg_4h        NUMERIC,
  volume_chg_5m       NUMERIC,
  volume_chg_15m      NUMERIC,
  volume_chg_1h       NUMERIC,
  volume_ratio        NUMERIC,

  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hist_futures_ticker_lookup
  ON history_futures_ticker (exchange, market_type, symbol, recorded_at DESC);

-- ─── history_futures_indicator: 선물 지표 히스토리 ─────────
CREATE TABLE history_futures_indicator (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange                VARCHAR(20)   NOT NULL,
  market_type             VARCHAR(20)   NOT NULL,
  symbol                  VARCHAR(40)   NOT NULL,

  mark_price              NUMERIC,
  index_price             NUMERIC,
  last_funding_rate       NUMERIC,
  open_interest           NUMERIC,

  top_ls_ratio_accounts   NUMERIC,
  top_ls_ratio_positions  NUMERIC,
  global_ls_ratio         NUMERIC,
  taker_buy_sell_ratio    NUMERIC,
  taker_buy_vol           NUMERIC,
  taker_sell_vol          NUMERIC,

  oi_chg_5m               NUMERIC,
  oi_chg_15m              NUMERIC,
  oi_chg_1h               NUMERIC,
  oi_chg_4h               NUMERIC,

  recorded_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hist_futures_indicator_lookup
  ON history_futures_indicator (exchange, market_type, symbol, recorded_at DESC);

-- ─── history_spot_kline: 현물 캔들 OHLCV ──────────────────
CREATE TABLE history_spot_kline (
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL DEFAULT 'spot',
  symbol              VARCHAR(40)   NOT NULL,
  interval            VARCHAR(5)    NOT NULL,   -- '1m', '5m', '1h', '1d'
  open_time           BIGINT        NOT NULL,   -- 봉 시작 시각 (epoch ms)
  close_time          BIGINT        NOT NULL,   -- 봉 종료 시각 (epoch ms)
  open_price          NUMERIC       NOT NULL,
  high_price          NUMERIC       NOT NULL,
  low_price           NUMERIC       NOT NULL,
  close_price         NUMERIC       NOT NULL,
  volume              NUMERIC       NOT NULL,   -- base asset 거래량
  quote_volume        NUMERIC       NOT NULL,   -- quote asset 거래대금
  trade_count         BIGINT,
  taker_buy_base_vol  NUMERIC,                  -- 매수 체결 거래량
  taker_buy_quote_vol NUMERIC,                  -- 매수 체결 거래대금

  PRIMARY KEY (exchange, market_type, symbol, interval, open_time)
);

-- ─── history_futures_kline: 선물 캔들 OHLCV ───────────────
CREATE TABLE history_futures_kline (
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL,
  symbol              VARCHAR(40)   NOT NULL,
  interval            VARCHAR(5)    NOT NULL,
  open_time           BIGINT        NOT NULL,
  close_time          BIGINT        NOT NULL,
  open_price          NUMERIC       NOT NULL,
  high_price          NUMERIC       NOT NULL,
  low_price           NUMERIC       NOT NULL,
  close_price         NUMERIC       NOT NULL,
  volume              NUMERIC       NOT NULL,
  quote_volume        NUMERIC,                  -- USDM만 (COINM은 NULL)
  base_volume         NUMERIC,                  -- COINM만 (USDM은 NULL)
  trade_count         BIGINT,
  taker_buy_base_vol  NUMERIC,
  taker_buy_quote_vol NUMERIC,

  PRIMARY KEY (exchange, market_type, symbol, interval, open_time)
);

-- ─── history_futures_liquidation: 청산 이벤트 로그 ─────────
CREATE TABLE history_futures_liquidation (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange            VARCHAR(20)   NOT NULL,
  market_type         VARCHAR(20)   NOT NULL,
  symbol              VARCHAR(40)   NOT NULL,
  side                VARCHAR(10)   NOT NULL,   -- 'BUY'(숏 청산) / 'SELL'(롱 청산)
  price               NUMERIC       NOT NULL,   -- 청산 가격
  avg_price           NUMERIC,                  -- 체결 평균가
  quantity            NUMERIC       NOT NULL,   -- 청산 수량
  last_filled_qty     NUMERIC,                  -- 마지막 체결 수량
  accumulated_qty     NUMERIC,                  -- 누적 체결 수량
  order_status        VARCHAR(20),              -- 'FILLED' 등
  trade_time          TIMESTAMPTZ   NOT NULL,   -- 청산 발생 시각
  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hist_liq_lookup
  ON history_futures_liquidation (exchange, market_type, symbol, trade_time DESC);

CREATE INDEX idx_hist_liq_time
  ON history_futures_liquidation (trade_time DESC);

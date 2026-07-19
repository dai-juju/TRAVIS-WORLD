-- ============================================================
-- [10-84] 청산 events→series 시간버킷 집계 RPC (M3-step3a Step 2, 2026-07-19)
--
-- 목적:
--   청산은 `events`(개별 사건) shape 로만 서빙돼 chart-card(series 소비)로
--   그릴 수 없었다. 이 함수가 사건을 시간버킷 합계(series)로 reshape 해
--   "모든 데이터 × 모든 형태" 격자의 청산 행을 채운다.
--   단일 진실 = docs/task-record/M3-step3a-liquidation-series.md
--
-- 왜 DB 집계인가 (클라 집계 기각 근거):
--   프론트 initialFetch 의 FETCH_HARD_CAP=3000 에 걸려 전 시장 24h(24,692행)이
--   3,000행에서 **무증상 절단** → 차트는 정상처럼 보이면서 값이 틀린다.
--   (사이트=DB 진실 일치 원칙 정면 위반). DB 집계는 24,677행→289행 = 85:1 압축.
--   실측 EXPLAIN: Index Scan(idx_hist_liq_time) + Index Only Scan(symbols_pkey),
--   Seq Scan 0, Execution 37ms / shared hit 17,347 (2026-07-19, 24h·1h 버킷).
--
-- 보안:
--   - SECURITY INVOKER (기본, 명시) — 호출자 권한으로 실행되어 원본 테이블의
--     기존 anon SELECT 정책이 그대로 적용된다. DEFINER 는 RLS 우회 통로가 되므로 금지.
--   - SET search_path = public, pg_temp — 함수 하이재킹 방어.
--   - p_bucket 은 interval 캐스팅이 아니라 **allowlist 매핑**. 임의 문자열 캐스팅은
--     '1 microsecond' 류가 수백만 버킷을 만드는 DoS 벡터. 미허용 값은 throw 가
--     아니라 기본값 폴백 (graceful — crash 금지 원칙).
--   - p_limit 상한 클램프. 나머지 인자는 전부 등치 비교 파라미터(동적 SQL 0).
--
-- 도메인 (crypto-domain-expert 판정 2026-07-19):
--   - side: o.S 는 청산 "주문" 방향 → **SELL = 롱 포지션 강제청산 / BUY = 숏**.
--     라벨·색의 단일 진실은 apps/web/lib/cards/liquidationSemantics.ts —
--     이 SQL 은 그 규약의 소비자이며 재구현이 아니다.
--   - 값: SUM(notional). 재계산 금지 (canonical = 워커 forceOrderWsHandler,
--     USDM zEff×apEff / COINM zEff×contractSize 인버스. canonical-metrics.md §Liquidation).
--   - ★ sampled: Binance 는 심볼당 1000ms 최대 1건만 push 하고, 그 1건은 "가장 최근"이
--     아니라 **"가장 큰"** 것이다 (change-log 2026-04-10 "report the largest liquidation
--     orders rather than the most recent ones"). 따라서 (a) 합계는 **하한**이고
--     (b) 무작위 표본이 아니라 외삽·보정이 원리적으로 불가하며 (c) 캐스케이드 구간에서
--     누락이 최대라 피크가 압축된다. allForceOrders REST 폐지로 완전한 총량은 비공개.
--     ⇒ "Total liquidations" 표방 금지. 제3자(CoinGlass) 총액과의 영구 불일치는 정상.
--     ref: context7 /websites/developers_binance_zh-cn — Liquidation Order Streams, 조회 2026-07-19
--
-- 🔴 notional 절벽 (무증상 함정 방어):
--   notional 컬럼은 2026-07-06 07:09:35 UTC 이후 행에만 존재 (전체 1,403,578 중
--   977,777행 NULL). SQL SUM() 은 NULL 을 조용히 건너뛰므로, 방어가 없으면 과거
--   구간이 "청산 0"으로 위장된다. → null_notional_count 를 **동반 반환**해
--   소비자가 "0 청산"과 "데이터 없음/불완전"을 구분하게 한다.
--   (전부 NULL 인 버킷은 SUM 이 NULL 을 반환하므로 0 막대가 아니라 결측으로 렌더됨.)
--
-- 🔴 마스터 INNER JOIN (오염 차단):
--   history_futures_liquidation 은 이력 보존 목적상 allowlist 무필터로 INSERT 된다
--   (경로 A 방송만 필터). 실측 결과 market_type='futures_coinm' 인데 심볼이 USDT
--   페어인 오분류 행 1,232건 존재(2026-07-09~17, Binance 신상품 TRADIFI_PERPETUAL).
--   symbols 마스터와의 INNER JOIN 이 이 유령 행을 구조적으로 제거한다.
--   ★ status 필터는 **의도적으로 걸지 않는다** — 지금 SETTLING 인 심볼도 과거의
--     청산은 진짜 역사다. 상태로 거르면 과거를 왜곡한다. 위생 #1 의 TRADING
--     allowlist 는 *현재 스크리닝*의 원칙이고, *역사 집계*의 올바른 게이트는 존재 여부다.
--     (실측: 7일 창 매칭 행의 100%가 TRADING — status 필터는 오늘 아무것도 걸러내지
--      않으면서 미래에 과거를 왜곡할 위험만 진다.)
--
-- 진행 중 버킷 제외:
--   미완 버킷은 항상 "방금 청산이 뚝 끊긴 것"처럼 보인다(워밍업 가드의 시간버킷판).
--   상한을 date_bin(bucket, now()) **미만**으로 두어 완결 버킷만 반환.
--
-- 빈 버킷:
--   generate_series 로 채우지 않는다. (a) 인덱스 친화 (b) spanGaps:false 로
--   "그 시간엔 청산 없음"이 시각적으로 정직 (c) 0 으로 채우면 "0 으로 plot/연결
--   금지" 공통 규칙 위반. 희소 심볼에서 표시 범위가 limit×interval 보다 길어질 수
--   있으나 이는 데이터 진실이지 결함이 아니다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.liquidation_volume_series(
  p_exchange    text,
  p_market_type text,
  p_bucket      text        DEFAULT '1h',
  p_symbol      text        DEFAULT NULL,   -- NULL = 시장 전체 집계
  p_side        text        DEFAULT NULL,   -- NULL = 롱·숏 양쪽
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_limit       integer     DEFAULT 300
)
RETURNS TABLE (
  bucket_time         timestamptz,
  long_notional       double precision,
  short_notional      double precision,
  total_notional      double precision,
  event_count         integer,
  null_notional_count integer
)
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket interval;
  v_limit  integer;
  v_end    timestamptz;
  v_from   timestamptz;
BEGIN
  -- 버킷 allowlist — 미허용/NULL 은 폴백 (graceful, throw 금지).
  --   ★ history 6종보다 넓다(1m 포함): history 는 워커가 그 주기로 수집·저장한 것만
  --     존재하지만 이 함수는 요청 시점 계산이라 어떤 버킷이든 가능하다. 이유 없이
  --     좁히는 것은 큐레이션 — 무엇을 볼지는 AI 가 유저 쿼리에서 정한다.
  v_bucket := CASE p_bucket
    WHEN '1m'  THEN interval '1 minute'   WHEN '5m'  THEN interval '5 minutes'
    WHEN '15m' THEN interval '15 minutes' WHEN '30m' THEN interval '30 minutes'
    WHEN '1h'  THEN interval '1 hour'     WHEN '2h'  THEN interval '2 hours'
    WHEN '4h'  THEN interval '4 hours'    WHEN '6h'  THEN interval '6 hours'
    WHEN '12h' THEN interval '12 hours'   WHEN '1d'  THEN interval '1 day'
    ELSE interval '1 hour'
  END;

  -- limit 클램프 — 상한은 남용 방어, 하한은 0/음수 방어.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 2000);

  -- 완결 버킷 상한(exclusive) = 현재 진행 중 버킷의 시작점.
  v_end := date_bin(v_bucket, COALESCE(p_to, now()), timestamptz 'epoch');

  -- 하한 미지정 시 limit×bucket 으로 스캔 범위를 스스로 제한 (풀스캔 방지).
  v_from := COALESCE(p_from, v_end - (v_limit * v_bucket));

  RETURN QUERY
  SELECT
    date_bin(v_bucket, l.trade_time, timestamptz 'epoch')                    AS bucket_time,
    SUM(l.notional) FILTER (WHERE l.side = 'SELL')                           AS long_notional,
    SUM(l.notional) FILTER (WHERE l.side = 'BUY')                            AS short_notional,
    SUM(l.notional)                                                          AS total_notional,
    COUNT(*)::integer                                                        AS event_count,
    COUNT(*) FILTER (WHERE l.notional IS NULL)::integer                      AS null_notional_count
  FROM public.history_futures_liquidation l
  -- 마스터 존재 확인 = 오분류/유령 심볼 차단 (status 무관 — 위 주석 참조).
  JOIN public.symbols s
    ON  s.exchange    = l.exchange
    AND s.market_type = l.market_type
    AND s.symbol      = l.symbol
  WHERE l.exchange    = p_exchange
    AND l.market_type = p_market_type
    AND l.trade_time >= v_from
    AND l.trade_time <  v_end
    AND (p_symbol IS NULL OR l.symbol = p_symbol)
    AND (p_side   IS NULL OR l.side   = p_side)
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.liquidation_volume_series(text, text, text, text, text, timestamptz, timestamptz, integer) IS
  'Aggregates Binance forced-liquidation events into time buckets (series shape) for chart rendering. p_symbol NULL = whole-market aggregate. SELL side = LONG positions force-closed, BUY = SHORT. Returns long/short/total USD notional plus event_count and null_notional_count (rows predating the 2026-07-06 notional rollout). SAMPLED SOURCE: Binance pushes at most one (the largest) liquidation per symbol per second, so totals are a lower bound and must never be presented as complete. Excludes the in-progress bucket. Only symbols present in the symbols master are counted. See docs/task-record/M3-step3a-liquidation-series.md';

GRANT EXECUTE ON FUNCTION public.liquidation_volume_series(text, text, text, text, text, timestamptz, timestamptz, integer)
  TO anon, authenticated;

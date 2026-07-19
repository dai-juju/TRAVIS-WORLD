-- ============================================================
-- 🔴 청산 마켓 오분류 기존 행 정리 — 1회성 DML (2026-07-19)
--
-- 선행 필수: 20260719000002 (방어 트리거). 재오염 경로를 먼저 막지 않고 정리하면
--            다음 상장(2026-07-20 03:00 UTC 예정 4종)에서 즉시 다시 쌓인다.
--
-- 대상 실측 (2026-07-19, market_type='futures_coinm' AND symbol 에 '_' 없음):
--   총 1,232행 / 14 심볼 / notional 은 전부 NULL(COINM contractSize 조회 실패)
--
--   G1 — 정본 완전 중복 : KORUUSDT 712행 (712/712 = 100% 가 USDM 정본과
--        exchange·symbol·side·trade_time·quantity·price 완전 일치) → **DELETE**
--        살리면 청산 집계가 2배로 부풀어 [10-84] 트랙을 직접 오염시킨다.
--   G2 — 유일 사본 13종 : 520행 (USDM 매칭 0건) → **market_type 교정 + notional
--        재계산**. 지우면 그 기간 청산 이력이 영구 소실된다.
--        (MUU 107 / SOXS 105 / SKHY 80 / BOT 64 / BNC 56 / SNXX 36 / ZHIPU 21 /
--         TZA 17 / INTW 14 / MINIMAX 8 / WEN 8 / XBI 3 / FWDI 1)
--
-- 검출 조건 = `strpos(symbol,'_') = 0` (심볼명 하드코딩 아님):
--   `symbol LIKE '%USDT'` 로 쓰면 quote 가 USD1 인 SPCXUSD1 류를 놓친다.
--
-- notional 재계산 (G2) — canonical 재구현이 아니라 **동일 공식 적용**:
--   워커 forceOrderWsHandler.computeNotional 의 USDM 경로와 같다.
--     zEff  = accumulated_qty > 0 ? accumulated_qty : quantity
--     apEff = avg_price      > 0 ? avg_price      : price
--     notional = zEff * apEff
--   sanity guard 도 코드와 동일: <= 0 또는 > 1e9 이면 NULL (위생 #5).
--   단일 진실은 canonical-metrics.md §Liquidation + 워커 코드.
--
-- 안전:
--   - 키 충돌 없음 — 유일 제약이 PRIMARY KEY(id) 이고 G2 는 USDM 매칭 0건(실측).
--   - 순서 의존: G1 DELETE 를 먼저. 중복을 지운 뒤 남은 것만 교정해야 한다.
--   - 멱등: 재실행 시 대상이 0행이라 무해 (G2 는 market_type 이 이미 바뀌어 미매칭).
-- ============================================================

-- ── G1. 정본과 완전 중복인 오분류 행 삭제 ──────────────────────────
DELETE FROM public.history_futures_liquidation b
WHERE b.market_type = 'futures_coinm'
  AND strpos(b.symbol, '_') = 0
  AND EXISTS (
    SELECT 1
    FROM public.history_futures_liquidation u
    WHERE u.market_type = 'futures_usdm'
      AND u.exchange   = b.exchange
      AND u.symbol     = b.symbol
      AND u.side       = b.side
      AND u.trade_time = b.trade_time
      AND u.quantity   = b.quantity
      AND u.price      = b.price
  );

-- ── G2. 남은 유일 사본을 USDM 으로 교정 + notional 재계산 ───────────
UPDATE public.history_futures_liquidation b
SET market_type = 'futures_usdm',
    notional = (
      SELECT CASE
               WHEN calc.n > 0 AND calc.n <= 1000000000 THEN calc.n
               ELSE NULL
             END
      FROM (
        SELECT (CASE WHEN COALESCE(b.accumulated_qty, 0) > 0
                     THEN b.accumulated_qty ELSE b.quantity END)
             * (CASE WHEN COALESCE(b.avg_price, 0) > 0
                     THEN b.avg_price ELSE b.price END) AS n
      ) AS calc
    )
WHERE b.market_type = 'futures_coinm'
  AND strpos(b.symbol, '_') = 0;

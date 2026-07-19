-- ============================================================
-- 🔴 청산 마켓 오분류 방어 트리거 (M3-step3a 착수 중 발견, 2026-07-19)
--
-- 증상:
--   history_futures_liquidation 에 market_type='futures_coinm' 인데 심볼이
--   USDT/USD1 페어인 행 1,232건 (2026-07-09 ~ 07-17, 14 심볼).
--
-- 근본원인 (backend-infra-specialist 진단 2026-07-19, 코드 역산 + DB 실측):
--   Binance CM migration(2026-06-30) 이후 `!forceOrder@arr` 는 UM+CM 병합 스트림.
--   ① 권위 판별자 `st`(1=UM/2=CM) 분기는 **죽은 코드** — forceOrder 페이로드에
--      `st` 가 애초에 없다(ticker 에는 있음, 스트림마다 다름). 역산 증명: st 가
--      숫자였다면 UM 이벤트는 st=1 ≠ expectedSt(2) 로 반드시 drop 됐을 것.
--   ② 실제 유일 방어선인 폴백이 **fail-open**:
--      "상대 마켓 allowlist 에 **있다고 확인될 때만** drop" → 신규 상장 심볼은
--      워커 인메모리 allowlist(24h 갱신)에 없어 **모르면 통과**된다.
--      (ticker/markPrice 는 "자기 마켓 allowlist 에 있는 것만 수용" = fail-closed
--       라 구조적으로 면역. 청산만 "이력 보존" 정책으로 양성 필터를 우회했다.)
--   ⇒ 오염 창 = 상장 시각 → 다음 24h 인메모리 refresh (최대 ~24h).
--      실측 7건이 전부 워커 재부팅(07-14 04:26 UTC) 기준 refresh 경계와 일치.
--
-- 이 트리거의 위치:
--   **임시 방어선**이다. 근본 수정은 워커(forceOrderWsHandler 마켓 판별을
--   fail-closed 로 전환)이며 다음 워커 사이클에서 수행한다 — 그때 M3-plan
--   §트랙⑤ 규약상 [10-110](워커 재시작 견고화)이 Step 0 으로 동반된다.
--   워커 수정 후에도 이 트리거는 2중 안전망으로 존치 가능.
--
-- 왜 "교정"이 아니라 "폐기"인가 (★ 자문안을 CTO 가 수정한 지점):
--   자문 초안은 market_type 을 futures_usdm 으로 **교정**하자고 했으나 기각.
--   이 테이블의 유일 제약은 PRIMARY KEY(id) 뿐 — **중복 방지 장치가 없다**.
--   KORUUSDT 실측 712행이 USDM 정본과 **100% 완전 중복**이었듯, 정본이 따로
--   들어오는 케이스에서 교정은 곧 중복 생성 = 청산 총액 2배 오염(더 나쁨).
--   폐기는 두 케이스 모두에서 현 상태보다 엄격히 낫다:
--     - 신규 상장 건: 어차피 지금도 **틀린 라벨**로 저장돼 못 쓰는 데이터
--     - 정본 중복 건: 중복이므로 버리는 것이 정답
--   ⚠️ 대가 = 신규 상장 초기 청산 이력의 무음 손실. 워커 근본 수정 전까지의
--      과도기 비용으로 수용하며, RAISE WARNING 으로 관측 가능하게 둔다.
--
-- 판별식:
--   Binance COINM 심볼은 예외 없이 `_` 를 포함(BTCUSD_PERP / BTCUSD_260925).
--   USDM 심볼은 절대 포함하지 않는다. allowlist 스냅샷과 달리 **시간에 의존하지
--   않는 구조 불변식**이라 상장 3초 후에도 유효.
--   ★ `symbol LIKE '%USDT'` 로 쓰지 말 것 — 2026-07-20 상장 예정 SPCXUSD1 은
--     quote 가 USD1 이라 누락된다. 반드시 `_` 미포함으로 판정.
--   ⚠️ Binance 한정 가정. 타 거래소 어댑터 추가 시 재검토 (위생 #8).
--   ref: Binance USDⓈ-M/COIN-M symbol naming, 조회 2026-07-19
--
-- 안전:
--   - BEFORE INSERT + RETURN NULL = 해당 행만 건너뜀 (배치의 나머지 행 무영향).
--   - 정상 COINM(`BTCUSD_PERP`)·정상 USDM 은 판정이 바뀌지 않음 → 회귀 0.
--   - 되돌리기: DROP TRIGGER trg_liq_reject_mislabeled_coinm ON ...
-- ============================================================

CREATE OR REPLACE FUNCTION public.liq_reject_mislabeled_coinm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- COINM 라벨인데 심볼에 '_' 가 없다 = 병합 스트림에서 새어든 USDM 이벤트.
  IF NEW.market_type = 'futures_coinm' AND strpos(NEW.symbol, '_') = 0 THEN
    RAISE WARNING '[liq-market-guard] dropped mislabeled COINM liquidation: symbol=% trade_time=%',
      NEW.symbol, NEW.trade_time;
    RETURN NULL; -- 이 행만 삽입 취소
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.liq_reject_mislabeled_coinm() IS
  'Temporary guard (2026-07-19): drops liquidation rows labelled futures_coinm whose symbol lacks an underscore. Binance COIN-M symbols always contain "_" (BTCUSD_PERP); USDM never does. Root fix belongs in the worker forceOrder market discrimination (fail-open fallback). Emits a WARNING per drop so contamination stays observable.';

DROP TRIGGER IF EXISTS trg_liq_reject_mislabeled_coinm ON public.history_futures_liquidation;

CREATE TRIGGER trg_liq_reject_mislabeled_coinm
  BEFORE INSERT ON public.history_futures_liquidation
  FOR EACH ROW
  EXECUTE FUNCTION public.liq_reject_mislabeled_coinm();

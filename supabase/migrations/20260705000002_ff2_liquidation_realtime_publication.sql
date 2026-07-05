-- ============================================================
-- 청산 테이블 Realtime publication 추가 (ff#2 재개 Step 4, 2026-07-05)
--
-- 목적:
--   table-card 의 8번째 datasource(liquidation)가 useDataServiceTable 의 기존
--   "초기 SELECT + Realtime 구독" 경로로 INSERT 를 실시간 수신 — 코드 0줄로
--   "recent/biggest liquidations" 표가 살아있는 표가 된다.
--
-- 근거 (사용자 결정 2026-07-05 — 계획 원안 '주기 pull' 을 실측으로 뒤집음):
--   [10-77] Realtime 청구 주범 = now_futures_indicator markPrice 초당 churn.
--   청산 INSERT 는 평시 분당 ~2.4건 / 일 ~3.5천 건 — 메시지 규모가 3자릿수 낮아
--   publication 추가 비용이 미미. 주기 pull 신설(인프라+스키마)보다 단순·실시간.
--
-- 안전:
--   RLS SELECT 정책(anon+authenticated)은 M1.4 Step 4.5 부터 존재 — Realtime
--   postgres_changes 는 그 정책을 그대로 따른다. 정책 변경 없음.
-- ============================================================

-- 멱등 가드 (code-reviewer W3) — 이미 추가된 상태에서 재실행해도 에러 없이 skip.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'history_futures_liquidation'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.history_futures_liquidation;
  END IF;
END $$;

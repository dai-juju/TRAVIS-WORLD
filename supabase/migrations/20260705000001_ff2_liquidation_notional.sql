-- ============================================================
-- [10-72] 청산 notional(USD) 컬럼 (ff#2 재개 Step 2, 2026-07-05)
--
-- 목적:
--   - 경로 A 방송 payload 와 경로 B history 저장의 drift 원천 제거
--     (payload-only enrich 안은 "biggest liquidations" table 정렬 불가 +
--      seed/과거 조회 시 notional 결측 비대칭 함정이 있어 기각).
--   - table-card 의 "biggest liquidations" 정렬 타깃.
--
-- 계산 (워커 forceOrderWsHandler enrich, canonical-metrics.md §Liquidation):
--   수량 폴백(z→q) × 가격 폴백(ap→p) 의 2축 곱 — 체결분(z)·체결가(ap) 우선.
--   USDM : zEff × apEff  (zEff = z>0 ? z : q, apEff = ap>0 ? ap : p)
--   COINM: zEff × contractSize (인버스 — 가격 곱 X. dapi exchangeInfo, 워커 인메모리 맵)
--
-- 안전:
--   - nullable + DEFAULT 없음 → ADD COLUMN 은 메타데이터 변경만
--     (테이블 리라이트 0, 라이브 INSERT 무영향, 대용량 무관 즉시 완료).
--   - 과거 행 backfill 없음 — NULL = 2026-07 rollout 이전 이벤트 (카드 "—" graceful).
--   - RLS/정책 변경 없음 (기존 테이블 정책 그대로 상속).
-- ============================================================

ALTER TABLE public.history_futures_liquidation
  ADD COLUMN IF NOT EXISTS notional double precision;

COMMENT ON COLUMN public.history_futures_liquidation.notional IS
  'USD notional of the liquidation event. USDM: zEff*apEff (zEff=z>0?z:q, apEff=ap>0?ap:p). COINM: zEff*contractSize (inverse contract - no price multiplication). NULL for events before 2026-07 rollout.';

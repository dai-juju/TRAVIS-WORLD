-- ========================================================================
-- M2 Disk Retention 묶음 S3 — pg_cron 기반 interval별 차등 retention
-- ========================================================================
-- 작성일: 2026-06-13 (M2 확장 루프, deferred [10-34]/[8-18] 회수)
-- 단일 진실 원천: docs/task-record/M2-history-retention.md + docs/DB_SCHEMA.md
--
-- 실행: Supabase Dashboard SQL Editor 에서 통째 실행 (MCP read-only → apply_migration 불가).
--   CREATE EXTENSION + PROCEDURE + cron.schedule 은 트랜잭션 안전(원자적 실행 무방).
--   ⚠️ PROCEDURE CALL(첫 청소)은 본 마이그레이션과 **별도로** 실행 — 아래 §첫 청소 참조.
--
-- 배경 (deferred [10-34]/[8-18]):
--   history_futures_indicator 가 retention 정책 부재로 27일치(767만 행, ~136MB/일) 누적 →
--   ~4주 내 8GB 한도 도달. 사용자 확정 보존정책(2026-06-13, 변경 금지):
--     단주기 5m/15m/30m = 14일 / 중주기 1h/2h/4h = 60일 / 장주기 6h/12h/1d = 180일.
--
-- 방식 선택 (방식 B = pg_cron 배치 DELETE):
--   native partition(방식 A)은 차등 보존과 안 맞고(날짜 파티션에 3보존군 혼재 → 통째 drop 불가)
--   라이브 767만 행 무중단 전환 위험이 커서 제외. interval별 차등은 DELETE WHERE 와 자연 정합.
--   파티션은 억 단위 성장 시 [8-18] 재평가.
--
-- IO 안전 설계 (6/11 Disk IO 고갈 사고 재현 방지):
--   - PROCEDURE(함수 아님): 배치마다 COMMIT → 단일 거대 트랜잭션 회피(WAL/lock 분산).
--   - ctid 기반 LIMIT 8000 배치 + pg_sleep(0.5) → IO 스파이크 완화.
--   - pg_try_advisory_lock: cron 겹침/중복 CALL 시 1개만 실행(나머지 즉시 반환).
--   - VACUUM FULL 금지(ACCESS EXCLUSIVE, 라이브 불가) — 일반 autovacuum 에 맡김.
-- RLS/보안: 방식 B 는 테이블 동일 → RLS policy 무변경, 영향 0.
-- ========================================================================

-- 1) pg_cron 확장 (현재 미설치, available 확인됨 2026-06-13)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2) retention PROCEDURE — interval별 차등 cutoff 배치 삭제 (COMMIT 분리)
CREATE OR REPLACE PROCEDURE public.prune_history_futures_indicator()
LANGUAGE plpgsql AS $$
DECLARE
  deleted_count int;
  total_deleted bigint := 0;
BEGIN
  -- 동시 실행 방지: 이미 다른 세션(cron 겹침/수동 CALL)이 돌고 있으면 즉시 반환
  IF NOT pg_try_advisory_lock(774411001) THEN
    RAISE NOTICE 'prune_history_futures_indicator: already running — skip';
    RETURN;
  END IF;

  LOOP
    DELETE FROM public.history_futures_indicator
    WHERE ctid IN (
      SELECT ctid FROM public.history_futures_indicator
      WHERE (interval IN ('5m','15m','30m') AND recorded_at < now() - interval '14 days')
         OR (interval IN ('1h','2h','4h')   AND recorded_at < now() - interval '60 days')
         OR (interval IN ('6h','12h','1d')  AND recorded_at < now() - interval '180 days')
      LIMIT 8000
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    COMMIT;                       -- 배치 단위 커밋: WAL/lock 부담 분산
    EXIT WHEN deleted_count = 0;   -- 더 지울 게 없으면 종료
    PERFORM pg_sleep(0.5);         -- IO 스파이크 완화 (배치 간 휴식)
  END LOOP;

  PERFORM pg_advisory_unlock(774411001);
  RAISE NOTICE 'prune_history_futures_indicator: done, % rows deleted', total_deleted;
END;
$$;

-- 3) 정규 cron — 매일 UTC 18:00 (= KST 03:00, 저트래픽 + forward-fill long 그룹 휴식대)
--    안정 상태에선 일 삽입량(~25만 행)만 삭제 = 테이블 크기 평형.
SELECT cron.schedule(
  'prune-hist-futures-indicator',
  '0 18 * * *',
  $$CALL public.prune_history_futures_indicator()$$
);

-- ========================================================================
-- §첫 청소 (별도 실행 — 본 마이그레이션 적용 후):
--   첫 실행은 27일치 중 단주기 14일 초과분 ~342만 행 삭제(1회성 대량).
--   Dashboard 직접 CALL 은 (a) statement timeout (b) SQL Editor 트랜잭션 래핑→COMMIT 에러
--   위험 → cron 백그라운드로 실행(둘 다 회피). 임시 매분 job 등록 → advisory lock 으로
--   1개만 실행 → 완료(삭제 0) 후 unschedule:
--     SELECT cron.schedule('prune-first-run', '* * * * *',
--                          $$CALL public.prune_history_futures_indicator()$$);
--     -- (수 분 모니터 후 삭제가 멈추면)
--     SELECT cron.unschedule('prune-first-run');
--
-- 검증 (적용 후):
--   (a) SELECT jobname, schedule FROM cron.job;  -- prune-hist-futures-indicator 등록 확인
--   (b) SELECT count(*) FROM history_futures_indicator;  -- 첫 청소 후 ~342만 감소
--   (c) cron.job_run_details 로 실행 이력/성공 확인
-- ========================================================================

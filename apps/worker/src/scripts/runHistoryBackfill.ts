// ============================================================
// runHistoryBackfill — 별도 IP one-shot backfill 스크립트 (M1.8.5 Step 4, 2026-05-31)
//
// 목적:
//   history_futures_indicator 14일 backfill 을 **production(Hetzner) IP 가 아닌 별도 IP**
//   (예: 개발자 로컬 PC)에서 1회 실행. production perSymbolTask 와 IP 를 공유하지 않아
//   Binance /futures/data IP quota 충돌(-1003 ban) 0 → 150 req/min 안전 + ~6~8h 완료.
//
// 실측 배경 (2026-05-31):
//   Hetzner worker 에서 backfill 활성화 시 production 과 같은 IP → -1003 IP ban 발생
//   (production 수집도 동시 차단). 따라서 worker task 는 dryRun:true 차단, 본 스크립트로 대체.
//
// 사용법 (로컬 PowerShell, repo 루트에서):
//   1) .env 파일에 두 줄 (Hetzner /etc/travis/worker.env 와 동일 값):
//        SUPABASE_URL=...
//        SUPABASE_SERVICE_ROLE_KEY=...
//   2) 실행:
//        pnpm -F @travis/worker exec tsx --env-file=.env src/scripts/runHistoryBackfill.ts
//      (또는 PowerShell 에서 $env:SUPABASE_URL / $env:SUPABASE_SERVICE_ROLE_KEY 설정 후
//        pnpm -F @travis/worker exec tsx src/scripts/runHistoryBackfill.ts)
//   3) 진행 로그(누적 rows 증가) 관찰. 완료 시 요약 출력 후 자동 종료.
//
//   옵션 env:
//     BACKFILL_REQ_PER_MIN (기본 150) / BACKFILL_LOOKBACK_DAYS (기본 14)
//
// ⚠️ production(Hetzner) 에서 실행 금지 — IP ban 재발. 반드시 별도 IP(로컬 PC 등)에서.
//
// task-record: docs/task-record/M1.8.5-step4-deploy.md
// ============================================================

import { dataService } from "../dataService.js";
import { executeHistoryBackfill } from "../poller/tasks/historyBackfillCore.js";

const REQ_PER_MIN = Number(process.env.BACKFILL_REQ_PER_MIN ?? 150);
const LOOKBACK_DAYS = Number(process.env.BACKFILL_LOOKBACK_DAYS ?? 14);

async function main(): Promise<void> {
  if (!dataService) {
    console.error(
      "[runHistoryBackfill] ❌ Supabase 미설정 — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요 (.env 또는 $env:).",
    );
    process.exit(1);
    return;
  }
  if (!Number.isFinite(REQ_PER_MIN) || REQ_PER_MIN <= 0) {
    console.error(`[runHistoryBackfill] ❌ BACKFILL_REQ_PER_MIN 비유효: ${process.env.BACKFILL_REQ_PER_MIN}`);
    process.exit(1);
    return;
  }

  console.log(
    `[runHistoryBackfill] 🚀 시작 — lookback ${LOOKBACK_DAYS}일, ${REQ_PER_MIN} req/min, 6 metric × 9 interval.\n` +
      `  ⚠️ 이 스크립트는 별도 IP(로컬 PC 등)에서만 실행하세요. production Hetzner 에서 실행 시 IP ban 재발.\n` +
      `  예상 ~6~8h. 진행 로그(누적 rows)를 관찰하세요. Ctrl+C 로 중단 가능 (재실행 시 ON CONFLICT 멱등).`,
  );

  try {
    const result = await executeHistoryBackfill({
      dataService,
      reqPerMin: REQ_PER_MIN,
      lookbackDays: LOOKBACK_DAYS,
      onProgress: (m) => console.log(m),
    });
    console.log(
      `\n[runHistoryBackfill] ✅ 완료\n` +
        `  - 심볼: ${result.symbolCount}개\n` +
        `  - 적재 row: ${result.totalRows.toLocaleString()}\n` +
        `  - 실패 페이지: ${result.failedPages}\n` +
        `  - 소요: ${(result.elapsedMin / 60).toFixed(1)}h (${result.elapsedMin.toFixed(0)}분)\n` +
        `  다음: Supabase 검증 쿼리 5종 (Step 5).`,
    );
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[runHistoryBackfill] ❌ 예외: ${msg}`);
    process.exit(1);
  }
}

void main();

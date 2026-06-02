// ============================================================
// forwardFillTask — history forward-fill 수집 task (M1.9 Step 1 골격 / Step 2 본구현).
//
// ⚠️ 현재는 **STUB** — execute 가 dryRun 로그만 남기고 실제 fetch/upsert 0.
//    실 forward-fill 로직(증분 윈도잉 + executeHistoryBackfill 활용 + state machine)은
//    M1.9 Step 2 에서 채운다. 본 Step 은 배포 단위(apps/collector-history) 골격만 세움.
//
// 설계 의도 (YAGNI):
//   - createForwardFillTask(deps) 가 PollTask 1개 반환.
//   - index.ts 는 poller.register(createForwardFillTask(...)) 한 줄 — 미래 task 는
//     register 추가만으로 확장 (TierPoller 무수정, 범용 골격).
//   - deps.dataService 는 Step 2 실 upsert 경로에서 사용. 현재는 미사용이지만
//     시그니처를 미리 확정해 Step 2 가 본문만 채우면 되도록 함.
//
// 별도 IP 근거: production worker 와 같은 IP 로 backfill 시 Binance /futures/data
//   IP quota(1000 req/5min) 초과 → -1003 ban 실측(2026-05-31). 이 수집기는 별도
//   Hetzner 서버(별도 IP)에서 돌아 충돌 회피.
// ============================================================

import type { IDataService } from "@travis/data-service";
import type { PollTask } from "@travis/shared";

/** forward-fill cycle 주기 (execute 완료 후 최소 휴식). Step 2 에서 증분 주기로 조정. */
const INTERVAL_MS = 5 * 60 * 1000;

/** 환경변수 rate (req/min). 미설정 시 보수 기본값. Step 2 본구현에서 throttle 에 사용. */
const DEFAULT_REQ_PER_MIN = 150;

export interface ForwardFillTaskDeps {
  /** Step 2 실 upsert 경로에서 사용 (현재 STUB 은 미참조). */
  dataService: IDataService;
  /** rate limit (req/min). 미지정 시 DEFAULT_REQ_PER_MIN. */
  reqPerMin?: number;
}

/**
 * forward-fill task 생성 (STUB).
 * Step 2 까지는 execute 가 무동작 로그만 — TierPoller 가 정상 스케줄/모니터링되는지만 확인.
 */
export function createForwardFillTask(deps: ForwardFillTaskDeps): PollTask {
  const reqPerMin = deps.reqPerMin ?? DEFAULT_REQ_PER_MIN;
  return {
    id: "binance-history-forward-fill",
    tier: "low",
    intervalMs: INTERVAL_MS,
    execute: () => runForwardFillStub(reqPerMin),
  };
}

/**
 * STUB 실행 — dryRun 로그만. 실제 fetch/upsert 없음 (Step 2 본구현 예정).
 * deps.dataService 미참조 (Step 2 에서 활성).
 */
async function runForwardFillStub(reqPerMin: number): Promise<void> {
  console.log(
    `[forwardFill:stub] dryRun — 실 fetch/upsert 0 (Step 2 본구현 예정). reqPerMin=${reqPerMin}`,
  );
}

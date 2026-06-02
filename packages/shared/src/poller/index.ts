/**
 * 폴링 스케줄러 배럴 (M1.9 Step 1, 2026-06-02).
 *
 * apps/worker · apps/collector-history 가 공유하는 거래소-무관 폴링 인프라.
 *   - PollTask / IPoller / PollStatus: 계약
 *   - TierPoller: 구현체 (setTimeout 재귀, graceful shutdown, throw 차단)
 */

export { TierPoller } from "./TierPoller";
export type { IPoller, PollTask, PollStatus } from "./IPoller";

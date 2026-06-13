// ============================================================
// forwardFillWindow — forward-fill 증분 시작점 계산 (순수 함수, M1.9 Step 2-B).
//
// forward-fill 의 핵심 결정 1줄: "DB 최신 봉(anchor) 부터 / 최초면 폴백 lookback 부터".
// 네트워크·DB 의존 0 의 순수 함수로 분리 — worker test suite 에서 단위 검증
// (historyFutures normalize 와 동일 패턴: 패키지 함수를 worker vitest 가 import).
//
// task-record: docs/task-record/M1.9-step2-forward-fill.md §2-B
// ============================================================

/**
 * forward-fill 증분 윈도우의 안전 lookback 봉 수.
 *
 * startMs = anchor - N*interval 부터 **now 까지 전체**를 재수집(자연키 upsert = 멱등).
 * → anchor~now 사이의 모든 봉은 N 과 무관하게 항상 채워진다(cycle 을 몇 번 건너뛰든
 *   anchor 기준이라 공백에 강건). 따라서 N 의 유일한 역할은 **anchor 봉**(직전 cycle 에
 *   forming/incomplete 였을 수 있는 단 1봉)을 재방문해 최종값으로 보정하는 것.
 *   forming 가능한 봉은 가장 최근 1봉뿐 → N=1 로 충분.
 *
 * ★ 2→1 축소 ([10-15] 인덱스/IO 다이어트, 2026-06-13): N=2 는 이미 확정된 직전 봉까지
 *   불필요하게 재방문(=같은 값 재쓰기)해 매 cycle dead tuple 을 양산했다(라이브 18.7%).
 *   1봉으로 줄이면 cycle·심볼·interval 당 재쓰기 1봉을 절감 → autovacuum IO 부담↓.
 *   anchor 봉 재방문(forming 보정)은 그대로 보장된다(startMs ≤ anchor).
 */
export const FORWARD_FILL_SAFETY_BARS = 1;

/**
 * forward-fill 증분 시작점(epoch ms) — 순수 함수.
 *
 * @param anchorMs DB 최신 recorded_at(ms). null = 해당 (market, interval) 미수집(예: COINM 최초 가동).
 * @param intervalMs 해당 interval 의 봉 폭(ms).
 * @param nowMs 현재 시각(ms).
 * @param defaultLookbackMs anchor null 시 폴백 lookback.
 * @returns startMs — `executeHistoryBackfill` 의 `startMsOverride` 로 주입.
 *
 * - anchor 있음: `anchorMs - SAFETY_BARS*intervalMs` (마지막 N봉 재수집, 멱등).
 * - anchor 없음: `nowMs - defaultLookbackMs` (최초 가동 폴백).
 * - 결과가 nowMs 초과(시계 역행/이상)면 nowMs 로 clamp → 빈 윈도우(0 row) graceful.
 */
export function computeForwardFillStartMs(
  anchorMs: number | null,
  intervalMs: number,
  nowMs: number,
  defaultLookbackMs: number,
): number {
  const raw =
    anchorMs === null
      ? nowMs - defaultLookbackMs
      : anchorMs - FORWARD_FILL_SAFETY_BARS * intervalMs;
  return Math.min(raw, nowMs);
}

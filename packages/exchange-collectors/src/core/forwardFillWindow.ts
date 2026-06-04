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
 * 마지막 N봉을 재수집(자연키 upsert = 멱등)해, 직전 cycle 시점에 forming/incomplete
 * 였던 봉이 최종값으로 갱신되도록 보정. §5 "최근 1~2봉" 정합.
 */
export const FORWARD_FILL_SAFETY_BARS = 2;

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

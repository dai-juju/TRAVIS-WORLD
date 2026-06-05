// ============================================================
// abortableSleep — AbortSignal 협조적 취소 가능한 sleep ([8-31]ⓑ, 2026-06-05).
//
// 배경 (왜 필요한가):
//   forward-fill 한 cycle(interval × symbol × 6 metric)이 수분 걸린다. 그 안에서 가장 긴
//   "대기"는 두 종류 — (1) PerMetricThrottle 호출 간격 sleep, (2) token-bucket 토큰 부족 await.
//   SIGTERM 수신 시 이 대기가 끝날 때까지(최대 수초) 프로세스가 안 죽으면 systemd
//   TimeoutStopSec 을 넘겨 SIGKILL → "failed" 기록 (M1.9 Step 3 라이브 실측 2026-06-05).
//   따라서 대기 중에도 abort 가 오면 즉시 깨어나야 한다.
//
// 설계:
//   - signal 미지정 시 = 평범한 setTimeout sleep (기존 동작 불변 — worker 경로 회귀 0).
//   - signal 지정 시 = setTimeout 과 abort 이벤트 중 먼저 오는 쪽에 resolve.
//     ★ abort 로 깨어나도 reject 가 아니라 resolve 한다(graceful) — 호출자는 sleep 직후
//       signal.aborted 를 체크해 graceful return 하면 되고, throw 핸들링이 불필요.
//   - 이미 aborted 인 signal 이면 즉시 resolve (대기 0).
//   - 타이머/리스너 누수 방지: 어느 쪽이 깨우든 양쪽 다 정리.
//
// 결정론 테스트: setTimeout/AbortController 표준 API 만 사용 — fake timer 로 검증 가능.
// ============================================================

/**
 * ms 만큼 sleep 하되, signal 이 abort 되면 즉시 깨어난다(throw 하지 않음, graceful).
 *
 * @param ms     대기 시간(ms). 0 이하면 즉시 resolve.
 * @param signal 취소 signal(옵션). 미지정 시 평범한 sleep.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  // signal 없으면 기존 sleep 과 동일 (worker 경로 회귀 0).
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // 이미 취소됐으면 대기 없이 즉시 반환 (호출자가 직후 aborted 체크 → graceful return).
  if (signal.aborted) return Promise.resolve();
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve) => {
    // 타이머와 abort 리스너 중 먼저 발생하는 쪽이 resolve. 양쪽 다 정리해 누수 방지.
    const onDone = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = (): void => onDone();
    const timer = setTimeout(onDone, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

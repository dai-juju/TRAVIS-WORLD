// ============================================================
// perMetricThrottle — per-metric REST 호출 간격 throttle ([8-31]ⓒ, 2026-06-05).
//
// 배경: backfill loop 가 metric 들을 순차 호출할 때 두 종류의 최소 간격을 동시에 지켜야 한다.
//   (1) 공통 floor (= 60000/reqPerMin): 직전 "아무" 호출과의 간격 — 전체 req/min 상한 보장.
//   (2) metric 자체 floor (예: basis 2400ms): 그 metric **자기 자신**의 직전 호출과의 간격
//       — basis 만 fapi weight 풀(2400/min)에 걸려 빈도 하향 필요(-1003 회피).
//
// 기존 버그(Step 3 즉효 fix): 단일 lastRestCallAt 을 모든 metric 이 공유 → basis floor(2400)가
//   "직전 호출이 OI/taker 든 뭐든"에 걸려 cycle 이 심볼수×(2400-공통)ms 만큼 팽창.
//   본 모듈은 metric 별 마지막 호출 시각을 추적해 metric floor 를 그 metric 자신에만 적용한다.
//
// ⚠️ 과장 금지: 이 fix 의 lag 개선은 ~14%(basis 의 부당한 cycle 팽창 제거분)뿐. lag 의 진짜
//   주범은 "심볼수×metric÷reqPerMin = cycle 하한"이라는 폴링 구조 자체(근본 해소는 별도 IP/
//   reqPerMin 증액 또는 [8-31]ⓐ token-bucket). 본 모듈은 산식 정확화 + 구조 정리가 목적.
//
// 순수 분리 이유: throttle 산식(대기 ms 계산)을 결정론적으로 단위 테스트하기 위함
//   (executeHistoryBackfill 통합 테스트는 패키지 경계로 fetcher mock 이 어려움).
// ============================================================

/**
 * per-metric throttle 상태 + 대기 산식. sleep 은 호출자(루프)가 수행 — 본 클래스는 순수 계산만.
 *
 * 사용:
 *   const t = new PerMetricThrottle(commonFloorMs);
 *   const waitMs = t.reserve("basis", 2400, Date.now());  // 대기해야 할 ms
 *   if (waitMs > 0) await sleep(waitMs);                   // 호출자가 sleep
 *   // reserve 가 이미 "호출 시각 = now + waitMs" 로 상태를 전진시켜 둠 (다음 reserve 정합).
 */
export class PerMetricThrottle {
  private lastAnyCallAt = 0;
  private readonly lastCallAtByMetric = new Map<string, number>();

  constructor(private readonly commonFloorMs: number) {}

  /**
   * (metricName, metricFloorMs) 호출을 예약하고 필요한 대기 ms 를 반환.
   * @param now 현재 시각(epoch ms) — 테스트 결정성 위해 주입.
   * @returns sleep 해야 할 ms (0 이면 즉시 호출 가능).
   */
  reserve(metricName: string, metricFloorMs: number, now: number): number {
    // (1) 공통 floor — 직전 아무 호출 대비.
    const commonWait = this.commonFloorMs - (now - this.lastAnyCallAt);
    // (2) metric 자체 floor — 같은 metric 직전 호출 대비.
    const lastSame = this.lastCallAtByMetric.get(metricName) ?? 0;
    const metricWait = metricFloorMs - (now - lastSame);
    const wait = Math.max(commonWait, metricWait, 0);
    // 상태 전진 기준 = now + wait (실제 호출 시각의 **하한**). 실제로는 fetch 소요시간만큼
    //   더 뒤에 다음 reserve 가 불리므로 다음 대기는 자연히 0 으로 클램프 — throttle 은 "하한
    //   보장"이 목적이라 실제 간격이 더 벌어지는 방향은 항상 안전(절대 하한보다 좁아지지 않음).
    const calledAt = now + wait;
    this.lastAnyCallAt = calledAt;
    this.lastCallAtByMetric.set(metricName, calledAt);
    return wait;
  }
}

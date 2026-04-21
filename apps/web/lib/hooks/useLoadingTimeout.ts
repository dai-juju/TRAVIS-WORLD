"use client";
/**
 * useLoadingTimeout — 초기 데이터 로드가 임계치를 넘으면 "stale" 플래그를 반환 (M1.4 Step 4-4).
 *
 * 사용처:
 *   TickerCard / CoinListCard / KlineChartCard 가 LOADING 상태로 장시간 머물 때
 *   "앱이 죽은 건가?" 라는 트레이더 오판을 방지하기 위한 graceful 안내 띄우기 용.
 *   데이터가 initialDelayMs 내에 오지 않으면 stale=true → 카드 하단에
 *   "연결 문제 가능 — 새로고침 권장" 메시지 노출.
 *
 * 설계:
 *   - hasData 가 true 로 바뀌는 순간 타이머 해제 + stale=false 유지
 *   - hasData 가 다시 false 로 돌아가면 새 타이머 시작 (재연결 시나리오 대비)
 *   - 카드 언마운트 / 재렌더 사이에 타이머 누수 없도록 cleanup
 *
 * 왜 카드별 훅인가 (전역 핸들러 대신):
 *   CoinListCard 의 로딩 기준과 KlineChartCard 의 기준이 다를 수 있고(차트는
 *   iframe 외부 서비스라 예외), 각 카드가 자신의 데이터 도착 여부만 판단하면
 *   되므로 훅으로 캡슐화.
 */

import { useEffect, useState } from "react";

export type UseLoadingTimeoutOptions = {
  /** 데이터가 수신되었는지 여부. true 면 타이머 무효화. */
  hasData: boolean;
  /** stale 로 판정할 대기 시간 (ms). 기본 8000. */
  initialDelayMs?: number;
};

export function useLoadingTimeout({
  hasData,
  initialDelayMs = 8000,
}: UseLoadingTimeoutOptions): { stale: boolean } {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // hasData 가 true 로 바뀌는 순간은 setStale(false) 동기 호출 — React 19
    // `react-hooks/set-state-in-effect` 룰이 적용되나 **실제 사용 케이스에서는
    // 가드 효과 없이 오히려 렌더를 유발** 하므로 그대로 둔다 (eslint-disable).
    //
    //   대안: async run() + void 래퍼를 썼으나 이는 await 가 없어 동기와 동등해
    //   규칙 회피 효과 없음(code-reviewer H-1). setTimeout 콜백 안의 setStale(true)
    //   는 규칙과 무관 (deferred callback).
    if (hasData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 타이머 리셋 목적
      setStale(false);
      return;
    }
    const handle = setTimeout(() => {
      setStale(true);
    }, initialDelayMs);
    return () => clearTimeout(handle);
  }, [hasData, initialDelayMs]);

  return { stale };
}

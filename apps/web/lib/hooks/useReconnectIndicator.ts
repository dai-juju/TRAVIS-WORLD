"use client";
/**
 * useReconnectIndicator — 경로 A 옵션 C 재연결 표시 상태기계 (Stage 1b Step 2, 2026-07-14).
 *
 * 옛 TickerCard/IndicatorCard 에 동형 중복돼 있던 검증된 코드의 이식 (신작 금지).
 * 원 결정: M2 경로 A Step 4 Phase B, [10-53](a), crypto-trader 자문 + 사용자 결정.
 *
 * 동작:
 *   경로 A(ws_direct)에서 연결이 끊기면 liveTopicManager.mapStatus 가 활성 토픽 동안의
 *   errored/closed 를 낙관적으로 subscribing(=loading)으로 매핑한다 → "status==='loading'
 *   && data 있음" 이 "값은 있는데 재연결 중" 신호. 소비 카드는:
 *   ① 값 흐림(opacity) ② "updated Ns ago" 로 마지막 갱신 노출 ③ 5초 유예 후 중립 문구.
 *   ★ 빨간 error 금지 — 경로 B(Supabase)가 라이브러리로 재연결을 흡수하던 체감 재현.
 *   realtime datasource(경로 B)에서는 mapStatus 가 이 낙관 매핑을 안 해 거의 안 켜짐.
 *
 * React 19 규칙 메모 (feedback_react_hooks_dual_rule_render_setstate):
 *   - W2 가드: mapStatus 는 최초 연결(connecting)도 loading 으로 매핑 → "한 번이라도
 *     ready 였는가" 플래그로 초기 로딩과 재연결을 구분 (첫 화면 흐림 방지).
 *   - "과거 기억" 값은 ref(refs 규칙)도 effect-setState(set-state-in-effect)도 위반 →
 *     **렌더 중 조건부 setState**(React 공식 패턴)가 유일 해. ready 도달 시 1회 true
 *     승격(이후 조건 false 로 안정) → 재렌더 1회뿐.
 *   - 시각은 순수 렌더값 now(5s 틱, useNow) 사용 — 렌더 중 Date.now() impure 회피.
 *     라벨이 5초 후 등장이라 5s 그래뉼 충분.
 */

import { useState } from "react";
import type { DataServiceStatus } from "@/lib/dataService";

export interface ReconnectIndicator {
  /** 값은 있는데 연결이 재수립 중 — 소비 카드는 값 영역 opacity 흐림. */
  reconnecting: boolean;
  /** 재연결 5초+ 지속 — "reconnecting…" 중립 문구 노출 시점. */
  showReconnectLabel: boolean;
}

export function useReconnectIndicator({
  status,
  hasData,
  now,
}: {
  status: DataServiceStatus;
  hasData: boolean;
  /** useNow(5000) 등 순수 렌더값 타임스탬프 (ms). */
  now: number;
}): ReconnectIndicator {
  // 한 번이라도 ready 였는지 — 렌더 입력이라 state (렌더 중 조건부 setState 패턴).
  const [hasConnected, setHasConnected] = useState(false);
  if (status === "ready" && !hasConnected) setHasConnected(true);

  const reconnecting = hasConnected && status === "loading" && hasData;

  // 재연결 시작 시각 — 경과시간 계산의 렌더 입력이라 state. reconnecting 전이를
  // 렌더 중 감지해 기록 (드문 이벤트라 추가 재렌더 무시 가능).
  const [reconnectStart, setReconnectStart] = useState<number | null>(null);
  if (reconnecting && reconnectStart === null) {
    setReconnectStart(now);
  } else if (!reconnecting && reconnectStart !== null) {
    setReconnectStart(null);
  }

  // 5초 유예 경과 여부 — now(5s 틱) 기준이라 라벨은 5~10초 사이 등장(브리프 깜빡임엔 안 뜸).
  const reconnectedFor =
    reconnecting && reconnectStart !== null ? now - reconnectStart : 0;
  const showReconnectLabel = reconnecting && reconnectedFor >= 5000;

  return { reconnecting, showReconnectLabel };
}

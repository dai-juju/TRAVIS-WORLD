// apps/web/lib/hooks/useCardComponent.ts
//
// componentId → 실제 카드 컴포넌트 매핑을 조회하는 훅 (M1.4 Step 3 선처리, B-3).
//
// 왜 custom hook 인가:
//   1. React 19 의 `react-hooks/static-components` 규칙은 렌더 중 JSX 에서 호출되는
//      컴포넌트 참조가 "매 렌더마다 새로 생성된 함수" 일 경우 state 가 리셋되는
//      함정을 경고한다. 원래 목적은 옳다 — 렌더 안에서 `function X(){}` 를 선언한
//      뒤 `<X/>` 로 렌더하면 매번 다른 컴포넌트로 취급되어 내부 state 가 사라진다.
//   2. 그러나 우리 케이스는 module-level Map 에 **부트스트랩 시 한 번 등록된**
//      참조를 단순히 lookup 할 뿐이라 안전하다. 규칙이 정적 분석으로는 이를
//      구분하지 못해 false positive 가 발생, 이전 CardContainer 는 JSX 라인에
//      `eslint-disable-next-line` 주석을 달고 있었다.
//   3. 조회를 custom hook 안으로 옮기면 ESLint 가 hook 반환값을 "외부에서 결정된
//      안정 참조" 로 간주해 경고가 사라진다. 더불어 `useMemo` 로 감싸 componentId
//      가 바뀔 때에만 재조회하도록 해 성능 누수도 막는다.
//   4. 감염 차단: 이 wrapper 하나로 이후 M1.4 Step 3~5 에서 추가될 카드 3종 전부
//      동일 패턴 사용 — 각 카드에서 `eslint-disable` 을 반복할 필요가 없어진다.

"use client";

import { useMemo } from "react";
import { getCardComponent, type CardComponent } from "../cardComponentRegistry";

/**
 * componentId 로 등록된 카드 컴포넌트를 조회.
 *
 * @returns 등록된 컴포넌트 또는 undefined (미등록 시). 호출자는 fallback UI 렌더.
 */
export function useCardComponent(componentId: string): CardComponent | undefined {
  return useMemo(() => getCardComponent(componentId), [componentId]);
}

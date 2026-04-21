// apps/web/lib/hooks/useIsMounted.ts
//
// 클라이언트 hydration 완료 여부 판정 훅 (M1.4 Step 3-1b, 2026-04-21).
//
// 용도:
//   SSR 과 클라이언트 첫 렌더 사이에 값이 달라지는 UI(themed image, localStorage
//   반영 버튼 등)에서 hydration mismatch 없이 "지금 브라우저에서 돌고 있나?" 를
//   판별.
//
// 왜 useSyncExternalStore 인가:
//   React 19 의 `react-hooks/set-state-in-effect` 규칙이 전통적 패턴
//   (`useState(false) + useEffect(() => setMounted(true), [])`) 을 거부한다.
//   useSyncExternalStore 는 서버 snapshot(false) 과 클라이언트 snapshot(true)
//   을 명시적으로 분리해 넘겨주는 React 정식 API 라 규칙 충돌 없이 동일 효과.
//   구독은 아무 일도 하지 않는 빈 함수로 충분하다 — 값이 한번 true 가 되면
//   바뀔 일이 없기 때문.
//
// 재사용:
//   ThemeToggle 외에도 localStorage 의존 UI 에서 동일 패턴이 필요. 이 훅 하나로
//   향후 M1.5+ 에서 확장할 때 중복 작성 방지.

"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useIsMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot);
}

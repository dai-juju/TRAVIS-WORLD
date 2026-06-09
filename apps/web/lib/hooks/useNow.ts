// apps/web/lib/hooks/useNow.ts
//
// 저빈도 "현재 시각" 틱 hook (M2 테마 A Step 2).
//
// IndicatorCard 의 freshness 라인("3m ago")이 데이터 갱신과 무관하게도 흘러가도록
// 일정 간격으로 now 를 갱신한다. OI/LSR/taker 카드는 ~5분 폴링이라 데이터 push 사이
// 간격이 길어, 이 틱이 없으면 상대시간이 멈춰 보인다.
//
// 저사양(Intel UHD 620) 고려: 기본 5s 간격 — 1s 류 고빈도 타이머를 다수 카드에 두지
// 않는다. setState 1회/5s 는 렌더 폭풍이 아니라 무시 가능 수준.

"use client";

import { useEffect, useState } from "react";

/**
 * intervalMs 간격으로 Date.now() 를 갱신해 반환.
 * @param intervalMs 갱신 간격(ms). 기본 5000.
 */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

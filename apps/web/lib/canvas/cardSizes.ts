/**
 * 사이즈 토큰 → 초기 px 매핑 (M1.4 Step 2, Step 4.6 개정 / M3-step1 에서 분리).
 *
 * 이 값들은 **React Flow Node 의 초기 width/height** 로 쓰이고 (actionDispatcher /
 * devInject / spawnCard 에서 주입), 그 이후엔 NodeResizer 드래그로 React Flow 가
 * 직접 노드 크기를 업데이트한다. CardContainer 자체는 `width:100% height:100%` 로
 * 부모 크기를 따르기만 한다.
 *
 * M3-step1 (2026-07-16) 분리 근거: 원래 CardContainer.tsx 소유였으나, 클릭 spawn
 *   경로가 생기면서 CardContainer → spawnCard → (사이즈 상수) 참조가 필요해짐 —
 *   상수가 CardContainer 에 남으면 순환 import(CardContainer ↔ spawnCard)가 생기므로
 *   컴포넌트 무의존 lib 모듈로 이동. 값 변경 없음(기계적 이동).
 */
export const CARD_SIZE_PX: Record<
  "sm" | "md" | "lg" | "xl",
  { w: number; h: number }
> = {
  sm: { w: 220, h: 140 },
  md: { w: 320, h: 220 },
  lg: { w: 480, h: 320 },
  xl: { w: 640, h: 440 },
};

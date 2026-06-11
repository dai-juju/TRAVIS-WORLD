// apps/web/lib/cards/flip.ts
//
// FLIP(First-Last-Invert-Play) 델타 계산 순수 함수 (M2 테마 A Step 4b, 2026-06-11).
//
// FLIP 기법: 순위가 바뀐 행을 "이전 위치에서 새 위치로 미끄러지듯" 보이게 한다.
//   1. First — 변경 전 각 행의 화면 y 좌표 기록
//   2. Last  — 변경 후 좌표 측정
//   3. Invert — 행을 transform 으로 이전 위치에 "되돌려" 놓음 (델타 적용)
//   4. Play  — transition 을 켜고 transform 을 0 으로 → 새 위치로 슬라이드
//
// 이 파일은 3단계의 "델타 계산" 만 담당하는 순수 함수 — DOM 없이 테스트 가능.
// DOM 측정/적용은 useListFlip 훅(useListFlip.ts) 책임.

/**
 * 이전/현재 y 좌표 맵에서 행별 이동 델타(prev - current)를 계산한다.
 *
 * - 양쪽 모두에 존재하고 위치가 바뀐 행만 결과에 포함 (델타 0 제외).
 * - 신규 진입 행(prev 없음)·이탈 행(current 없음)은 애니메이션 대상 아님 (YAGNI —
 *   진입은 그냥 나타나고 이탈은 그냥 사라진다. 저사양 절제).
 */
export function computeFlipDeltas(
  prevTops: ReadonlyMap<string, number>,
  currentTops: ReadonlyMap<string, number>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const [key, currentTop] of currentTops) {
    const prevTop = prevTops.get(key);
    if (prevTop === undefined) continue; // 신규 진입
    const delta = prevTop - currentTop;
    if (delta !== 0) deltas.set(key, delta);
  }
  return deltas;
}

/**
 * nodeFactory — AiCardConfig → React Flow TravisNode 변환의 공용 유틸.
 *
 * M3-step1 (2026-07-16): actionDispatcher.ts 의 module-private 함수들을 추출.
 *   AI 응답 경로(actionDispatcher)와 클릭 spawn 경로(lib/interaction/spawnCard)가
 *   동일한 노드 생성·id 유일화 로직을 공유해야 드리프트가 없다. 로직 변경 없음
 *   (기계적 이동) — 단위 의미·주석은 원문 보존.
 */
import {
  TRAVIS_CARD_NODE_TYPE,
  type TravisNode,
} from "@/lib/stores/canvasStore";
import type { AiCardConfig } from "@travis/shared";
import { CARD_SIZE_PX } from "./cardSizes";

/**
 * AiCardConfig → React Flow TravisNode 로 변환.
 *   position 이 없으면 index 기반으로 약간씩 어긋나게 배치해 겹침을 줄인다.
 *   devInject 의 randomSpawnPosition 과 달리, index 시드를 써서 동일 응답은
 *   동일 배치 → E2E 테스트 결정성 확보.
 */
export function buildTravisNode(config: AiCardConfig, index: number): TravisNode {
  const position = config.position ?? layoutSlot(index);
  // Step 4.6: React Flow NodeResizer 가 작동하려면 노드에 width/height 가
  // 심어져야 한다. 초기값은 size 토큰(sm/md/lg/xl) → px 매핑을 따름.
  const sizePx = CARD_SIZE_PX[config.size];
  return {
    id: config.id,
    type: TRAVIS_CARD_NODE_TYPE,
    position,
    width: sizePx.w,
    height: sizePx.h,
    data: { config },
  };
}

/**
 * 간단한 2x3 그리드 레이아웃 슬롯. 더 많은 카드는 자동으로 아래로 이어 붙는다.
 * 카드 사이즈 md(320x220) 기준 + 30px 마진.
 */
export function layoutSlot(index: number): { x: number; y: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 120 + col * 350,
    y: 80 + row * 250,
  };
}

/**
 * AI 가 요청한 id 가 canvas 에 이미 존재하면 short base36 nonce 를 붙여 유일화한다.
 *
 * 이 함수는 "AI 표현력 보존(슬러그 의미 유지) + React Flow 무결성(유일 id)" 두
 * 축을 모두 만족. 충돌이 없으면 원본을 그대로 반환해 "cosmic ray 급" 드문
 * 상황에서만 교체가 일어난다.
 *
 * nonce 길이 6 — 36^6 ≈ 2.2B 조합. 동일 베이스 id 에 대해 suffix 가 다시 충돌할
 * 확률은 실사용 규모(카드 수십~수백) 에서 무시 가능. 최악의 경우 `recursive`
 * 호출로 재시도. 무한 루프 방어는 최대 10회 반복 제한.
 */
export function resolveUniqueId(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  for (let attempt = 0; attempt < 10; attempt++) {
    const nonce = Math.random().toString(36).slice(2, 8);
    const candidate = `${desired}-${nonce}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 현실적으로 도달 불가 — 마지막 수단으로 timestamp 기반 유일 키
  return `${desired}-${Date.now().toString(36)}`;
}

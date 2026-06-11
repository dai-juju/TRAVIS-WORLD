// apps/web/lib/cards/renderableDatasource.ts
//
// 카드 ↔ datasource 렌더 가능성 가드 — **registry dataShapes 파생** (M2 테마 A
// Step 5, 2026-06-11 — Step 0 의 하드코딩 allowlist 를 약속대로 대체).
//
// 이력:
//   Step 0 (2026-06-09): F3 즉시 안전망 — ticker 2개 테이블 하드코딩 allowlist.
//   Step 3 (2026-06-11): AiCardConfigSchema superRefine 에 componentId↔datasource
//     dataShapes 결합 검증 추가 (AI 경로 1차 방어선).
//   Step 5 (2026-06-11): 본 모듈을 registry 파생으로 교체 — 단일 진실은
//     componentRegistry 의 dataShapes 선언. 새 카드/datasource 는 registerComponent
//     만 갱신하면 schema 검증과 본 표시 가드가 동시에 자동 반영된다.
//
// 2중 방어 구조:
//   1차 = schema superRefine (AI 가 잘못된 조합을 emit 한 시점에 거부 + self-correction)
//   2차 = 본 가드 (저장된 옛 뷰 복원·수동 config 등 schema 를 안 거친 경로의
//         렌더 직전 방어 — 깨진 화면 대신 graceful "coming soon").

import { getComponent } from "@travis/shared";

/**
 * 렌더 불가 datasource 안내 문구 (단일 진실 원천 — 카드들이 공유).
 * 미래 datasource 가 카드보다 먼저 등록되는 과도기에 항상 쓰이는 안전망 문구.
 */
export const COMING_SOON_LABEL = "this data view is coming soon";

/**
 * 해당 컴포넌트가 이 datasource 를 렌더할 수 있다고 registry 에 선언했는지.
 *
 * componentRegistry 의 dataShapes 선언에서 파생 — 하드코딩 명단 없음.
 * 미등록 컴포넌트/Nullish datasource 는 graceful false (절대 crash 금지).
 */
export function isDatasourceSupportedByComponent(
  componentId: string | undefined | null,
  datasource: string | undefined | null,
): boolean {
  if (typeof componentId !== "string" || componentId.length === 0) return false;
  if (typeof datasource !== "string" || datasource.length === 0) return false;
  const component = getComponent(componentId);
  if (!component) return false;
  return component.dataShapes.some((s) => s.datasourceId === datasource);
}

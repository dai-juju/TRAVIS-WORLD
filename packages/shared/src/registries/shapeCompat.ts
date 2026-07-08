/**
 * shape 호환성 헬퍼 (Composable Stage 2 Step 1, 2026-07-08).
 *
 * ★ 이것은 **렌더 게이트가 아니다** — 작동 게이트는 여전히 component.dataShapes
 *   멤버십(= "이 form 이 이 datasource 용 descriptor 팩을 실제로 가짐")이다.
 *   shape 교집합은 그 위에 얹는 **호환성 검사 레이어**: "dataShapes 에 나열된
 *   조합이 애초에 모양이 맞는가"를 등록/테스트 시점 불변식으로 시끄럽게 검증해
 *   무의미 조합(series 전용 데이터를 표 명단에 넣는 실수)을 개발 중에 잡는다.
 *
 * 순수 shape 로 게이트를 교체하지 않는 이유: descriptor 팩 없는 새 set datasource
 *   가 등록되는 순간 table-card 가 컬럼 렌더 근거 없이 통과 → 빈/깨진 표
 *   (F3 사고류 재발). shape 는 필요조건이지 충분조건이 아니다.
 *
 * 미래 용도: "새 데이터 등록 → 전 form 과의 가능/불가 자동 판정"(feasibility 진단).
 *   그 시점엔 "우리 데이터 레이어가 실제 서빙하는가(table 존재 등)" AND 조건이
 *   추가로 필요하다 (kline 은 shape=series 지만 TradingView 외부 서빙).
 */

import { getComponent } from "./componentRegistry";
import { getDatasource } from "./datasourceRegistry";
import type { DataShapeKind } from "./shapeKind";

/**
 * form 이 이 datasource 를 모양 관점에서 렌더 가능한 shape 교집합.
 * 미등록/미태깅/nullish 입력은 graceful 빈 배열 (절대 throw 금지).
 */
export function shapeIntersection(
  componentId: string | undefined | null,
  datasourceId: string | undefined | null,
): DataShapeKind[] {
  if (typeof componentId !== "string" || componentId.length === 0) return [];
  if (typeof datasourceId !== "string" || datasourceId.length === 0) return [];
  const accepts = getComponent(componentId)?.acceptsShapes;
  const serves = getDatasource(datasourceId)?.servableShapes;
  if (!accepts || !serves) return []; // 미태깅 = graceful 빈집합
  const servable = new Set(serves);
  return accepts.filter((kind) => servable.has(kind));
}

/**
 * 모양 궁합 여부 — 등록시점 불변식 + 미래 feasibility 진단 전용 (렌더 게이트 아님).
 */
export function areShapesCompatible(
  componentId: string | undefined | null,
  datasourceId: string | undefined | null,
): boolean {
  return shapeIntersection(componentId, datasourceId).length > 0;
}

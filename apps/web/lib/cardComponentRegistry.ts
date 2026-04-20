/**
 * 프론트 전용 카드 컴포넌트 레지스트리 (M1.4 Step 2).
 *
 * 책임 분리:
 *   - packages/shared/src/registries/componentRegistry.ts
 *       → AI-facing 메타데이터. `generatePromptInjection()` 으로 직렬화돼 프롬프트에 주입.
 *         "ticker-card 는 어떤 데이터를 필요로 하는가" 를 AI 가 읽는 소스.
 *   - apps/web/lib/cardComponentRegistry.ts (이 파일)
 *       → componentId → 실제 React 컴포넌트 매핑. 번들에만 존재하면 되고,
 *         shared 패키지로 올라가면 React 가 shared 에 딸려가는 오염이 발생.
 *
 * 확장 원칙 (nextjs-frontend-specialist §3.2):
 *   - 등록은 모듈 import 시점에 1회 (카드 모듈 맨 아래에서 registerCardComponent 호출).
 *   - 앱 부트스트랩에서 `registerAllCardComponents()` 를 불러 모든 카드를 import,
 *     그 부수효과로 레지스트리가 채워진다. 이 방식은 tree-shaking 을 깨지 않는다
 *     (명시적으로 import 하는 카드만 번들에 포함).
 *
 * graceful:
 *   - getCardComponent 는 미등록 id 에 대해 undefined 를 반환. CardContainer 가
 *     fallback UI 로 처리.
 *   - 중복 등록은 console.warn 하고 덮어쓴다 (HMR 친화적).
 */

import type { ComponentType } from "react";
import type { AiCardConfig } from "@travis/shared";

/**
 * 카드 컴포넌트가 받는 공통 props.
 *
 * 모든 카드는 `config` 하나만 받고 내부에서 필요한 필드를 추출해 사용한다.
 * Step 3 이후 TickerCard / CoinListCard / KlineChartCard 가 이 시그니처를 따른다.
 */
export interface CardComponentProps {
  config: AiCardConfig;
}

export type CardComponent = ComponentType<CardComponentProps>;

const registry = new Map<string, CardComponent>();

/**
 * 카드 컴포넌트를 레지스트리에 등록.
 *
 * @param componentId shared 의 componentRegistry 와 **동일한 id**. 불일치 시 AI 가
 *                    존재하지 않는 id 를 출력해도 이 쪽에서 매칭 실패.
 * @param component   React 함수 컴포넌트.
 */
export function registerCardComponent(
  componentId: string,
  component: CardComponent,
): void {
  if (registry.has(componentId)) {
    console.warn(
      `[cardComponentRegistry] "${componentId}" 이미 등록됨 — 덮어쓰기 (HMR?)`,
    );
  }
  registry.set(componentId, component);
}

export function getCardComponent(componentId: string): CardComponent | undefined {
  return registry.get(componentId);
}

export function getAllCardComponentIds(): string[] {
  return [...registry.keys()];
}

/** 테스트/HMR 용 — 프로덕션 호출 금지. */
export function clearCardComponents(): void {
  registry.clear();
}

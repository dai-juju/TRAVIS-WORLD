/**
 * 카드 레지스트리 일괄 등록 — 앱 부트스트랩 전용 (M1.4 Step 2).
 *
 * 왜 한 파일로 모으는가:
 *   각 카드가 자기 모듈 하단에서 `registerCardComponent` 를 호출하는 side-effect 방식은
 *   "해당 카드를 import 해야 등록된다" 는 조건을 낳는다. 앱 여러 곳에서 카드가
 *   사용되면 어디가 최초 import 인지 추적이 어렵고, tree-shaking 과 실행 순서도
 *   예측 불가능해진다.
 *
 *   대신 이 파일 하나에서 모든 카드를 import → registerCardComponent 를 호출하고,
 *   CanvasStoreProvider(=앱 루트) 가 마운트 시점에 `ensureCardsRegistered()` 1회 호출.
 *
 * HMR / StrictMode 대응:
 *   중복 호출이 들어와도 registerCardComponent 가 이미 있는 id 를 warn 후 덮어쓰므로
 *   crash 없음. `registered` 플래그로 불필요한 반복도 피한다.
 */

import DummyCard from "@/components/cards/DummyCard";
import { registerCardComponent } from "@/lib/cardComponentRegistry";

let registered = false;

export function ensureCardsRegistered(): void {
  if (registered) return;
  registered = true;

  // Step 2 검증용 dummy — Step 3 에서 실제 ticker-card 가 들어오면 삭제.
  registerCardComponent("dummy", DummyCard);
}

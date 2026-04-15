/**
 * @travis/shared — 4개 레지스트리(거래소/데이터소스/컴포넌트/인터랙션)
 * 인터페이스가 들어올 자리. M1.2에서 실제 항목이 추가된다.
 *
 * 이 패키지는 runtime-agnostic 유지 — `window`/`document` 등 DOM 심볼을
 * 직접 참조하지 말 것. 워커(Node.js)와 웹(브라우저) 양쪽에서 import됨.
 * (M1.2에서 packages/shared/tsconfig.json의 lib를 ["ES2022"]로 좁혀
 *  타입 수준 강제를 함께 추가할 예정.)
 */

/**
 * @deprecated M1.2 첫 레지스트리 추가 시 삭제할 것.
 *             isolatedModules 규칙상 빈 module을 피하기 위한 한시적 상수.
 */
export const SHARED_PLACEHOLDER = "M1.2에서 4개 레지스트리 인터페이스가 들어옴" as const;

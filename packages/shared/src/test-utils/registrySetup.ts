/**
 * 테스트 환경에서 4개 레지스트리를 깨끗한 상태로 재등록하는 helper.
 *
 * 배경 (M1.6 Step 4, 2026-04-28):
 *   `registries/index.ts:10` 이 모듈 import 시 `registerDefaults()` 자동 실행
 *   → 보통은 OK. 그러나 테스트 워크플로 (a) 단위 테스트 A 가 `clearComponents()`
 *   호출 → (b) 같은 vitest 워커에서 단위 테스트 B 진입 시 모듈 import 부수효과
 *   는 한 번만 실행되어 registry 가 빈 상태. 이때 Step 4 의 registry-derived
 *   refinement 가 모두 fail → 테스트 격리 깨짐.
 *
 *   `beforeAll` 의 명시적 clear+register 가 격리 보장 — 어떤 직전 상태에서
 *   넘어와도 본 describe 블록 시작 시 깨끗한 등록 상태.
 *
 * 사용 (zod-schema-architect 자문 2026-04-28):
 *   ```
 *   import { describe, it } from "vitest";
 *   import { ensureRegistries } from "../../test-utils/registrySetup";
 *
 *   describe("AiCardConfigSchema", () => {
 *     ensureRegistries();
 *     it("...", () => { ... });
 *   });
 *   ```
 *
 *   `ensureRegistries()` 는 `beforeAll` 을 등록만 하고 즉시 반환 — describe 블록
 *   안에서 호출 가능. `it()` 본문에서는 호출하지 말 것 (beforeAll 은 it 내부에서
 *   동작 안 함).
 */

import { beforeAll } from "vitest";
import { clearComponents } from "../registries/componentRegistry";
import { clearDatasources } from "../registries/datasourceRegistry";
import { clearExchanges } from "../registries/exchangeRegistry";
import { clearInteractions } from "../registries/interactionRegistry";
import { registerDefaults } from "../registries/defaults";

/**
 * vitest `describe` 블록 안에서 호출 — `beforeAll` 에서 4개 registry 를 모두
 * clear 후 `registerDefaults()` 재등록. 다른 테스트의 clear 부수효과로부터
 * 격리.
 */
export function ensureRegistries(): void {
  beforeAll(() => {
    clearExchanges();
    clearDatasources();
    clearComponents();
    clearInteractions();
    registerDefaults();
  });
}

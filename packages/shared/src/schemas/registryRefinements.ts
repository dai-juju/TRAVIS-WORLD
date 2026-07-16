/**
 * Registry-derived id refinement helpers.
 *
 * 배경 (M1.6 Step 4, 2026-04-28 — `[3-7]` 회수):
 *   AI 가 hallucinated id (예: 폐기된 `ticker_spot`, 미등록 `screener-card`)
 *   를 emit 해도 옛 `z.string().min(1)` 는 통과시키는 구조적 결함이 있었다.
 *   M1.5 Step 3 에서 dummyChatParser 제거 직후 처음 발현 — id drift 4종이
 *   동시 노출되었고 카드가 silent 비표시.
 *
 * 패턴 (zod-schema-architect 자문 2026-04-28 채택):
 *   1. `superRefine` 사용 — `refine` 보다 풍부한 에러 메시지 (등록 id 목록 dump).
 *      AI self-correction 재시도 시 정답 후보를 그대로 받음 → 첫 retry 통과율 ↑.
 *   2. **빈 registry 가드** — 테스트 setup 누락 vs 진짜 unknown 구분.
 *      "did you forget to call registerDefaults()?" 메시지로 30분 디버깅 시간 절약.
 *   3. **모듈 top-level 캐싱 금지** — `getAll*()` 를 refinement 함수 **내부**에서
 *      매번 호출해야 registry 런타임 변화 (테스트의 clear+register cycle) 추적 가능.
 *      `const KNOWN = new Set(...)` 같은 캐싱 시 import 순서 따라 영구 빈 Set 위험.
 *
 * 회피한 대안:
 *   - `z.enum([...known])` 동적 enum: Zod `z.enum` 은 컴파일 타임 리터럴 배열을
 *     요구. 런타임 동적 배열 시 TypeScript 추론이 `string` 으로 무너짐.
 *   - `z.custom<RegisteredXId>`: 타입 좁히기는 가능하지만 에러 메시지 customization
 *     이 약함. registry id 처럼 자주 디버깅하는 필드엔 부적합.
 */

import { z } from "zod";
import {
  getAllComponents,
  getComponent,
} from "../registries/componentRegistry";
import {
  getAllDatasources,
  getDatasource,
} from "../registries/datasourceRegistry";
import {
  getAllInteractions,
  getInteraction,
} from "../registries/interactionRegistry";

/**
 * componentRegistry 에 등록된 id 만 통과시키는 string schema.
 *
 * 실패 메시지에 등록된 id 목록을 dump → AI self-correction retry 시 정답
 * 후보 즉시 인지. 회수 `[3-7]` (M1.5 Step 3 dummyChatParser 제거 시 발현).
 *
 * 사용처: `AiCardConfigSchema.componentId`, `SpawnTargetSchema.componentId` (M3-step1).
 */
export const RegisteredComponentIdSchema = z
  .string()
  .min(1)
  .superRefine((val, ctx) => {
    // refinement 안에서 매번 조회 (모듈 top-level 캐싱 금지)
    const known = getAllComponents().map((c) => c.id);
    if (known.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "componentRegistry is empty — did you forget to call registerDefaults() in test setup?",
      });
      return;
    }
    if (!getComponent(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown componentId "${val}". Registered: [${known.join(", ")}]`,
      });
    }
  })
  // helper 단독 JSON Schema 변환 시 description fallback (code-reviewer W3, 2026-04-28).
  // 사용처가 `.describe()` overlay 시 그것이 우선.
  .describe("Registered componentRegistry id (validated against runtime registry)");

/**
 * datasourceRegistry 에 등록된 id 만 통과시키는 string schema.
 *
 * `[3-32]` AI hallucinated `base_asset` filter 사고의 1차 차단선 — datasource
 * 자체가 unknown 일 때도 통과되던 옛 결함을 막는다. filters 안의 field 검증은
 * 별도 `AiCardConfigSchema.superRefine` 에서 cross-field 로 처리 (Substep 4c).
 *
 * 사용처: `CardDataBindingSchema.datasource`, `ComponentEntrySchema.dataShapes[].datasourceId`.
 */
export const RegisteredDatasourceIdSchema = z
  .string()
  .min(1)
  .superRefine((val, ctx) => {
    const known = getAllDatasources().map((d) => d.id);
    if (known.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "datasourceRegistry is empty — did you forget to call registerDefaults() in test setup?",
      });
      return;
    }
    if (!getDatasource(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown datasource "${val}". Registered: [${known.join(", ")}]`,
      });
    }
  })
  .describe("Registered datasourceRegistry id (validated against runtime registry)");

/**
 * interactionRegistry 에 등록된 id 만 통과시키는 string schema.
 *
 * 현재 직접 사용처 없음 — 향후 인터랙션 id 가 AI 출력에 노출되는 필드
 * (예: `CardActionSchema` 가 `interactionId` 명시 형태로 진화) 등장 시
 * 동일 패턴 재사용 예약. 일관성 차원에서 두 helper 와 함께 export.
 */
export const RegisteredInteractionIdSchema = z
  .string()
  .min(1)
  .superRefine((val, ctx) => {
    const known = getAllInteractions().map((i) => i.id);
    if (known.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "interactionRegistry is empty — did you forget to call registerDefaults() in test setup?",
      });
      return;
    }
    if (!getInteraction(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown interactionId "${val}". Registered: [${known.join(", ")}]`,
      });
    }
  })
  .describe("Registered interactionRegistry id (validated against runtime registry)");

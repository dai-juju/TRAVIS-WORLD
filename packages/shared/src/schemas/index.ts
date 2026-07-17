/**
 * schemas 배럴 — AI contract 스키마 re-export.
 *
 * registries는 "런타임 등록 대상"이고, schemas는 "I/O 검증 대상" — 역할 분리.
 */

export { FilterClauseSchema } from "./filterClause";
export type { FilterClause } from "./filterClause";

export { formatZodError } from "./formatZodError";
export type { FormatZodErrorOptions } from "./formatZodError";

export {
  CardActionSchema,
  CardDataBindingSchema,
  AiCardConfigSchema,
  // M3-step1 (2026-07-16) — spawn "AI 사전 선언" 계약
  SpawnTargetSchema,
  SELECTOR_KEY_TO_CONFIG_FIELD,
  SPAWN_MAPPABLE_TARGET_FIELDS,
} from "./aiCardConfig";

export type {
  CardAction,
  CardDataBinding,
  AiCardConfig,
  // M3-step1 (2026-07-16) — spawn "AI 사전 선언" 계약
  SpawnTarget,
} from "./aiCardConfig";

// 사이클 4a [10-101] (2026-07-12) — 표현 스타일 축 (descriptor 기본값의 AI override).
export { SeriesStyleSchema, CardStyleSchema } from "./cardStyle";
export type { SeriesStyle, CardStyle } from "./cardStyle";

// M1.6 Step 4 (2026-04-28) — registry-derived id refinement helpers.
//   `[3-7]` 회수: AI hallucinated id 의 schema-level 차단선.
export {
  RegisteredComponentIdSchema,
  RegisteredDatasourceIdSchema,
  RegisteredInteractionIdSchema,
} from "./registryRefinements";

export {
  OrchestrateResponseSchema,
  OrchestrateApiResponseSchema,
  OrchestrateSuccessSchema,
  OrchestrateFallbackSchema,
  OrchestrateFallbackReasonSchema,
} from "./orchestrateResponse";

export type {
  OrchestrateResponse,
  OrchestrateApiResponse,
  OrchestrateApiResponseSuccess,
  OrchestrateApiResponseFallback,
  OrchestrateFallbackReason,
} from "./orchestrateResponse";

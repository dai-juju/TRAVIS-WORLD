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
} from "./aiCardConfig";

export type {
  CardAction,
  CardDataBinding,
  AiCardConfig,
} from "./aiCardConfig";

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

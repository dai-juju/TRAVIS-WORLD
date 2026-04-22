/**
 * @travis/shared — 4개 레지스트리 + 공용 타입 + Zod 스키마.
 *
 * 이 패키지는 runtime-agnostic — DOM 심볼(window/document) 참조 금지.
 * tsconfig.json에서 lib를 ["ES2022"]로 제한하여 타입 수준에서도 강제됨.
 */

export {
  // 거래소
  MarketTypeSchema,
  ExchangeEntrySchema,
  registerExchange,
  getAllExchanges,
  getExchange,
  clearExchanges,
  // 데이터소스
  FieldTypeSchema,
  OperatorSchema,
  QueryableFieldSchema,
  RefreshTierSchema,
  DataCategorySchema,
  DatasourceEntrySchema,
  registerDatasource,
  getAllDatasources,
  getDatasource,
  clearDatasources,
  // 컴포넌트
  CardSizeSchema,
  UpdateModeSchema,
  DataShapeSchema,
  ComponentEntrySchema,
  registerComponent,
  getAllComponents,
  getComponent,
  clearComponents,
  // 인터랙션
  InteractionTypeSchema,
  InteractionParamSchema,
  InteractionEntrySchema,
  registerInteraction,
  getAllInteractions,
  getInteraction,
  clearInteractions,
  // AI 프롬프트 주입
  generatePromptInjection,
  // 기본 항목 등록
  registerDefaults,
} from "./registries/index";

export {
  // AI 카드 설정 스키마 (M1.4 Step 2)
  FilterClauseSchema,
  CardActionSchema,
  CardDataBindingSchema,
  AiCardConfigSchema,
  // M1.5 /api/orchestrate AI payload 스키마 (M1.4 Step 4-3 에서 미리 심음)
  OrchestrateResponseSchema,
  // M1.5 Step 2 신규 — API Route 응답 wrapper (discriminated union)
  OrchestrateApiResponseSchema,
  OrchestrateSuccessSchema,
  OrchestrateFallbackSchema,
  OrchestrateFallbackReasonSchema,
} from "./schemas/index";

export type {
  // 거래소
  MarketType,
  ExchangeEntry,
  // 데이터소스
  FieldType,
  Operator,
  QueryableField,
  RefreshTier,
  DataCategory,
  DatasourceEntry,
  // 컴포넌트
  CardSize,
  UpdateMode,
  DataShape,
  ComponentEntry,
  // 인터랙션
  InteractionType,
  InteractionParam,
  InteractionEntry,
} from "./registries/index";

export type {
  // AI 카드 설정 타입
  FilterClause,
  CardAction,
  CardDataBinding,
  AiCardConfig,
  // M1.5 /api/orchestrate AI payload 타입
  OrchestrateResponse,
  // M1.5 Step 2 신규 — API Route 응답 wrapper 타입
  OrchestrateApiResponse,
  OrchestrateApiResponseSuccess,
  OrchestrateApiResponseFallback,
  OrchestrateFallbackReason,
} from "./schemas/index";

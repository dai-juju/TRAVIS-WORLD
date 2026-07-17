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
  TransportSchema,
  MergeModeSchema,
  LiveTopicSpecSchema,
  DatasourceEntrySchema,
  registerDatasource,
  getAllDatasources,
  getDatasource,
  resolveDatasourceTable,
  buildLiveTopic,
  buildLiveTopics,
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
  // M3-step1 (2026-07-16) — spawn "AI 사전 선언" 계약
  SpawnTargetSchema,
  SELECTOR_KEY_TO_CONFIG_FIELD,
  SPAWN_MAPPABLE_TARGET_FIELDS,
  // M1.5 Step 2b — Zod 에러 포맷 유틸 (self-correction feedback 용)
  formatZodError,
  // M1.5 /api/orchestrate AI payload 스키마 (M1.4 Step 4-3 에서 미리 심음)
  OrchestrateResponseSchema,
  // M1.5 Step 2 신규 — API Route 응답 wrapper (discriminated union)
  OrchestrateApiResponseSchema,
  OrchestrateSuccessSchema,
  OrchestrateFallbackSchema,
  OrchestrateFallbackReasonSchema,
  // M1.6 Step 4 (2026-04-28) — registry-derived id refinement helpers (`[3-7]` 회수).
  RegisteredComponentIdSchema,
  RegisteredDatasourceIdSchema,
  RegisteredInteractionIdSchema,
  // 사이클 4a [10-101] (2026-07-12) — 표현 스타일 축.
  SeriesStyleSchema,
  CardStyleSchema,
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
  Transport,
  MergeMode,
  LiveTopicSpec,
  DatasourceEntry,
  DatasourceEntryInput,
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

export {
  // M1.9 Step 1 (2026-06-02) — 폴링 스케줄러 (worker + collector-history 공유)
  TierPoller,
} from "./poller/index";

export type {
  // M1.9 Step 1 — 폴링 계약
  IPoller,
  PollTask,
  PollStatus,
} from "./poller/index";

export {
  // M2 경로 A Step 4 (2026-06-23) — WS 직결 subprotocol 상수 (worker·web 단일 진실)
  WS_SUBPROTOCOL,
} from "./liveTransport";

export type {
  // AI 카드 설정 타입
  FilterClause,
  CardAction,
  CardDataBinding,
  AiCardConfig,
  // M3-step1 (2026-07-16) — spawn 사전 선언 타입
  SpawnTarget,
  // 사이클 4a [10-101] — 표현 스타일 축
  SeriesStyle,
  CardStyle,
  // M1.5 Step 2b — formatZodError options
  FormatZodErrorOptions,
  // M1.5 /api/orchestrate AI payload 타입
  OrchestrateResponse,
  // M1.5 Step 2 신규 — API Route 응답 wrapper 타입
  OrchestrateApiResponse,
  OrchestrateApiResponseSuccess,
  OrchestrateApiResponseFallback,
  OrchestrateFallbackReason,
} from "./schemas/index";

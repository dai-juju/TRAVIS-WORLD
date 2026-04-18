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
} from "./registries/index.js";

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
} from "./registries/index.js";

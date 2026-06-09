/**
 * 레지스트리 배럴 — 4개 레지스트리의 모든 public API를 re-export.
 *
 * 사용법: import { registerExchange, MarketType, ... } from "@travis/shared"
 */

// 기본 항목 명시적 등록 — 이 모듈 import 시 defaults가 자동 등록됨.
// 테스트에서 clearAll() 후 재등록 필요 시 registerDefaults() 직접 호출.
import { registerDefaults } from "./defaults";
registerDefaults();

export { registerDefaults } from "./defaults";

// ─── 거래소 레지스트리 ──────────────────────────────
export {
  MarketTypeSchema,
  ExchangeEntrySchema,
  registerExchange,
  getAllExchanges,
  getExchange,
  clearExchanges,
} from "./exchangeRegistry";

export type {
  MarketType,
  ExchangeEntry,
} from "./exchangeRegistry";

// ─── 데이터소스 레지스트리 ──────────────────────────
export {
  FieldTypeSchema,
  OperatorSchema,
  QueryableFieldSchema,
  RefreshTierSchema,
  DataCategorySchema,
  DatasourceEntrySchema,
  registerDatasource,
  getAllDatasources,
  getDatasource,
  resolveDatasourceTable,
  clearDatasources,
} from "./datasourceRegistry";

export type {
  FieldType,
  Operator,
  QueryableField,
  RefreshTier,
  DataCategory,
  DatasourceEntry,
} from "./datasourceRegistry";

// ─── 컴포넌트 레지스트리 ────────────────────────────
export {
  CardSizeSchema,
  UpdateModeSchema,
  DataShapeSchema,
  ComponentEntrySchema,
  registerComponent,
  getAllComponents,
  getComponent,
  clearComponents,
} from "./componentRegistry";

export type {
  CardSize,
  UpdateMode,
  DataShape,
  ComponentEntry,
} from "./componentRegistry";

// ─── 인터랙션 레지스트리 ────────────────────────────
export {
  InteractionTypeSchema,
  InteractionParamSchema,
  InteractionEntrySchema,
  registerInteraction,
  getAllInteractions,
  getInteraction,
  clearInteractions,
} from "./interactionRegistry";

export type {
  InteractionType,
  InteractionParam,
  InteractionEntry,
} from "./interactionRegistry";

// ─── AI 프롬프트 주입 ───────────────────────────────
export { generatePromptInjection } from "./promptInjection";

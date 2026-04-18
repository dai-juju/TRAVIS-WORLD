/**
 * 레지스트리 배럴 — 4개 레지스트리의 모든 public API를 re-export.
 *
 * 사용법: import { registerExchange, MarketType, ... } from "@travis/shared"
 */

// 기본 항목 명시적 등록 — 이 모듈 import 시 defaults가 자동 등록됨.
// 테스트에서 clearAll() 후 재등록 필요 시 registerDefaults() 직접 호출.
import { registerDefaults } from "./defaults.js";
registerDefaults();

export { registerDefaults } from "./defaults.js";

// ─── 거래소 레지스트리 ──────────────────────────────
export {
  MarketTypeSchema,
  ExchangeEntrySchema,
  registerExchange,
  getAllExchanges,
  getExchange,
  clearExchanges,
} from "./exchangeRegistry.js";

export type {
  MarketType,
  ExchangeEntry,
} from "./exchangeRegistry.js";

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
  clearDatasources,
} from "./datasourceRegistry.js";

export type {
  FieldType,
  Operator,
  QueryableField,
  RefreshTier,
  DataCategory,
  DatasourceEntry,
} from "./datasourceRegistry.js";

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
} from "./componentRegistry.js";

export type {
  CardSize,
  UpdateMode,
  DataShape,
  ComponentEntry,
} from "./componentRegistry.js";

// ─── 인터랙션 레지스트리 ────────────────────────────
export {
  InteractionTypeSchema,
  InteractionParamSchema,
  InteractionEntrySchema,
  registerInteraction,
  getAllInteractions,
  getInteraction,
  clearInteractions,
} from "./interactionRegistry.js";

export type {
  InteractionType,
  InteractionParam,
  InteractionEntry,
} from "./interactionRegistry.js";

// ─── AI 프롬프트 주입 ───────────────────────────────
export { generatePromptInjection } from "./promptInjection.js";

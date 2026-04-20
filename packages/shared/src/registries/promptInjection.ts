/**
 * 4개 레지스트리 → AI 시스템 프롬프트 텍스트 자동 변환.
 *
 * 이 함수의 출력물이 M1.5에서 Claude 시스템 프롬프트에 직접 들어간다.
 * 레지스트리에 새 항목을 register()하면 이 출력에 자동 반영 —
 * 오케스트레이터 코드 변경 없이 AI 능력이 확장되는 핵심 메커니즘.
 */

import { getAllExchanges } from "./exchangeRegistry";
import { getAllDatasources } from "./datasourceRegistry";
import { getAllComponents } from "./componentRegistry";
import { getAllInteractions } from "./interactionRegistry";
import type { ExchangeEntry } from "./exchangeRegistry";
import type { DatasourceEntry, QueryableField } from "./datasourceRegistry";
import type { ComponentEntry } from "./componentRegistry";
import type { InteractionEntry, InteractionParam } from "./interactionRegistry";

// ─── 개별 섹션 직렬화 ──────────────────────────────

function serializeExchange(entry: ExchangeEntry): string {
  return [
    `  - ${entry.name} (${entry.id})`,
    `    Markets: ${entry.marketTypes.join(", ")}`,
    `    REST: ${entry.baseRestUrl}`,
    `    WS: ${entry.baseWsUrl}`,
    `    Batch: ${entry.batchSupport ? "yes" : "no"}`,
  ].join("\n");
}

function serializeQueryableField(field: QueryableField): string {
  const desc = field.description ? ` — ${field.description}` : "";
  return `      ${field.name} (${field.type}) [${field.operators.join(", ")}]${desc}`;
}

function serializeDatasource(entry: DatasourceEntry): string {
  const lines = [
    `  - ${entry.name} (${entry.id})`,
    `    Category: ${entry.category} | Refresh: ${entry.refreshTier}`,
  ];
  if (entry.description) {
    lines.push(`    Description: ${entry.description}`);
  }
  if (entry.queryableFields.length > 0) {
    lines.push("    Queryable fields:");
    for (const field of entry.queryableFields) {
      lines.push(serializeQueryableField(field));
    }
  }
  return lines.join("\n");
}

function serializeComponent(entry: ComponentEntry): string {
  const lines = [
    `  - ${entry.name} (${entry.id})`,
    `    Description: ${entry.description}`,
    `    Sizes: ${entry.supportedSizes.join(", ")} (default: ${entry.defaultSize})`,
    `    Update modes: ${entry.supportedUpdateModes.join(", ")}`,
    `    Interactions: ${entry.supportedInteractions.length > 0 ? entry.supportedInteractions.join(", ") : "none"}`,
  ];
  for (const shape of entry.dataShapes) {
    lines.push(
      `    Data: ${shape.datasourceId} [${shape.requiredFields.join(", ")}]`,
    );
  }
  return lines.join("\n");
}

function serializeParam(param: InteractionParam): string {
  const req = param.required ? "required" : "optional";
  const desc = param.description ? ` — ${param.description}` : "";
  return `      ${param.name} (${param.type}, ${req})${desc}`;
}

function serializeInteraction(entry: InteractionEntry): string {
  const lines = [
    `  - ${entry.name} (${entry.id}) [type: ${entry.type}]`,
    `    Description: ${entry.description}`,
  ];
  if (entry.params.length > 0) {
    lines.push("    Params:");
    for (const param of entry.params) {
      lines.push(serializeParam(param));
    }
  }
  return lines.join("\n");
}

// ─── 메인 함수 ─────────────────────────────────────

/**
 * 4개 레지스트리의 현재 상태를 AI가 읽을 수 있는
 * 구조적 텍스트로 변환한다.
 *
 * 반환된 문자열은 Claude 시스템 프롬프트에 직접 삽입됨.
 */
export function generatePromptInjection(): string {
  const exchanges = getAllExchanges();
  const datasources = getAllDatasources();
  const components = getAllComponents();
  const interactions = getAllInteractions();

  const sections: string[] = [];

  // 거래소 섹션
  sections.push("## Available Exchanges");
  if (exchanges.length === 0) {
    sections.push("  (none registered)");
  } else {
    for (const entry of exchanges) {
      sections.push(serializeExchange(entry));
    }
  }

  // 데이터소스 섹션
  sections.push("\n## Available Data Sources");
  if (datasources.length === 0) {
    sections.push("  (none registered)");
  } else {
    for (const entry of datasources) {
      sections.push(serializeDatasource(entry));
    }
  }

  // 컴포넌트 섹션
  sections.push("\n## Available Components");
  if (components.length === 0) {
    sections.push("  (none registered)");
  } else {
    for (const entry of components) {
      sections.push(serializeComponent(entry));
    }
  }

  // 인터랙션 섹션
  sections.push("\n## Available Interactions");
  if (interactions.length === 0) {
    sections.push("  (none registered)");
  } else {
    for (const entry of interactions) {
      sections.push(serializeInteraction(entry));
    }
  }

  return sections.join("\n");
}

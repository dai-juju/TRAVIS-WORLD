/**
 * 컴포넌트 레지스트리.
 *
 * AI가 "어떤 카드를 그릴 수 있는지"를 이 레지스트리에서 읽는다.
 * 각 컴포넌트는 필요한 데이터 형태, 지원 사이즈, 갱신 모드를 선언.
 *
 * updateMode: AI가 카드 생성 시 "이 카드는 숫자만 갱신(value)" 또는
 * "조건에 맞는 항목이 동적으로 추가/제거(content)"를 지시.
 */

import { z } from "zod";

// ─── 카드 사이즈 ────────────────────────────────────

export const CardSizeSchema = z.enum(["sm", "md", "lg", "xl"]);

export type CardSize = z.infer<typeof CardSizeSchema>;

// ─── 갱신 모드 ──────────────────────────────────────

/**
 * value: 값만 갱신 (예: BTC 가격 → 숫자만 바뀜)
 * content: 목록 항목이 동적으로 추가/제거 (예: OI 급증 코인 목록)
 *
 * reactive는 M2+ 확장 루프에서 추가 예정.
 */
export const UpdateModeSchema = z.enum(["value", "content"]);

export type UpdateMode = z.infer<typeof UpdateModeSchema>;

// ─── 데이터 바인딩 형태 선언 ────────────────────────

/**
 * 컴포넌트가 필요로 하는 데이터의 형태를 선언.
 * AI가 카드 생성 시 적절한 데이터소스를 매칭하는 데 사용.
 */
export const DataShapeSchema = z.object({
  /** 필요한 데이터소스 ID (예: "ticker", "kline") */
  datasourceId: z.string().min(1),

  /** 이 컴포넌트가 사용하는 필드 목록 */
  requiredFields: z.array(z.string().min(1)),
});

export type DataShape = z.infer<typeof DataShapeSchema>;

// ─── 레지스트리 엔트리 스키마 ───────────────────────

export const ComponentEntrySchema = z.object({
  /** 고유 식별자 (예: "ticker-card", "table-card") */
  id: z.string().min(1),

  /** 표시 이름 (예: "실시간 가격 카드") */
  name: z.string().min(1),

  /** 컴포넌트 설명 — AI가 사용자 의도와 매칭할 때 참고 */
  description: z.string(),

  /** 지원하는 카드 사이즈 */
  supportedSizes: z.array(CardSizeSchema).min(1),

  /** 지원하는 갱신 모드 */
  supportedUpdateModes: z.array(UpdateModeSchema).min(1),

  /** 필요한 데이터 형태 목록 — 최소 1개 */
  dataShapes: z.array(DataShapeSchema).min(1),

  /** 지원하는 인터랙션 ID 목록 (예: ["spawn", "drill-down"]) */
  supportedInteractions: z.array(z.string()),

  /** 기본 사이즈 */
  defaultSize: CardSizeSchema,
});

export type ComponentEntry = z.infer<typeof ComponentEntrySchema>;

// ─── 레지스트리 저장소 + 등록/조�� ─────────────────

const store = new Map<string, ComponentEntry>();

/** Zod 검증 실패 시 crash 없이 false 반환 (graceful). */
export function registerComponent(entry: ComponentEntry): boolean {
  const result = ComponentEntrySchema.safeParse(entry);
  if (!result.success) {
    console.error(`[componentRegistry] 등록 실패:`, result.error.message);
    return false;
  }
  if (store.has(result.data.id)) {
    console.warn(`[componentRegistry] "${result.data.id}" 이미 등록됨 — 덮어쓰기`);
  }
  store.set(result.data.id, result.data);
  return true;
}

export function getAllComponents(): ComponentEntry[] {
  return [...store.values()];
}

export function getComponent(id: string): ComponentEntry | undefined {
  return store.get(id);
}

export function clearComponents(): void {
  store.clear();
}

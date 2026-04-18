/**
 * 인터랙션 레지스트��.
 *
 * 카드에서 발생할 수 있는 상호작용 타입을 정의.
 * M1에서는 spawn(새 카드 생성)만 지원.
 * drill-down, linked-selection 등은 확장 루프에서 추가.
 */

import { z } from "zod";

// ─── 인터랙션 카테고리 ──────────────────────────────

/**
 * spawn: 클릭 시 새 카드 생성 (예: BTC 클릭 → BTC 차트 카드)
 * drill_down: 기존 카드 내부에서 더 깊은 뷰로 전환
 * linked_selection: 한 카드 선택이 다른 카드에 연동
 *
 * M1에서는 spawn만 구현. 나머지는 타입만 선언.
 */
export const InteractionTypeSchema = z.enum([
  "spawn",
  "drill_down",
  "linked_selection",
]);

export type InteractionType = z.infer<typeof InteractionTypeSchema>;

// ─── 인터랙션 파라미터 스키마 ───────────────────────

/**
 * 인터랙션 발동 시 전달되는 파라미터 형태를 선언.
 * AI가 카드 JSON에 "이 카드에서 BTC를 클릭하면
 * TickerCard를 spawn하라"를 표현할 때 사용.
 */
export const InteractionParamSchema = z.object({
  /** 파라미터 이름 (예: "symbol", "timeframe") */
  name: z.string().min(1),

  /** 파라미터 타입 */
  type: z.enum(["string", "number", "boolean"]),

  /** 필수 여부 */
  required: z.boolean(),

  /** 파라미터 설명 */
  description: z.string().optional(),
});

export type InteractionParam = z.infer<typeof InteractionParamSchema>;

// ─── 레지스트리 엔트리 스키마 ───────────────────────

export const InteractionEntrySchema = z.object({
  /** 고유 식별자 (예: "spawn", "drill-down") */
  id: z.string().min(1),

  /** 표시 이름 */
  name: z.string().min(1),

  /** 인터랙션 타입 */
  type: InteractionTypeSchema,

  /** 인터랙션 설명 — AI가 적절한 인터랙션을 선택할 때 참고 */
  description: z.string(),

  /** 이 인터랙션이 받는 파라미터 목록 */
  params: z.array(InteractionParamSchema),
});

export type InteractionEntry = z.infer<typeof InteractionEntrySchema>;

// ��── 레지스트리 저장소 + 등록/조회 ─────────────────

const store = new Map<string, InteractionEntry>();

/** Zod 검증 실패 시 crash 없이 false 반환 (graceful). */
export function registerInteraction(entry: InteractionEntry): boolean {
  const result = InteractionEntrySchema.safeParse(entry);
  if (!result.success) {
    console.error(`[interactionRegistry] 등록 실패:`, result.error.message);
    return false;
  }
  if (store.has(result.data.id)) {
    console.warn(`[interactionRegistry] "${result.data.id}" 이미 등록됨 — 덮어쓰기`);
  }
  store.set(result.data.id, result.data);
  return true;
}

export function getAllInteractions(): InteractionEntry[] {
  return [...store.values()];
}

export function getInteraction(id: string): InteractionEntry | undefined {
  return store.get(id);
}

export function clearInteractions(): void {
  store.clear();
}

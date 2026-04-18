/**
 * 거래소 어댑터 레지스트리.
 *
 * 새 거래소를 추가할 때 register()만 호출하면
 * AI가 자동으로 해당 거래소를 인식하고 사용할 수 있다.
 * 오케스트레이터 코드 변경 절대 금지.
 */

import { z } from "zod";

// ─── 공용 도메인 타입 ───────────────────────────────

/** 거래소가 지원하는 마켓 종류 */
export const MarketTypeSchema = z.enum([
  "spot",
  "futures_usdm",
  "futures_coinm",
  "options",
  "alpha",
]);

export type MarketType = z.infer<typeof MarketTypeSchema>;

// ─── 레지스트리 엔트리 스키마 ───────────────────────

export const ExchangeEntrySchema = z.object({
  /** 고유 식별자 (예: "binance", "okx") */
  id: z.string().min(1),

  /** 표시 이름 (예: "Binance", "OKX") */
  name: z.string().min(1),

  /** 지원 마켓 타입 배열 — 최소 1개 */
  marketTypes: z.array(MarketTypeSchema).min(1),

  /** REST API 기본 URL */
  baseRestUrl: z.string().url(),

  /** WebSocket 기본 URL */
  baseWsUrl: z.string().url(),

  /** 배치 API 지원 여부 — TRAVIS는 배치 필수 */
  batchSupport: z.boolean(),

  /** 거래소 로고 아이콘 경로 (선택) */
  iconPath: z.string().optional(),
});

export type ExchangeEntry = z.infer<typeof ExchangeEntrySchema>;

// ─── 레지스트리 저장소 + 등록/조회 ─────────────────

const store = new Map<string, ExchangeEntry>();

/**
 * 거래소를 레지스트리에 등록한다.
 * Zod 검증 실패 시 crash 없이 false 반환 (graceful).
 */
export function registerExchange(entry: ExchangeEntry): boolean {
  const result = ExchangeEntrySchema.safeParse(entry);
  if (!result.success) {
    console.error(`[exchangeRegistry] 등록 실패:`, result.error.message);
    return false;
  }
  if (store.has(result.data.id)) {
    console.warn(`[exchangeRegistry] "${result.data.id}" 이미 등록됨 — 덮어쓰기`);
  }
  store.set(result.data.id, result.data);
  return true;
}

/** 등록된 모든 거래소 목록 반환. */
export function getAllExchanges(): ExchangeEntry[] {
  return [...store.values()];
}

/** 특정 거래소 조회 (없으면 undefined). */
export function getExchange(id: string): ExchangeEntry | undefined {
  return store.get(id);
}

/** 테스트용 — 레지스트리 초기화. */
export function clearExchanges(): void {
  store.clear();
}

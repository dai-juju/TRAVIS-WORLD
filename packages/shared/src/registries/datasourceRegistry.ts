/**
 * 데이터 소스 레지스트리.
 *
 * AI가 사용자 쿼리를 해석할 때 "어떤 데이터가 존재하는지",
 * "어떤 필드로 필터링 가능한지"를 이 레지스트리에서 읽는다.
 * queryableFields가 핵심 — AI의 필터 JSON 생성 근거.
 */

import { z } from "zod";

// ─── 필드 타입 + 연산자 ─────────────────────────────

/** queryableField가 지원하는 데이터 타입 */
export const FieldTypeSchema = z.enum([
  "number",
  "string",
  "boolean",
  "enum",
  "position",
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

/** 필터 연산자 */
export const OperatorSchema = z.enum([
  ">",
  ">=",
  "<",
  "<=",
  "=",
  "!=",
  "in",
  "not_in",
  "contains",
  "above",
  "below",
]);

export type Operator = z.infer<typeof OperatorSchema>;

/** AI가 필터 조건을 생성할 때 참조하는 필드 선언 */
export const QueryableFieldSchema = z.object({
  /** 필드 이름 (예: "volume_24h", "price_change_pct") */
  name: z.string().min(1),

  /** 필드 데이터 타입 */
  type: FieldTypeSchema,

  /** 이 필드에서 지원하는 연산자 목록 */
  operators: z.array(OperatorSchema).min(1),

  /** 필드 설명 — AI가 사용자 의도와 매칭할 때 참고 */
  description: z.string().optional(),

  /** enum 타입일 때 허용 값 목록 (예: ["spot", "futures_usdm"]) */
  enumValues: z.array(z.string()).optional(),

  /** 이 필드로 정렬 가능 여부 — AI가 "상위 10개" 등 정렬 쿼리 생성 시 참조 */
  sortable: z.boolean().optional(),
});

export type QueryableField = z.infer<typeof QueryableFieldSchema>;

// ─── 데이터 갱신 주기 티어 ──────────────────────────

/** 폴링 주기 티어 — 구체 초/분은 M1.3에서 결정 */
export const RefreshTierSchema = z.enum(["realtime", "high", "mid", "low"]);

export type RefreshTier = z.infer<typeof RefreshTierSchema>;

// ─── 데이터 카테고리 ────────────────────────────────

/** 데이터 저장 카테고리 (DB_SCHEMA.md 기준) */
export const DataCategorySchema = z.enum(["_now", "_history", "exchange"]);

export type DataCategory = z.infer<typeof DataCategorySchema>;

// ─── 레지스트리 엔트리 스키마 ───────────────────────

export const DatasourceEntrySchema = z.object({
  /** 고유 식별자 (예: "ticker", "kline", "funding_rate") */
  id: z.string().min(1),

  /** 표시 이름 (예: "Ticker (24h)") */
  name: z.string().min(1),

  /** 데이터 저장 카테고리 */
  category: DataCategorySchema,

  /** 갱신 주기 티어 */
  refreshTier: RefreshTierSchema,

  /** AI가 필터/정렬에 사용할 수 있는 필드 목록 */
  queryableFields: z.array(QueryableFieldSchema),

  /** 데이터 소스 설명 — AI가 사용자 의도와 매칭할 때 참고 */
  description: z.string().optional(),

  /** 이 데이터소스를 제공하는 거래소 ID (거래소 무관 소스는 생략) */
  exchangeId: z.string().optional(),
});

export type DatasourceEntry = z.infer<typeof DatasourceEntrySchema>;

// ─── 공통 PK 필드 (M1.6 Step 4, 2026-04-28 신설) ──────────────────────────
//
// 거의 모든 _now_*/symbols 테이블에 존재하는 PK 3개를 commonField 로 1번 정의.
// 새 datasource 추가 시 boilerplate 없이 자동 상속 → 확장성 우선.
//
// crypto-domain-expert 자문 (2026-04-28) — 패턴 B 채택:
//   "9번 중복 선언" 보다 "1곳 정의 + 자동 상속" 이 운영 부담 압도적으로 낮음.
//   AI 입장에서는 머지된 view 를 보므로 명시성 동일.
//
// **충돌 처리**: datasource entry 가 같은 name 의 필드 (예: now_futures_ticker
// 의 `market_type` enum 값이 spot 제외) 를 명시하면 **entry 가 우선** —
// commonField 는 자동 제외. 도메인 정확성 (USDM/COINM 만 가능) 보존.
//
// 누락 의도 (commonField 안 됨): updated_at / recorded_at / trade_time —
//   datasource 마다 시간 컬럼명이 다름 (history_*_liquidation 의 trade_time,
//   _now_* 의 updated_at, history_*_kline 의 open_time). 각 datasource 가 명시.
//
// 이월 [3-47]: M2 거래소 다변화 시점에 `siteParityUrl` 필드 신설 — 거래소별
//   사이트 URL 매핑. 현재는 description 안 평문.
export const COMMON_QUERYABLE_FIELDS: QueryableField[] = [
  {
    name: "exchange",
    type: "enum",
    operators: ["=", "in"],
    // M2 거래소 다변화 시 ["binance", "okx", "bybit", "bitget"] 로 자동 확장.
    enumValues: ["binance"],
    description: "Exchange identifier",
  },
  {
    name: "market_type",
    type: "enum",
    operators: ["=", "in"],
    enumValues: ["spot", "futures_usdm", "futures_coinm"],
    description: "Market segment (spot vs USDT-margined vs coin-margined futures)",
  },
  {
    name: "symbol",
    type: "string",
    operators: ["=", "in", "contains"],
    description: "Trading pair symbol (e.g. BTCUSDT, BTCUSD_PERP)",
  },
];

// ─── 레지스트리 저장소 + 등록/조회 ─────────────────

const store = new Map<string, DatasourceEntry>();

/**
 * commonFields 자동 상속.
 *
 * datasource entry 가 명시한 같은 name 의 필드는 우선 — common 자동 제외 (override).
 * 예: `now_futures_ticker.market_type` 은 enumValues 가 USDM/COINM 만 (spot 제외) →
 *     entry 의 명시값이 commonField 를 덮어씀.
 */
function mergeCommonFields(entry: DatasourceEntry): DatasourceEntry {
  const entryFieldNames = new Set(entry.queryableFields.map((f) => f.name));
  const commonNotOverridden = COMMON_QUERYABLE_FIELDS.filter(
    (f) => !entryFieldNames.has(f.name),
  );
  return {
    ...entry,
    queryableFields: [...commonNotOverridden, ...entry.queryableFields],
  };
}

/** Zod 검증 실패 시 crash 없이 false 반환 (graceful). */
export function registerDatasource(entry: DatasourceEntry): boolean {
  const result = DatasourceEntrySchema.safeParse(entry);
  if (!result.success) {
    console.error(`[datasourceRegistry] 등록 실패:`, result.error.message);
    return false;
  }
  if (store.has(result.data.id)) {
    console.warn(`[datasourceRegistry] "${result.data.id}" 이미 등록됨 — 덮어쓰기`);
  }
  // 저장은 raw (commonFields 미포함) 로. getter 호출 시 머지된 view 반환.
  store.set(result.data.id, result.data);
  return true;
}

/** 머지된 view 반환 — commonFields 자동 상속 적용. */
export function getAllDatasources(): DatasourceEntry[] {
  return [...store.values()].map(mergeCommonFields);
}

/** 머지된 view 반환 — commonFields 자동 상속 적용. */
export function getDatasource(id: string): DatasourceEntry | undefined {
  const raw = store.get(id);
  return raw ? mergeCommonFields(raw) : undefined;
}

export function clearDatasources(): void {
  store.clear();
}

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

// ─── 데이터 운반 경로 (M2 경로 A Step 3, 2026-06-22) ────────────────
//
// 이 datasource 데이터가 "프론트에 **어떻게 닿느냐**"를 선언.
// table/(미래)fetchKind 의 "**어디서 오나**" 축과 직교 — 둘은 서로 모름.
//
//   - "realtime"  : 경로 B. 워커가 Supabase upsert → 프론트가 Supabase Realtime
//                   구독(channelManager). 현재 전 datasource 의 기본·유일 경로.
//   - "ws_direct" : 경로 A. 워커가 LiveBus 토픽 방송 → 프론트가 워커 WS 서버
//                   직결 구독. DB 미경유(저지연).
//
// ★ refreshTier 의 "realtime" 과 **글자만 같고 의미 축이 다름**:
//   refreshTier=얼마나 자주 갱신 / transport=어느 길로 닿음. 한 datasource 가
//   refreshTier:"realtime" + transport:"ws_direct" 둘 다 가질 수 있음.
//
// 확장 여지(미구현): "on_demand"(REST 1회 fetch) — 실제 필요 시 추가.
export const TransportSchema = z.enum(["realtime", "ws_direct"]);

export type Transport = z.infer<typeof TransportSchema>;

// ─── row 병합 모드 (M2 경로 A fast-follow #1 Step 2, 2026-06-26) ────────────
//
// 새 row 이벤트가 도착했을 때 dataService(applyRow)가 이전 상태와 **어떻게 합치나**.
//
//   - "replace" : 새 row 로 통째 교체. full-row 소스의 기본·기존 동작.
//                 ticker(full upsert) 와 모든 Supabase Realtime 경로(Postgres 가
//                 UPDATE 시 전체 row push) 가 여기 해당.
//   - "partial" : 이전 상태 위에 새 row 의 컬럼만 덮어쓰기(`{...prev, ...next}`).
//                 경로 A ws_direct 의 **부분 방송** 전용 — markPrice 는 7컬럼만 WS
//                 push 하므로, REST 폴러가 채운 컬럼(last_settled_funding_rate /
//                 interest_rate / OI·LSR 등 초기 seed)을 보존해야 사라지지 않는다.
//
// ★ full-row 소스에선 partial == replace (next 가 모든 키를 가져 동일 결과) →
//   premium_index 를 미리 "partial" 로 둬도 transport 가 realtime 인 동안 거동 불변
//   (휴면 안전). Step 5 플립 후 비로소 의미가 생긴다.
// **AI 비노출**: promptInjection(serializeDatasource)이 allowlist 라 직렬화 안 함
//   (transport/table/liveTopicSpec 와 동일 — 순수 내부 운반 디테일).
export const MergeModeSchema = z.enum(["replace", "partial"]);

export type MergeMode = z.infer<typeof MergeModeSchema>;

// ─── 라이브 토픽 형식 선언 (M2 경로 A Step 3) ───────────────────────
//
// ws_direct datasource 가 "구독 키로부터 불투명 토픽을 어떻게 짓는지"를
// **데이터로** 선언(함수 아님 → 직렬화 안전: promptInjection/JSON Schema 무해).
//
// ★ 전역 고정 토픽 규격 금지(사용자 양보 불가 원칙, 2026-06-22):
//   "{출처}.{시장}.{지표}.{코인}" 같은 전역 스키마를 코드에 박지 않는다.
//   각 datasource 가 자기 prefix(네임스페이스) + 어떤 selector 키를 토픽에
//   넣을지 스스로 선언 → buildLiveTopic 은 형식 무지하게 조립만 한다.
//   추후 뉴스(prefix:"news:reuters", selectorKeys:["category"]) 등이 이 칸만
//   채워 같은 파이프에 꽂힘.
export const LiveTopicSpecSchema = z.object({
  /**
   * 토픽 접두사(네임스페이스). 이 datasource 의 모든 토픽이 공유.
   * metric 구분까지 prefix 에 녹임 → 다른 datasource 와 충돌 없음.
   * 예: ticker = "binance:ticker" / liquidation = "binance:liquidation".
   * 형식은 소스 자유 — 운반층(LiveBus/WsServer)은 안 본다.
   */
  prefix: z.string().min(1),
  /**
   * selector 객체에서 토픽에 이어붙일 키 순서.
   * 워커(방송)·프론트(구독)가 **같은 순서·같은 값**을 넣어야 fan-out 매칭.
   * 예: ticker = ["market_type", "symbol"]
   *   buildLiveTopic("now_futures_ticker", {market_type:"futures_usdm", symbol:"BTCUSDT"})
   *   → "binance:ticker:futures_usdm:BTCUSDT"
   */
  selectorKeys: z.array(z.string().min(1)).min(1),
  /**
   * 후행 **선택** selector 칸 (M2 fast-follow #2, 2026-06-27).
   * selector 에 값이 있으면 토픽에 이어붙이고, 없으면 생략 → 한 datasource 가
   * 토픽을 계층(예: 전체 tape `[market_type]` / 심볼별 `[market_type, symbol]`)으로
   * 낼 수 있다. ★ 반드시 required(selectorKeys) **뒤**에 붙고, required 와 무중복.
   * 생략(미선언) 시 []  → 기존 datasource 토픽 출력 **byte-identical = 회귀 0**.
   * 예: liquidation = selectorKeys ["market_type"] + optionalSelectorKeys ["symbol"]
   */
  optionalSelectorKeys: z.array(z.string().min(1)).default(() => []),
  /** 세그먼트 구분자. 기본 ":". */
  separator: z.string().min(1).default(":"),
})
  .refine((s) => new Set(s.selectorKeys).size === s.selectorKeys.length, {
    // selectorKeys 중복은 토픽에 같은 segment 가 두 번 들어가는 실수 — 양쪽 동일
    // spec 이라 매칭은 되지만 의도 아님. 등록 시 차단(code-reviewer S1).
    message: "selectorKeys must be unique",
    path: ["selectorKeys"],
  })
  .refine(
    (s) => {
      // required ∪ optional 전체 유일 — 한 칸이 토픽에 두 번 들어가는 실수 차단.
      const all = [...s.selectorKeys, ...s.optionalSelectorKeys];
      return new Set(all).size === all.length;
    },
    {
      message: "selectorKeys and optionalSelectorKeys must be collectively unique",
      path: ["optionalSelectorKeys"],
    },
  );
// ★ 토픽은 **절대 역파싱 금지**(불투명). prefix 가 separator(":")를 품어도
//   fan-out 은 정확 일치(===)로만 매칭하므로 무해 — 세그먼트 경계를 되읽지 않는다.

export type LiveTopicSpec = z.infer<typeof LiveTopicSpecSchema>;

// ─── 레지스트리 엔트리 스키마 ───────────────────────

export const DatasourceEntrySchema = z.object({
  /** 고유 식별자 (예: "ticker", "kline", "funding_rate") */
  id: z.string().min(1),

  /** 표시 이름 (예: "Ticker (24h)") */
  name: z.string().min(1),

  /** 데이터 저장 카테고리 */
  category: DataCategorySchema,

  /**
   * 이 datasource 가 읽는 실제 Supabase 물리 테이블명.
   *
   * 빚 [8-27] #1 회수 (M2 테마 A Step 1, 2026-06-09) — datasource id ≠ 테이블명 분리.
   * 여러 논리 datasource(premium_index / open_interest / long_short_ratio /
   * taker_long_short)가 같은 물리 테이블(now_futures_indicator)을 가리킬 수 있다.
   *
   * - 생략 시: id 자체를 테이블명으로 사용 (대안 A 호환 — now_spot_ticker 등 id=table).
   * - kline 처럼 Supabase 테이블이 없는(TradingView widget) datasource 는 생략.
   * - **AI 비노출**: promptInjection 이 직렬화하지 않는 순수 내부 구현 디테일.
   *   AI 는 논리 id 만 알고, 물리 테이블 매핑은 dataService 가 resolve.
   */
  table: z.string().min(1).optional(),

  /** 갱신 주기 티어 */
  refreshTier: RefreshTierSchema,

  /** AI가 필터/정렬에 사용할 수 있는 필드 목록 */
  queryableFields: z.array(QueryableFieldSchema),

  /** 데이터 소스 설명 — AI가 사용자 의도와 매칭할 때 참고 */
  description: z.string().optional(),

  /** 이 데이터소스를 제공하는 거래소 ID (거래소 무관 소스는 생략) */
  exchangeId: z.string().optional(),

  /**
   * 데이터 운반 경로 (M2 경로 A Step 3). 생략 시 "realtime"(경로 B).
   * default 라 기존 entry 는 한 줄도 안 고쳐도 경로 B 유지(하위호환).
   * ws_direct 로 올릴 datasource(now_*_ticker 등)만 명시.
   * **AI 비노출**: promptInjection 이 직렬화 안 함(table 과 동일 — 내부 운반 디테일).
   */
  transport: TransportSchema.default("realtime"),

  /**
   * 라이브 토픽 형식 선언 (M2 경로 A Step 3). transport==="ws_direct" 일 때 필수.
   * realtime datasource 는 생략(토픽 개념 없음). **AI 비노출**.
   * 단 transport 가 아직 realtime 이어도 명시 가능 — 워커가 미리 방송 준비하는
   * 과도기(Step 3: 기계는 깔되 프론트 전환은 Step 4)를 허용.
   */
  liveTopicSpec: LiveTopicSpecSchema.optional(),

  /**
   * row 병합 모드 (M2 경로 A fast-follow #1 Step 2). 생략 시 "replace"(기존 동작).
   * default 라 기존 entry 는 한 줄도 안 고쳐도 replace 유지(하위호환).
   * 경로 A 부분 방송(markPrice 7컬럼)을 받는 datasource(premium_index)만 "partial".
   * full-row 소스에선 replace 와 동일 결과 → 미리 켜도 휴면 안전. **AI 비노출**.
   */
  mergeMode: MergeModeSchema.default("replace"),
})
  .superRefine((entry, ctx) => {
    // ws_direct 는 토픽 빌더 spec 필수 — 없으면 방송/구독 키 불일치로 silent 무전달.
    if (entry.transport === "ws_direct" && !entry.liveTopicSpec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["liveTopicSpec"],
        message:
          `datasource "${entry.id}" has transport:"ws_direct" but no liveTopicSpec. ` +
          `Path A needs a topic spec so worker and frontend build the same topic.`,
      });
    }
    // 역방향(realtime + liveTopicSpec)은 허용 — 과도기·미래 양경로 지원 여지 보존.
  });

/** 등록 입력 타입(transport 등 default 필드 생략 가능). 소비자는 output 타입 DatasourceEntry 사용. */
export type DatasourceEntryInput = z.input<typeof DatasourceEntrySchema>;

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

/**
 * Zod 검증 실패 시 crash 없이 false 반환 (graceful).
 * 입력은 DatasourceEntryInput — transport 등 default 필드 생략 가능(safeParse 가 채움).
 */
export function registerDatasource(entry: DatasourceEntryInput): boolean {
  const result = DatasourceEntrySchema.safeParse(entry);
  if (!result.success) {
    console.error(`[datasourceRegistry] 등록 실패:`, result.error.message);
    return false;
  }
  if (store.has(result.data.id)) {
    console.warn(`[datasourceRegistry] "${result.data.id}" 이미 등록됨 — 덮어쓰기`);
  }
  // realtime 인데 liveTopicSpec 명시 — 의도된 과도기(Step 3)일 수도, transport
  // 누락 오타일 수도. 거부는 안 하되(과도기 허용) silent 는 깸 (code-reviewer W1).
  if (result.data.transport === "realtime" && result.data.liveTopicSpec) {
    console.warn(
      `[datasourceRegistry] "${result.data.id}" has liveTopicSpec but transport:"realtime" — ` +
        `topic builds but path stays B. Intended transition, or forgot transport:"ws_direct"?`,
    );
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

/** store 가 빈 상태에서 resolve 가 호출된 경우 1회만 경고 (조기경보, 폭발 방지). */
let warnedEmptyStore = false;

/**
 * datasource 논리 id → 실제 Supabase 물리 테이블명 (빚 [8-27] #1, 2026-06-09).
 *
 * dataService(initialFetch / channelManager)가 `from()` / Realtime 구독 시 사용.
 * - entry.table 이 있으면 그 값 (예: open_interest → now_futures_indicator).
 * - 없으면 id 자체 (대안 A 호환 — now_spot_ticker 등).
 * - **미등록 id 는 id 그대로 반환** (graceful — 절대 throw 안 함).
 *
 * **registry 등록 보장**: `@travis/shared` 배럴 import 시 `registries/index.ts` 의
 * top-level `registerDefaults()` 가 자동 실행되어 store 가 채워진다 (브라우저/서버 동일).
 * → 호출 측은 배럴(`@travis/shared`)로 import 하면 별도 부트스트랩 불필요.
 * datasourceRegistry 를 **직접** import(배럴 우회)하면 자동 등록이 안 되므로 금지.
 * store 가 비어 있으면 아래 조기경보가 1회 출력된다 (code-reviewer S2).
 */
export function resolveDatasourceTable(id: string): string {
  const entry = store.get(id);
  if (!entry && store.size === 0 && !warnedEmptyStore) {
    warnedEmptyStore = true;
    console.warn(
      `[datasourceRegistry] resolveDatasourceTable("${id}") 호출됐지만 registry 가 비어 있음 — ` +
        `registerDefaults() 미실행 의심. @travis/shared 배럴로 import 했는지 확인.`,
    );
  }
  return entry?.table ?? id;
}

/**
 * datasource 의 liveTopicSpec + selector 값으로 **불투명** 토픽 문자열 조립
 * (M2 경로 A Step 3, 2026-06-22).
 *
 * ★ 단일 진실: 워커(방송)와 프론트(구독)가 둘 다 이 함수를 호출 → 같은 selector
 *   면 같은 문자열 보장 → fan-out 매칭. 한쪽이라도 직접 문자열을 조립하면
 *   (Step 1 의 워커 인라인 같은) drift 가 재발하므로 **양쪽 다 이 함수만** 쓴다.
 *
 * 조립: `[prefix, ...selectorKeys 의 값들].join(separator)`. 형식은 spec 이 정하고
 *   이 함수는 기계적 조립만(토픽 형식 무지 = 불투명 원칙 보존).
 *
 * graceful (throw 금지): 필수 누락/spec 없음 → null. 호출 측은 null 이면 그 토픽
 *   방송/구독을 skip(데이터 안 올 뿐 crash 없음).
 *
 * ★ 프론트(구독)는 이 단수 함수로 자기 selector 에 맞는 토픽 1개를 얻는다
 *   (symbol 있으면 심볼 토픽 / 없으면 tape 토픽). **단수 = 복수 fan-out 의 마지막
 *   (가장 긴) 누적 prefix 로 파생** → "프론트 단수 토픽은 항상 워커 복수 fan-out
 *   집합의 원소" 불변식을 테스트가 아니라 **구조로** 보장(drift 불가, code-reviewer S1).
 *   빌드 로직 단일 진실 = buildLiveTopics.
 */
export function buildLiveTopic(
  datasourceId: string,
  selector: Record<string, string>,
): string | null {
  const topics = buildLiveTopics(datasourceId, selector);
  return topics.length > 0 ? topics[topics.length - 1]! : null;
}

/**
 * 워커(방송)용 — 한 selector 로부터 required-only ~ required+all-optional 까지
 * **누적 prefix 토픽 전부**를 반환(M2 fast-follow #2, 2026-06-27).
 *
 * 예: liquidation selector {market_type:"futures_usdm", symbol:"BTCUSDT"} →
 *   ["binance:liquidation:futures_usdm",            // tape (required-only)
 *    "binance:liquidation:futures_usdm:BTCUSDT"]    // + symbol
 * 한 청산 이벤트를 전체 tape 구독자·심볼별 구독자 양쪽에 동시 fan-out.
 *
 * graceful: spec 없음/필수 누락 → [](발행 skip). optionalSelectorKeys 없는 기존
 *   datasource(ticker 등)는 **정확히 1개 원소 배열** = 단수 발행과 거동 동일(회귀 0).
 */
export function buildLiveTopics(
  datasourceId: string,
  selector: Record<string, string>,
): string[] {
  const spec = store.get(datasourceId)?.liveTopicSpec;
  if (!spec) return [];
  const required: string[] = [spec.prefix];
  for (const key of spec.selectorKeys) {
    const v = selector[key];
    if (typeof v !== "string" || v.length === 0) return []; // 필수 누락 = 발행 불가
    required.push(v);
  }
  const topics = [required.join(spec.separator)]; // tape (required-only)
  const cur = [...required];
  for (const key of spec.optionalSelectorKeys) {
    const v = selector[key];
    if (typeof v !== "string" || v.length === 0) break;
    cur.push(v);
    topics.push(cur.join(spec.separator)); // + 각 누적 단계
  }
  return topics;
}

export function clearDatasources(): void {
  store.clear();
}

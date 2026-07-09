/**
 * M1.2 레지스트리 단위 테스트.
 *
 * 핵심 검증: 새 항목 등록 → promptInjection에 자동 반영.
 * 이것이 TRAVIS의 "오케스트레이터 코드 변경 없이 확장" 원칙의 증명.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerExchange,
  getAllExchanges,
  clearExchanges,
  ExchangeEntrySchema,
} from "../exchangeRegistry";
import {
  registerDatasource,
  getAllDatasources,
  getDatasource,
  buildLiveTopic,
  buildLiveTopics,
  clearDatasources,
} from "../datasourceRegistry";
import {
  registerComponent,
  getAllComponents,
  getComponent,
  clearComponents,
} from "../componentRegistry";
import {
  registerInteraction,
  getAllInteractions,
  clearInteractions,
} from "../interactionRegistry";
import { generatePromptInjection } from "../promptInjection";
import { SELECTOR_KEY_TO_CONFIG_FIELD } from "../../schemas/aiCardConfig";
import { ensureRegistries } from "../../test-utils/registrySetup";
import { DataShapeKindSchema } from "../shapeKind";
import { shapeIntersection, areShapesCompatible } from "../shapeCompat";

// ─── 헬퍼: 전체 레지스트리 초기화 ──────────────────

function clearAll(): void {
  clearExchanges();
  clearDatasources();
  clearComponents();
  clearInteractions();
}

// ─── 거래소 레지스트리 ──────────────────────────────

describe("exchangeRegistry", () => {
  beforeEach(clearAll);

  it("register → getAll에 반영", () => {
    registerExchange({
      id: "test-exchange",
      name: "Test Exchange",
      marketTypes: ["spot"],
      baseRestUrl: "https://api.test.com",
      baseWsUrl: "wss://ws.test.com",
      batchSupport: true,
    });

    const all = getAllExchanges();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("test-exchange");
  });

  it("Zod 검증 실패 시 false 반환 (graceful, crash 없음)", () => {
    const result = registerExchange({
      id: "",
      name: "Bad",
      marketTypes: [],
      baseRestUrl: "not-a-url",
      baseWsUrl: "not-a-url",
      batchSupport: true,
    });
    expect(result).toBe(false);
    expect(getAllExchanges()).toHaveLength(0);
  });

  it("Zod 스키마가 올바른 항목은 통과", () => {
    const valid = {
      id: "binance",
      name: "Binance",
      marketTypes: ["spot", "futures_usdm"] as const,
      baseRestUrl: "https://api.binance.com",
      baseWsUrl: "wss://stream.binance.com:9443",
      batchSupport: true,
    };
    const result = ExchangeEntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

// ─── 데이터소스 레지스트리 ──────────────────────────

describe("datasourceRegistry", () => {
  beforeEach(clearAll);

  it("queryableFields 포함 항목 등록 성공", () => {
    registerDatasource({
      id: "test-ticker",
      name: "Test Ticker",
      category: "_now",
      refreshTier: "high",
      queryableFields: [
        { name: "volume_24h", type: "number", operators: [">", "<"] },
      ],
    });

    const all = getAllDatasources();
    expect(all).toHaveLength(1);
    // M1.6 Step 4 (2026-04-28): getAllDatasources() 가 commonFields (exchange/
    //   market_type/symbol 3개) 머지된 view 반환 → 등록한 1개 + commonField 3
    //   = 총 4개. 등록한 필드는 `find` 로 robust 하게 확인.
    expect(all[0]?.queryableFields).toHaveLength(4);
    expect(
      all[0]?.queryableFields.find((f) => f.name === "volume_24h"),
    ).toBeDefined();
    // commonFields 자동 상속 검증
    expect(
      all[0]?.queryableFields.find((f) => f.name === "exchange"),
    ).toBeDefined();
  });
});

// ─── 컴포넌트 레지스트리 ────────────────────────────

describe("componentRegistry", () => {
  beforeEach(clearAll);

  it("updateMode value/content 모두 등록 가능", () => {
    registerComponent({
      id: "test-card",
      name: "Test Card",
      description: "테스트용 카드",
      supportedSizes: ["sm", "md"],
      supportedUpdateModes: ["value", "content"],
      dataShapes: [{ datasourceId: "ticker", requiredFields: ["last_price"] }],
      supportedInteractions: ["spawn"],
      defaultSize: "sm",
    });

    const all = getAllComponents();
    expect(all).toHaveLength(1);
    expect(all[0]?.supportedUpdateModes).toEqual(["value", "content"]);
  });
});

// ─── 인터랙션 레지스트리 ────────────────────────────

describe("interactionRegistry", () => {
  beforeEach(clearAll);

  it("params 배열 포함 항목 등록 성공", () => {
    registerInteraction({
      id: "test-spawn",
      name: "Test Spawn",
      type: "spawn",
      description: "테스트용 spawn",
      params: [
        { name: "symbol", type: "string", required: true },
      ],
    });

    const all = getAllInteractions();
    expect(all).toHaveLength(1);
    expect(all[0]?.params).toHaveLength(1);
  });
});

// ─── 핵심 테스트: promptInjection 자동 반영 ────────

describe("promptInjection", () => {
  beforeEach(clearAll);

  it("빈 레지스트리 → (none registered) 출력", () => {
    const text = generatePromptInjection();
    expect(text).toContain("(none registered)");
    expect(text).toContain("## Available Exchanges");
    expect(text).toContain("## Available Data Sources");
    expect(text).toContain("## Available Components");
    expect(text).toContain("## Available Interactions");
  });

  it("새 항목 등록 → promptInjection에 자동 반영", () => {
    // 등록 전: none
    const before = generatePromptInjection();
    expect(before).toContain("(none registered)");

    // 거래소 등록
    registerExchange({
      id: "okx",
      name: "OKX",
      marketTypes: ["spot", "futures_usdm"],
      baseRestUrl: "https://www.okx.com",
      baseWsUrl: "wss://ws.okx.com:8443",
      batchSupport: true,
    });

    // 등록 후: OKX가 포함됨 (다른 레지스트리는 여전히 비어있어도 OK)
    const after = generatePromptInjection();
    expect(after).toContain("OKX (okx)");
    expect(after).toContain("Markets: spot, futures_usdm");
    // Exchanges 섹션에는 (none registered)가 없어야 함
    const exchangeSection = after.split("## Available Data Sources")[0]!;
    expect(exchangeSection).not.toContain("(none registered)");
  });

  it("4개 레지스트리에 모두 등록 → 모두 반영", () => {
    registerExchange({
      id: "binance",
      name: "Binance",
      marketTypes: ["spot"],
      baseRestUrl: "https://api.binance.com",
      baseWsUrl: "wss://stream.binance.com:9443",
      batchSupport: true,
    });
    registerDatasource({
      id: "ticker",
      name: "Ticker",
      category: "_now",
      refreshTier: "high",
      queryableFields: [
        { name: "volume_24h", type: "number", operators: [">"] },
      ],
    });
    registerComponent({
      id: "ticker-card",
      name: "Ticker Card",
      description: "가격 카드",
      supportedSizes: ["sm"],
      supportedUpdateModes: ["value"],
      dataShapes: [{ datasourceId: "ticker", requiredFields: ["last_price"] }],
      supportedInteractions: [],
      defaultSize: "sm",
    });
    registerInteraction({
      id: "spawn",
      name: "Spawn",
      type: "spawn",
      description: "새 카드 생성",
      params: [],
    });

    const text = generatePromptInjection();
    expect(text).toContain("Binance (binance)");
    expect(text).toContain("Ticker (ticker)");
    expect(text).toContain("volume_24h");
    expect(text).toContain("Ticker Card (ticker-card)");
    expect(text).toContain("Spawn (spawn)");
  });

  it("queryableFields 상세 정보가 포함됨", () => {
    registerDatasource({
      id: "ds-test",
      name: "DS Test",
      category: "_now",
      refreshTier: "mid",
      queryableFields: [
        {
          name: "oi_change",
          type: "number",
          operators: [">", "<", ">=", "<="],
          description: "OI 변화율",
        },
      ],
    });

    const text = generatePromptInjection();
    expect(text).toContain("oi_change (number) [>, <, >=, <=]");
    expect(text).toContain("OI 변화율");
  });
});

// ─── 테마 B [10-2]: defaults 의 quote_asset 등록 + AI 노출 검증 ──────
//   (2026-06-11) ticker 양 datasource 에 quote_asset queryableField 신설.
//   promptInjection 직렬화까지 확인 — "registry 등록만 하면 AI 자동 인지" 증명.

describe("defaults quote_asset (M2 테마 B)", () => {
  ensureRegistries();

  it("now_spot_ticker / now_futures_ticker 양쪽에 quote_asset 등록됨", () => {
    for (const id of ["now_spot_ticker", "now_futures_ticker"]) {
      const entry = getAllDatasources().find((d) => d.id === id);
      expect(entry).toBeDefined();
      const field = entry?.queryableFields.find((f) => f.name === "quote_asset");
      expect(field).toBeDefined();
      expect(field?.type).toBe("string");
      // not_in 은 FilterClauseSchema 에 없어 등록 금지 — drift 가드
      expect(field?.operators).toEqual(["=", "in", "!="]);
    }
  });

  it("promptInjection 출력에 quote_asset 필드가 직렬화됨 (AI 자동 인지)", () => {
    const text = generatePromptInjection();
    expect(text).toContain("quote_asset (string) [=, in, !=]");
  });
});

// ─── Composable Stage 1 Step 3+4 (2026-06-30): dataShapes.requiredFields 무결성 ──
//   requiredFields 는 superRefine 이 검증하지 않고 promptInjection 으로 AI 프롬프트에
//   직렬화된다 → 유령 필드가 섞이면 AI 가 그 필드를 emit → 불필요한 self-correction 왕복.
//   table-card 수렴이 7개 배열 수동 이관으로 전사(transcription) 오타 위험을 키워 이 갭을
//   가시화 (zod 자문 2026-06-30). 모든 컴포넌트에 대해 registry 레벨에서 박제.
describe("defaults dataShapes.requiredFields ⊆ datasource.queryableFields (전사 오타 가드)", () => {
  ensureRegistries();

  it("모든 컴포넌트의 모든 dataShape requiredFields 가 그 datasource 의 queryableFields 에 실존", () => {
    for (const comp of getAllComponents()) {
      for (const shape of comp.dataShapes) {
        const ds = getDatasource(shape.datasourceId);
        expect(
          ds,
          `${comp.id}: dataShape datasource 미등록 "${shape.datasourceId}"`,
        ).toBeDefined();
        const fields = new Set(ds?.queryableFields.map((f) => f.name) ?? []);
        for (const rf of shape.requiredFields) {
          expect(
            fields.has(rf),
            `${comp.id} × ${shape.datasourceId}: requiredField "${rf}" 가 queryableFields 에 없음 (전사 오타?)`,
          ).toBe(true);
        }
      }
    }
  });
});

// ─── ff#2 재개 Step 1 (2026-07-05): selectorKey → config 필드 매핑 완전성 ──
//   aiCardConfig superRefine(2.5 일반화)은 SELECTOR_KEY_TO_CONFIG_FIELD 에 있는
//   selectorKey 만 강제한다 — 매핑에 없는 미래 selectorKey 는 조용히 건너뛰어
//   "필수 selector 누락 → 토픽 null → frozen 카드" 구멍이 재발한다. 등록된 전
//   datasource 의 selectorKey(필수+선택)가 매핑에 실존함을 빌드타임에 박제.
describe("liveTopicSpec selectorKeys ⊆ SELECTOR_KEY_TO_CONFIG_FIELD (superRefine 구멍 방지)", () => {
  ensureRegistries();

  it("등록된 모든 datasource 의 selectorKey 가 매핑에 존재", () => {
    for (const ds of getAllDatasources()) {
      const spec = ds.liveTopicSpec;
      if (!spec) continue;
      for (const key of [...spec.selectorKeys, ...spec.optionalSelectorKeys]) {
        expect(
          // `in` 은 프로토타입 키(toString 등)에도 true — 자기 키만 인정 (zod S3).
          Object.hasOwn(SELECTOR_KEY_TO_CONFIG_FIELD, key),
          `${ds.id}: selectorKey "${key}" 가 SELECTOR_KEY_TO_CONFIG_FIELD 에 없음 — ` +
            `superRefine 이 이 키의 누락을 검증하지 못한다 (aiCardConfig.ts 매핑에 추가할 것)`,
        ).toBe(true);
      }
    }
  });

  it("subscribesByTopic 은 promptInjection 에 노출되지 않는다 (AI 비노출 회귀 가드)", () => {
    // serializeComponent 가 allowlist 직렬화라 현재 안전 — 전 필드 dump 로 리팩터되는
    // 미래 실수를 시끄럽게 잡는다 (transport/mergeMode 비노출 가드와 동형, zod S1).
    expect(generatePromptInjection()).not.toContain("subscribesByTopic");
  });

  it("default(false) 하위호환 — 미선언 컴포넌트 false / 토픽 구독 카드만 true (zod S2)", () => {
    expect(getComponent("table-card")?.subscribesByTopic).toBe(false);
    expect(getComponent("kline-chart-card")?.subscribesByTopic).toBe(false);
    // chart-card 는 주기 pull(useDataServiceSeries) — 토픽 구독 카드 아님 (사이클 2 Step 5).
    expect(getComponent("chart-card")?.subscribesByTopic).toBe(false);
    expect(getComponent("ticker-card")?.subscribesByTopic).toBe(true);
    expect(getComponent("indicator-card")?.subscribesByTopic).toBe(true);
  });
});

// ─── Composable Stage 2 Step 1 (2026-07-08): shape 계약 불변식 ─────────────
//   servableShapes/acceptsShapes 는 optional(정체성이라 default 금지) — 그 구멍을
//   "렌더에 실제 관여하는 항목은 반드시 태깅" 표적 불변식으로 봉합한다.
//   ★ 렌더 게이트는 여전히 dataShapes 멤버십(byte-identical) — shape 는 그 위의
//   호환성 검사 레이어. 무의미 조합(series 전용 데이터를 표 명단에 넣는 실수)을
//   빌드타임에 시끄럽게 실패시키는 것이 이 블록의 존재 이유 (zod 자문 2026-07-08).

describe("shape 계약 (servableShapes × acceptsShapes)", () => {
  ensureRegistries();

  it("[불변식 1] 렌더되는(dataShapes 에 등장하는) 모든 datasource 는 servableShapes 태깅 필수", () => {
    const renderedIds = new Set(
      getAllComponents().flatMap((c) => c.dataShapes.map((s) => s.datasourceId)),
    );
    for (const id of renderedIds) {
      const ds = getDatasource(id);
      expect(ds, `dataShapes 가 미등록 datasource "${id}" 를 참조`).toBeDefined();
      expect(
        ds?.servableShapes && ds.servableShapes.length >= 1,
        `datasource "${id}" 는 렌더 대상인데 servableShapes 미태깅 — shape 정체성을 선언할 것`,
      ).toBe(true);
    }
  });

  it("[불변식 2] defaults 등록 컴포넌트 전부 acceptsShapes 태깅 필수", () => {
    for (const comp of getAllComponents()) {
      expect(
        comp.acceptsShapes && comp.acceptsShapes.length >= 1,
        `component "${comp.id}" 의 acceptsShapes 미태깅 — form 이 소비하는 shape 를 선언할 것`,
      ).toBe(true);
    }
  });

  it("[불변식 3 ★핵심] 모든 dataShapes 조합은 shape 호환 — 무의미 조합 등록 차단", () => {
    for (const comp of getAllComponents()) {
      for (const shape of comp.dataShapes) {
        expect(
          areShapesCompatible(comp.id, shape.datasourceId),
          `${comp.id} × ${shape.datasourceId}: dataShapes 에 나열됐지만 shape 비호환 — ` +
            `acceptsShapes(${JSON.stringify(comp.acceptsShapes)}) ∩ ` +
            `servableShapes 가 공집합. 무의미 조합이거나 태깅 오류.`,
        ).toBe(true);
      }
    }
  });

  it("[불변식 4] servableShapes/acceptsShapes 정확값 핀 — 과다·오태깅 가시화 (code-reviewer W1)", () => {
    // 불변식 1~3 은 '누락'만 잡는다 — 잘못된 shape 를 **추가**하는 실수(예: premium_index
    //   에 'events' 를 덧붙임)는 교집합이 비어있지 않은 한 전부 통과해, 불변식 3 의
    //   무의미-조합 차단까지 역으로 뚫린다. Stage 4(AI shape 선택)에선 그 과다 태그가
    //   "AI 가 무의미 조합을 정당하게 고르는 경로"가 됨 → 정확값 스냅샷으로 핀 고정
    //   (렌더 매트릭스 byte-identical 스냅샷과 동형). 태그 변경은 여기 diff 로 가시화.
    const dsShapes = Object.fromEntries(
      getAllDatasources().map((d) => [d.id, d.servableShapes ?? null]),
    );
    expect(dsShapes).toEqual({
      now_spot_ticker: ["record", "set"],
      now_futures_ticker: ["record", "set"],
      premium_index: ["record", "set"],
      basis: ["record", "set"],
      open_interest: ["record", "set"],
      long_short_ratio: ["record", "set"],
      taker_long_short: ["record", "set"],
      symbols_meta: ["record", "set"],
      liquidation: ["events", "set"],
      kline: ["series"],
      // 사이클 2 Step 3 (2026-07-08): history 시계열 6종 — 순수 series.
      open_interest_history: ["series"],
      top_ls_ratio_accounts_history: ["series"],
      top_ls_ratio_positions_history: ["series"],
      global_ls_ratio_history: ["series"],
      taker_long_short_history: ["series"],
      basis_history: ["series"],
    });
    const compShapes = Object.fromEntries(
      getAllComponents().map((c) => [c.id, c.acceptsShapes ?? null]),
    );
    expect(compShapes).toEqual({
      "ticker-card": ["record"],
      "table-card": ["set"],
      "kline-chart-card": ["series"],
      "indicator-card": ["record"],
      "feed-card": ["events"],
      // 사이클 2 Step 5 (2026-07-09): 자체 series 차트 form 등록.
      "chart-card": ["series"],
    });
  });

  it("[불변식 6] servableShapes/acceptsShapes 는 promptInjection 비노출 (AI 비노출 회귀 가드)", () => {
    // serializeDatasource/serializeComponent 가 allowlist 직렬화라 현재 안전 —
    // 전 필드 dump 로 리팩터되는 미래 실수를 잡는다 (transport/subscribesByTopic 가드 동형).
    const text = generatePromptInjection();
    expect(text).not.toContain("servableShapes");
    expect(text).not.toContain("acceptsShapes");
  });

  it("[불변식 7] shapeIntersection/areShapesCompatible — 미등록·nullish 는 graceful (throw 금지)", () => {
    expect(shapeIntersection("nonexistent-card", "now_spot_ticker")).toEqual([]);
    expect(shapeIntersection("table-card", "nonexistent-ds")).toEqual([]);
    expect(shapeIntersection(undefined, "now_spot_ticker")).toEqual([]);
    expect(shapeIntersection("table-card", null)).toEqual([]);
    expect(shapeIntersection("", "")).toEqual([]);
    expect(areShapesCompatible(undefined, undefined)).toBe(false);
  });

  it("[불변식 8] shape enum 은 정확히 5종 (Architecture.md §8 정합, scalar=Stage 1b placeholder)", () => {
    expect(DataShapeKindSchema.options).toEqual([
      "scalar",
      "record",
      "set",
      "series",
      "events",
    ]);
    // scalar 는 선언만 되고 현재 어떤 servable/accepts 에도 미사용 (Stage 1b 에서 첫 사용).
    for (const ds of getAllDatasources()) {
      expect(ds.servableShapes ?? []).not.toContain("scalar");
    }
    for (const comp of getAllComponents()) {
      expect(comp.acceptsShapes ?? []).not.toContain("scalar");
    }
  });

  it("shape 교집합 실측 — 대표 조합 (렌더 게이트가 아닌 호환성 판정)", () => {
    // 궁합 있음: 실제 dataShapes 조합들
    expect(shapeIntersection("table-card", "liquidation")).toEqual(["set"]);
    expect(shapeIntersection("feed-card", "liquidation")).toEqual(["events"]);
    expect(shapeIntersection("ticker-card", "now_spot_ticker")).toEqual(["record"]);
    // 궁합 없음: feed(events) × ticker(record/set) — 무의미 조합
    expect(areShapesCompatible("feed-card", "now_spot_ticker")).toBe(false);
    // ★ 궁합은 있지만 dataShapes 에 없어 렌더는 불가한 조합 — shape 는 필요조건일 뿐
    //   (kline=series 를 미래 chart form 이 자동 렌더한다고 오판하지 않는 근거).
    expect(areShapesCompatible("kline-chart-card", "kline")).toBe(true);
  });
});

// ─── 사이클 2 Step 3 (2026-07-08): history 시계열 datasource 계약 핀 ─────────────
//   seriesFetch(useDataServiceSeries)가 실제 존중하는 축만 queryableFields 로 노출
//   한다는 정직성 계약을 빌드타임에 박제 (zod 자문 — silent-wrong 필터 차단).

describe("history 시계열 datasource 6종 계약 (사이클 2 Step 3)", () => {
  ensureRegistries();

  const HISTORY_IDS = [
    "open_interest_history",
    "top_ls_ratio_accounts_history",
    "top_ls_ratio_positions_history",
    "global_ls_ratio_history",
    "taker_long_short_history",
    "basis_history",
  ];

  it("공통 골격: category _history / table 공유 / refreshTier low / servableShapes ['series']", () => {
    for (const id of HISTORY_IDS) {
      const ds = getDatasource(id);
      expect(ds, `미등록: ${id}`).toBeDefined();
      expect(ds?.category).toBe("_history");
      expect(ds?.table).toBe("history_futures_indicator");
      expect(ds?.refreshTier).toBe("low");
      expect(ds?.servableShapes).toEqual(["series"]);
      expect(ds?.transport).toBe("realtime"); // 미설정 default — pull 은 transport 무관
      expect(ds?.liveTopicSpec).toBeUndefined();
    }
  });

  it("★ 값 컬럼 미노출 — queryableFields 는 seriesFetch 가 존중하는 축만 (silent-wrong 차단)", () => {
    // 값/파생 컬럼이 노출되면 AI 의 "OI > X" 필터가 스키마를 통과한 뒤 조용히 무시됨.
    const VALUE_COLUMNS = [
      "open_interest", "oi_chg_5m", "oi_chg_15m", "oi_chg_1h", "oi_chg_4h",
      "top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio",
      "taker_buy_sell_ratio", "taker_buy_vol", "taker_sell_vol",
      "basis", "basis_rate", "annualized_basis_rate",
      "mark_price", "index_price", "predicted_funding_rate", "last_settled_funding_rate",
    ];
    for (const id of HISTORY_IDS) {
      const names = new Set(getDatasource(id)!.queryableFields.map((f) => f.name));
      for (const col of VALUE_COLUMNS) {
        expect(names.has(col), `${id}: 값 컬럼 "${col}" 이 queryableFields 에 노출됨`).toBe(false);
      }
      // 축 필드는 정확히: commonField(exchange/symbol) + override 3종.
      expect([...names].sort()).toEqual(
        ["exchange", "interval", "market_type", "recorded_at", "symbol"],
      );
    }
  });

  it("recorded_at = string(ISO) + range/sortable — liquidation trade_time 교훈 회귀 가드", () => {
    for (const id of HISTORY_IDS) {
      const f = getDatasource(id)!.queryableFields.find((q) => q.name === "recorded_at");
      expect(f?.type, id).toBe("string"); // number 선언 시 필터가 문자열 비교로 무력화
      expect(f?.operators, id).toEqual([">", ">=", "<", "<=", "="]);
      expect(f?.sortable, id).toBe(true);
    }
  });

  it("interval = enum 9종 + operators ['='] (seriesFetch 는 한 번에 1개 — 'in' over-promise 금지)", () => {
    for (const id of HISTORY_IDS) {
      const f = getDatasource(id)!.queryableFields.find((q) => q.name === "interval");
      expect(f?.type, id).toBe("enum");
      expect(f?.operators, id).toEqual(["="]);
      expect(f?.enumValues, id).toEqual(["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"]);
    }
  });

  it("market_type override = 선물 2종 (spot 포함 commonField 상속은 부정직)", () => {
    for (const id of HISTORY_IDS) {
      const f = getDatasource(id)!.queryableFields.find((q) => q.name === "market_type");
      expect(f?.enumValues, id).toEqual(["futures_usdm", "futures_coinm"]);
    }
  });

  it("history 6종은 AI 에 직렬화되고(id 노출) 내부 필드는 비노출", () => {
    const text = generatePromptInjection();
    for (const id of HISTORY_IDS) {
      expect(text).toContain(`(${id})`); // AI 가 논리 id 를 인지
    }
    expect(text).not.toContain("history_futures_indicator"); // 물리 테이블명 비노출
  });
});

// ─── 경로 A transport + liveTopicSpec (M2 경로 A Step 3) ─────────────

describe("datasource transport + buildLiveTopic", () => {
  beforeEach(clearAll);

  it("transport 생략 시 default 'realtime' — 기존 entry 하위호환", () => {
    registerDatasource({
      id: "ds-b",
      name: "Path B",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
    });
    expect(getDatasource("ds-b")?.transport).toBe("realtime");
  });

  it("ws_direct + liveTopicSpec 등록 성공 + transport 보존", () => {
    const ok = registerDatasource({
      id: "ds-a",
      name: "Path A",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "binance:ticker", selectorKeys: ["market_type", "symbol"] },
    });
    expect(ok).toBe(true);
    expect(getDatasource("ds-a")?.transport).toBe("ws_direct");
  });

  it("ws_direct 인데 liveTopicSpec 누락 → superRefine 거부 (graceful false)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = registerDatasource({
      id: "ds-bad",
      name: "Bad",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      // liveTopicSpec 없음
    });
    expect(ok).toBe(false);
    expect(getDatasource("ds-bad")).toBeUndefined();
    errSpy.mockRestore();
  });

  it("buildLiveTopic — spec + selector 로 불투명 토픽 조립 (워커·프론트 단일 진실)", () => {
    registerDatasource({
      id: "now_futures_ticker",
      name: "Futures Ticker",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "binance:ticker", selectorKeys: ["market_type", "symbol"] },
    });
    expect(
      buildLiveTopic("now_futures_ticker", { market_type: "futures_usdm", symbol: "BTCUSDT" }),
    ).toBe("binance:ticker:futures_usdm:BTCUSDT");
  });

  it("buildLiveTopic — spec 없음(realtime/미등록) 또는 selector 키 누락 → null (graceful)", () => {
    registerDatasource({
      id: "ds-rt",
      name: "Realtime",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
      // transport realtime (기본), spec 없음
    });
    expect(buildLiveTopic("ds-rt", { symbol: "BTCUSDT" })).toBeNull(); // spec 없음
    expect(buildLiveTopic("ds-missing", { symbol: "BTCUSDT" })).toBeNull(); // 미등록

    registerDatasource({
      id: "ds-a2",
      name: "Path A2",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "x", selectorKeys: ["market_type", "symbol"] },
    });
    // market_type 키 누락 → null (방송/구독 skip)
    expect(buildLiveTopic("ds-a2", { symbol: "BTCUSDT" })).toBeNull();
  });

  it("transport/liveTopicSpec 는 promptInjection 에 노출 안 됨 (AI 비노출 = table 과 동일)", () => {
    registerDatasource({
      id: "ds-hidden",
      name: "Hidden Path A",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "secret:prefix", selectorKeys: ["symbol"] },
    });
    const text = generatePromptInjection();
    expect(text).toContain("Hidden Path A (ds-hidden)"); // datasource 자체는 노출
    expect(text).not.toContain("ws_direct"); // 운반 경로는 비노출
    expect(text).not.toContain("secret:prefix"); // 토픽 형식도 비노출
  });
});

// ─── optionalSelectorKeys + buildLiveTopics (M2 fast-follow #2, "둘 다") ─────
describe("optionalSelectorKeys + buildLiveTopics", () => {
  beforeEach(clearAll);

  // 청산처럼 required[market_type] + optional[symbol] 인 datasource 등록 헬퍼.
  function registerLiq() {
    registerDatasource({
      id: "liquidation",
      name: "Liquidation",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: {
        prefix: "binance:liquidation",
        selectorKeys: ["market_type"],
        optionalSelectorKeys: ["symbol"],
      },
    });
  }

  it("회귀 0 — optionalSelectorKeys 미선언 datasource 는 토픽 출력 byte-identical", () => {
    registerDatasource({
      id: "now_futures_ticker",
      name: "Futures Ticker",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "binance:ticker", selectorKeys: ["market_type", "symbol"] },
    });
    const sel = { market_type: "futures_usdm", symbol: "BTCUSDT" };
    // 단수: 기존과 동일
    expect(buildLiveTopic("now_futures_ticker", sel)).toBe("binance:ticker:futures_usdm:BTCUSDT");
    // 복수: 정확히 1개 원소(워커 발행 거동 동일)
    expect(buildLiveTopics("now_futures_ticker", sel)).toEqual([
      "binance:ticker:futures_usdm:BTCUSDT",
    ]);
  });

  it("buildLiveTopic(단수) — symbol 있으면 심볼 토픽 / 없으면 tape 토픽(프론트 구독)", () => {
    registerLiq();
    // symbol 있음 → 심볼별
    expect(buildLiveTopic("liquidation", { market_type: "futures_usdm", symbol: "BTCUSDT" })).toBe(
      "binance:liquidation:futures_usdm:BTCUSDT",
    );
    // symbol 없음 → tape (optional 생략)
    expect(buildLiveTopic("liquidation", { market_type: "futures_usdm" })).toBe(
      "binance:liquidation:futures_usdm",
    );
  });

  it("buildLiveTopic(단수) — 필수(market_type) 누락 → null (graceful, tape도 불가)", () => {
    registerLiq();
    expect(buildLiveTopic("liquidation", { symbol: "BTCUSDT" })).toBeNull();
  });

  it("buildLiveTopics(복수) — symbol 있으면 tape+심볼 둘 다 fan-out", () => {
    registerLiq();
    expect(
      buildLiveTopics("liquidation", { market_type: "futures_usdm", symbol: "BTCUSDT" }),
    ).toEqual([
      "binance:liquidation:futures_usdm", // tape
      "binance:liquidation:futures_usdm:BTCUSDT", // + symbol
    ]);
  });

  it("buildLiveTopics(복수) — symbol 없으면 tape 1개만", () => {
    registerLiq();
    expect(buildLiveTopics("liquidation", { market_type: "futures_usdm" })).toEqual([
      "binance:liquidation:futures_usdm",
    ]);
  });

  it("buildLiveTopics(복수) — 필수 누락/미등록 → [] (발행 skip)", () => {
    registerLiq();
    expect(buildLiveTopics("liquidation", { symbol: "BTCUSDT" })).toEqual([]); // market_type 누락
    expect(buildLiveTopics("ds-missing", { market_type: "futures_usdm" })).toEqual([]); // 미등록
  });

  it("★ 단일 진실 — 프론트 단수 토픽은 항상 워커 복수 fan-out 집합의 원소", () => {
    registerLiq();
    const cases: Record<string, string>[] = [
      { market_type: "futures_usdm", symbol: "ETHUSDT" },
      { market_type: "futures_coinm" }, // tape
    ];
    for (const sel of cases) {
      const single = buildLiveTopic("liquidation", sel);
      const fanout = buildLiveTopics("liquidation", sel);
      expect(single).not.toBeNull();
      expect(fanout).toContain(single!); // drift 구조적 불가 증명
    }
  });

  it("optional 2개 누적: tape→+a→+a+b 3단계 + 중간 빈 칸 break 규약 (W1)", () => {
    registerDatasource({
      id: "ds-multi",
      name: "Multi",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "x", selectorKeys: ["m"], optionalSelectorKeys: ["a", "b"] },
    });
    // 전부 채움 → 3단계 누적 fan-out
    expect(buildLiveTopics("ds-multi", { m: "M", a: "A", b: "B" })).toEqual([
      "x:M",
      "x:M:A",
      "x:M:A:B",
    ]);
    // ★ 중간 빈 칸: a 없고 b 있어도 b 는 버려짐(첫 누락에서 break) — 순서 의존 계층 규약
    expect(buildLiveTopics("ds-multi", { m: "M", b: "B" })).toEqual(["x:M"]);
    expect(buildLiveTopic("ds-multi", { m: "M", b: "B" })).toBe("x:M");
    // 단수 = 복수 마지막(가장 긴) — 전부 채우면 +a+b
    expect(buildLiveTopic("ds-multi", { m: "M", a: "A", b: "B" })).toBe("x:M:A:B");
  });

  it("selectorKeys 내부 중복 → 등록 거부 (graceful false, S3)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = registerDatasource({
      id: "ds-dup-req",
      name: "DupReq",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "x", selectorKeys: ["m", "m"] }, // 필수 내부 중복
    });
    expect(ok).toBe(false);
    errSpy.mockRestore();
  });

  it("required ∪ optional 중복 → 등록 거부 (graceful false)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = registerDatasource({
      id: "ds-dup",
      name: "Dup",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: {
        prefix: "x",
        selectorKeys: ["market_type"],
        optionalSelectorKeys: ["market_type"], // required 와 중복
      },
    });
    expect(ok).toBe(false);
    errSpy.mockRestore();
  });
});

// ─── row 병합 모드 mergeMode (M2 경로 A fast-follow #1 Step 2) ─────────
// 스키마 거동만 검증(중립 id/name — "partial"/"replace" 단어를 엔트리에 안 씀:
//   id/name 은 promptInjection 노출 대상이라 AI 비노출 단언을 오염시킴).
// 실 datasource(premium_index=partial / ticker=replace) 단언은 defaults 가 상주하는
//   web transport.test.ts 가 담당(이 파일은 beforeEach(clearAll)로 defaults 비움).
describe("datasource mergeMode", () => {
  it("mergeMode 생략 시 default 'replace' — 기존 entry 하위호환", () => {
    registerDatasource({
      id: "mm-a",
      name: "MM A",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
    });
    expect(getDatasource("mm-a")?.mergeMode).toBe("replace");
  });

  it("mergeMode 명시 등록 + 보존", () => {
    registerDatasource({
      id: "mm-b",
      name: "MM B",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
      mergeMode: "partial",
    });
    expect(getDatasource("mm-b")?.mergeMode).toBe("partial");
  });

  it("mergeMode 는 promptInjection 에 노출 안 됨 (AI 비노출 = transport 와 동일)", () => {
    registerDatasource({
      id: "mm-c",
      name: "MM C",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
      mergeMode: "partial",
    });
    const text = generatePromptInjection();
    expect(text).toContain("MM C (mm-c)"); // datasource 자체는 노출
    expect(text).not.toContain("partial"); // 병합 모드 값은 비노출
  });
});

// ─── 4개 레지스트리 독립성 테스트 ───────────────────

describe("레지스트리 독립성", () => {
  beforeEach(clearAll);

  it("한 레지스트리 clear가 다른 레지스트리에 영향 없음", () => {
    registerExchange({
      id: "ex",
      name: "Ex",
      marketTypes: ["spot"],
      baseRestUrl: "https://ex.com",
      baseWsUrl: "wss://ex.com",
      batchSupport: true,
    });
    registerDatasource({
      id: "ds",
      name: "Ds",
      category: "_now",
      refreshTier: "low",
      queryableFields: [],
    });

    clearExchanges();

    expect(getAllExchanges()).toHaveLength(0);
    expect(getAllDatasources()).toHaveLength(1);
  });
});

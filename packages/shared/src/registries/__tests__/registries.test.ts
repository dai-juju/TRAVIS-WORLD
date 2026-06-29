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
  clearComponents,
} from "../componentRegistry";
import {
  registerInteraction,
  getAllInteractions,
  clearInteractions,
} from "../interactionRegistry";
import { generatePromptInjection } from "../promptInjection";
import { ensureRegistries } from "../../test-utils/registrySetup";

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

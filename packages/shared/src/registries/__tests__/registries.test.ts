/**
 * M1.2 레지스트리 단위 테스트.
 *
 * 핵심 검증: 새 항목 등록 → promptInjection에 자동 반영.
 * 이것이 TRAVIS의 "오케스트레이터 코드 변경 없이 확장" 원칙의 증명.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerExchange,
  getAllExchanges,
  clearExchanges,
  ExchangeEntrySchema,
} from "../exchangeRegistry";
import {
  registerDatasource,
  getAllDatasources,
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
    expect(all[0]?.queryableFields).toHaveLength(1);
    expect(all[0]?.queryableFields[0]?.name).toBe("volume_24h");
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

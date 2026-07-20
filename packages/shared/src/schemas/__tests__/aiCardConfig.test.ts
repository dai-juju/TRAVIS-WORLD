/**
 * AiCardConfigSchema 단위 테스트.
 *
 * 이 스키마가 M1.5에서 Claude 출력의 runtime 게이트가 되므로,
 * 엄격성(strict, unknown key 차단)과 discriminated union의
 * operator↔value 매칭이 핵심 검증 포인트.
 *
 * M1.6 Step 4 (2026-04-28, [3-7] 회수): registry-derived refinement 도입 후
 *   componentId / datasource / targetComponentId 가 실제 등록된 id 만 통과.
 *   픽스처도 실제 등록된 id (now_futures_ticker, big-value-card, table-card,
 *   kline-chart-card, spawn) 로 정합. 또한 ensureRegistries() 로 격리.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { AiCardConfigSchema } from "../aiCardConfig";
import { FilterClauseSchema } from "../filterClause";
import { ensureRegistries } from "../../test-utils/registrySetup";
import { registerComponent } from "../../registries/componentRegistry";
import { registerDatasource } from "../../registries/datasourceRegistry";

describe("AiCardConfigSchema", () => {
  ensureRegistries();

  it("유효한 BigValueCard 설정을 통과시킨다 (value 모드, 단일 symbol)", () => {
    const config = {
      id: "ticker-btc-1",
      componentId: "big-value-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("유효한 TableCard 스크리너 설정을 통과시킨다 (content 모드, filters + sort + limit)", () => {
    const config = {
      id: "list-oi-surge",
      componentId: "table-card",
      size: "lg" as const,
      updateMode: "content" as const,
      data: {
        // M1.6 Step 4: 실제 등록된 datasource id 사용 (옛 `now_futures_indicator`
        //   는 indicator datasource 로 분리됨 — premium_index / open_interest /
        //   long_short_ratio / taker_long_short / basis, M2 테마 A Step 2 에서 basis 추가).
        datasource: "now_futures_ticker",
        exchange: "binance",
        filters: [
          { field: "price_chg_5m", operator: ">", value: 0.03 },
          { field: "symbol", operator: "in", value: ["BTCUSDT", "ETHUSDT"] },
        ],
        // sort.field 도 실제 queryableFields 등록된 컬럼명 사용 (옛 `volume_usd`
        //   는 hallucinated — 실제 컬럼은 `quote_volume`).
        sort: { field: "quote_volume", direction: "desc" as const },
        limit: 20,
      },
      // M3-step1 (2026-07-16): 구형 { targetComponentId } 평면 → { target } 중첩.
      //   AI 사전 선언 방식 — 클릭 시 띄울 카드의 form × data 를 미리 선언,
      //   symbol 은 parameterMapping 으로 클릭 행에서 채움.
      actions: [
        {
          trigger: "row-click" as const,
          type: "spawn" as const,
          target: {
            componentId: "kline-chart-card",
            updateMode: "value" as const,
            data: {
              datasource: "kline",
              exchange: "binance",
              interval: "1h",
            },
          },
          parameterMapping: { symbol: "symbol" },
        },
      ],
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  // ─── [10-62] (2026-06-26): ws_direct 단일 row 카드 marketType 필수 ───
  it("ws_direct 단일 row (premium_index) 가 marketType 없으면 reject (경로 A 토픽 조립 불가)", () => {
    const config = {
      id: "funding-btc-no-market",
      componentId: "detail-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "premium_index",
        exchange: "binance",
        symbol: "BTCUSDT",
        // marketType 누락 — 경로 A 토픽 조립 불가 → 라이브 frozen 위험 차단
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toContain("market_type"); // 에러 경로/문구
      expect(msg).toContain("futures_usdm"); // self-correction 힌트 (예시 명시)
    }
  });

  it("ws_direct 단일 row (premium_index) 가 marketType 있으면 통과 ([10-62] 정상 경로 A)", () => {
    const config = {
      id: "funding-btc-ok",
      componentId: "detail-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "premium_index",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("ws_direct 리스트 카드(symbol 없음 + filters)는 marketType 없어도 통과 (테이블=경로 B)", () => {
    const config = {
      id: "futures-list",
      componentId: "table-card",
      size: "lg" as const,
      updateMode: "content" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        filters: [{ field: "quote_asset", operator: "=" as const, value: "USDT" }],
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("허용되지 않은 operator는 reject", () => {
    // "contains"는 현재 지원하지 않음 — discriminated union에서 컷
    const bad = {
      field: "symbol",
      operator: "contains",
      value: "BTC",
    };
    const result = FilterClauseSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("unknown key는 strict에 의해 reject (환각/오타 차단)", () => {
    const config = {
      id: "ticker-1",
      componentId: "big-value-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: { datasource: "now_spot_ticker", symbol: "BTCUSDT" },
      // AI가 환각으로 넣은 미지정 필드
      unknownField: "oops",
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  // ─── componentId ↔ datasource 결합 검증 (M2 테마 A Step 3, 2026-06-11) ───
  //   dataShapes 에 선언되지 않은 조합은 reject + 에러 메시지에 허용 목록 dump.

  it("feed-card + open_interest 조합은 reject (dataShapes 미선언 — F3 잔재 차단)", () => {
    // Stage 1b (2026-07-14): 옛 픽스처 "ticker-card + open_interest" 는 수렴 후
    //   big-value-card 가 open_interest 를 정당 지원해 의미 소실 → "유효 컴포넌트 ×
    //   미지원 datasource" 쌍을 feed-card(=liquidation 전용)로 교체해 의미 보존
    //   (Stage 1 의 reject 픽스처 교체 선례와 동일).
    const config = {
      id: "list-oi-wrong",
      componentId: "feed-card",
      size: "lg" as const,
      updateMode: "content" as const,
      data: {
        datasource: "open_interest",
        exchange: "binance",
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      // AI self-correction 용 허용 목록 dump 확인
      expect(msg).toContain('does not support datasource "open_interest"');
      expect(msg).toContain("liquidation");
    }
  });

  it("table-card + open_interest 조합은 통과 (dataShapes 선언됨)", () => {
    const config = {
      id: "oi-ranking-1",
      componentId: "table-card",
      size: "md" as const,
      updateMode: "content" as const,
      data: {
        datasource: "open_interest",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        sort: { field: "open_interest", direction: "desc" as const },
        limit: 10,
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("detail-card + premium_index 기존 조합 회귀 통과", () => {
    const config = {
      id: "funding-btc",
      componentId: "detail-card",
      size: "sm" as const,
      updateMode: "value" as const,
      data: {
        datasource: "premium_index",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  // ─── quote_asset 필터 (M2 테마 B [10-2], 2026-06-11) ───
  //   ticker 양 datasource 에 quote_asset queryableField 신설 — F2 ("USDT pairs"
  //   쿼리에 TRY/IDR 혼입) 의 schema 레이어 회수. superRefine 통과 + 오타 reject 검증.

  it("now_spot_ticker + quote_asset '=' 필터 통과 (F2 회수 — USDT pairs only)", () => {
    const config = {
      id: "spot-usdt-gainers",
      componentId: "table-card",
      size: "lg" as const,
      updateMode: "content" as const,
      data: {
        datasource: "now_spot_ticker",
        exchange: "binance",
        marketType: "spot" as const,
        filters: [{ field: "quote_asset", operator: "=", value: "USDT" }],
        sort: { field: "price_change_pct", direction: "desc" as const },
        limit: 20,
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("now_futures_ticker + quote_asset 'in' 배열 필터 통과 (USDT/USDC perps)", () => {
    const config = {
      id: "perp-stable-quotes",
      componentId: "table-card",
      size: "lg" as const,
      updateMode: "content" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        filters: [
          { field: "quote_asset", operator: "in", value: ["USDT", "USDC"] },
        ],
        limit: 20,
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("미등록 필터 필드 (quote_asset 오타) 는 여전히 reject — 허용 목록 dump 포함", () => {
    const config = {
      id: "spot-typo",
      componentId: "table-card",
      size: "lg" as const,
      updateMode: "content" as const,
      data: {
        datasource: "now_spot_ticker",
        exchange: "binance",
        filters: [{ field: "quote_aset", operator: "=", value: "USDT" }],
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      expect(msg).toContain("quote_asset"); // 허용 목록 dump 에 정식 필드명 노출
    }
  });

  it("in operator는 array value만 수용 (scalar value reject)", () => {
    const valid = {
      field: "symbol",
      operator: "in" as const,
      value: ["BTCUSDT", "ETHUSDT"],
    };
    expect(FilterClauseSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      field: "symbol",
      operator: "in" as const,
      value: "BTCUSDT", // scalar — in에는 허용 안 됨
    };
    expect(FilterClauseSchema.safeParse(invalid).success).toBe(false);
  });
});

// ─── ff#2 재개 Step 1 (2026-07-05): subscribesByTopic refine 일반화 ────────────
//
// 옛 2.5([10-62])는 `cfg.data.symbol &&` 게이트라 "symbol 없는 전체 tape 카드"의
//   marketType 누락이 통과 → 토픽 null → 영구 빈 피드(ff#1 frozen 54d7b98 악화판).
//   일반화: subscribesByTopic 컴포넌트는 필수 selectorKey 전부 요구 / optional 은 자유.
describe("AiCardConfigSchema — subscribesByTopic 일반화 (ff#2 재개 Step 1)", () => {
  ensureRegistries();

  it("big-value-card: marketType 만 있고 symbol 누락 → reject (필수 selectorKey 전부 강제)", () => {
    // 옛 2.5 는 symbol 게이트라 이 케이스가 통과했다(어차피 깨진 카드) — 일반화가 잡음.
    const config = {
      id: "ticker-no-symbol",
      componentId: "big-value-card",
      size: "sm" as const,
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        marketType: "futures_usdm" as const,
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      expect(msg).toContain("data.symbol"); // self-correction 힌트
    }
  });

  it("updateMode ∉ supportedUpdateModes → reject (big-value-card + content)", () => {
    const config = {
      id: "ticker-wrong-mode",
      componentId: "big-value-card",
      size: "sm" as const,
      updateMode: "content" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
      },
    };
    const result = AiCardConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      expect(msg).toContain("value"); // 허용 모드 dump
    }
  });
});

describe("AiCardConfigSchema — 전체 tape 카드 (optional selectorKey 자유)", () => {
  ensureRegistries();

  // 합성 events datasource + subscribesByTopic 컴포넌트 — 청산 feed-card 등록(Step 5)
  //   전에 "tape(필수만)/심볼별(optional 추가)" 계약 자체를 박제. liquidation 은 아직
  //   transport realtime(휴면)이라 실엔트리로는 이 refine 이 발화하지 않는다.
  beforeAll(() => {
    registerDatasource({
      id: "test_events_tape",
      name: "Test Events Tape",
      category: "_history",
      refreshTier: "realtime",
      transport: "ws_direct",
      liveTopicSpec: {
        prefix: "test:events",
        selectorKeys: ["market_type"],
        optionalSelectorKeys: ["symbol"],
      },
      queryableFields: [
        {
          name: "side",
          type: "enum",
          operators: ["="],
          enumValues: ["BUY", "SELL"],
        },
      ],
    });
    registerComponent({
      id: "test-feed-card",
      name: "Test Feed Card",
      description: "test-only feed form",
      supportedSizes: ["md"],
      supportedUpdateModes: ["content"],
      dataShapes: [
        { datasourceId: "test_events_tape", requiredFields: ["side"] },
      ],
      supportedInteractions: [],
      defaultSize: "md",
      subscribesByTopic: true,
    });
  });

  const base = {
    id: "tape-1",
    componentId: "test-feed-card",
    size: "md" as const,
    updateMode: "content" as const,
  };

  it("tape 카드(symbol 없음): marketType 누락 → reject (옛 2.5 의 구멍이 막힘)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...base,
      data: { datasource: "test_events_tape", exchange: "binance" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      expect(msg).toContain("futures_usdm"); // market_type 힌트 메시지 유지
    }
  });

  it("tape 카드(symbol 없음): marketType 있으면 통과 — optional selectorKey 는 자유", () => {
    const result = AiCardConfigSchema.safeParse({
      ...base,
      data: {
        datasource: "test_events_tape",
        exchange: "binance",
        marketType: "futures_usdm" as const,
      },
    });
    expect(result.success).toBe(true);
  });

  it("심볼별 카드(symbol 지정 + marketType) 통과 — 계층 토픽 분기", () => {
    const result = AiCardConfigSchema.safeParse({
      ...base,
      id: "tape-symbol-1",
      data: {
        datasource: "test_events_tape",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
      },
    });
    expect(result.success).toBe(true);
  });
});

// ─── 사이클 4a [10-101] (2026-07-12): 표현 스타일 축 `style` ────────────────
//
// top-level optional style — descriptor(도메인 기본값)의 AI override 통로.
// strict 오타 차단 + enum 밖 거부 + "스타일 비소비 컴포넌트에 와도 스키마 통과
// (form 이 무시 = graceful)" 정책을 핀.
describe("AiCardConfigSchema — style 표현 축 ([10-101])", () => {
  ensureRegistries();

  const chartBase = {
    id: "funding-line-btc-1",
    componentId: "chart-card",
    size: "lg" as const,
    updateMode: "value" as const,
    data: {
      datasource: "open_interest_history",
      exchange: "binance",
      marketType: "futures_usdm" as const,
      symbol: "BTCUSDT",
      interval: "1h",
    },
  };

  it("chart-card + style.series='line' 통과 (유저 명시 스타일 override 경로)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      style: { series: "line" as const },
    });
    expect(result.success).toBe(true);
  });

  it("style 생략 = 기존 config 그대로 valid (하위 호환 — 저장 뷰 무회귀)", () => {
    expect(AiCardConfigSchema.safeParse(chartBase).success).toBe(true);
  });

  it("style 내부 unknown key 는 strict 로 reject (환각/오타 조기 검출)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      style: { series: "line", color: "red" },
    });
    expect(result.success).toBe(false);
  });

  it("enum 밖 스타일('candle'/'stepped')은 reject — stepped 는 form 소유 파생 스타일", () => {
    for (const bad of ["candle", "stepped"]) {
      const result = AiCardConfigSchema.safeParse({
        ...chartBase,
        style: { series: bad },
      });
      expect(result.success, bad).toBe(false);
    }
  });

  it("스타일 비소비 컴포넌트(big-value-card)에 style 이 와도 스키마 통과 (form 이 무시)", () => {
    const result = AiCardConfigSchema.safeParse({
      id: "ticker-btc-style",
      componentId: "big-value-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
      },
      style: { series: "line" as const },
    });
    expect(result.success).toBe(true);
  });

  // ── breakdown 표현 축 ([10-121] M3-step3b, 2026-07-20) ──
  it("style.breakdown 두 값('total'/'components') 통과 + 생략 valid (하위 호환)", () => {
    for (const value of ["total", "components"] as const) {
      const result = AiCardConfigSchema.safeParse({
        ...chartBase,
        style: { breakdown: value },
      });
      expect(result.success, value).toBe(true);
    }
    // series 와 동시 지정도 독립 축이라 통과.
    expect(
      AiCardConfigSchema.safeParse({
        ...chartBase,
        style: { series: "bars" as const, breakdown: "components" as const },
      }).success,
    ).toBe(true);
  });

  it("enum 밖 breakdown('stacked'/'diverging')은 reject — 다이버징은 form 소유 렌더 정책", () => {
    for (const bad of ["stacked", "diverging"]) {
      const result = AiCardConfigSchema.safeParse({
        ...chartBase,
        style: { breakdown: bad },
      });
      expect(result.success, bad).toBe(false);
    }
  });
});

// ─── M3-step1 (2026-07-16): CardAction "AI 사전 선언" 계약 — SpawnTarget 중첩 ────
//
// 클릭 시 AI 재호출 없이 프론트가 조립하는 방식의 스키마 백본. 검증 역할 분담:
//   emit 시점(여기) = target 만으로 판정 가능한 조합 결함((1)/(1.5)/(4)) + 매핑 key.
//   클릭 시점(spawnCard.ts) = 조립 후 AiCardConfigSchema.safeParse 가 스코프 완결성
//   최종 게이트 — emit 에서 symbol 을 강제하면 "행에서 채울 예정" 정상 케이스 오탐.
describe("CardActionSchema — SpawnTarget 사전 선언 (M3-step1)", () => {
  ensureRegistries();

  const sourceCard = {
    id: "screener-src-1",
    componentId: "table-card",
    size: "lg" as const,
    updateMode: "content" as const,
    data: {
      datasource: "now_futures_ticker",
      exchange: "binance",
      sort: { field: "price_change_pct", direction: "desc" as const },
      limit: 10,
    },
  };

  const validAction = {
    trigger: "row-click" as const,
    type: "spawn" as const,
    target: {
      componentId: "big-value-card",
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
      },
    },
    parameterMapping: { symbol: "symbol", marketType: "market_type" },
  };

  it("target.data.symbol 생략 통과 — 스코프 완결성은 클릭 시점으로 이연", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [validAction],
    });
    expect(result.success).toBe(true);
  });

  it("target.size 생략 통과 — 레이아웃은 defaultSize 폴백 (AI 표시 의도 아님)", () => {
    const noSize = { ...validAction, target: { ...validAction.target } };
    expect("size" in noSize.target).toBe(false); // 픽스처 자체가 size 미포함 핀
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [noSize],
    });
    expect(result.success).toBe(true);
  });

  it("emit 부분검증: target componentId↔datasource 미선언 조합 reject + 허용 목록 dump", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        {
          ...validAction,
          target: {
            ...validAction.target,
            componentId: "feed-card", // feed-card 는 ticker datasource 미지원
          },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.join(".").includes("target.data.datasource"),
      );
      expect(issue?.message).toContain("does not support datasource");
    }
  });

  it("emit 부분검증: target updateMode 미지원 reject (big-value-card + content)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        {
          ...validAction,
          target: { ...validAction.target, updateMode: "content" as const },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.join(".").includes("target.updateMode"),
      );
      expect(issue?.message).toContain("supports update modes");
    }
  });

  it("parameterMapping key 비허용(행 파생 불가 필드) reject — limit 은 target.data 소속", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        { ...validAction, parameterMapping: { limit: "quote_volume" } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      expect(msg).toContain("not row-mappable");
      expect(msg).toContain("symbol"); // 허용 필드 dump (self-correction 힌트)
    }
  });

  it("parameterMapping value 미등록 소스 컬럼 reject — 부모 datasource 파생 검증", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        { ...validAction, parameterMapping: { symbol: "not_a_column" } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.join(".").includes("parameterMapping.symbol"),
      );
      expect(issue?.message).toContain('source column "not_a_column"');
    }
  });

  it("구형 평면 { targetComponentId } shape 는 strict 로 reject — 클린 교체 핀", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        {
          trigger: "row-click" as const,
          type: "spawn" as const,
          targetComponentId: "big-value-card",
          parameterMapping: { symbol: "symbol" },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ─── M3-step2 [10-115] (2026-07-17): 재클릭 체인 — 깊이 1 명시 중첩 ──────────
//
// 재귀(z.lazy)가 아닌 깊이 1 명시 중첩 채택 근거: route.ts 의 tool input_schema
//   변환이 $refStrategy:"none" 이라 재귀 지점이 {}(무제약)로 뭉개짐. 체인 상한 =
//   소스 → mid(클릭 가능) → leaf(말단) 2 hop 을 스키마가 구조로 강제한다.
describe("CardActionSchema — 재클릭 체인 깊이 1 (M3-step2 [10-115])", () => {
  ensureRegistries();

  const sourceCard = {
    id: "screener-src-2",
    componentId: "table-card",
    size: "lg" as const,
    updateMode: "content" as const,
    data: {
      datasource: "now_futures_ticker",
      exchange: "binance",
      sort: { field: "price_change_pct", direction: "desc" as const },
      limit: 10,
    },
  };

  /** mid(detail) 위 header-click → leaf(chart) — 실무 드릴다운 대표 체인. */
  const leafAction = {
    trigger: "header-click" as const,
    type: "spawn" as const,
    target: {
      componentId: "chart-card",
      updateMode: "value" as const,
      data: {
        datasource: "open_interest_history",
        exchange: "binance",
        marketType: "futures_usdm",
        interval: "1h",
      },
    },
    parameterMapping: { symbol: "symbol" },
  };

  const chainAction = {
    trigger: "row-click" as const,
    type: "spawn" as const,
    target: {
      componentId: "detail-card",
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        marketType: "futures_usdm",
      },
      actions: [leafAction],
    },
    parameterMapping: { symbol: "symbol" },
  };

  it("target.actions(깊이 1) 포함 체인 선언 통과 — 표→상세→차트", () => {
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [chainAction],
    });
    expect(result.success).toBe(true);
  });

  it("깊이 2(leaf 안에 또 actions)는 strict 로 reject — 체인 상한 구조 강제", () => {
    const depth2 = {
      ...chainAction,
      target: {
        ...chainAction.target,
        actions: [
          {
            ...leafAction,
            target: { ...leafAction.target, actions: [leafAction] },
          },
        ],
      },
    };
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [depth2],
    });
    expect(result.success).toBe(false);
  });

  it("중첩 leaf 도 emit 부분검증 작동 — 미선언 조합(feed-card×ticker) reject", () => {
    const badLeaf = {
      ...leafAction,
      target: { ...leafAction.target, componentId: "feed-card" },
    };
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        { ...chainAction, target: { ...chainAction.target, actions: [badLeaf] } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join("\n");
      expect(msg).toContain("does not support datasource");
    }
  });

  it("중첩 leaf value 미등록 컬럼 → emit 시점 reject (reviewer W1 — mid datasource 는 선언에 정적 존재)", () => {
    const badLeaf = {
      ...leafAction,
      parameterMapping: { symbol: "not_a_column" },
    };
    const result = AiCardConfigSchema.safeParse({
      ...sourceCard,
      actions: [
        { ...chainAction, target: { ...chainAction.target, actions: [badLeaf] } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.join(".").includes("target.actions.0.parameterMapping.symbol"),
      );
      expect(issue?.message).toContain('source column "not_a_column"');
    }
  });

  it("클릭 시점 자동 승계: mid 카드(AiCardConfig)의 leaf parameterMapping value 를 mid datasource 로 검증", () => {
    // spawn 엔진이 mid 카드를 조립하면 target.actions 가 config.actions 로 관통
    //   — 그 config 의 safeParse 에서 step (5) 가 leaf value ⊆ mid datasource
    //   queryableFields 를 자동 검증한다 (신규 검증 로직 0 의 근거 핀).
    const midCardConfig = {
      id: "spawned-mid-1",
      componentId: "detail-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        marketType: "futures_usdm",
        symbol: "BTCUSDT",
      },
      actions: [
        { ...leafAction, parameterMapping: { symbol: "not_a_column" } },
      ],
    };
    const result = AiCardConfigSchema.safeParse(midCardConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.join(".").includes("parameterMapping.symbol"),
      );
      expect(issue?.message).toContain('source column "not_a_column"');
    }
  });
});

// ─── 사이클 4b Step 5 (2026-07-12): 단일 대상 스코프 파생 강제 — 블록 (3), [10-91]/[10-78] ──
describe("AiCardConfigSchema — 단일 대상 스코프 파생 강제 ([10-91]/[10-78])", () => {
  ensureRegistries();

  const chartBase = {
    id: "scope-chart-1",
    componentId: "chart-card",
    size: "lg" as const,
    updateMode: "value" as const,
  };

  // ─── [10-84] M3-step3a (2026-07-19): optionalScopeFields 면제 ───────────
  //   symbol 생략이 "전 시장 집계"라는 정의된 의미를 갖는 datasource 만 면제.
  //   ★ 면제가 marketType 으로 번지거나 다른 datasource 로 새면 [10-91] 재발.
  it("★ 집계 datasource: symbol 없이 marketType 만 → 통과 (전 시장 집계 = 유효 요청)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "liquidation_volume_history",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        interval: "1h",
      },
    });
    expect(result.success).toBe(true);
  });

  it("★ 집계 datasource: symbol 지정도 통과 (면제 = 강제 안 함이지 금지가 아님)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "liquidation_volume_history",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        symbol: "BTCUSDT",
        interval: "5m",
      },
    });
    expect(result.success).toBe(true);
  });

  it("★ 집계 datasource: marketType 누락은 여전히 reject (면제가 스코프 축 전체로 번지지 않음)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "liquidation_volume_history",
        exchange: "binance",
        interval: "1h",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("data.marketType");
      // symbol 은 면제 대상이라 issue 가 나오면 안 된다.
      expect(paths).not.toContain("data.symbol");
    }
  });

  it("chart-card: marketType 누락 → reject (주기 pull 도 스코프 강제 — 렌더 가드가 2차로 강등)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "open_interest_history",
        exchange: "binance",
        symbol: "BTCUSDT",
        interval: "1h",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("data.marketType");
    }
  });

  it("chart-card: symbol/filters 둘 다 없음 → reject + 오버레이 힌트 메시지", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "open_interest_history",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        interval: "1h",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const symbolIssue = result.error.issues.find(
        (i) => i.path.join(".") === "data.symbol",
      );
      expect(symbolIssue?.message).toContain("overlay"); // self-correction 힌트
    }
  });

  it("chart-card: filters `symbol in [...]` 만으로 통과 (오버레이 경로 보존)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "taker_long_short_history",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        interval: "1h",
        filters: [
          { field: "symbol", operator: "in" as const, value: ["BTCUSDT", "ETHUSDT"] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("chart-card: symbol + filters symbol 동시 지정도 통과 ([10-104] — form 이 union 해석)", () => {
    const result = AiCardConfigSchema.safeParse({
      ...chartBase,
      data: {
        datasource: "taker_long_short_history",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        interval: "1h",
        symbol: "BTCUSDT",
        filters: [
          { field: "symbol", operator: "in" as const, value: ["BTCUSDT", "ETHUSDT"] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("detail-card × basis(경로 B): symbol 누락 → reject (신규 정탐 — ws_direct 아니어도 강제)", () => {
    const result = AiCardConfigSchema.safeParse({
      id: "scope-ind-1",
      componentId: "detail-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "basis",
        exchange: "binance",
        marketType: "futures_usdm" as const,
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("data.symbol");
    }
  });

  it("detail-card(record): filters symbol 절은 대체 불가 — record 는 직접 symbol 필수", () => {
    const result = AiCardConfigSchema.safeParse({
      id: "scope-ind-2",
      componentId: "detail-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "basis",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        filters: [{ field: "symbol", operator: "=" as const, value: "BTCUSDT" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("kline-chart-card: marketType/symbol 스코프 강제 면제 — ds.table 부재(TradingView 자체 fetch)", () => {
    const result = AiCardConfigSchema.safeParse({
      id: "scope-kline-1",
      componentId: "kline-chart-card",
      size: "lg" as const,
      updateMode: "value" as const,
      data: {
        datasource: "kline",
        exchange: "binance",
        symbol: "BTCUSDT",
        interval: "1m",
      },
    });
    // marketType 없음에도 통과 = 면제 핀 (few-shot candlestick 예시와 동일 형태).
    expect(result.success).toBe(true);
  });

  it("★ dedupe: big-value-card 스코프 누락 시 필드당 issue 정확히 1개 ((2.5)+(3) 중복 금지)", () => {
    const result = AiCardConfigSchema.safeParse({
      id: "scope-dedupe-1",
      componentId: "big-value-card",
      size: "md" as const,
      updateMode: "value" as const,
      data: {
        datasource: "now_futures_ticker",
        exchange: "binance",
        // marketType/symbol 둘 다 누락 — (2.5) ws_direct 가 먼저 발화, (3)은 skip.
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const marketIssues = result.error.issues.filter(
        (i) => i.path.join(".") === "data.marketType",
      );
      const symbolIssues = result.error.issues.filter(
        (i) => i.path.join(".") === "data.symbol",
      );
      expect(marketIssues.length).toBe(1);
      expect(symbolIssues.length).toBe(1);
    }
  });

  it("면제 확인: table-card(set)/feed-card(events)는 symbol-less 정상 유스케이스 유지", () => {
    const table = AiCardConfigSchema.safeParse({
      id: "scope-table-1",
      componentId: "table-card",
      size: "md" as const,
      updateMode: "content" as const,
      data: {
        datasource: "futures_indicators",
        exchange: "binance",
        marketType: "futures_usdm" as const,
        filters: [
          { field: "top_ls_ratio_accounts", operator: "<" as const, value: 1 },
          { field: "oi_chg_1h", operator: ">" as const, value: 0 },
        ],
        sort: { field: "open_interest", direction: "desc" as const },
      },
    });
    expect(table.success).toBe(true); // ★ 크로스 family 필터 — 구 5종이면 disjoint 로 불가
  });
});

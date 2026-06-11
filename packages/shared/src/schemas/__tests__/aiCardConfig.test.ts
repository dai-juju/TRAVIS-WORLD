/**
 * AiCardConfigSchema 단위 테스트.
 *
 * 이 스키마가 M1.5에서 Claude 출력의 runtime 게이트가 되므로,
 * 엄격성(strict, unknown key 차단)과 discriminated union의
 * operator↔value 매칭이 핵심 검증 포인트.
 *
 * M1.6 Step 4 (2026-04-28, [3-7] 회수): registry-derived refinement 도입 후
 *   componentId / datasource / targetComponentId 가 실제 등록된 id 만 통과.
 *   픽스처도 실제 등록된 id (now_futures_ticker, ticker-card, coin-list-card,
 *   kline-chart-card, spawn) 로 정합. 또한 ensureRegistries() 로 격리.
 */

import { describe, it, expect } from "vitest";
import { AiCardConfigSchema } from "../aiCardConfig";
import { FilterClauseSchema } from "../filterClause";
import { ensureRegistries } from "../../test-utils/registrySetup";

describe("AiCardConfigSchema", () => {
  ensureRegistries();

  it("유효한 TickerCard 설정을 통과시킨다 (value 모드, 단일 symbol)", () => {
    const config = {
      id: "ticker-btc-1",
      componentId: "ticker-card",
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

  it("유효한 CoinListCard 설정을 통과시킨다 (content 모드, filters + sort + limit)", () => {
    const config = {
      id: "list-oi-surge",
      componentId: "coin-list-card",
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
      actions: [
        {
          trigger: "row-click" as const,
          type: "spawn" as const,
          targetComponentId: "kline-chart-card",
          parameterMapping: { symbol: "symbol" },
        },
      ],
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
      componentId: "ticker-card",
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

  it("coin-list-card + open_interest 조합은 reject (dataShapes 미선언 — F3 잔재 차단)", () => {
    const config = {
      id: "list-oi-wrong",
      componentId: "coin-list-card",
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
      expect(msg).toContain("now_futures_ticker");
    }
  });

  it("indicator-list-card + open_interest 조합은 통과 (dataShapes 선언됨)", () => {
    const config = {
      id: "oi-ranking-1",
      componentId: "indicator-list-card",
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

  it("indicator-card + premium_index 기존 조합 회귀 통과", () => {
    const config = {
      id: "funding-btc",
      componentId: "indicator-card",
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

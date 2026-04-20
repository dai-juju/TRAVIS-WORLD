/**
 * AiCardConfigSchema 단위 테스트.
 *
 * 이 스키마가 M1.5에서 Claude 출력의 runtime 게이트가 되므로,
 * 엄격성(strict, unknown key 차단)과 discriminated union의
 * operator↔value 매칭이 핵심 검증 포인트.
 */

import { describe, it, expect } from "vitest";
import { AiCardConfigSchema } from "../aiCardConfig";
import { FilterClauseSchema } from "../filterClause";

describe("AiCardConfigSchema", () => {
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
        datasource: "now_futures_indicator",
        exchange: "binance",
        filters: [
          { field: "price_chg_5m", operator: ">", value: 0.03 },
          { field: "symbol", operator: "in", value: ["BTCUSDT", "ETHUSDT"] },
        ],
        sort: { field: "volume_usd", direction: "desc" as const },
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

/**
 * AiCardConfigSchema 단위 테스트.
 *
 * 이 스키마가 M1.5에서 Claude 출력의 runtime 게이트가 되므로,
 * 엄격성(strict, unknown key 차단)과 discriminated union의
 * operator↔value 매칭이 핵심 검증 포인트.
 *
 * M1.6 Step 4 (2026-04-28, [3-7] 회수): registry-derived refinement 도입 후
 *   componentId / datasource / targetComponentId 가 실제 등록된 id 만 통과.
 *   픽스처도 실제 등록된 id (now_futures_ticker, ticker-card, table-card,
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

  // ─── [10-62] (2026-06-26): ws_direct 단일 row 카드 marketType 필수 ───
  it("ws_direct 단일 row (premium_index) 가 marketType 없으면 reject (경로 A 토픽 조립 불가)", () => {
    const config = {
      id: "funding-btc-no-market",
      componentId: "indicator-card",
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
      componentId: "indicator-card",
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

  it("ticker-card + open_interest 조합은 reject (dataShapes 미선언 — F3 잔재 차단)", () => {
    const config = {
      id: "list-oi-wrong",
      componentId: "ticker-card",
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

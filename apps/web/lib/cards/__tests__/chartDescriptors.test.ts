// chartDescriptors 불변식 테스트 (Composable 사이클 2 Step 3, 2026-07-08).
//
// ★ tableDescriptors 의 "columns ⊆ queryableFields" 불변식은 여기 미러하지 않는다 —
//   차트 값 컬럼은 정렬/필터 대상이 아닌 플롯 대상이라 queryableFields 에 의도적으로
//   없음(silent-wrong 필터 차단, zod 자문 2026-07-08). 대신 history 테이블 **실컬럼
//   리터럴**에 대해 valueField 를 핀한다.
// chart-card 등치(descriptorKeys ≡ dataShapes)는 Step 5 등록 시 박제.

import { describe, expect, it } from "vitest";
import { getDatasource, registerDefaults } from "@travis/shared";
import {
  CHART_CONSUMES_SHAPE,
  CHART_DESCRIPTORS,
  getChartDescriptor,
} from "../chartDescriptors";

registerDefaults();

/** history_futures_indicator 실컬럼 (DB information_schema 실측 2026-07-08, 23컬럼). */
const HISTORY_COLUMNS = new Set([
  "exchange", "market_type", "symbol", "interval", "recorded_at",
  "mark_price", "index_price", "predicted_funding_rate", "last_settled_funding_rate",
  "open_interest", "oi_chg_5m", "oi_chg_15m", "oi_chg_1h", "oi_chg_4h",
  "top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio",
  "taker_buy_sell_ratio", "taker_buy_vol", "taker_sell_vol",
  "basis", "basis_rate", "annualized_basis_rate",
]);

const KEYS = Object.keys(CHART_DESCRIPTORS).sort();

describe("chartDescriptors — 불변식", () => {
  it("shape 선언 = series", () => {
    expect(CHART_CONSUMES_SHAPE).toBe("series");
  });

  it("descriptor key 집합 = history datasource 6종 정확값 핀", () => {
    expect(KEYS).toEqual([
      "basis_history",
      "global_ls_ratio_history",
      "open_interest_history",
      "taker_long_short_history",
      "top_ls_ratio_accounts_history",
      "top_ls_ratio_positions_history",
    ]);
  });

  it("모든 key 는 registry 에 등록된 datasource 이고 servableShapes=['series']", () => {
    for (const key of KEYS) {
      const ds = getDatasource(key);
      expect(ds, `datasource 미등록: ${key}`).toBeDefined();
      expect(ds?.servableShapes).toEqual(["series"]);
      expect(ds?.table).toBe("history_futures_indicator");
    }
  });

  it("valueField/timeField 가 history 테이블 실컬럼에 실존", () => {
    for (const key of KEYS) {
      const d = CHART_DESCRIPTORS[key]!;
      expect(HISTORY_COLUMNS.has(d.valueField), `${key}.valueField "${d.valueField}"`).toBe(true);
      expect(HISTORY_COLUMNS.has(d.timeField), `${key}.timeField "${d.timeField}"`).toBe(true);
    }
  });

  it("도메인 시맨틱 정확값 핀 — midline/tone/style (crypto-domain 판정 2026-07-08)", () => {
    // OI: 기준선 없음 + ★모노크롬 강제(방향색=오정보) + area
    const oi = CHART_DESCRIPTORS.open_interest_history!;
    expect(oi.midline).toBeUndefined();
    expect(oi.tone).toBe("neutral");
    expect(oi.seriesStyle).toBe("area");
    expect(oi.axisUnitLabel?.("futures_coinm")).toBe("contracts");
    expect(oi.axisUnitLabel?.("futures_usdm")).toBe("base asset");
    // LSR 3종 + taker: 1.0 midline + directional line
    for (const key of [
      "top_ls_ratio_accounts_history",
      "top_ls_ratio_positions_history",
      "global_ls_ratio_history",
      "taker_long_short_history",
    ]) {
      const d = CHART_DESCRIPTORS[key]!;
      expect(d.midline, key).toBe(1);
      expect(d.tone, key).toBe("directional");
      expect(d.seriesStyle, key).toBe("line");
    }
    // basis: 0 midline (contango/backwardation 경계) + neutral(압력색 아님) + rate 주 플롯
    const basis = CHART_DESCRIPTORS.basis_history!;
    expect(basis.midline).toBe(0);
    expect(basis.tone).toBe("neutral");
    expect(basis.seriesStyle).toBe("line");
    expect(basis.valueField).toBe("basis_rate");
  });

  it("formatValue graceful — null/undefined 는 '—'", () => {
    for (const key of KEYS) {
      const d = CHART_DESCRIPTORS[key]!;
      expect(d.formatValue(null), key).toBe("—");
      expect(d.formatValue(undefined), key).toBe("—");
      expect(typeof d.formatValue(1.2345), key).toBe("string");
    }
  });

  it("defaultInterval 은 registry interval enum 9종에 실존", () => {
    for (const key of KEYS) {
      const d = CHART_DESCRIPTORS[key]!;
      const ds = getDatasource(key);
      const intervalField = ds?.queryableFields.find((f) => f.name === "interval");
      expect(intervalField?.enumValues ?? []).toContain(d.defaultInterval);
    }
  });

  it("getChartDescriptor graceful — 미지원/nullish 는 undefined (crash 금지)", () => {
    expect(getChartDescriptor("open_interest")).toBeUndefined(); // now id 는 차트 팩 아님
    expect(getChartDescriptor("nonexistent")).toBeUndefined();
    expect(getChartDescriptor(undefined)).toBeUndefined();
    expect(getChartDescriptor(null)).toBeUndefined();
    expect(getChartDescriptor("")).toBeUndefined();
  });
});

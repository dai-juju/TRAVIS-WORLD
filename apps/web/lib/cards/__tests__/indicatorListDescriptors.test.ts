// indicatorListDescriptors — registry ↔ 표시계층 drift 차단 테스트 (테마 A Step 3, 2026-06-11).
//
// 검증 3축:
//   1. descriptor key 집합이 datasourceRegistry 의 등록 id 와 정합 (self-gate 무결).
//   2. columns[].key / watchColumns / defaultSort.field 가 해당 datasource 의
//      queryableFields 에 실존 — registry 가 모르는 컬럼을 카드가 그리거나
//      정렬키로 쓰는 drift 차단 ([3-32] 부류의 표시계층 버전).
//   3. value/tone 함수가 라이브 형태 row 에서 graceful (null 컬럼 포함).

import { describe, expect, it } from "vitest";
import { getDatasource, registerDefaults } from "@travis/shared";
import type { IndicatorRow } from "../indicatorDescriptors";
import {
  INDICATOR_LIST_DESCRIPTORS,
  getIndicatorListDescriptor,
} from "../indicatorListDescriptors";

// shared registry 를 명시 부트스트랩 (브라우저 배럴 자동 등록과 무관하게 테스트 격리).
registerDefaults();

/** BTCUSDT 라이브 형태의 최소 row (indicatorDescriptors.test 와 동일 픽스처). */
const ROW: IndicatorRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  mark_price: 61133.1,
  index_price: 61166.68369565,
  predicted_funding_rate: -0.0000403,
  last_settled_funding_rate: 0.00002908,
  next_funding_time: 1_781_078_400_000,
  basis: -23.51,
  basis_rate: -0.0004,
  open_interest: 97630.299,
  oi_chg_5m: null,
  oi_chg_15m: null,
  oi_chg_1h: null,
  oi_chg_4h: null,
  top_ls_ratio_accounts: 1.9577,
  top_ls_ratio_positions: null,
  global_ls_ratio: null,
  taker_buy_sell_ratio: null,
  taker_buy_vol: null,
  taker_sell_vol: null,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

const DESCRIPTOR_KEYS = Object.keys(INDICATOR_LIST_DESCRIPTORS);

/** Record 인덱싱 non-null 가드 (noUncheckedIndexedAccess 대응). */
function descriptorOf(key: string) {
  const d = INDICATOR_LIST_DESCRIPTORS[key];
  if (!d) throw new Error(`descriptor not found: ${key}`);
  return d;
}

describe("indicatorListDescriptors × datasourceRegistry 정합", () => {
  it("descriptor key 5종이 전부 등록된 datasource id 다", () => {
    expect(DESCRIPTOR_KEYS.sort()).toEqual(
      ["basis", "long_short_ratio", "open_interest", "premium_index", "taker_long_short"].sort(),
    );
    for (const key of DESCRIPTOR_KEYS) {
      expect(getDatasource(key), `datasource 미등록: ${key}`).toBeDefined();
    }
  });

  it("columns[].key / watchColumns / defaultSort.field 가 queryableFields 에 실존", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const d = descriptorOf(key);
      const ds = getDatasource(key);
      if (!ds) throw new Error(`datasource 미등록: ${key}`);
      const fields = new Set(ds.queryableFields.map((f) => f.name));

      for (const col of d.columns) {
        expect(fields.has(col.key), `${key}.columns: unknown field "${col.key}"`).toBe(true);
      }
      for (const wc of d.watchColumns) {
        expect(fields.has(wc), `${key}.watchColumns: unknown field "${wc}"`).toBe(true);
      }
      expect(
        fields.has(d.defaultSort.field),
        `${key}.defaultSort: unknown field "${d.defaultSort.field}"`,
      ).toBe(true);
    }
  });

  it("defaultSort.field 는 sortable 로 등록된 컬럼이다", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const d = descriptorOf(key);
      const ds = getDatasource(key);
      const field = ds?.queryableFields.find((f) => f.name === d.defaultSort.field);
      expect(field?.sortable, `${key}.defaultSort "${d.defaultSort.field}" not sortable`).toBe(true);
    }
  });
});

describe("indicatorListDescriptors 표시 graceful", () => {
  it("value 함수가 라이브 row(null 컬럼 포함)에서 throw 없이 문자열 반환", () => {
    for (const key of DESCRIPTOR_KEYS) {
      for (const col of descriptorOf(key).columns) {
        const out = col.value(ROW);
        expect(typeof out, `${key}/${col.key} value`).toBe("string");
        expect(out.length).toBeGreaterThan(0);
        const tone = col.tone?.(ROW) ?? "neutral";
        expect(["up", "down", "neutral"]).toContain(tone);
      }
    }
  });

  it("self-gate: 미등록 datasource 는 undefined (coming soon 경로)", () => {
    expect(getIndicatorListDescriptor("now_spot_ticker")).toBeUndefined();
    expect(getIndicatorListDescriptor(null)).toBeUndefined();
    expect(getIndicatorListDescriptor(undefined)).toBeUndefined();
    expect(getIndicatorListDescriptor("open_interest")).toBeDefined();
  });
});

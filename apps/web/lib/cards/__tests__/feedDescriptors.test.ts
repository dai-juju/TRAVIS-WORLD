// feedDescriptors 불변식 테스트 (ff#2 재개 Step 3, 2026-07-05).
//
// tableDescriptors.test 미러 — "조용한 빈칸이 아닌 시끄러운 실패":
//   레시피가 참조하는 모든 필드는 datasource queryableFields 에 실존해야 하고,
//   결측 값 픽스처에서 graceful("—")해야 한다. 등치(FEED_DESCRIPTORS keys ≡
//   feed-card.dataShapes)는 Step 5(feed-card 등록) 때 추가.

import { describe, expect, it } from "vitest";
import { getDatasource } from "@travis/shared";
import {
  FEED_CONSUMES_SHAPE,
  FEED_DESCRIPTORS,
  getFeedDescriptor,
  type FeedRow,
} from "../feedDescriptors";

/** USDM 청산 정상 픽스처 (방송 payload 모양 — worker normalizeForceOrder 산출). */
const LIQ_ROW: FeedRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  side: "SELL",
  price: 60000,
  quantity: 1.5,
  avg_price: 59950,
  accumulated_qty: 1.5,
  notional: 89925,
  order_status: "FILLED",
  trade_time: "2026-07-05T12:34:56.000Z",
};

/** 결측 픽스처 — rollout 이전 행(notional null) + ap null. */
const LIQ_ROW_SPARSE: FeedRow = {
  ...LIQ_ROW,
  side: "BUY",
  avg_price: null,
  notional: null,
};

describe("feedDescriptors — 불변식", () => {
  it("shape 선언 = events", () => {
    expect(FEED_CONSUMES_SHAPE).toBe("events");
  });

  it("모든 descriptor 의 timeField/labelField/columns[].key 가 datasource queryableFields 에 실존", () => {
    for (const [dsId, d] of Object.entries(FEED_DESCRIPTORS)) {
      const ds = getDatasource(dsId);
      expect(ds, `datasource 미등록: ${dsId}`).toBeDefined();
      const fields = new Set(ds!.queryableFields.map((f) => f.name));
      for (const key of [d.timeField, d.labelField, ...d.columns.map((c) => c.key)]) {
        expect(
          fields.has(key),
          `${dsId}: "${key}" 가 queryableFields 에 없음 (drift?)`,
        ).toBe(true);
      }
    }
  });

  it("columns 는 1~3개 + 전 컬럼 width 필수 (grid-template 조립 보장)", () => {
    for (const [dsId, d] of Object.entries(FEED_DESCRIPTORS)) {
      expect(d.columns.length, dsId).toBeGreaterThanOrEqual(1);
      expect(d.columns.length, dsId).toBeLessThanOrEqual(3);
      for (const c of d.columns) {
        expect(c.width, `${dsId}.${c.key}: width 누락`).toMatch(/rem$/);
      }
    }
  });

  it("getFeedDescriptor — 미등록 datasource 는 undefined (graceful lookup)", () => {
    expect(getFeedDescriptor("no-such-datasource")).toBeUndefined();
    expect(getFeedDescriptor("liquidation")).toBeDefined();
  });
});

describe("청산 descriptor — 도메인 결정 반영 (ff#2 Step 1 사용자 확정)", () => {
  const d = getFeedDescriptor("liquidation")!;

  it("side SELL = LONG LIQ + down(vermilion 하락 압력)", () => {
    expect(d.badge.text(LIQ_ROW)).toBe("LONG LIQ");
    expect(d.badge.tone(LIQ_ROW)).toBe("down");
  });

  it("side BUY = SHORT LIQ + up(teal 상승 압력)", () => {
    expect(d.badge.text(LIQ_ROW_SPARSE)).toBe("SHORT LIQ");
    expect(d.badge.tone(LIQ_ROW_SPARSE)).toBe("up");
  });

  it("미지의 side = 중립 LIQ + neutral (공급자 드리프트 graceful)", () => {
    const weird = { ...LIQ_ROW, side: "UNKNOWN" };
    expect(d.badge.text(weird)).toBe("LIQ");
    expect(d.badge.tone(weird)).toBe("neutral");
  });

  it("notional 컬럼: compact USD 표기 + null 은 '—'/intensity 0 (rollout 이전 행 graceful)", () => {
    const notionalCol = d.columns.find((c) => c.key === "notional")!;
    expect(notionalCol.value(LIQ_ROW)).toBe("$89.9K");
    expect(notionalCol.value(LIQ_ROW_SPARSE)).toBe("—");
    expect(notionalCol.intensity!(LIQ_ROW_SPARSE)).toBe(0);
    // $5M 포화 — 큰 청산은 풀 농도.
    expect(notionalCol.intensity!({ ...LIQ_ROW, notional: 10_000_000 })).toBe(1);
  });

  it("가격 컬럼: ap(실제 체결가) 우선 + 결측 시 p 폴백 (canonical)", () => {
    const priceCol = d.columns.find((c) => c.key === "avg_price")!;
    expect(priceCol.value(LIQ_ROW)).toContain("59,950");
    expect(priceCol.value(LIQ_ROW_SPARSE)).toContain("60,000"); // ap null → p
    expect(priceCol.value({ ...LIQ_ROW, avg_price: null, price: null })).toBe("—");
  });
});

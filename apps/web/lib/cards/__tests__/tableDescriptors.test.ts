// tableDescriptors — registry ↔ 표시계층 drift 차단 테스트 (Composable Expressiveness Stage 1, 2026-06-29).
//
// 검증 5축:
//   1. descriptor key 집합(7종 = 지표 5 + 티커 2)이 전부 등록된 datasource id 다.
//   2. columns[].key / labelColumn.key / rowKeyFields / flashColumn / defaultSort.field 가
//      해당 datasource 의 queryableFields 에 실존 — registry 가 모르는 컬럼을 그리거나
//      정렬키/식별키로 쓰는 drift 를 "조용한 빈칸" 아닌 "시끄러운 실패"로 (자문 zod 2026-06-29).
//   3. defaultSort.field 는 sortable 로 등록된 컬럼.
//   4. value/tone/intensity 가 각 datasource 의 대표 row 에서 graceful (per-datasource 픽스처).
//   5. (defaultLimit 제거됨 2026-06-30 — AI 가 limit 결정, 카드 기본 cap 없음. 하드코딩 금지.)
//
// 6. ★ 두 게이트 등치: descriptorKeys ≡ table-card.dataShapes (Step 3 등록 후 박제,
//    2026-06-30) — registry 게이트(렌더 권한)와 descriptor lookup(표시)이 같은 7종을
//    가리켜 coming-soon drift 를 "조용한 빈칸" 아닌 "시끄러운 실패"로 만든다.

import { describe, expect, it } from "vitest";
import { getComponent, getDatasource, registerDefaults } from "@travis/shared";
import type { IndicatorRow } from "../indicatorDescriptors";
import {
  SCREENER_COLUMN_CATALOG,
  TABLE_CONSUMES_SHAPE,
  TABLE_DESCRIPTORS,
  getTableDescriptor,
  type TableDescriptor,
  type TableRow,
} from "../tableDescriptors";

// shared registry 를 명시 부트스트랩 (브라우저 배럴 자동 등록과 무관하게 테스트 격리).
registerDefaults();

/** BTCUSDT 라이브 형태의 최소 지표 row. */
const INDICATOR_ROW: IndicatorRow = {
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

/** now_*_ticker 라이브 형태의 최소 row (티커 descriptor value 함수 검증용). */
const TICKER_ROW: TableRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  last_price: 61133.1,
  price_change_pct: 2.34,
  quote_volume: 1234567.8,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

/** null 변화율/가격의 티커 row — value 의 "—"/?? 0 fallback + intensity=0/tone=neutral 박제. */
const TICKER_ROW_SPARSE: TableRow = {
  exchange: "binance",
  market_type: "spot",
  symbol: "NULLUSDT",
  last_price: null,
  price_change_pct: null,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

/** history_futures_liquidation 라이브 형태의 최소 row (청산 표 descriptor 검증용). */
const LIQUIDATION_ROW: TableRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  side: "SELL",
  price: 60000,
  quantity: 1.5,
  avg_price: 59950,
  accumulated_qty: 1.5,
  notional: 89925,
  trade_time: "2026-07-05T12:34:56.000Z",
  recorded_at: "2026-07-05T12:34:56.120Z",
};

/** datasource id → 그 datasource 대표 픽스처 (단일 ROW 의 의미 없는 교차 검증 방지). */
const FIXTURES: Record<string, TableRow> = {
  premium_index: INDICATOR_ROW,
  basis: INDICATOR_ROW,
  open_interest: INDICATOR_ROW,
  long_short_ratio: INDICATOR_ROW,
  taker_long_short: INDICATOR_ROW,
  // 통합 스크리너 — 같은 물리 행이라 지표 픽스처 공유 (사이클 4b).
  futures_indicators: INDICATOR_ROW,
  now_spot_ticker: TICKER_ROW,
  now_futures_ticker: TICKER_ROW,
  liquidation: LIQUIDATION_ROW,
};

const DESCRIPTOR_KEYS = Object.keys(TABLE_DESCRIPTORS);

/** Record 인덱싱 non-null 가드 (noUncheckedIndexedAccess 대응). */
function descriptorOf(key: string): TableDescriptor {
  const d = TABLE_DESCRIPTORS[key];
  if (!d) throw new Error(`descriptor not found: ${key}`);
  return d;
}

describe("tableDescriptors × datasourceRegistry 정합", () => {
  it("descriptor key 9종(지표 5 + 티커 2 + 청산 1 + 통합 스크리너 1)이 전부 등록된 datasource id 다", () => {
    expect(DESCRIPTOR_KEYS.sort()).toEqual(
      [
        "basis",
        "futures_indicators",
        "liquidation",
        "long_short_ratio",
        "now_futures_ticker",
        "now_spot_ticker",
        "open_interest",
        "premium_index",
        "taker_long_short",
      ].sort(),
    );
    for (const key of DESCRIPTOR_KEYS) {
      expect(getDatasource(key), `datasource 미등록: ${key}`).toBeDefined();
    }
  });

  it("★ 두 게이트 등치 — descriptor key 집합 ≡ table-card.dataShapes (coming-soon drift 차단)", () => {
    const tableCard = getComponent("table-card");
    expect(tableCard, "table-card 미등록 — Step 3 등록 누락").toBeDefined();
    const cardDatasources = (tableCard?.dataShapes ?? [])
      .map((s) => s.datasourceId)
      .slice()
      .sort();
    // 렌더 권한(registry dataShapes)과 표시 lookup(descriptor)이 정확히 같은 datasource
    //   집합을 가리켜야 한다 — 한쪽에만 있으면 "권한은 있는데 그릴 줄 모름"(crash 위험) 또는
    //   "그릴 줄 아는데 권한 없음"(coming-soon)으로 조용히 drift.
    expect(cardDatasources).toEqual(DESCRIPTOR_KEYS.slice().sort());
  });

  it("★ shape 등치 — TABLE_CONSUMES_SHAPE ≡ table-card.acceptsShapes (Stage 2 Step 1)", () => {
    // web form 상수와 registry 선언은 cross-package 라 collapse 불가 — 등치 테스트로 동기.
    // 한쪽만 바뀌면 form 이 소비하는 shape 와 registry 가 선언한 shape 가 조용히 갈라진다.
    expect(getComponent("table-card")?.acceptsShapes).toEqual([TABLE_CONSUMES_SHAPE]);
  });

  it("columns[].key / labelColumn.key / rowKeyFields / flashColumn / defaultSort.field 가 queryableFields 에 실존", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const d = descriptorOf(key);
      const ds = getDatasource(key);
      if (!ds) throw new Error(`datasource 미등록: ${key}`);
      const fields = new Set(ds.queryableFields.map((f) => f.name));

      for (const col of d.columns) {
        expect(fields.has(col.key), `${key}.columns: unknown field "${col.key}"`).toBe(true);
      }
      expect(
        fields.has(d.labelColumn.key),
        `${key}.labelColumn: unknown field "${d.labelColumn.key}"`,
      ).toBe(true);
      for (const f of d.rowKeyFields) {
        expect(fields.has(f), `${key}.rowKeyFields: unknown field "${f}"`).toBe(true);
      }
      if (d.flashColumn !== undefined) {
        expect(
          fields.has(d.flashColumn),
          `${key}.flashColumn: unknown field "${d.flashColumn}"`,
        ).toBe(true);
      }
      if (d.defaultSort) {
        expect(
          fields.has(d.defaultSort.field),
          `${key}.defaultSort: unknown field "${d.defaultSort.field}"`,
        ).toBe(true);
      }
    }
  });

  it("defaultSort.field 는 sortable 로 등록된 컬럼이다", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const d = descriptorOf(key);
      if (!d.defaultSort) continue;
      const ds = getDatasource(key);
      const field = ds?.queryableFields.find((f) => f.name === d.defaultSort?.field);
      expect(field?.sortable, `${key}.defaultSort "${d.defaultSort.field}" not sortable`).toBe(true);
    }
  });

  it("columns 는 1~3개(좁은 카드 폭) + 전부 width 지정 (가상화 세로정렬 [10-75] 재발 가드)", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const d = descriptorOf(key);
      if (d.dynamicColumns) {
        // 동적 descriptor(통합 스크리너)는 정적 columns 0개가 정상 — 컬럼은 AI 계약
        //   참조에서 파생(큐레이션 금지). 카탈로그 자체 검증은 아래 별도 describe.
        expect(d.columns.length, `${key}.columns (dynamic)`).toBe(0);
        continue;
      }
      expect(d.columns.length, `${key}.columns count`).toBeGreaterThanOrEqual(1);
      expect(d.columns.length, `${key}.columns count`).toBeLessThanOrEqual(3);
      for (const col of d.columns) {
        // ★ 모든 컬럼 width 필수 (code-reviewer W2): 가상화(>100행) 경로는 행별 독립 grid 라
        //   width 미지정(auto) 컬럼이 행마다 폭 달라져 세로정렬 깨짐. "증상 수정 ≠ 재발 가드"
        //   → 새 컬럼이 width 누락하면 시끄럽게 실패.
        expect(
          typeof col.width === "string" && col.width.length > 0,
          `${key}/${col.key} width 누락/빈값 → 가상화 시 정렬 깨짐: "${col.width}"`,
        ).toBe(true);
      }
    }
  });
});

describe("tableDescriptors 표시 graceful (per-datasource 픽스처)", () => {
  it("FIXTURES 가 descriptor 키를 정확히 덮는다", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(DESCRIPTOR_KEYS.sort());
  });

  it("각 descriptor 의 value 가 자기 datasource 픽스처에서 throw 없이 비어있지 않은 문자열 반환", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const row = FIXTURES[key];
      if (!row) throw new Error(`fixture 누락: ${key}`);
      for (const col of descriptorOf(key).columns) {
        const out = col.value(row);
        expect(typeof out, `${key}/${col.key} value`).toBe("string");
        expect(out.length, `${key}/${col.key} value empty`).toBeGreaterThan(0);

        const tone = col.tone?.(row) ?? "neutral";
        expect(["up", "down", "neutral"]).toContain(tone);

        if (col.intensity) {
          const i = col.intensity(row);
          expect(Number.isFinite(i), `${key}/${col.key} intensity not finite`).toBe(true);
          expect(i, `${key}/${col.key} intensity < 0`).toBeGreaterThanOrEqual(0);
          expect(i, `${key}/${col.key} intensity > 1`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("티커 null 변화율/가격 → '—' / value 문자열 / tone=neutral / intensity=0 (graceful null branch)", () => {
    for (const key of ["now_spot_ticker", "now_futures_ticker"]) {
      const d = descriptorOf(key);
      const price = d.columns.find((c) => c.key === "last_price");
      const pct = d.columns.find((c) => c.key === "price_change_pct");
      expect(price?.value(TICKER_ROW_SPARSE), `${key} price null`).toBe("—");
      expect(typeof pct?.value(TICKER_ROW_SPARSE), `${key} pct null value`).toBe("string");
      expect(pct?.tone?.(TICKER_ROW_SPARSE), `${key} pct null tone`).toBe("neutral");
      expect(pct?.intensity?.(TICKER_ROW_SPARSE), `${key} pct null intensity`).toBe(0);
    }
  });

  it("self-gate(거울): 등록 datasource 는 descriptor 반환, 그 외 undefined", () => {
    expect(getTableDescriptor("now_spot_ticker")).toBeDefined();
    expect(getTableDescriptor("open_interest")).toBeDefined();
    expect(getTableDescriptor("kline")).toBeUndefined(); // 차트 form 소유 (scope 밖)
    expect(getTableDescriptor(null)).toBeUndefined();
    expect(getTableDescriptor(undefined)).toBeUndefined();
  });
});

// ─── 통합 스크리너 카탈로그 + dynamicColumns (사이클 4b [10-102](a), 2026-07-12) ──
describe("futures_indicators — 카탈로그 정합 + dynamicColumns 파생 로직", () => {
  const screener = descriptorOf("futures_indicators");
  const catalogKeys = Object.keys(SCREENER_COLUMN_CATALOG);

  it("★ 카탈로그 key ≡ registry 값필드 27종 (공통 3축 제외 — 등치 불변식)", () => {
    // 카탈로그가 registry 를 못 따라가면 "필터는 되는데 컬럼이 안 뜨는" 반쪽 UX 가
    //   조용히 생긴다 — 새 metric 필드 추가 시 여기서 시끄럽게 실패.
    const ds = getDatasource("futures_indicators");
    const valueFields = (ds?.queryableFields ?? [])
      .map((f) => f.name)
      .filter((n) => !["exchange", "market_type", "symbol"].includes(n));
    expect(catalogKeys.sort()).toEqual(valueFields.sort());
    expect(catalogKeys.length).toBe(27);
  });

  it("카탈로그 전 항목: key 정합 + header + width 지정 ([10-75] 가상화 정렬 가드)", () => {
    for (const [mapKey, col] of Object.entries(SCREENER_COLUMN_CATALOG)) {
      expect(col.key, `catalog[${mapKey}].key 불일치`).toBe(mapKey);
      expect(col.header.length, `catalog[${mapKey}].header empty`).toBeGreaterThan(0);
      expect(
        typeof col.width === "string" && col.width.length > 0,
        `catalog[${mapKey}].width 누락 → 가상화 시 정렬 깨짐`,
      ).toBe(true);
    }
  });

  it("카탈로그 전 항목 value/tone 이 지표 픽스처에서 graceful (누락 필드 = '—')", () => {
    for (const [mapKey, col] of Object.entries(SCREENER_COLUMN_CATALOG)) {
      const out = col.value(INDICATOR_ROW);
      expect(typeof out, `catalog[${mapKey}] value`).toBe("string");
      expect(out.length, `catalog[${mapKey}] value empty`).toBeGreaterThan(0);
      const tone = col.tone?.(INDICATOR_ROW) ?? "neutral";
      expect(["up", "down", "neutral"]).toContain(tone);
    }
  });

  it("dynamicColumns: sort 먼저 → filters 등장순 (사용자/crypto-trader 확정 2026-07-12)", () => {
    const cols = screener.dynamicColumns!({
      filters: [
        { field: "top_ls_ratio_accounts" },
        { field: "oi_chg_1h" },
      ],
      sort: { field: "open_interest" },
    });
    expect(cols.map((c) => c.key)).toEqual([
      "open_interest", // sort = 첫 값 컬럼 (랭킹 세로 검증 스캔)
      "top_ls_ratio_accounts",
      "oi_chg_1h",
    ]);
  });

  it("dynamicColumns: 식별/스코프 축 제외 + 중복 제거 + 상한 4", () => {
    const cols = screener.dynamicColumns!({
      filters: [
        { field: "market_type" }, // 스코프 축 — 값 컬럼 아님
        { field: "symbol" }, // 식별 축
        { field: "predicted_funding_rate" },
        { field: "predicted_funding_rate" }, // 중복
        { field: "basis_rate" },
        { field: "taker_buy_sell_ratio" },
        { field: "global_ls_ratio" }, // 5번째 값 필드 — 상한 4 로 표시 제외
      ],
      sort: { field: "open_interest" },
    });
    expect(cols.map((c) => c.key)).toEqual([
      "open_interest",
      "predicted_funding_rate",
      "basis_rate",
      "taker_buy_sell_ratio",
    ]);
  });

  it("dynamicColumns: 무참조 = [] (기본 컬럼 큐레이션 폴백 금지 — 표시 결정은 AI 소유)", () => {
    expect(screener.dynamicColumns!({ filters: undefined, sort: undefined })).toEqual([]);
    expect(screener.dynamicColumns!({ filters: [], sort: undefined })).toEqual([]);
    // 미지 필드는 graceful skip (스키마 화이트리스트가 1차 차단이라 실경로 희귀).
    expect(
      screener.dynamicColumns!({
        filters: [{ field: "not_a_field" }],
        sort: undefined,
      }),
    ).toEqual([]);
  });

  it("스크리너는 defaultSort/flashColumn 큐레이션 없음 — 정렬·flash 는 AI sort 파생만", () => {
    expect(screener.defaultSort).toBeUndefined();
    expect(screener.flashColumn).toBeUndefined();
  });
});

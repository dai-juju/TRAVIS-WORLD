// recordDescriptors — registry ↔ 표시계층 drift 차단 테스트 (Composable Stage 1b Step 1, 2026-07-14).
//
// 검증 축 (tableDescriptors.test 동형 + record 계약 고유 불변식):
//   1. descriptor key 집합(7종 = 지표 5 + 티커 2)이 전부 등록된 datasource id 다.
//   2. shape 정합 — pack 이 있는 datasource 는 전부 servableShapes 에 'record' 선언
//      (역방향: record 미서빙 datasource 는 pack 이 없어야 함 — 무의미 조합 시끄럽게).
//   3. fields[].key / watchColumns / flashField 가 해당 datasource 의 queryableFields
//      에 실존 — registry 가 모르는 컬럼을 그리는 drift 를 "조용한 빈칸" 아닌
//      "시끄러운 실패"로.
//   4. pack 당 role="primary" 정확히 1 (BigValue 의 huge 값 유일성).
//   5. label 이 pack 안에서 유일 (form 의 React key).
//   6. value/tone/intensity 가 각 datasource 대표 row 에서 graceful (per-datasource 픽스처).
//   7. defaultTitle 해석(문자열/함수) graceful.
//   8. ★ 두 게이트 등치 — descriptorKeys ≡ big-value-card/detail-card.dataShapes
//      (Step 4 등록 후 가산, **양방향 toEqual** — 단방향 ⊆ 검사는 "registry 누락 →
//      조용한 coming-soon" drift 를 못 잡는다, Step 2 reviewer W2).
//   9. shape 등치 — RECORD_CONSUMES_SHAPE ≡ 두 form 의 acceptsShapes (cross-package
//      테스트 동기, TABLE_CONSUMES_SHAPE 선례).

import { describe, expect, it } from "vitest";
import {
  getAllDatasources,
  getComponent,
  getDatasource,
  registerDefaults,
} from "@travis/shared";
import type { IndicatorRow } from "../marketSemantics";
import {
  RECORD_CONSUMES_SHAPE,
  RECORD_DESCRIPTORS,
  getRecordDescriptor,
  resolveRecordTitle,
  type RecordDescriptor,
  type RecordRow,
} from "../recordDescriptors";

// shared registry 를 명시 부트스트랩 (브라우저 배럴 자동 등록과 무관하게 테스트 격리).
registerDefaults();

/** BTCUSDT 라이브 형태의 최소 지표 row (tableDescriptors.test 와 동일 픽스처). */
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
  oi_chg_1h: 0.42,
  oi_chg_4h: null,
  top_ls_ratio_accounts: 1.9577,
  top_ls_ratio_positions: null,
  global_ls_ratio: null,
  taker_buy_sell_ratio: null,
  taker_buy_vol: null,
  taker_sell_vol: null,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

/** now_*_ticker 라이브 형태의 row (티커 pack 전 필드 채움). */
const TICKER_ROW: RecordRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  last_price: 61133.1,
  price_change_pct: 2.34,
  high_price: 62000.5,
  low_price: 60100.2,
  volume_chg_5m: 3.21,
  open_price: 60500,
  weighted_avg_price: 61050.7,
  quote_volume: 1234567.8,
  volume: 20.5,
  trade_count: 987654,
  price_chg_1h: -0.12,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

/** null 필드 일색의 티커 row — "—" fallback + tone=neutral graceful 분기 박제. */
const TICKER_ROW_SPARSE: RecordRow = {
  exchange: "binance",
  market_type: "spot",
  symbol: "NULLUSDT",
  last_price: null,
  price_change_pct: null,
  high_price: null,
  low_price: null,
  volume_chg_5m: null,
  open_price: null,
  weighted_avg_price: null,
  quote_volume: null,
  volume: null,
  trade_count: null,
  price_chg_1h: null,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

/** datasource id → 대표 픽스처 (단일 ROW 의 의미 없는 교차 검증 방지). */
const FIXTURES: Record<string, RecordRow> = {
  premium_index: INDICATOR_ROW,
  basis: INDICATOR_ROW,
  open_interest: INDICATOR_ROW,
  long_short_ratio: INDICATOR_ROW,
  taker_long_short: INDICATOR_ROW,
  now_spot_ticker: TICKER_ROW,
  now_futures_ticker: TICKER_ROW,
};

const DESCRIPTOR_KEYS = Object.keys(RECORD_DESCRIPTORS);

/** Record 인덱싱 non-null 가드 (noUncheckedIndexedAccess 대응). */
function descriptorOf(key: string): RecordDescriptor {
  const d = RECORD_DESCRIPTORS[key];
  if (!d) throw new Error(`descriptor not found: ${key}`);
  return d;
}

describe("recordDescriptors × datasourceRegistry 정합", () => {
  it("descriptor key 7종(지표 5 + 티커 2)이 전부 등록된 datasource id 다", () => {
    expect(DESCRIPTOR_KEYS.sort()).toEqual(
      [
        "basis",
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

  it("★ 두 게이트 등치(양방향) — descriptor key 집합 ≡ big-value-card/detail-card.dataShapes", () => {
    // 렌더 권한(registry dataShapes)과 표시 lookup(descriptor)이 정확히 같은 집합을
    //   가리켜야 한다 — 한쪽 누락 = "권한 있는데 그릴 줄 모름"(빈 카드) 또는 "그릴 줄
    //   아는데 권한 없음"(조용한 coming-soon). toEqual = 양방향 (reviewer W2: 옛
    //   IndicatorCard 엔 없던 registry 게이트가 새로 붙은 강화라 누락 방향이 특히 위험).
    for (const componentId of ["big-value-card", "detail-card"]) {
      const comp = getComponent(componentId);
      expect(comp, `${componentId} 미등록 — Step 4 등록 누락`).toBeDefined();
      const cardDatasources = (comp?.dataShapes ?? [])
        .map((s) => s.datasourceId)
        .slice()
        .sort();
      expect(cardDatasources, componentId).toEqual(DESCRIPTOR_KEYS.slice().sort());
    }
  });

  it("★ shape 등치 — RECORD_CONSUMES_SHAPE ≡ 두 form 의 acceptsShapes", () => {
    // web form 상수와 registry 선언은 cross-package 라 collapse 불가 — 등치 테스트로 동기.
    expect(getComponent("big-value-card")?.acceptsShapes).toEqual([RECORD_CONSUMES_SHAPE]);
    expect(getComponent("detail-card")?.acceptsShapes).toEqual([RECORD_CONSUMES_SHAPE]);
  });

  it("★ shape 정합 — pack 보유 datasource 는 전부 servableShapes 에 'record' 선언", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const ds = getDatasource(key);
      expect(
        ds?.servableShapes ?? [],
        `${key}: record 미서빙 datasource 에 record pack — 무의미 조합`,
      ).toContain(RECORD_CONSUMES_SHAPE);
    }
  });

  it("★ 역방향 — record 를 서빙하지 않는 datasource 는 pack 이 없다 (모양 게이트 무결)", () => {
    // 예: liquidation(events/set) / futures_indicators(set) / kline·history(series) 에
    //   record pack 을 실수로 추가하면 여기서 시끄럽게 실패.
    for (const ds of getAllDatasources()) {
      const servesRecord = (ds.servableShapes ?? []).includes(RECORD_CONSUMES_SHAPE);
      if (!servesRecord) {
        expect(
          RECORD_DESCRIPTORS[ds.id],
          `${ds.id}: servableShapes 에 record 가 없는데 pack 존재`,
        ).toBeUndefined();
      }
    }
  });

  it("fields[].key / watchColumns / flashField 가 물리 테이블 컬럼(같은 table 공유 datasource 들의 queryableFields union)에 실존", () => {
    // ★ table 기준 union 인 이유: queryableFields 는 "AI 필터/정렬 노출" 계약이고,
    //   표시 계층은 같은 물리 행의 동반 컬럼을 무료로 읽을 수 있다 — 예: basis pack 의
    //   Mark/Index price 는 basis 논리 datasource 의 queryableFields 엔 없지만
    //   now_futures_indicator 물리 행엔 실존 (옛 IndicatorCard 부터의 정당한 표시).
    //   같은 table 을 공유하는 datasource 들의 필드 union = 물리 컬럼 진실의 근사 —
    //   오타/삭제 drift 는 여전히 어느 union 에도 없어 시끄럽게 실패한다.
    const unionByTable = new Map<string, Set<string>>();
    for (const ds of getAllDatasources()) {
      const table = ds.table ?? ds.id;
      const set = unionByTable.get(table) ?? new Set<string>();
      for (const f of ds.queryableFields) set.add(f.name);
      unionByTable.set(table, set);
    }

    for (const key of DESCRIPTOR_KEYS) {
      const d = descriptorOf(key);
      const ds = getDatasource(key);
      if (!ds) throw new Error(`datasource 미등록: ${key}`);
      const fields = unionByTable.get(ds.table ?? ds.id) ?? new Set<string>();

      for (const f of d.fields) {
        expect(fields.has(f.key), `${key}.fields: unknown field "${f.key}"`).toBe(true);
      }
      for (const w of d.watchColumns ?? []) {
        expect(fields.has(w), `${key}.watchColumns: unknown field "${w}"`).toBe(true);
      }
      if (d.flashField !== undefined) {
        expect(
          fields.has(d.flashField),
          `${key}.flashField: unknown field "${d.flashField}"`,
        ).toBe(true);
      }
    }
  });

  it("pack 당 role='primary' 는 정확히 1 (BigValue huge 값 유일성)", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const primaries = descriptorOf(key).fields.filter((f) => f.role === "primary");
      expect(primaries.length, `${key}: primary ${primaries.length}개`).toBe(1);
    }
  });

  it("label 은 pack 안에서 유일 (form 의 React key 충돌 방지)", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const labels = descriptorOf(key).fields.map((f) => f.label);
      expect(new Set(labels).size, `${key}: label 중복`).toBe(labels.length);
      for (const label of labels) {
        expect(label.length, `${key}: 빈 label`).toBeGreaterThan(0);
      }
    }
  });

  it("지표 pack 은 watchColumns 필수([10-7] 공유 테이블 fan-out) / 티커 pack 은 생략(freshness 보존)", () => {
    const INDICATOR_PACKS = [
      "premium_index",
      "basis",
      "open_interest",
      "long_short_ratio",
      "taker_long_short",
    ];
    for (const key of INDICATOR_PACKS) {
      const d = descriptorOf(key);
      expect(d.watchColumns, `${key}: watchColumns 누락`).toBeDefined();
      expect(d.watchColumns!.length, `${key}: watchColumns 비어있음`).toBeGreaterThan(0);
    }
    // 티커는 전용 테이블 — watchColumns 를 걸면 가격 정지 심볼의 push 생존 신호
    //   (updated_at freshness)가 죽는다 (옛 TickerCard 거동 보존).
    expect(descriptorOf("now_spot_ticker").watchColumns).toBeUndefined();
    expect(descriptorOf("now_futures_ticker").watchColumns).toBeUndefined();
  });
});

describe("recordDescriptors 표시 graceful (per-datasource 픽스처)", () => {
  it("FIXTURES 가 descriptor 키를 정확히 덮는다", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(DESCRIPTOR_KEYS.sort());
  });

  it("각 pack 의 value 가 자기 픽스처에서 throw 없이 비어있지 않은 문자열 반환 (meta 없이)", () => {
    for (const key of DESCRIPTOR_KEYS) {
      const row = FIXTURES[key];
      if (!row) throw new Error(`fixture 누락: ${key}`);
      for (const f of descriptorOf(key).fields) {
        const out = f.value(row);
        expect(typeof out, `${key}/${f.key} value`).toBe("string");
        expect(out.length, `${key}/${f.key} value empty`).toBeGreaterThan(0);

        const tone = f.tone?.(row) ?? "neutral";
        expect(["up", "down", "neutral"]).toContain(tone);

        if (f.intensity) {
          const i = f.intensity(row);
          expect(Number.isFinite(i), `${key}/${f.key} intensity not finite`).toBe(true);
          expect(i, `${key}/${f.key} intensity < 0`).toBeGreaterThanOrEqual(0);
          expect(i, `${key}/${f.key} intensity > 1`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("티커 null 필드 → '—'/문자열 + tone=neutral (graceful null branch)", () => {
    for (const key of ["now_spot_ticker", "now_futures_ticker"]) {
      for (const f of descriptorOf(key).fields) {
        const out = f.value(TICKER_ROW_SPARSE);
        expect(typeof out, `${key}/${f.key} sparse value`).toBe("string");
        expect(out.length, `${key}/${f.key} sparse value empty`).toBeGreaterThan(0);
        expect(f.tone?.(TICKER_ROW_SPARSE) ?? "neutral", `${key}/${f.key} sparse tone`).toBe(
          "neutral",
        );
      }
      const price = descriptorOf(key).fields.find((f) => f.key === "last_price");
      expect(price?.value(TICKER_ROW_SPARSE), `${key} price null`).toBe("—");
    }
  });

  it("defaultTitle 해석 — 티커=symbol 함수형(심볼 부재 graceful) / 지표=고정 문자열", () => {
    const ticker = descriptorOf("now_spot_ticker");
    expect(resolveRecordTitle(ticker, { symbol: "BTCUSDT" })).toBe("BTCUSDT");
    expect(resolveRecordTitle(ticker, {})).toBe("Ticker"); // 심볼 부재 graceful
    expect(resolveRecordTitle(descriptorOf("open_interest"), {})).toBe("Open Interest");
    expect(resolveRecordTitle(undefined, { symbol: "BTCUSDT" })).toBeUndefined();
  });

  it("self-gate(거울): 등록 datasource 는 descriptor 반환, 그 외 undefined", () => {
    expect(getRecordDescriptor("now_spot_ticker")).toBeDefined();
    expect(getRecordDescriptor("open_interest")).toBeDefined();
    expect(getRecordDescriptor("liquidation")).toBeUndefined(); // events/set — record 아님
    expect(getRecordDescriptor("futures_indicators")).toBeUndefined(); // set 전용 렌즈
    expect(getRecordDescriptor("kline")).toBeUndefined(); // series — 차트 소관
    expect(getRecordDescriptor(null)).toBeUndefined();
    expect(getRecordDescriptor(undefined)).toBeUndefined();
  });
});


// chartDescriptors 불변식 테스트 (Composable 사이클 2 Step 3, 2026-07-08 / Step 6 확장 07-09).
//
// ★ tableDescriptors 의 "columns ⊆ queryableFields" 불변식은 여기 미러하지 않는다 —
//   차트 값 컬럼은 정렬/필터 대상이 아닌 플롯 대상이라 queryableFields 에 의도적으로
//   없음(silent-wrong 필터 차단, zod 자문 2026-07-08). 대신 각 물리 테이블 **실컬럼
//   리터럴**에 대해 valueField 를 핀한다.
// chart-card 등치(descriptorKeys ≡ dataShapes)는 Step 5 등록으로 박제됨 (아래 ★ 2건).
// Step 6: descriptor 가 두 물리 테이블(indicator 격자 / funding 이벤트)을 커버 —
//   테이블별 컬럼 핀 분기 + defaultInterval 은 "interval 필드 유무와 양방향 등치"로 강화.

import { describe, expect, it } from "vitest";
import { getComponent, getDatasource, registerDefaults } from "@travis/shared";
import {
  CHART_CONSUMES_SHAPE,
  CHART_DESCRIPTORS,
  getChartDescriptor,
} from "../chartDescriptors";

registerDefaults();

/**
 * history_futures_indicator 실컬럼 (DB information_schema 실측 2026-07-08 23컬럼 →
 * 2026-07-09 migration 20260709000001 이 죽은 펀딩 컬럼 2개 DROP = **21컬럼**.
 * 삭제 컬럼을 핀에 남기면 오타 valueField 가 거짓 통과하는 잠복 구멍 — reviewer W1).
 */
const HISTORY_COLUMNS = new Set([
  "exchange", "market_type", "symbol", "interval", "recorded_at",
  "mark_price", "index_price",
  "open_interest", "oi_chg_5m", "oi_chg_15m", "oi_chg_1h", "oi_chg_4h",
  "top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio",
  "taker_buy_sell_ratio", "taker_buy_vol", "taker_sell_vol",
  "basis", "basis_rate", "annualized_basis_rate",
]);

/** history_futures_funding 실컬럼 (migration 20260709000001 DDL, 6컬럼). */
const FUNDING_COLUMNS = new Set([
  "exchange", "market_type", "symbol", "funding_time", "funding_rate", "mark_price",
]);

/**
 * 청산 집계 RPC `liquidation_volume_series` 반환 컬럼
 * (migration 20260719000001 RETURNS TABLE, 6컬럼).
 * ★ 물리 테이블이 아니라 **함수 반환 계약** — descriptor 의 valueField/timeField 는
 *   이 이름들과 일치해야 한다. 함수 시그니처 변경 시 여기가 먼저 빨개진다.
 */
const LIQUIDATION_BUCKET_COLUMNS = new Set([
  "bucket_time",
  "long_notional",
  "short_notional",
  "total_notional",
  "event_count",
  "null_notional_count",
]);

/**
 * descriptor key → 실컬럼 set (테이블별 핀 분기의 단일 진실).
 *
 * ★ [10-84] M3-step3a: 삼항 분기 → **명시 맵 + 기본값**으로 전환.
 *   3번째 소스가 생기면서 옛 `key === "funding_history" ? A : B` 는 새 key 가 조용히
 *   HISTORY_COLUMNS(잘못된 테이블)로 떨어져 **오타 valueField 가 거짓 통과**하는
 *   구조가 됐다 (`feedback_column_drop_grep_misses_test_pins` 계보 — "실컬럼 핀"이
 *   계속 green 인 채로 무력화되는 형태). 맵은 미등록 key 를 즉시 드러낸다.
 */
const COLUMNS_BY_KEY: Record<string, Set<string>> = {
  funding_history: FUNDING_COLUMNS,
  liquidation_volume_history: LIQUIDATION_BUCKET_COLUMNS,
};
function columnsForKey(key: string): Set<string> {
  return COLUMNS_BY_KEY[key] ?? HISTORY_COLUMNS;
}

const KEYS = Object.keys(CHART_DESCRIPTORS).sort();

describe("chartDescriptors — 불변식", () => {
  it("shape 선언 = series", () => {
    expect(CHART_CONSUMES_SHAPE).toBe("series");
  });

  it("descriptor key 집합 = series datasource 8종 정확값 핀 ([10-84]: 청산 집계 가산)", () => {
    expect(KEYS).toEqual([
      "basis_history",
      "funding_history",
      "global_ls_ratio_history",
      "liquidation_volume_history",
      "open_interest_history",
      "taker_long_short_history",
      "top_ls_ratio_accounts_history",
      "top_ls_ratio_positions_history",
    ]);
  });

  it("모든 key 는 registry 에 등록된 datasource 이고 servableShapes=['series'] + 서빙 경로 핀", () => {
    // ★ [10-84]: "table 이 반드시 있다" 단정 → "table 또는 rpc 로 **우리 레이어가
    //   서빙한다**" 로 일반화. 집계 datasource 는 table 이 없고 DB 함수가 서빙한다
    //   (aiCardConfig superRefine (3) 의 isServedByDataLayer 와 같은 축).
    const TABLE_BY_KEY: Record<string, string> = {
      funding_history: "history_futures_funding",
    };
    for (const key of KEYS) {
      const ds = getDatasource(key);
      expect(ds, `datasource 미등록: ${key}`).toBeDefined();
      expect(ds?.servableShapes).toEqual(["series"]);
      if (ds?.fetchKind === "rpc") {
        // 함수 서빙 — table 이 있으면 두 경로를 겸한다는 모순 선언.
        expect(ds.table, key).toBeUndefined();
        expect(ds.rpcSpec?.functionName, key).toBeTruthy();
      } else {
        expect(ds?.table, key).toBe(
          TABLE_BY_KEY[key] ?? "history_futures_indicator",
        );
      }
    }
  });

  it("valueField/timeField 가 각자 물리 테이블 실컬럼에 실존", () => {
    for (const key of KEYS) {
      const d = CHART_DESCRIPTORS[key]!;
      const cols = columnsForKey(key);
      expect(cols.has(d.valueField), `${key}.valueField "${d.valueField}"`).toBe(true);
      expect(cols.has(d.timeField), `${key}.timeField "${d.timeField}"`).toBe(true);
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

  it("funding 도메인 시맨틱 핀 — bars/0 midline/directional/이벤트 시간축 (Step 6, crypto-domain 07-09)", () => {
    const f = CHART_DESCRIPTORS.funding_history!;
    expect(f.seriesStyle).toBe("bars"); // 정산 1회=막대 1개 (CoinGlass 관례)
    expect(f.midline).toBe(0); // 롱→숏 / 숏→롱 지불 경계
    expect(f.tone).toBe("directional"); // 부호 = 지불 방향
    expect(f.valueField).toBe("funding_rate");
    expect(f.timeField).toBe("funding_time"); // 정산 시각이 곧 x축 (interval 재구성 금지)
    expect(f.defaultInterval).toBeUndefined(); // 이벤트 — interval 개념 자체가 없음
    expect(f.defaultRefreshMs).toBe(600_000); // 60초 폴백 낭비 차단 (10분)
    // percent 5자리 + ★고정 interval 라벨 없음 (실간격 1h/4h 혼재 가능 — canonical §2.1.1)
    expect(f.formatValue(0.0001)).toBe("+0.01000%");
    expect(f.formatValue(-0.0000403)).toBe("-0.00403%");
    expect(f.formatValue(0.0001)).not.toContain("(");
  });

  it("formatValue graceful — null/undefined 는 '—'", () => {
    for (const key of KEYS) {
      const d = CHART_DESCRIPTORS[key]!;
      expect(d.formatValue(null), key).toBe("—");
      expect(d.formatValue(undefined), key).toBe("—");
      expect(typeof d.formatValue(1.2345), key).toBe("string");
    }
  });

  it("defaultInterval ⟺ datasource interval 필드 — 양방향 등치 (Step 6 강화)", () => {
    // 격자 datasource(interval 필드 보유)는 defaultInterval 필수 + enum 실존,
    // 이벤트 datasource(interval 필드 부재)는 defaultInterval 도 없어야 함 —
    // 한쪽만 선언되는 어긋남(무의미 기본값/fetch 불능 기본값 부재)을 양방향 차단.
    for (const key of KEYS) {
      const d = CHART_DESCRIPTORS[key]!;
      const intervalField = getDatasource(key)?.queryableFields.find(
        (f) => f.name === "interval",
      );
      if (intervalField) {
        expect(intervalField.enumValues ?? [], key).toContain(d.defaultInterval);
      } else {
        expect(d.defaultInterval, `${key}: interval 필드 없는데 defaultInterval 선언`).toBeUndefined();
      }
    }
  });

  it("getChartDescriptor graceful — 미지원/nullish 는 undefined (crash 금지)", () => {
    expect(getChartDescriptor("open_interest")).toBeUndefined(); // now id 는 차트 팩 아님
    expect(getChartDescriptor("nonexistent")).toBeUndefined();
    expect(getChartDescriptor(undefined)).toBeUndefined();
    expect(getChartDescriptor(null)).toBeUndefined();
    expect(getChartDescriptor("")).toBeUndefined();
  });

  it("★ 두 게이트 등치 — descriptor key 집합 ≡ chart-card.dataShapes (coming-soon drift 차단)", () => {
    // table/feedDescriptors 의 등치 불변식 미러 (Step 5 등록으로 파일 헤더 약속 이행).
    // datasource 만 추가하고 descriptor 를 빠뜨리면(또는 반대) 여기서 시끄럽게 실패.
    const chartCard = getComponent("chart-card");
    expect(chartCard, "chart-card 미등록 — Step 5 등록 누락").toBeDefined();
    const cardDatasources = (chartCard?.dataShapes ?? [])
      .map((s) => s.datasourceId)
      .slice()
      .sort();
    expect(Object.keys(CHART_DESCRIPTORS).sort()).toEqual(cardDatasources);
  });

  it("★ shape 등치 — CHART_CONSUMES_SHAPE ≡ chart-card.acceptsShapes (Stage 2 계약)", () => {
    // web form 상수 ↔ registry 선언 동기 (TABLE/FEED_CONSUMES_SHAPE 동형).
    expect(getComponent("chart-card")?.acceptsShapes).toEqual([CHART_CONSUMES_SHAPE]);
  });
});

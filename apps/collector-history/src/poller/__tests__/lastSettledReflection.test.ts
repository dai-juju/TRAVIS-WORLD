// ============================================================
// lastSettledReflection 단위 테스트 (N1 hotfix, 2026-07-10).
//
// 검증 대상 (순수 로직만 — DB upsert 배선은 fundingHistoryTask 소관):
//   mergeLatestFunding: 심볼별 최신 정산 선별 (페이지 넘나듦 / 순서 뒤섞임 / 이상 시각).
//   buildLastSettledIndicatorRows: partial upsert row 빌드 (mixed-batch 균일 key / ms 변환).
//
// 핵심 회귀 핀:
//   - N1 결함(predicted 스냅샷 오염)의 반영 파이프가 "가장 최신 정산의 realized rate"를
//     골라야 함 — 늦게 도착한 구(舊) 정산이 최신을 덮으면 안 됨.
//   - 시각 비교는 Date.parse 숫자값 (feedback_iso_lexical_vs_numeric_time_compare).
// ============================================================

import { describe, expect, it } from "vitest";
import type { HistoryFuturesFundingInsert } from "@travis/data-service";
import {
  buildLastSettledIndicatorRows,
  mergeLatestFunding,
  type LatestFunding,
} from "../lastSettledReflection.js";

/** 테스트용 정산 row 헬퍼. */
function fundingRow(
  symbol: string,
  fundingTime: string,
  fundingRate: number,
): HistoryFuturesFundingInsert {
  return {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol,
    funding_time: fundingTime,
    funding_rate: fundingRate,
    mark_price: null,
  };
}

describe("mergeLatestFunding — 심볼별 최신 정산 선별", () => {
  it("단일 배치: 심볼별로 저장", () => {
    const latest = new Map<string, LatestFunding>();
    mergeLatestFunding(latest, [
      fundingRow("BTCUSDT", "2026-07-10T00:00:00Z", 0.00009058),
      fundingRow("ETHUSDT", "2026-07-10T00:00:00Z", 0.0001),
    ]);
    expect(latest.get("BTCUSDT")?.fundingRate).toBeCloseTo(0.00009058);
    expect(latest.get("ETHUSDT")?.fundingRate).toBeCloseTo(0.0001);
  });

  it("페이지 넘나듦: 더 최신 정산이 이전 값을 갱신 (realized 확정값 추적)", () => {
    const latest = new Map<string, LatestFunding>();
    // page 1 — 00:00 정산
    mergeLatestFunding(latest, [fundingRow("BTCUSDT", "2026-07-10T00:00:00Z", 0.00006198)]);
    // page 2 — 08:00 정산 (더 최신) — realized 가 이 값으로 갱신돼야 함
    mergeLatestFunding(latest, [fundingRow("BTCUSDT", "2026-07-10T08:00:00Z", 0.00009058)]);
    expect(latest.get("BTCUSDT")?.fundingRate).toBeCloseTo(0.00009058);
    expect(latest.get("BTCUSDT")?.fundingTimeMs).toBe(
      Date.parse("2026-07-10T08:00:00Z"),
    );
  });

  it("★ 순서 뒤섞임: 늦게 도착한 구(舊) 정산이 최신을 덮지 않음 (핵심 회귀 핀)", () => {
    const latest = new Map<string, LatestFunding>();
    mergeLatestFunding(latest, [fundingRow("BTCUSDT", "2026-07-10T08:00:00Z", 0.00009058)]);
    // 이후 배치에 더 오래된 정산이 섞여 들어와도 최신(08:00)을 유지해야 함.
    mergeLatestFunding(latest, [fundingRow("BTCUSDT", "2026-07-10T00:00:00Z", 0.00006198)]);
    expect(latest.get("BTCUSDT")?.fundingRate).toBeCloseTo(0.00009058);
  });

  it("이상 시각(파싱 불가)은 skip (graceful — 반영 후보에서 제외)", () => {
    const latest = new Map<string, LatestFunding>();
    mergeLatestFunding(latest, [fundingRow("BADUSDT", "not-a-date", 0.0002)]);
    expect(latest.has("BADUSDT")).toBe(false);
  });

  it("같은 instant 의 'Z' vs '+00:00' 포맷은 숫자값으로 동일 취급 (사전식 함정 회피)", () => {
    const latest = new Map<string, LatestFunding>();
    mergeLatestFunding(latest, [fundingRow("BTCUSDT", "2026-07-10T00:00:00+00:00", 0.00006198)]);
    // 동일 instant 를 'Z' 로 다시 — ms 가 같으므로 > 비교 실패 → 갱신 안 함(기존 유지).
    mergeLatestFunding(latest, [fundingRow("BTCUSDT", "2026-07-10T00:00:00Z", 0.00009058)]);
    expect(Date.parse("2026-07-10T00:00:00+00:00")).toBe(
      Date.parse("2026-07-10T00:00:00Z"),
    );
    expect(latest.size).toBe(1);
    // 엄밀 '>' 라 동일 instant 는 갱신 안 됨 — 어느 값이든 realized 로 유효(같은 정산).
    expect(latest.get("BTCUSDT")?.fundingRate).toBeCloseTo(0.00006198);
  });
});

describe("buildLastSettledIndicatorRows — partial upsert row 빌드", () => {
  it("모든 row 가 동일 key 집합 (mixed-batch 불변) + ms 변환 + market_type", () => {
    const latest = new Map<string, LatestFunding>([
      ["BTCUSDT", { fundingTimeMs: Date.parse("2026-07-10T08:00:00Z"), fundingRate: 0.00009058 }],
      ["ETHUSDT", { fundingTimeMs: Date.parse("2026-07-10T08:00:00Z"), fundingRate: 0.00012 }],
    ]);
    const rows = buildLastSettledIndicatorRows("futures_usdm", latest);

    expect(rows).toHaveLength(2);
    const expectedKeys = [
      "exchange",
      "market_type",
      "symbol",
      "last_settled_funding_rate",
      "last_settled_funding_time",
    ].sort();
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(expectedKeys); // 균일 key = mixed-batch 안전
      expect(row.exchange).toBe("binance");
      expect(row.market_type).toBe("futures_usdm");
    }
    const btc = rows.find((r) => r.symbol === "BTCUSDT");
    expect(btc?.last_settled_funding_rate).toBeCloseTo(0.00009058);
    // now_futures_indicator.last_settled_funding_time 은 epoch ms(number) 컬럼.
    expect(btc?.last_settled_funding_time).toBe(Date.parse("2026-07-10T08:00:00Z"));
  });

  it("COINM market_type 전파", () => {
    const latest = new Map<string, LatestFunding>([
      ["BTCUSD_PERP", { fundingTimeMs: Date.parse("2026-07-10T08:00:00Z"), fundingRate: 0.0001 }],
    ]);
    const rows = buildLastSettledIndicatorRows("futures_coinm", latest);
    expect(rows[0]?.market_type).toBe("futures_coinm");
  });

  it("빈 맵 → 빈 배열 (upsert 스킵 신호)", () => {
    expect(buildLastSettledIndicatorRows("futures_usdm", new Map())).toEqual([]);
  });
});

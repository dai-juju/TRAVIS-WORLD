// apps/web/lib/dataService/__tests__/mergeRow.test.ts
//
// M2 경로 A fast-follow #1 Step 2 (2026-06-26) — row 병합 규칙 검증.
//
// 경로 A ws_direct 의 markPrice 부분 방송(7컬럼)이 도착해도, REST 폴러가 채운 다른
// 컬럼(last_settled_funding_rate / interest_rate / OI 등 초기 seed)이 사라지지 않아야
// 한다(partial-merge). replace(기본)·full-row(realtime)는 기존 통째 교체 거동 유지.

import { describe, expect, it } from "vitest";
import { mergeRow } from "../hooks";

type Row = Record<string, unknown>;

describe("mergeRow (M2 경로 A fast-follow #1 Step 2)", () => {
  // premium_index seed — REST(last_settled/interest) + WS(mark/funding) 혼합 full row.
  const seed: Row = {
    exchange: "binance",
    market_type: "futures_usdm",
    symbol: "BTCUSDT",
    mark_price: 63087.13,
    index_price: 63090.5,
    predicted_funding_rate: -0.00009475,
    next_funding_time: 1672531200000,
    last_settled_funding_rate: 0.0001, // REST 폴러가 채움 (WS 방송에 없음)
    interest_rate: 0.0001, // REST 폴러가 채움 (WS 방송에 없음)
  };

  it("partial — markPrice 부분 방송이 seed 위 WS 컬럼만 덮어쓰고 REST 컬럼 보존 (핵심)", () => {
    // 경로 A markPrice 방송 = WS 7컬럼 + PK (last_settled/interest 없음).
    const wsPush: Row = {
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: "BTCUSDT",
      mark_price: 63100.0, // 변동
      index_price: 63095.0, // 변동
      predicted_funding_rate: -0.0001, // 변동
      next_funding_time: 1672531200000,
    };
    const merged = mergeRow(seed, wsPush, "partial");
    // WS 컬럼은 갱신
    expect(merged.mark_price).toBe(63100.0);
    expect(merged.predicted_funding_rate).toBe(-0.0001);
    // ★ REST 컬럼은 seed 값 보존 (지워지지 않음)
    expect(merged.last_settled_funding_rate).toBe(0.0001);
    expect(merged.interest_rate).toBe(0.0001);
  });

  it("partial — next 가 명시한 키는 값이 null 이어도 덮어씀 (누락 ≠ null)", () => {
    const wsPush: Row = { ...seed, estimated_settle_price: null, mark_price: null };
    const merged = mergeRow(seed, wsPush, "partial");
    // 명시된 null 은 덮어씀 (WS 가 실제 null 을 보냄 = 그 값이 정답)
    expect(merged.mark_price).toBeNull();
    expect(merged.estimated_settle_price).toBeNull();
    // 누락한 REST 컬럼은 여전히 보존
    expect(merged.last_settled_funding_rate).toBe(0.0001);
  });

  it("partial — prev 부재(seed 아직 안 옴) → next 통째 반환 (graceful)", () => {
    const wsPush: Row = { symbol: "BTCUSDT", mark_price: 63100 };
    const merged = mergeRow(null, wsPush, "partial");
    expect(merged).toEqual(wsPush);
  });

  it("replace — prev 있어도 next 통째 교체 (ticker 기존 거동, 회귀 0)", () => {
    const fullNext: Row = { ...seed, mark_price: 64000, last_settled_funding_rate: 0.0002 };
    const merged = mergeRow(seed, fullNext, "replace");
    expect(merged).toBe(fullNext); // 동일 참조 반환 = 통째 교체
    expect(merged.last_settled_funding_rate).toBe(0.0002);
  });

  it("replace — prev 부재 → next 반환", () => {
    const next: Row = { symbol: "BTCUSDT", last_price: 63100 };
    expect(mergeRow(null, next, "replace")).toBe(next);
  });

  it("partial — full-row(realtime) 에선 replace 와 동일 결과 (휴면 안전 증명)", () => {
    // Supabase Realtime 은 전체 row push → next 가 모든 키 보유 → 병합해도 next 와 동등.
    const fullNext: Row = { ...seed, mark_price: 64000, last_settled_funding_rate: 0.0003 };
    const partialMerged = mergeRow(seed, fullNext, "partial");
    const replaceMerged = mergeRow(seed, fullNext, "replace");
    expect(partialMerged).toEqual(replaceMerged);
  });
});

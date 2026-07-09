// packages/shared/src/registries/__tests__/resolveDatasourceTable.test.ts
//
// 빚 [8-27] #1 회수 (M2 테마 A Step 1) — datasource 논리 id ↔ 물리 테이블명 분리.
// dataService(initialFetch / channelManager)가 from()/Realtime 구독 시 이 매핑을 쓴다.
//
// 주의: `../index` 를 import 하면 registries/index.ts 의 top-level registerDefaults()
//       가 실행되어 store 가 자동으로 채워진다 (브라우저/서버 동일 메커니즘).

import { describe, expect, it } from "vitest";
import { resolveDatasourceTable } from "../index";

describe("resolveDatasourceTable — datasource id ≠ 물리 테이블 분리 ([8-27] #1)", () => {
  it("indicator 5개 논리 id 는 모두 now_futures_indicator 로 매핑 (F3 핵심 회수 + basis 신설)", () => {
    expect(resolveDatasourceTable("premium_index")).toBe("now_futures_indicator");
    expect(resolveDatasourceTable("open_interest")).toBe("now_futures_indicator");
    expect(resolveDatasourceTable("long_short_ratio")).toBe(
      "now_futures_indicator",
    );
    expect(resolveDatasourceTable("taker_long_short")).toBe(
      "now_futures_indicator",
    );
    // M2 테마 A Step 2 신설 — basis 도 같은 물리 테이블 공유.
    expect(resolveDatasourceTable("basis")).toBe("now_futures_indicator");
  });

  it("ticker 2개는 자기 자신 (대안 A 호환 — 기존 동작 보존)", () => {
    expect(resolveDatasourceTable("now_spot_ticker")).toBe("now_spot_ticker");
    expect(resolveDatasourceTable("now_futures_ticker")).toBe(
      "now_futures_ticker",
    );
  });

  it("symbols_meta → symbols, liquidation → history_futures_liquidation", () => {
    expect(resolveDatasourceTable("symbols_meta")).toBe("symbols");
    expect(resolveDatasourceTable("liquidation")).toBe(
      "history_futures_liquidation",
    );
  });

  it("funding_history → history_futures_funding (사이클 2 Step 6 — 정산 이벤트 전용 테이블)", () => {
    expect(resolveDatasourceTable("funding_history")).toBe(
      "history_futures_funding",
    );
  });

  it("kline 은 table 미지정 → id fallback (TradingView widget, Supabase 테이블 없음)", () => {
    expect(resolveDatasourceTable("kline")).toBe("kline");
  });

  it("미등록 id 는 graceful 하게 id 그대로 반환 (절대 throw 안 함)", () => {
    expect(resolveDatasourceTable("nonexistent_xyz")).toBe("nonexistent_xyz");
    expect(resolveDatasourceTable("")).toBe("");
  });
});

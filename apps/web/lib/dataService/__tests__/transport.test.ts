// resolveTransport 단위 테스트 (M2 경로 A Step 3b, 2026-06-22).

import { describe, it, expect } from "vitest";
import { registerDatasource } from "@travis/shared";
import { resolveMergeMode, resolveTransport } from "../transport";

// @travis/shared 배럴 import 시 registerDefaults() 가 자동 실행 → 실 datasource 등록됨.
// 테스트는 고유 id 의 추가 entry 만 등록(clear 안 함 → defaults 경고 spam 회피).

describe("resolveTransport", () => {
  it("미등록 datasource → 'realtime' (하위호환 기본)", () => {
    expect(resolveTransport("ds-does-not-exist-xyz")).toBe("realtime");
  });

  it("transport 미명시 등록 → 'realtime'", () => {
    registerDatasource({
      id: "tp-test-rt",
      name: "RT",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
    });
    expect(resolveTransport("tp-test-rt")).toBe("realtime");
  });

  it("ws_direct 등록 → 'ws_direct'", () => {
    registerDatasource({
      id: "tp-test-wd",
      name: "WD",
      category: "_now",
      refreshTier: "realtime",
      queryableFields: [],
      transport: "ws_direct",
      liveTopicSpec: { prefix: "x:y", selectorKeys: ["symbol"] },
    });
    expect(resolveTransport("tp-test-wd")).toBe("ws_direct");
  });

  // ★ Phase B 플립 불변식 회귀 가드 (code-reviewer W2, Step 4) — ticker 2종 모두
  //   "ws_direct" 로 동시 전환됨(경로 A 활성). 둘 중 하나만 켜는 비대칭 실수를 이 두
  //   단언이 잡는다(같은 prefix "binance:ticker" 공유 → 한쪽만 켜면 데이터 경로 혼선).
  it("실 datasource now_futures_ticker 는 'ws_direct' (Step 4 Phase B 플립)", () => {
    expect(resolveTransport("now_futures_ticker")).toBe("ws_direct");
  });

  it("실 datasource now_spot_ticker 는 'ws_direct' (Step 4 Phase B 플립)", () => {
    expect(resolveTransport("now_spot_ticker")).toBe("ws_direct");
  });

  // ★ fast-follow #1 Step 5 플립 (2026-06-26) — premium_index(마크/펀딩)가 ws_direct 로
  //   전환됨(경로 A 활성). Step 1 휴면 단언("realtime")을 여기서 뒤집어 플립을 증명·고정.
  //   USDM·COINM 모두 같은 premium_index 토픽(market_type 세그먼트로 구분)으로 방송.
  it("실 datasource premium_index 는 'ws_direct' (fast-follow #1 Step 5 플립)", () => {
    expect(resolveTransport("premium_index")).toBe("ws_direct");
  });

  // ★ ff#2 Step 6 Phase B 플립 (2026-07-06) — liquidation 이 ws_direct 로 전환
  //   (feed-card 경로 A tape 활성). table-card 의 set 소비는 테이블 훅(경로 B)이라
  //   transport 와 무관 — 두 form 공존.
  it("실 datasource liquidation 은 'ws_direct' (ff#2 Step 6 플립)", () => {
    expect(resolveTransport("liquidation")).toBe("ws_direct");
  });
});

describe("resolveMergeMode (M2 경로 A fast-follow #1 Step 2)", () => {
  it("미등록 datasource → 'replace' (하위호환 기본)", () => {
    expect(resolveMergeMode("ds-does-not-exist-xyz")).toBe("replace");
  });

  it("mergeMode 미명시 등록 → 'replace'", () => {
    registerDatasource({
      id: "mm-test-default",
      name: "MM RT",
      category: "_now",
      refreshTier: "high",
      queryableFields: [],
    });
    expect(resolveMergeMode("mm-test-default")).toBe("replace");
  });

  // ★ 실 datasource — premium_index 만 partial(markPrice 부분 방송 컬럼 보존),
  //   나머지(ticker 등)는 replace. defaults 가 상주하는 web 에서 검증.
  it("실 datasource premium_index 는 'partial' (markPrice 부분 방송 컬럼 보존)", () => {
    expect(resolveMergeMode("premium_index")).toBe("partial");
  });

  it("실 datasource ticker 2종은 'replace' (full upsert — 통째 교체)", () => {
    expect(resolveMergeMode("now_futures_ticker")).toBe("replace");
    expect(resolveMergeMode("now_spot_ticker")).toBe("replace");
  });
});

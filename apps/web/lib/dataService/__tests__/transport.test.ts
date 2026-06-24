// resolveTransport 단위 테스트 (M2 경로 A Step 3b, 2026-06-22).

import { describe, it, expect } from "vitest";
import { registerDatasource } from "@travis/shared";
import { resolveTransport } from "../transport";

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
});

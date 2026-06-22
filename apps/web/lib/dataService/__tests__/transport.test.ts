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

  it("실 datasource now_futures_ticker 는 'realtime' (Step 3b 휴면 — 아직 안 넘김)", () => {
    expect(resolveTransport("now_futures_ticker")).toBe("realtime");
  });
});

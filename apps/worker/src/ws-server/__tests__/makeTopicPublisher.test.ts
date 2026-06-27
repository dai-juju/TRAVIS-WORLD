// ============================================================
// makeTopicPublisher 단위 테스트 ([10-68], 2026-06-27).
//
// 검증 핵심:
//   1. 전역 구독자 0 → publish 무비용 no-op (datasourceIdFor 조차 미호출, throw 없음)
//   2. 구독자 있으면 buildLiveTopic 으로 조립한 토픽에 전체 행 payload 방송
//   3. datasourceIdFor 에 marketType 전달 (ticker = marketType별 datasource 해석)
//   4. 다중 행 → 행마다 토픽 조립 + 방송
//   5. buildLiveTopic null(미등록 datasource) → 그 행만 graceful skip(throw 없음)
// ============================================================

import { buildLiveTopic, buildLiveTopics } from "@travis/shared";
import { describe, expect, it, vi } from "vitest";
import { LiveBus } from "../LiveBus.js";
import type { LiveEnvelope } from "../envelope.js";
import { makeTopicPublisher } from "../makeTopicPublisher.js";

// markPrice 가 쓰는 실제 등록 datasource — buildLiveTopic 이 토픽을 조립한다.
const DS = "premium_index";
const ROW = { symbol: "BTCUSDT", mark_price: "60000" };
const EXPECTED_TOPIC = buildLiveTopic(DS, {
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
});

describe("makeTopicPublisher", () => {
  // 전제: 등록된 datasource 라 토픽이 실제로 조립돼야 테스트가 의미 있음.
  it("전제 — premium_index 토픽이 buildLiveTopic 으로 조립된다", () => {
    expect(EXPECTED_TOPIC).toBeTruthy();
  });

  it("전역 구독자 0 → datasourceIdFor 미호출 + no-op (throw 없음)", () => {
    const bus = new LiveBus();
    const idFor = vi.fn(() => DS);
    const publish = makeTopicPublisher(bus, idFor);

    expect(() => publish("futures_usdm", [ROW])).not.toThrow();
    // 구독자 0 가드가 datasourceId 해석조차 생략 = idle 무비용 보장.
    expect(idFor).not.toHaveBeenCalled();
  });

  it("구독자 있으면 buildLiveTopic 토픽에 전체 행 payload 방송", () => {
    const bus = new LiveBus();
    const received: LiveEnvelope[] = [];
    bus.subscribe(EXPECTED_TOPIC!, (env) => received.push(env));

    const publish = makeTopicPublisher(bus, () => DS);
    publish("futures_usdm", [ROW]);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ topic: EXPECTED_TOPIC!, payload: ROW });
  });

  it("datasourceIdFor 에 marketType 전달 (ticker식 marketType별 해석)", () => {
    const bus = new LiveBus();
    bus.subscribe(EXPECTED_TOPIC!, () => {});
    const idFor = vi.fn(() => DS);

    makeTopicPublisher(bus, idFor)("futures_usdm", [ROW]);

    expect(idFor).toHaveBeenCalledWith("futures_usdm");
  });

  it("다중 행 → 행마다 토픽 조립 + 방송", () => {
    const bus = new LiveBus();
    const ethTopic = buildLiveTopic(DS, {
      market_type: "futures_usdm",
      symbol: "ETHUSDT",
    })!;
    const btc: LiveEnvelope[] = [];
    const eth: LiveEnvelope[] = [];
    bus.subscribe(EXPECTED_TOPIC!, (env) => btc.push(env));
    bus.subscribe(ethTopic, (env) => eth.push(env));

    makeTopicPublisher(bus, () => DS)("futures_usdm", [
      ROW,
      { symbol: "ETHUSDT", mark_price: "3000" },
    ]);

    expect(btc).toHaveLength(1);
    expect(eth).toHaveLength(1);
    expect(eth[0]!.payload).toMatchObject({ symbol: "ETHUSDT" });
  });

  it("optionalSelectorKeys datasource(liquidation) → tape+심볼 양쪽 fan-out", () => {
    const bus = new LiveBus();
    // liquidation = selectorKeys[market_type] + optionalSelectorKeys[symbol] (defaults).
    const topics = buildLiveTopics("liquidation", {
      market_type: "futures_usdm",
      symbol: "BTCUSDT",
    });
    expect(topics).toHaveLength(2); // tape + 심볼
    const tape: LiveEnvelope[] = [];
    const sym: LiveEnvelope[] = [];
    bus.subscribe(topics[0]!, (e) => tape.push(e)); // tape (market_type만)
    bus.subscribe(topics[1]!, (e) => sym.push(e)); // 심볼별

    const liqRow = { symbol: "BTCUSDT", side: "SELL" };
    makeTopicPublisher(bus, () => "liquidation")("futures_usdm", [liqRow]);

    // 한 청산 이벤트가 전체 tape 구독자·심볼별 구독자 양쪽에 동시 전달.
    expect(tape).toHaveLength(1);
    expect(sym).toHaveLength(1);
    expect(sym[0]).toMatchObject({ payload: { symbol: "BTCUSDT", side: "SELL" } });
  });

  it("미등록 datasource → buildLiveTopic null → graceful skip (throw 없음)", () => {
    const bus = new LiveBus();
    const received: LiveEnvelope[] = [];
    // 구독자는 있으나(가드 통과) datasource 가 미등록이라 토픽 null → 방송 skip.
    bus.subscribe("anything", (env) => received.push(env));

    const publish = makeTopicPublisher(bus, () => "definitely_not_a_datasource");
    expect(() => publish("futures_usdm", [ROW])).not.toThrow();
    expect(received).toHaveLength(0);
  });

  it("혼합 — 유효 행은 방송, selector 빈(symbol='') 행만 graceful skip", () => {
    const bus = new LiveBus();
    const received: LiveEnvelope[] = [];
    bus.subscribe(EXPECTED_TOPIC!, (env) => received.push(env));

    // 같은 datasource 라도 symbol='' 면 buildLiveTopic null → 그 행만 건너뜀.
    makeTopicPublisher(bus, () => DS)("futures_usdm", [
      ROW,
      { symbol: "", mark_price: "0" },
    ]);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ topic: EXPECTED_TOPIC!, payload: ROW });
  });

  it("빈 rows 배열 → no-op + no-throw", () => {
    const bus = new LiveBus();
    const idFor = vi.fn(() => DS);
    bus.subscribe(EXPECTED_TOPIC!, () => {});

    expect(() => makeTopicPublisher(bus, idFor)("futures_usdm", [])).not.toThrow();
  });
});

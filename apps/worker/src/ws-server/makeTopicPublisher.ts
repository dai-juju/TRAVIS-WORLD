// ============================================================
// makeTopicPublisher — 경로 A 방송 sink 배선 헬퍼 (M2 경로 A [10-68], 2026-06-27).
//
// 배경 (code-reviewer W2, fast-follow #1 Step 3): ticker / markPrice 의 publish
//   콜백이 "전역 구독자 0 가드 + datasourceId 해석 + buildLiveTopic + liveBus.publish
//   루프" 동형 패턴을 반복(현재 2회). fast-follow #2(청산)·#3(체결/호가)가 같은 패턴을
//   더 복붙하면 4~5회로 증식 → 스파게티(CLAUDE.md "확장 가능·스파게티 금지").
//   두 클로저의 유일한 차이 = datasourceId 해석 한 줄(ticker=marketType별 lookup /
//   markPrice=상수)이므로, 그 한 줄만 주입 함수로 빼서 배선을 단일화한다.
//
// 설계 (★확장성·분리 경계):
//   - datasourceIdFor(marketType) 만 주입 → 새 방송 sink(청산·호가 …)는 이 해석
//     함수만 다르게 넘기면 끝. 배선 로직은 한 곳에서만 산다.
//   - 행 타입은 토픽 selector(symbol)만 알면 됨 → { symbol: string } 최소 계약.
//     ticker/markPrice 의 Insert 행 모두 symbol 을 가지므로 그대로 수용(payload 는
//     런타임 전체 행 그대로 방송, 타입만 좁게 본다).
//   - 토픽 문자열은 워커가 직접 조립하지 않고 buildLiveTopic 단일 진실 경유 —
//     워커/프론트가 같은 함수·같은 liveTopicSpec 으로 조립하므로 drift 불가
//     (W2 grep gate 로 토픽 리터럴 0 강제).
//   - graceful: spec 없음/selector 누락 시 buildLiveTopic 이 null → 그 행만 방송
//     skip(crash 없음). 전역 구독자 0 이면 토픽 계산조차 생략 = idle 무비용.
// ============================================================

import { buildLiveTopic } from "@travis/shared";
import type { MarketType } from "../ws-relay/index.js";
import type { LiveBus } from "./LiveBus.js";

/** 방송할 행의 최소 계약 — 토픽 selector(symbol)만 요구. */
export interface PublishableRow {
  symbol: string;
}

/**
 * 경로 A 방송 sink 콜백을 생성한다. 핸들러의 `publish` 옵션에 그대로 주입.
 *
 * @param liveBus 프로세스 내부 토픽 pub/sub 버스
 * @param datasourceIdFor marketType → datasource id 해석(레지스트리 liveTopicSpec 키)
 * @returns `(marketType, rows) => void` — 핸들러가 enriched/partial 행 배열로 호출
 */
export function makeTopicPublisher(
  liveBus: LiveBus,
  datasourceIdFor: (marketType: MarketType) => string,
): (marketType: MarketType, rows: ReadonlyArray<PublishableRow>) => void {
  return (marketType, rows) => {
    // 전역 구독자 0 이면 토픽 계산조차 생략 = idle 무비용(프론트 미접속 정상 운영).
    if (liveBus.subscriberCount() === 0) return;
    const datasourceId = datasourceIdFor(marketType);
    for (const r of rows) {
      // selectorKeys=["market_type","symbol"] → buildLiveTopic 이 동일 순서로 조립.
      // spec 없음/selector 누락 시 null → 그 행만 방송 skip(graceful, crash 없음).
      const topic = buildLiveTopic(datasourceId, {
        market_type: marketType,
        symbol: r.symbol,
      });
      if (topic) liveBus.publish(topic, r);
    }
  };
}

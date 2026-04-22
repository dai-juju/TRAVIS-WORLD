/**
 * __TRAVIS_INJECT__ — 개발자 전용 콘솔 헬퍼 (M1.4 Step 2).
 *
 * 왜 필요한가:
 *   M1.5 에서 Claude 가 AiCardConfig JSON 을 자동 생산하기 전까지, 개발자가
 *   devtools 콘솔에서 수동으로 JSON 을 주입해 카드 3종(Step 3~5)을 검증해야 한다.
 *
 * 사용 예 (브라우저 콘솔):
 *   __TRAVIS_INJECT__({
 *     id: "ticker-btc",
 *     componentId: "ticker-card",
 *     size: "md",
 *     updateMode: "value",
 *     kicker: "SPOT · LIVE",
 *     title: "Bitcoin, in <em>dollars</em>",
 *     subtitle: "Binance · BTC/USDT · realtime",
 *     data: {
 *       datasource: "now_spot_ticker",
 *       exchange: "binance",
 *       marketType: "spot",
 *       symbol: "BTCUSDT",
 *     },
 *   });
 *
 * 반환값:
 *   boolean — true 면 추가 성공, false 면 Zod 검증 실패 (원인은 console.error).
 *
 * 안전 장치:
 *   1. production build 에서는 설치하지 않는다 (NODE_ENV 가드).
 *   2. SSR/Node 환경에서는 window 자체가 없으므로 no-op.
 *   3. AiCardConfigSchema.safeParse 로 crash 없이 거부.
 *   4. position 이 없으면 뷰포트 근처 랜덤 좌표로 자동 배치 (겹침 허용 — 드래그로 정돈).
 */

import { AiCardConfigSchema } from "@travis/shared";
import type { StoreApi } from "zustand";
import type { CanvasStore, TravisNode } from "@/lib/stores/canvasStore";
import { TRAVIS_CARD_NODE_TYPE } from "@/lib/stores/canvasStore";
import { CARD_SIZE_PX } from "@/components/canvas/CardContainer";

/** window 에 주입되는 함수 시그니처. */
type TravisInjectFn = (json: unknown) => boolean;

/** 전역 네임스페이스 확장 — TS 가 window.__TRAVIS_INJECT__ 를 인지하도록. */
declare global {
  interface Window {
    __TRAVIS_INJECT__?: TravisInjectFn;
  }
}

/**
 * CanvasStoreProvider 마운트 시점에 호출해 window 에 inject 함수를 설치한다.
 * cleanup 함수를 반환 — provider 언마운트 시 window 에서 제거.
 */
export function installDevInject(store: StoreApi<CanvasStore>): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (process.env.NODE_ENV === "production") return () => undefined;

  const inject: TravisInjectFn = (json) => {
    const result = AiCardConfigSchema.safeParse(json);
    if (!result.success) {
      console.error("[__TRAVIS_INJECT__] AiCardConfig 검증 실패:", result.error.issues);
      return false;
    }
    const config = result.data;
    const position = config.position ?? randomSpawnPosition();
    // Step 4.6: React Flow NodeResizer 가 제대로 작동하려면 width/height 를
    // 노드에 박아줘야 한다 (CardContainer 는 100% 크기로 부모를 따름).
    const sizePx = CARD_SIZE_PX[config.size];
    const node: TravisNode = {
      id: config.id,
      type: TRAVIS_CARD_NODE_TYPE,
      position,
      width: sizePx.w,
      height: sizePx.h,
      data: { config },
    };
    store.getState().addNode(node);
    return true;
  };

  window.__TRAVIS_INJECT__ = inject;
  console.log(
    "[__TRAVIS_INJECT__] dev-only 헬퍼 설치됨. " +
      "예: __TRAVIS_INJECT__({ id:'t1', componentId:'ticker-card', size:'md', " +
      "updateMode:'value', kicker:'SPOT · LIVE', title:'Bitcoin, in <em>dollars</em>', " +
      "data:{ datasource:'now_spot_ticker', exchange:'binance', marketType:'spot', symbol:'BTCUSDT' } })",
  );

  return () => {
    if (window.__TRAVIS_INJECT__ === inject) {
      delete window.__TRAVIS_INJECT__;
    }
  };
}

/** 대략 뷰포트 중앙 근처의 무작위 좌표 — 연속 주입 시 카드가 겹치지 않게 분산. */
function randomSpawnPosition(): { x: number; y: number } {
  const jitter = () => Math.round((Math.random() - 0.5) * 200);
  return { x: 100 + jitter(), y: 100 + jitter() };
}

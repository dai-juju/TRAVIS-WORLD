// ============================================================
// StreamRouter — Binance WS 수신 메시지 → 핸들러 dispatch (M1.3 Step 5a).
//
// 책임:
//   - 여러 StreamHandler를 등록 보관
//   - 수신한 {stream, data, marketType} 을 canHandle 매칭되는 핸들러에게 전달
//   - 매칭 핸들러 0개 → debug 로그 (예상된 미등록 스트림)
//   - 매칭 핸들러 2개 이상 → 전부 호출 (예: kline 1m이 historyKline + volumeKline 양쪽)
//
// graceful 원칙:
//   핸들러 handle 내부는 throw 안 하기로 계약되어 있음. 혹시 터져도 router가 catch.
// ============================================================

import type { MarketType, StreamHandler } from "./types.js";

export class StreamRouter {
  private readonly handlers: StreamHandler[] = [];

  /**
   * 핸들러 등록. bootstrap에서 모든 핸들러를 여기로 모은다.
   * 같은 ID 중복 등록은 경고만 남기고 그대로 추가 (테스트 유연성).
   */
  register(handler: StreamHandler): void {
    if (this.handlers.some((h) => h.id === handler.id)) {
      console.warn(`[streamRouter] 중복 ID '${handler.id}' 재등록 — 동일 핸들러 2회 호출됨`);
    }
    this.handlers.push(handler);
  }

  /**
   * 수신 메시지를 canHandle 매칭되는 핸들러 모두에게 dispatch.
   * 매칭 핸들러들은 **병렬** 호출 — 각자 독립적인 upsert 경로라 서로 blocking 없음.
   * 단 한 핸들러에서 unexpected throw가 나도 다른 핸들러 실행은 계속됨.
   */
  async route(
    streamName: string,
    marketType: MarketType,
    data: unknown,
  ): Promise<void> {
    const matched = this.handlers.filter((h) => h.canHandle(streamName, marketType));

    if (matched.length === 0) {
      // 예상된 "미구현 스트림"도 Binance Combined Stream이 돌려줄 수 있음.
      // 로그 과다 방지 차원에서 debug 수준만 — 운영 관측 시 log level로 제어.
      return;
    }

    // Promise.allSettled: 한 핸들러가 예외로 실패해도 다른 핸들러 결과 영향 없음.
    const results = await Promise.allSettled(
      matched.map(async (h) => {
        try {
          await h.handle(streamName, marketType, data);
        } catch (e) {
          // 핸들러 계약 위반(throw) 방어. 로그만 남기고 propagate 금지.
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[streamRouter] handler '${h.id}' threw: ${msg}`);
        }
      }),
    );

    // allSettled 결과 자체는 위에서 이미 catch로 처리해 rejected 없음. 방어선.
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[streamRouter] 예상외 rejection: ${String(r.reason)}`);
      }
    }
  }

  /** 테스트·디버그용. 등록된 핸들러 ID 목록. */
  listIds(): string[] {
    return this.handlers.map((h) => h.id);
  }
}

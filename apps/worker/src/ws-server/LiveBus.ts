// ============================================================
// LiveBus — 워커 내부 토픽 pub/sub 버스 (M2 경로 A Step 1, 2026-06-22).
//
// 책임:
//   - publish(topic, payload): 해당 topic 구독자 전원에게 LiveEnvelope 전달
//   - subscribe(topic, fn): 구독 등록 + unsubscribe 함수 반환
//   - 구독자 0 이면 publish 는 즉시 반환 (무비용 — back-pressure skip)
//
// 설계 의도 (★확장성·분리 경계):
//   - 토픽은 **불투명 문자열** (envelope.ts 참조) — 버스는 의미를 모름.
//   - 이 파일이 "프로세스 내부 방송"의 단일 경계. 추후 사용자가 늘어 별도
//     WS 서버 프로세스로 분리해야 하면 **이 LiveBus 구현만** 프로세스 간
//     transport(예: Redis pub/sub)로 교체 → 방송 sink(핸들러)·WsServer 무변경.
//   - graceful (CLAUDE.md): 한 구독자(소켓 전송)가 throw 해도 방송 루프와
//     다른 구독자 전달이 죽지 않게 격리.
// ============================================================

import type { LiveEnvelope } from "./envelope.js";

/** 한 건의 envelope 를 받는 구독 콜백. */
export type LiveSubscriber = (env: LiveEnvelope) => void;

export class LiveBus {
  /** topic → 구독자 집합. 구독자 0 이 되면 키 자체를 제거(메모리 누수 방지). */
  private readonly subs = new Map<string, Set<LiveSubscriber>>();
  /** 전역 단조 증가 시퀀스 (방송마다 +1, 토픽 무관). */
  private seq = 0;
  /** 전체 구독 수 — 방송 측 idle 가드용(0 이면 topic 계산조차 생략). */
  private totalSubs = 0;

  /**
   * topic 구독자 전원에게 payload 를 봉투에 담아 전달.
   * 구독자 0 이면 즉시 반환 — 정상 운영(프론트 미접속) 시 무비용.
   */
  publish(topic: string, payload: unknown): void {
    const set = this.subs.get(topic);
    if (!set || set.size === 0) return;
    const env: LiveEnvelope = { topic, ts: Date.now(), seq: ++this.seq, payload };
    for (const fn of set) {
      try {
        fn(env);
      } catch (e) {
        // 구독자(보통 소켓 send) 예외 격리 — 다른 구독자/방송 루프 보호.
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[liveBus] subscriber threw on '${topic}': ${msg}`);
      }
    }
  }

  /**
   * topic 구독. 반환된 함수를 호출하면 구독 해제.
   * 같은 (topic, fn) 중복 구독은 1회로 취급 (Set).
   */
  subscribe(topic: string, fn: LiveSubscriber): () => void {
    let set = this.subs.get(topic);
    if (!set) {
      set = new Set();
      this.subs.set(topic, set);
    }
    if (!set.has(fn)) {
      set.add(fn);
      this.totalSubs++;
    }
    let active = true;
    return () => {
      if (!active) return; // unsubscribe 멱등 (2회 호출 안전)
      active = false;
      const current = this.subs.get(topic);
      if (current && current.delete(fn)) {
        this.totalSubs--;
        if (current.size === 0) this.subs.delete(topic);
      }
    };
  }

  /** 전체 구독 수. 방송 측이 "아무도 안 들으면 작업 생략"에 사용. */
  subscriberCount(): number {
    return this.totalSubs;
  }

  /** 특정 topic 구독자 수 (디버그·테스트용). */
  topicSubscriberCount(topic: string): number {
    return this.subs.get(topic)?.size ?? 0;
  }
}

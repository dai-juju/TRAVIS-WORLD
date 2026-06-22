// ============================================================
// ws-server/rateLimiter.ts — 연결당 메시지 rate limit (M2 경로 A Step 2, [10-52], 2026-06-22).
//
// 토큰 버킷: 평소엔 버스트(capacity)를 허용하되 지속 남용은 초당 refill 로 제한.
//   - 정상 클라는 카드 mount/unmount 시에만 subscribe/unsubscribe 를 보냄(드문 버스트).
//   - 악의/버그 클라가 메시지를 쏟아내면 토큰 고갈 → WsServer 가 close(4429).
//
// 순수 로직(소켓·시간 의존 주입) — 단위 테스트 가능. now() 주입으로 결정적 검증.
// ============================================================

export interface TokenBucketOptions {
  /** 최대 누적 토큰 = 허용 버스트 크기. */
  capacity: number;
  /** 초당 충전 토큰 수 = 지속 허용 rate. */
  refillPerSec: number;
  /** 현재 시각(ms). 테스트 주입용. 기본 Date.now. */
  now?: () => number;
}

export class TokenBucket {
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefillMs: number;

  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity;
    this.refillPerSec = opts.refillPerSec;
    this.now = opts.now ?? (() => Date.now());
    this.tokens = opts.capacity; // 가득 찬 상태로 시작(첫 버스트 허용)
    this.lastRefillMs = this.now();
  }

  /**
   * 토큰 1개 소비 시도. 성공 시 true, 고갈 시 false(= rate 초과).
   * 호출 시점에 경과 시간만큼 토큰을 먼저 충전(capacity 상한).
   */
  tryConsume(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill(): void {
    const nowMs = this.now();
    const elapsedSec = (nowMs - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefillMs = nowMs;
  }
}

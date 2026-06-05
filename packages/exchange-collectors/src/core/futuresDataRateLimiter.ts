// ============================================================
// futuresDataRateLimiter — 프로세스 전역 /futures/data 요청 token-bucket ([8-31]ⓐ, 2026-06-05).
//
// 배경 (왜 별도 카운터가 필요한가):
//   Binance /futures/data/* 통계 엔드포인트(LSR/Taker/OI hist/basis 등)는 weight=0 이라
//   X-MBX-USED-WEIGHT-1M 에 전혀 잡히지 않는다. 대신 **IP 단위 요청 수 카운터**(1000 req/5min)
//   가 별도로 존재 — 초과 시 200 + {code:-1003} 또는 418 IP ban (M1.8.5 실측). 기존 방어선
//   (client.ts 의 weight sticky throttle, PerMetricThrottle 의 per-task 간격)으로는
//   "여러 task 동시 발화 시 합산 순간 초과"를 구조적으로 막지 못한다.
//
//   - PerMetricThrottle = backfill loop **한 개 task 내부**의 호출 간격(per-metric floor).
//   - 본 token-bucket = **프로세스 전역 합산** 요청 수 hard cap (여러 task 동시 발화 통제).
//   둘은 레이어가 다르며 공존한다(중복 아님).
//
// 버킷 분리 (crypto-domain-expert 자문 2026-06-05):
//   (1) 통계 버킷 — openInterestHist/topLongShort(Account/Position)/globalLongShort/taker:
//       합산 150 req/min (1000 req/5min IP 카운터의 75% 마진. 150×5=750<1000).
//   (2) basis 버킷 — /futures/data/basis: 합산 30 req/min.
//       ★ basis 는 fapi weight 풀(2400/min)에도 걸리는 별도 카운터 → 통계 버킷과 반드시 분리.
//         섞으면 한쪽 한도 산수가 붕괴한다.
//
// 단순 token-bucket(capacity=refill=분당 한도) 으로 충분 — 5분 sliding window 정밀 구현 불요
//   (분당 150 × 5분 = 750 < 1000 IP 카운터, 안전 마진 내). burst 는 분당 한도 내에서만 허용.
//
// opt-in 설계 (★핵심): binanceFetch 가 opts.rateLimiterGroup 을 줄 때만 acquire 한다.
//   worker now-poller(별도 IP·실시간 폴링)는 group 미지정 → 본 limiter 비활성 → 무영향.
//   collector forward-fill 경로(별도 서버·별도 IP)에서만 group 지정 → 전역 합산 통제.
//   ⚠️ worker 와 collector 는 별개 프로세스(별개 서버)라 어차피 버킷 인스턴스를 공유하지 않지만,
//      "전역 적용 시 worker now-poller 가 throttle 되는 부작용" 자체를 차단하는 게 opt-in 의 목적.
//
// 결정론 테스트: 시계(now)·sleep 을 주입해 가짜 시계로 리필/대기 검증.
//
// 공식 근거: /futures/data IP quota = 1000 req/5min, weight=0.
//   ref: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data
//   (canonical-metrics.md §LSR/Basis, M1.8.5 실측 -1003, 2026-06-05 조회)
// ============================================================

/** /futures/data token-bucket 버킷 구분. basis 는 별도 weight 풀이라 분리 필수. */
export type FuturesDataBucket = "stats" | "basis";

/**
 * 통계 5종 버킷 분당 한도 (req/min). 1000 req/5min IP 카운터의 75% 마진.
 * ★ W2: historyBackfillCore 의 reqPerMin(PerMetricThrottle floor)과 min() 관계 — 느린 쪽이 실질 한도.
 *   둘 중 하나만 바꾸면 다른 쪽이 조용히 무력화되니 함께 검토할 것.
 */
export const STATS_BUCKET_PER_MIN = 150;

/** basis 버킷 분당 한도 (req/min). fapi weight 풀(2400/min)과 IP 카운터 양쪽 보호. */
export const BASIS_BUCKET_PER_MIN = 30;

/** 1분(ms) — 리필 윈도우. */
const REFILL_WINDOW_MS = 60_000;

/** 토큰 부족 시 재확인 폴링 간격(ms). 리필이 연속적이라 짧은 간격으로 충분. */
const ACQUIRE_POLL_MS = 50;

/** 테스트/주입용 시계·sleep 인터페이스. 기본은 실제 시계. */
export interface RateLimiterClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const REAL_CLOCK: RateLimiterClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * 연속 리필 token-bucket. capacity = refillPerMin (분당 한도).
 * 1분에 capacity 만큼 균등 리필(연속) — burst 는 capacity 한도 내에서만 허용.
 *
 * 순수 클래스 — 전역 싱글톤은 본 파일 하단에서 1회 생성. 테스트는 자체 인스턴스 + 가짜 시계.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;
  /** 분당 토큰 1개당 리필 소요 ms (= 60000 / capacity). */
  private readonly msPerToken: number;

  /** capacity 정규화 결과 (>=1 보장). S1 가드: capacity<=0 시 1 로 클램프. */
  private readonly effectiveCapacity: number;

  constructor(capacity: number, private readonly clock: RateLimiterClock = REAL_CLOCK) {
    // ★ S1 방어 가드 (code-reviewer): capacity<=0 면 msPerToken = 60000/0 = Infinity →
    //   acquire 가 영원히 토큰 못 받아 무한 hang. throw 대신 graceful(TRAVIS 스타일):
    //   console.warn 후 Math.max(1, capacity) 로 클램프 → 최소 분당 1 요청은 흘려보냄.
    //   (정상 경로에선 STATS=150 / BASIS=30 상수라 절대 안 걸림 — 오설정 방어용.)
    if (capacity <= 0) {
      console.warn(
        `[TokenBucket] capacity<=0 (${capacity}) — 무한 대기 방지 위해 1 로 클램프. 호출부 상수 확인 요망.`,
      );
    }
    this.effectiveCapacity = Math.max(1, capacity);
    this.tokens = this.effectiveCapacity; // 시작 시 가득 — 초기 burst 는 한도 내 허용.
    this.lastRefillAt = clock.now();
    this.msPerToken = REFILL_WINDOW_MS / this.effectiveCapacity;
  }

  /** 경과 시간만큼 토큰 리필 (capacity 상한). */
  private refill(now: number): void {
    const elapsed = now - this.lastRefillAt;
    if (elapsed <= 0) return;
    const refilled = elapsed / this.msPerToken;
    if (refilled <= 0) return;
    this.tokens = Math.min(this.effectiveCapacity, this.tokens + refilled);
    this.lastRefillAt = now;
  }

  /**
   * 토큰 1개 확보. 부족하면 리필될 때까지 await (throw 금지, graceful).
   * 여러 호출이 동시 대기해도 각자 폴링하며 순차적으로 토큰을 가져간다.
   */
  async acquire(): Promise<void> {
    // 무한 루프 방지용 안전 상한 없음 — 리필이 보장되므로 반드시 종료한다.
    //   (effectiveCapacity>=1 보장 → msPerToken 유한 → msPerToken 마다 토큰 1개 확정 리필.
    //    S1 가드로 capacity<=0 이어도 effectiveCapacity=1 이라 hang 불가.)
    for (;;) {
      this.refill(this.clock.now());
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // 토큰 1개가 리필될 때까지의 예상 대기 — 최소 ACQUIRE_POLL_MS 보장.
      const deficit = 1 - this.tokens;
      const waitMs = Math.max(ACQUIRE_POLL_MS, Math.ceil(deficit * this.msPerToken));
      await this.clock.sleep(waitMs);
    }
  }

  /** 테스트용 현재 토큰 수 스냅샷. */
  _peekTokens(): number {
    return this.tokens;
  }
}

/**
 * /futures/data 전역 rate limiter — 통계·basis 2 버킷 보유.
 * 프로세스당 1 인스턴스(하단 싱글톤). path 로 버킷을 자동 판별해 acquire.
 */
export class FuturesDataRateLimiter {
  private readonly stats: TokenBucket;
  private readonly basis: TokenBucket;

  constructor(clock: RateLimiterClock = REAL_CLOCK) {
    this.stats = new TokenBucket(STATS_BUCKET_PER_MIN, clock);
    this.basis = new TokenBucket(BASIS_BUCKET_PER_MIN, clock);
  }

  /**
   * 해당 path 의 버킷에서 토큰 1개 확보 (필요 시 await).
   * /futures/data/basis → basis 버킷, 그 외 /futures/data/* → 통계 버킷.
   */
  async acquire(path: string): Promise<void> {
    const bucket = bucketForPath(path);
    if (bucket === "basis") {
      await this.basis.acquire();
    } else {
      await this.stats.acquire();
    }
  }

  /** 테스트용 버킷 직접 접근. */
  _bucket(kind: FuturesDataBucket): TokenBucket {
    return kind === "basis" ? this.basis : this.stats;
  }
}

/**
 * path → 버킷 판별. /futures/data/basis 는 basis 버킷, 그 외 /futures/data/* 는 통계.
 * (대소문자 무시 — Binance path 는 소문자지만 방어적으로 정규화.)
 */
export function bucketForPath(path: string): FuturesDataBucket {
  return path.toLowerCase().includes("/futures/data/basis") ? "basis" : "stats";
}

/** path 가 /futures/data/* 인지 (token-bucket 적용 대상인지) 판별. */
export function isFuturesDataPath(path: string): boolean {
  return path.toLowerCase().includes("/futures/data/");
}

// ─── 프로세스 전역 싱글톤 ────────────────────────────
// collector(forward-fill) 프로세스에서 binanceFetch(opts.rateLimiterGroup) 경로가 공유.
// worker 프로세스는 group 미지정이라 이 싱글톤을 건드리지 않는다(무영향).

let globalLimiter = new FuturesDataRateLimiter();

/** 전역 싱글톤 반환 (binanceFetch 가 opt-in 호출 시 사용). */
export function getFuturesDataRateLimiter(): FuturesDataRateLimiter {
  return globalLimiter;
}

/**
 * 테스트 전용 — 전역 싱글톤 limiter 재생성 (토큰 가득 상태로 초기화).
 * (프로덕션 코드에서 호출 금지. unsupportedMetricCache._resetUnsupportedMetricCacheForTest 와 일관.)
 *
 * binanceFetch 분기 테스트가 전역 싱글톤의 토큰을 소비하므로, 케이스 간 격리를 위해 사용.
 * 실시계(REAL_CLOCK)로 재생성된다 — 가짜 시계 주입이 필요한 단위 테스트는 직접 인스턴스를 만들 것.
 */
export function _resetFuturesDataRateLimiterForTest(): void {
  globalLimiter = new FuturesDataRateLimiter();
}

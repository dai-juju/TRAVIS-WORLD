// ============================================================
// /futures/data 전역 token-bucket ([8-31]ⓐ) 단위 테스트. M1.9 Step 3 후속 (2026-06-05).
//
// 검증 (요청 #3 + code-reviewer W1):
//   (a) 통계 버킷 150 소진 후 추가 acquire 가 대기, 1분 후 리필되어 진행 (가짜 시계).
//   (b) basis 버킷 30 이 통계 버킷과 독립적으로 동작 (한쪽 소진이 다른 쪽에 영향 없음).
//   (c) path → 버킷 구분 정확 (/futures/data/basis=basis, 그 외 /futures/data/*=stats).
//   (d) isFuturesDataPath 판별 (worker now-poller weight 엔드포인트는 false).
//   (S1) capacity<=0 방어 가드 — 무한 hang 대신 1 로 클램프 + console.warn.
//   ★ (W1) opt-in 분기 단위 테스트 — fetch 를 mock 해 binanceFetch 의 useFuturesDataLimiter
//       분기를 네트워크 없이 검증. 이 PR 의 생명줄("worker=group 미지정 → acquire 안 함")을
//       전역 싱글톤 토큰 소비량으로 직접 단언:
//         (W1-a) group 미지정 + /futures/data path → 토큰 안 줄어듦 (worker 무영향).
//         (W1-b) group 지정 + /futures/data path → 토큰 줄어듦.
//         (W1-c) group 지정 + 비-/futures/data path(/fapi/v1/openInterest) → 토큰 안 줄어듦.
//       전역 싱글톤을 건드리므로 각 케이스 전 _resetFuturesDataRateLimiterForTest 로 격리.
//
// 순수 단위 — (a)~(c)는 시계·sleep 을 RateLimiterClock 으로 주입해 결정론. W1 은 fetch mock.
//
// 단일 진실: docs/task-record/M1.9-step3-rollout.md ([8-31]ⓐ)
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TokenBucket,
  FuturesDataRateLimiter,
  binanceFetch,
  getFuturesDataRateLimiter,
  _resetFuturesDataRateLimiterForTest,
  bucketForPath,
  limiterBucketForPath,
  isFuturesDataPath,
  STATS_BUCKET_PER_MIN,
  BASIS_BUCKET_PER_MIN,
  FUNDING_BUCKET_PER_MIN,
  type RateLimiterClock,
} from "@travis/exchange-collectors";

/**
 * 가짜 시계 — now() 는 수동 전진, sleep(ms) 은 즉시 resolve 하면서 시계를 ms 만큼 전진.
 * 토큰 리필이 경과 시간 기반이므로, sleep 이 시계를 전진시키면 그만큼 리필이 일어난다.
 */
function makeFakeClock(): RateLimiterClock & { advance: (ms: number) => void } {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms; // sleep = 시계 전진 (리필 트리거).
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TokenBucket ([8-31]ⓐ 통계 버킷)", () => {
  it("(a) 150 소진 후 추가 acquire 는 대기, 1분 후 리필되어 진행", async () => {
    const clock = makeFakeClock();
    const bucket = new TokenBucket(STATS_BUCKET_PER_MIN, clock);
    expect(STATS_BUCKET_PER_MIN).toBe(150);

    // 초기 가득 — 150개 즉시 acquire 가능(시계 전진 0).
    for (let i = 0; i < STATS_BUCKET_PER_MIN; i++) {
      await bucket.acquire();
    }
    expect(bucket._peekTokens()).toBeLessThan(1);
    const tAfterDrain = clock.now();
    // 소진 직후엔 시계가 거의 전진하지 않았어야 함(초기 가득 → 즉시 소비).
    expect(tAfterDrain).toBe(0);

    // 151번째 acquire — 토큰 부족 → sleep(시계 전진)으로 리필 대기 후 진행.
    await bucket.acquire();
    // 토큰 1개 리필에 60000/150=400ms 필요 → 시계가 최소 그만큼 전진했어야 함.
    expect(clock.now()).toBeGreaterThanOrEqual(400);
  });

  it("1분 경과 시 capacity 만큼 완전 리필 (상한 클램프)", async () => {
    const clock = makeFakeClock();
    const bucket = new TokenBucket(STATS_BUCKET_PER_MIN, clock);
    // 전부 소진.
    for (let i = 0; i < STATS_BUCKET_PER_MIN; i++) await bucket.acquire();
    // 2분 경과 — capacity(150) 상한으로 클램프되어야 함(300 아님).
    clock.advance(120_000);
    await bucket.acquire(); // 리필 트리거 + 1개 소비.
    expect(bucket._peekTokens()).toBeLessThanOrEqual(STATS_BUCKET_PER_MIN);
    expect(bucket._peekTokens()).toBeGreaterThan(140); // 150 - 1 소비 ≈ 149.
  });
});

describe("FuturesDataRateLimiter ([8-31]ⓐ 버킷 분리)", () => {
  it("(b) basis 버킷(30)이 통계 버킷(150)과 독립 — 통계 소진이 basis 에 영향 없음", async () => {
    const clock = makeFakeClock();
    const limiter = new FuturesDataRateLimiter(clock);
    expect(BASIS_BUCKET_PER_MIN).toBe(30);

    // 통계 버킷 완전 소진.
    for (let i = 0; i < STATS_BUCKET_PER_MIN; i++) {
      await limiter.acquire("/futures/data/openInterestHist");
    }
    expect(limiter._bucket("stats")._peekTokens()).toBeLessThan(1);

    // basis 버킷은 손대지 않았으니 가득 — 30개 즉시 acquire 가능(시계 전진 없이).
    const tBefore = clock.now();
    for (let i = 0; i < BASIS_BUCKET_PER_MIN; i++) {
      await limiter.acquire("/futures/data/basis");
    }
    // basis 30개 acquire 동안 통계 소진의 영향으로 추가 대기가 없었어야 함.
    //   (통계 소진으로 시계가 이미 전진했을 수 있으나, basis 가득→즉시소비라 basis 때문엔 전진 0.)
    expect(limiter._bucket("basis")._peekTokens()).toBeLessThan(1);
    // basis 31번째는 대기 발생.
    const tBeforeOver = clock.now();
    await limiter.acquire("/futures/data/basis");
    // basis 1개 리필 = 60000/30 = 2000ms.
    expect(clock.now() - tBeforeOver).toBeGreaterThanOrEqual(2000);
    // (basis 소진 검증 — tBefore 는 통계 소진 시점, basis 가득 소비엔 무관함을 명시.)
    expect(tBefore).toBe(tBeforeOver - 0); // basis 가득 소비 구간은 시계 전진 0.
  });
});

describe("bucketForPath / isFuturesDataPath ([8-31]ⓐ path 판별)", () => {
  it("(c) /futures/data/basis → basis, 그 외 /futures/data/* → stats", () => {
    expect(bucketForPath("/futures/data/basis")).toBe("basis");
    expect(bucketForPath("/futures/data/openInterestHist")).toBe("stats");
    expect(bucketForPath("/futures/data/topLongShortAccountRatio")).toBe("stats");
    expect(bucketForPath("/futures/data/topLongShortPositionRatio")).toBe("stats");
    expect(bucketForPath("/futures/data/globalLongShortAccountRatio")).toBe("stats");
    expect(bucketForPath("/futures/data/takerlongshortRatio")).toBe("stats");
    expect(bucketForPath("/futures/data/takerBuySellVol")).toBe("stats");
  });

  it("대소문자 무시 — Basis 변형도 basis 버킷", () => {
    expect(bucketForPath("/Futures/Data/Basis")).toBe("basis");
  });

  it("(d) isFuturesDataPath: /futures/data/* 만 true (worker now-poller weight 엔드포인트는 false)", () => {
    // /futures/data/* = token-bucket 대상.
    expect(isFuturesDataPath("/futures/data/openInterestHist")).toBe(true);
    expect(isFuturesDataPath("/futures/data/basis")).toBe(true);
    // worker 의 OI now-poller 는 /fapi/v1/openInterest (별개 weight 풀) → 대상 아님.
    expect(isFuturesDataPath("/fapi/v1/openInterest")).toBe(false);
    expect(isFuturesDataPath("/dapi/v1/openInterest")).toBe(false);
    // 일반 ticker 등도 대상 아님.
    expect(isFuturesDataPath("/fapi/v1/ticker/24hr")).toBe(false);
  });
});

// ─── 사이클 2 Step 6: limiterBucketForPath 일반화 + funding 버킷 (2026-07-09) ──
// Plan 검증이 잡은 결함의 회귀 가드: 기존 isFuturesDataPath 게이트는 /fapi/v1/fundingRate
// (자체 500/5min/IP 풀)를 무음 통과시켰다 — 활성 판정과 버킷 판별을 단일 진실로 통합.

describe("limiterBucketForPath (사이클 2 Step 6 — 활성 게이트 단일 진실)", () => {
  it("판별 정확값 핀 — stats/basis/funding/null 4분류", () => {
    // 기존 /futures/data 2버킷 유지.
    expect(limiterBucketForPath("/futures/data/basis")).toBe("basis");
    expect(limiterBucketForPath("/futures/data/openInterestHist")).toBe("stats");
    // ★ funding — /futures/data 밖이지만 자체 특수 풀(500/5min, fundingInfo 공유).
    expect(limiterBucketForPath("/fapi/v1/fundingRate")).toBe("funding");
    expect(limiterBucketForPath("/FAPI/V1/FUNDINGRATE")).toBe("funding"); // 대소문자 방어
    // ★ COINM dapi fundingRate 는 weight 1 일반 풀 → 버킷 비대상 (의도).
    expect(limiterBucketForPath("/dapi/v1/fundingRate")).toBeNull();
    // 일반 weight 엔드포인트 비대상.
    expect(limiterBucketForPath("/fapi/v1/openInterest")).toBeNull();
    expect(limiterBucketForPath("/fapi/v1/ticker/24hr")).toBeNull();
    // 유사 문자열 오탐 방어 — fundingInfo 는 fundingRate 아님 (버킷 비대상: 저빈도 1h task
    //   가 worker 별도 IP 에서 도는 현 구조상 limiter 필요 없음).
    expect(limiterBucketForPath("/fapi/v1/fundingInfo")).toBeNull();
  });

  it("bucketForPath 레거시 계약 유지 — 비대상 path 는 stats 폴백", () => {
    expect(bucketForPath("/fapi/v1/ticker/24hr")).toBe("stats");
    expect(bucketForPath("/fapi/v1/fundingRate")).toBe("funding");
  });

  it("funding 버킷 상수 = 80/min (500 req/5min 공유 풀의 80% 마진) + 독립 버킷", async () => {
    expect(FUNDING_BUCKET_PER_MIN).toBe(80);
    const clock = makeFakeClock();
    const limiter = new FuturesDataRateLimiter(clock);
    // funding 80 소진 — stats/basis 는 무영향(독립).
    for (let i = 0; i < FUNDING_BUCKET_PER_MIN; i++) {
      await limiter.acquire("/fapi/v1/fundingRate");
    }
    expect(limiter._bucket("funding")._peekTokens()).toBeLessThan(1);
    expect(limiter._bucket("stats")._peekTokens()).toBe(STATS_BUCKET_PER_MIN);
    expect(limiter._bucket("basis")._peekTokens()).toBe(BASIS_BUCKET_PER_MIN);
    // 81번째는 리필 대기 (60000/80 = 750ms).
    const t0 = clock.now();
    await limiter.acquire("/fapi/v1/fundingRate");
    expect(clock.now() - t0).toBeGreaterThanOrEqual(750);
  });
});

describe("TokenBucket S1 가드 (capacity<=0 클램프)", () => {
  it("(S1) capacity=0 이면 무한 hang 대신 1 로 클램프 + console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const clock = makeFakeClock();
    const bucket = new TokenBucket(0, clock); // 오설정 시뮬레이션.

    // 경고 1회 발생 (오설정 가시화).
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // 클램프(capacity=1)로 토큰 1개는 즉시 acquire 가능 — 무한 hang 안 함.
    await bucket.acquire();
    expect(bucket._peekTokens()).toBeLessThan(1);

    // 2번째 acquire 는 리필 대기(60000/1 = 60000ms)지만 결국 종료 — hang 없음을 입증.
    await bucket.acquire();
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);

    warnSpy.mockRestore();
  });

  it("(S1) capacity 음수도 1 로 클램프", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = new TokenBucket(-5, makeFakeClock());
    // 가득 = effectiveCapacity(1) → 토큰 1개.
    expect(bucket._peekTokens()).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

// ─── W1: opt-in 분기 단위 테스트 (fetch mock) ───────────────────────────────
// 이 PR 의 생명줄 = "worker(group 미지정)는 전역 limiter 토큰을 절대 소비 안 함".
// fetch 를 mock 해 네트워크 없이 binanceFetch 의 useFuturesDataLimiter 분기를 직접 검증.

describe("binanceFetch opt-in /futures/data 토큰 소비 ([8-31]ⓐ W1)", () => {
  beforeEach(() => {
    // 전역 싱글톤을 만지므로 케이스마다 토큰 가득으로 격리 (W3 reset).
    _resetFuturesDataRateLimiterForTest();
    // fetch mock — 즉시 정상 빈 배열 반환 (token-bucket 분기만 검증, 응답 내용 무관).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        headers: new Headers(),
        json: async () => [],
        text: async () => "[]",
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    _resetFuturesDataRateLimiterForTest();
  });

  /** 전역 stats 버킷 현재 토큰 수 스냅샷. */
  function statsTokens(): number {
    return getFuturesDataRateLimiter()._bucket("stats")._peekTokens();
  }

  it("(W1-a) group 미지정 + /futures/data path → 토큰 안 줄어듦 (worker 무영향)", async () => {
    const before = statsTokens();
    expect(before).toBe(STATS_BUCKET_PER_MIN); // 가득.

    // rateLimiterGroup 미지정 — worker now-poller 가 쓰는 형태.
    const res = await binanceFetch({
      baseUrl: "https://fapi.binance.com",
      path: "/futures/data/openInterestHist",
    });
    expect(res.success).toBe(true);

    // ★ 핵심 단언: limiter 를 안 탔으니 토큰 그대로.
    expect(statsTokens()).toBe(before);
  });

  it("(W1-b) group 지정 + /futures/data path → 토큰 줄어듦", async () => {
    const before = statsTokens();

    const res = await binanceFetch({
      baseUrl: "https://fapi.binance.com",
      path: "/futures/data/openInterestHist",
      rateLimiterGroup: "collector",
    });
    expect(res.success).toBe(true);

    // acquire 1회 → 토큰 정확히 1 감소.
    expect(statsTokens()).toBe(before - 1);
  });

  it("(W1-c) group 지정 + 비-/futures/data path → 토큰 안 줄어듦 (OI now-poll 은 별개 풀)", async () => {
    const before = statsTokens();

    // /fapi/v1/openInterest = weight 풀 엔드포인트 (IP /futures/data 카운터 아님).
    const res = await binanceFetch({
      baseUrl: "https://fapi.binance.com",
      path: "/fapi/v1/openInterest",
      rateLimiterGroup: "collector",
    });
    expect(res.success).toBe(true);

    // isFuturesDataPath=false → limiter 미적용 → 토큰 그대로.
    expect(statsTokens()).toBe(before);
  });

  it("(W1-b) group 지정 + /futures/data/basis → basis 버킷만 소비 (stats 무영향)", async () => {
    const statsBefore = getFuturesDataRateLimiter()._bucket("stats")._peekTokens();
    const basisBefore = getFuturesDataRateLimiter()._bucket("basis")._peekTokens();

    const res = await binanceFetch({
      baseUrl: "https://fapi.binance.com",
      path: "/futures/data/basis",
      rateLimiterGroup: "collector",
    });
    expect(res.success).toBe(true);

    // basis 만 1 감소, stats 불변 (path → 버킷 자동 분리).
    expect(getFuturesDataRateLimiter()._bucket("basis")._peekTokens()).toBe(basisBefore - 1);
    expect(getFuturesDataRateLimiter()._bucket("stats")._peekTokens()).toBe(statsBefore);
  });

  // ─── 사이클 2 Step 6 (2026-07-09): funding 게이트 — Plan 검증 결함의 핵심 회귀 가드 ──

  it("(F-a) group 지정 + /fapi/v1/fundingRate → funding 버킷만 소비 (구 게이트에선 무음 무제한이던 경로)", async () => {
    const fundingBefore = getFuturesDataRateLimiter()._bucket("funding")._peekTokens();
    const statsBefore = getFuturesDataRateLimiter()._bucket("stats")._peekTokens();

    const res = await binanceFetch({
      baseUrl: "https://fapi.binance.com",
      path: "/fapi/v1/fundingRate",
      rateLimiterGroup: "collector",
    });
    expect(res.success).toBe(true);

    expect(getFuturesDataRateLimiter()._bucket("funding")._peekTokens()).toBe(fundingBefore - 1);
    expect(getFuturesDataRateLimiter()._bucket("stats")._peekTokens()).toBe(statsBefore);
  });

  it("(F-b) group 지정 + /dapi/v1/fundingRate → 어느 버킷도 안 줄어듦 (weight 1 일반 풀 의도)", async () => {
    const fundingBefore = getFuturesDataRateLimiter()._bucket("funding")._peekTokens();

    const res = await binanceFetch({
      baseUrl: "https://dapi.binance.com",
      path: "/dapi/v1/fundingRate",
      rateLimiterGroup: "collector",
    });
    expect(res.success).toBe(true);

    expect(getFuturesDataRateLimiter()._bucket("funding")._peekTokens()).toBe(fundingBefore);
  });

  it("(F-c) group 미지정 + /fapi/v1/fundingRate → 토큰 안 줄어듦 (opt-in 유지)", async () => {
    const fundingBefore = getFuturesDataRateLimiter()._bucket("funding")._peekTokens();

    const res = await binanceFetch({
      baseUrl: "https://fapi.binance.com",
      path: "/fapi/v1/fundingRate",
    });
    expect(res.success).toBe(true);

    expect(getFuturesDataRateLimiter()._bucket("funding")._peekTokens()).toBe(fundingBefore);
  });
});

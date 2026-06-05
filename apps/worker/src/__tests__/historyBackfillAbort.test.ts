// ============================================================
// executeHistoryBackfill 협조적 취소(AbortSignal) 통합 테스트 ([8-31]ⓑ, 2026-06-05).
//
// 검증 (요청 #6):
//   (a) 루프 도중 abort 면 다음 페이지/심볼 fetch 가 호출되지 않는다(요청 0 으로 수렴).
//   (b) abort 는 throw 가 아니라 graceful return — 부분 결과(BackfillResult) 반환.
//   (c) signal 미지정 시 기존 동작 유지(회귀 0) — abort 분기 없이 정상 완료.
//
// 방식: global fetch 를 stub 해 fetcher(historyFetchers → binanceFetch → fetch)의 호출
//   횟수를 센다. packages 경계로 fetcher 함수 자체는 mock 못 하지만, 최하단 fetch 를 stub 하면
//   "abort 후 추가 요청이 안 나간다"를 호출 횟수로 직접 단언할 수 있다(가장 결정론적).
//   dataService 는 getSymbols / upsert 만 쓰이므로 최소 mock.
//
// 단일 진실: docs/task-record/M1.9-step3-rollout.md ([8-31]ⓑ)
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeHistoryBackfill,
  _resetFuturesDataRateLimiterForTest,
  _resetUnsupportedMetricCacheForTest,
} from "@travis/exchange-collectors";
import type { IDataService } from "@travis/data-service";

// 심볼 3개 (루프가 여러 심볼을 돌도록).
const SYMBOLS = ["AAAUSDT", "BBBUSDT", "CCCUSDT"];

/** getSymbols 만 진짜로 응답하고 나머지는 성공 stub 하는 최소 dataService. */
function makeDataService(): IDataService {
  const ds = {
    getSymbols: vi.fn(async () => ({
      success: true as const,
      data: SYMBOLS.map((symbol) => ({ symbol })),
    })),
    upsertHistoryFuturesIndicator: vi.fn(async () => ({ success: true as const, data: undefined })),
  };
  // 테스트가 쓰는 메서드만 구현 — IDataService 전체 캐스팅(나머지는 미사용).
  return ds as unknown as IDataService;
}

describe("executeHistoryBackfill 협조적 취소 ([8-31]ⓑ)", () => {
  beforeEach(() => {
    _resetFuturesDataRateLimiterForTest();
    _resetUnsupportedMetricCacheForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("(a)+(b) 첫 fetch 후 abort → 추가 요청 0 + throw 없이 graceful return", async () => {
    const ac = new AbortController();
    let fetchCalls = 0;
    // fetch stub: 첫 호출 직후 abort 를 트리거 → 이후 페이지/심볼/metric fetch 가 안 나가야 함.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) ac.abort(); // 첫 요청 직후 shutdown 발생 시뮬레이션.
        return {
          status: 200,
          headers: new Headers(),
          json: async () => [], // 빈 배열 — upsert 생략, 다음 페이지로 전진.
          text: async () => "[]",
        } as unknown as Response;
      }),
    );

    const ds = makeDataService();
    let result: Awaited<ReturnType<typeof executeHistoryBackfill>> | null = null;
    // ★ throw 가 나면 이 await 가 reject → 테스트 실패. graceful return 이어야 통과.
    await expect(
      (async () => {
        result = await executeHistoryBackfill({
          dataService: ds,
          marketType: "futures_usdm",
          intervals: ["5m"],
          startMsOverride: Date.now() - 60 * 60 * 1000, // 1h 윈도우 — 여러 페이지 가능.
          reqPerMin: 600, // throttle 짧게(테스트 속도).
          signal: ac.signal,
          onProgress: () => {},
        });
      })(),
    ).resolves.toBeUndefined();

    // (b) 결과 객체 반환(부분 결과) — throw 0.
    expect(result).not.toBeNull();
    // (a) 첫 fetch 직후 abort → 더 이상 요청이 안 나가 fetch 호출은 소수(1~2)에 그친다.
    //   (abort 체크가 페이지 루프 + symbol 경계 + interval 경계에 있어 추가 요청 차단.
    //    경쟁 조건 여유로 ≤2 로 둔다 — 6 metric × 3 symbol × 다중 페이지였다면 수십 회였을 것.)
    expect(fetchCalls).toBeLessThanOrEqual(2);
  });

  it("(a) 시작 전 이미 aborted → fetch 0 (interval/symbol 경계에서 즉시 중단)", async () => {
    const ac = new AbortController();
    ac.abort(); // 시작 전 취소.
    let fetchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls += 1;
        return {
          status: 200,
          headers: new Headers(),
          json: async () => [],
          text: async () => "[]",
        } as unknown as Response;
      }),
    );

    const ds = makeDataService();
    const result = await executeHistoryBackfill({
      dataService: ds,
      marketType: "futures_usdm",
      intervals: ["5m"],
      startMsOverride: Date.now() - 60 * 60 * 1000,
      reqPerMin: 600,
      signal: ac.signal,
      onProgress: () => {},
    });

    // 한 건도 안 나가야 함 — interval 경계 첫 체크에서 graceful return.
    expect(fetchCalls).toBe(0);
    expect(result.totalRows).toBe(0);
    expect(result.symbolCount).toBe(SYMBOLS.length);
  });

  it("(c) signal 미지정: 정상 완료 — 회귀 0 (모든 페이지 fetch 진행)", async () => {
    let fetchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCalls += 1;
        return {
          status: 200,
          headers: new Headers(),
          json: async () => [],
          text: async () => "[]",
        } as unknown as Response;
      }),
    );

    const ds = makeDataService();
    const result = await executeHistoryBackfill({
      dataService: ds,
      marketType: "futures_usdm",
      intervals: ["5m"],
      // 1봉(5m) 윈도우 — 심볼당 metric 당 1페이지로 최소화(테스트 속도).
      startMsOverride: Date.now() - 5 * 60 * 1000,
      reqPerMin: 6000,
      onProgress: () => {},
    });

    // signal 미지정이라 abort 분기 없이 끝까지 진행 — 3 symbol × 6 metric = 18 요청.
    expect(fetchCalls).toBe(SYMBOLS.length * 6);
    expect(result.symbolCount).toBe(SYMBOLS.length);
  });
});

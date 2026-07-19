// useDataServiceSeries 훅 테스트 (Composable Stage 2 Step 2, 2026-07-08).
//
// seriesFetch 를 mock 해 훅 생명주기 계약을 검증:
//   loading→ready / idle 2경로 / hard vs soft 실패 분리 / per-series 참조 재사용 /
//   부분 실패 이전 곡선 유지 / 주기 pull 타이머 / 재구독 clear / symbols 값-메모.
// 타이머 테스트는 vi.useFakeTimers + advanceTimersByTimeAsync (microtask 동반 flush).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ★ MARKET_WIDE_KEY 도 함께 mock ([10-84]): 훅이 같은 모듈에서 이 상수를 import
//   하므로 빠뜨리면 undefined 가 되어 전 시장 경로가 조용히 어긋난다.
vi.mock("../seriesFetch", () => ({
  seriesFetch: vi.fn(),
  MARKET_WIDE_KEY: "__market__",
}));

import { seriesFetch } from "../seriesFetch";
import { useDataServiceSeries } from "../useDataServiceSeries";
import type { SeriesGroup } from "../types";

const mockSeriesFetch = vi.mocked(seriesFetch);

interface Row extends Record<string, unknown> {
  symbol: string;
  recorded_at: string;
  open_interest: number;
}

function group(symbol: string, rows: Array<[string, number]>): SeriesGroup<Row> {
  return {
    key: symbol,
    symbol,
    rows: rows.map(([recorded_at, open_interest]) => ({
      symbol,
      recorded_at,
      open_interest,
    })),
  };
}

const BASE_OPTS: { datasource: string; symbols: string[]; timeField: string } = {
  datasource: "test_history",
  symbols: ["BTCUSDT"],
  timeField: "recorded_at",
};

/** 초기 fetch 의 async 해소를 흘려보낸다. */
async function flushFetch(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockSeriesFetch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useDataServiceSeries — 생명주기", () => {
  it("성공: loading → ready + series + lastUpdatedAt", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    const { result } = renderHook(() => useDataServiceSeries<Row>({ ...BASE_OPTS }));
    // 첫 렌더 직후 = loading (fetch 미해소).
    expect(result.current.status).toBe("loading");
    await flushFetch();
    expect(result.current.status).toBe("ready");
    expect(result.current.series).toHaveLength(1);
    expect(result.current.series[0]!.rows[0]!.open_interest).toBe(100);
    expect(result.current.lastUpdatedAt).toBeTypeOf("number");
    expect(result.current.error).toBeNull();
  });

  it("symbols [] → idle + fetch 미호출 (휴면)", async () => {
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, symbols: [] }),
    );
    await flushFetch();
    expect(result.current.status).toBe("idle");
    expect(result.current.series).toEqual([]);
    expect(mockSeriesFetch).not.toHaveBeenCalled();
  });

  // ─── [10-84] M3-step3a (2026-07-19): 전 시장 집계 경로 ──────────────────
  //   ★ 라이브 G2 적발 회귀 핀 — seriesFetch 에 "심볼 없으면 전 시장 1회 호출"
  //     분기를 넣었으나 훅이 그 **앞에서** idle 로 끊어 도달 불가였다. 아래 두
  //     테스트가 "능력을 아래 계층에 넣었는데 위 계층 가드가 막는" 재발을 잡는다.
  it("★ symbols [] + allowEmptySymbols → 전 시장 1회 fetch (idle 아님)", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [
        {
          key: "__market__",
          symbol: "ALL",
          rows: [{ symbol: "ALL", recorded_at: "2026-07-19T08:00:00Z", open_interest: 42 }],
        },
      ],
      failedSymbols: [],
    });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({
        ...BASE_OPTS,
        symbols: [],
        allowEmptySymbols: true,
      }),
    );
    await flushFetch();
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);
    expect(mockSeriesFetch.mock.calls[0]![0]!.symbols).toEqual([]);
    expect(result.current.status).toBe("ready");
    // 병합 루프가 MARKET_WIDE_KEY 를 순회해야 결과가 버려지지 않는다.
    expect(result.current.series).toHaveLength(1);
    expect(result.current.series[0]!.key).toBe("__market__");
  });

  it("★ allowEmptySymbols 기본 false — 기존 idle 거동 보존 (회귀 0)", async () => {
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, symbols: [] }),
    );
    await flushFetch();
    expect(result.current.status).toBe("idle");
    expect(mockSeriesFetch).not.toHaveBeenCalled();
  });

  it("enabled false → idle + fetch 미호출 (오프스크린 pause 이음매)", async () => {
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, enabled: false }),
    );
    await flushFetch();
    expect(result.current.status).toBe("idle");
    expect(mockSeriesFetch).not.toHaveBeenCalled();
  });

  it("hard fail: 첫 fetch 전 심볼 실패 → error + 빈 series", async () => {
    mockSeriesFetch.mockResolvedValue({ groups: [], failedSymbols: ["BTCUSDT"] });
    const { result } = renderHook(() => useDataServiceSeries<Row>({ ...BASE_OPTS }));
    await flushFetch();
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.series).toEqual([]);
    expect(result.current.lastUpdatedAt).toBeNull();
  });

  it("fulfilled-빈 곡선 = ready (데이터 없음은 에러 아님 — 'no data' 카드 표시용)", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [])],
      failedSymbols: [],
    });
    const { result } = renderHook(() => useDataServiceSeries<Row>({ ...BASE_OPTS }));
    await flushFetch();
    expect(result.current.status).toBe("ready");
    expect(result.current.series[0]!.rows).toEqual([]);
  });

  it("재구독 clear: symbols 변경 시 즉시 loading + 빈 series 후 새 데이터 (불변식 F)", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    const { result, rerender } = renderHook(
      (p: { symbols: string[] }) =>
        useDataServiceSeries<Row>({ ...BASE_OPTS, symbols: p.symbols }),
      { initialProps: { symbols: ["BTCUSDT"] } },
    );
    await flushFetch();
    expect(result.current.series).toHaveLength(1);

    mockSeriesFetch.mockResolvedValue({
      groups: [group("ETHUSDT", [["2026-07-08T01:00:00Z", 50]])],
      failedSymbols: [],
    });
    rerender({ symbols: ["ETHUSDT"] });
    // 재구독 진입 직후 — 옛 BTC 곡선 잔류 없이 clear.
    expect(result.current.status).toBe("loading");
    expect(result.current.series).toEqual([]);
    await flushFetch();
    expect(result.current.series[0]!.symbol).toBe("ETHUSDT");
  });

  it("symbols 값-메모: 인라인 배열(새 참조, 같은 내용) rerender 는 재fetch 없음", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    const { rerender } = renderHook(
      (p: { symbols: string[] }) =>
        useDataServiceSeries<Row>({ ...BASE_OPTS, symbols: p.symbols }),
      { initialProps: { symbols: ["BTCUSDT"] } },
    );
    await flushFetch();
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);
    rerender({ symbols: ["BTCUSDT"] }); // 새 배열 참조, 같은 값
    await flushFetch();
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1); // 재fetch 없음
  });
});

describe("useDataServiceSeries — 주기 pull + soft fail + 참조 재사용", () => {
  it("refreshIntervalMs 생략 → 타이머 없음 (fetch 정확히 1회)", async () => {
    vi.useFakeTimers();
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    renderHook(() => useDataServiceSeries<Row>({ ...BASE_OPTS }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);
  });

  it("주기 pull: 타이머마다 재fetch + 새 포인트 반영", async () => {
    vi.useFakeTimers();
    mockSeriesFetch
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
        failedSymbols: [],
      })
      .mockResolvedValueOnce({
        groups: [
          group("BTCUSDT", [
            ["2026-07-08T01:00:00Z", 100],
            ["2026-07-08T01:05:00Z", 110],
          ]),
        ],
        failedSymbols: [],
      });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.series[0]!.rows).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(2);
    expect(result.current.series[0]!.rows).toHaveLength(2);
  });

  it("soft fail: 재fetch 전체 실패 → ready 유지 + 기존 series 유지 + lastUpdatedAt 미전진 (불변식 D)", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSeriesFetch
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
        failedSymbols: [],
      })
      .mockResolvedValueOnce({ groups: [], failedSymbols: ["BTCUSDT"] });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const firstUpdatedAt = result.current.lastUpdatedAt;
    const firstSeries = result.current.series;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.status).toBe("ready"); // 작동 차트를 비우지 않음
    expect(result.current.series).toBe(firstSeries); // 참조까지 유지
    expect(result.current.lastUpdatedAt).toBe(firstUpdatedAt); // 미전진 = staleness 계산 가능
    expect(result.current.error).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("per-series 참조 재사용: 무변화 곡선은 이전 참조 유지 (불변식 E — uPlot setData 절약)", async () => {
    vi.useFakeTimers();
    const sameData: Array<[string, number]> = [["2026-07-08T01:00:00Z", 100]];
    mockSeriesFetch
      .mockResolvedValueOnce({ groups: [group("BTCUSDT", sameData)], failedSymbols: [] })
      .mockResolvedValueOnce({ groups: [group("BTCUSDT", sameData)], failedSymbols: [] });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const firstGroup = result.current.series[0]!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(2);
    expect(result.current.series[0]).toBe(firstGroup); // 동일 참조 = 차트 갱신 skip 가능
  });

  it("마지막 버킷 in-place 값 변경(forward-fill UPDATE)은 새 참조로 감지 (불변식 E shallow)", async () => {
    vi.useFakeTimers();
    mockSeriesFetch
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
        failedSymbols: [],
      })
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 105]])], // 같은 시각, 값만 변경
        failedSymbols: [],
      });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const firstGroup = result.current.series[0]!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.series[0]).not.toBe(firstGroup);
    expect(result.current.series[0]!.rows[0]!.open_interest).toBe(105);
  });

  it("부분 실패 병합: 실패 심볼은 이전 곡선 유지, 성공 심볼만 갱신 (불변식 G)", async () => {
    vi.useFakeTimers();
    mockSeriesFetch
      .mockResolvedValueOnce({
        groups: [
          group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]]),
          group("ETHUSDT", [["2026-07-08T01:00:00Z", 50]]),
        ],
        failedSymbols: [],
      })
      .mockResolvedValueOnce({
        groups: [
          group("BTCUSDT", [
            ["2026-07-08T01:00:00Z", 100],
            ["2026-07-08T01:05:00Z", 110],
          ]),
        ],
        failedSymbols: ["ETHUSDT"],
      });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({
        ...BASE_OPTS,
        symbols: ["BTCUSDT", "ETHUSDT"],
        refreshIntervalMs: 30_000,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const ethBefore = result.current.series[1]!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // BTC 갱신 + ETH 이전 곡선 그대로 (순서 보존).
    expect(result.current.series.map((g) => g.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(result.current.series[0]!.rows).toHaveLength(2);
    expect(result.current.series[1]).toBe(ethBefore);
  });

  it("W1: '직전 데이터 있음 + 이번 0행(fulfilled-empty)' = 의심 신호 — 이전 곡선 유지", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSeriesFetch
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
        failedSymbols: [],
      })
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [])], // fetch 성공이지만 0행 — retention/복제 지연 의심
        failedSymbols: [],
      });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const before = result.current.series[0]!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.series[0]).toBe(before); // 작동 곡선 유지 (깜빡 비움 방지)
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("catch 경로 hard/soft: 첫 fetch reject=error / 재fetch reject=기존 유지 (W2-1)", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // hard: 첫 fetch 자체가 reject (allSettled 밖 예외 — 조립 결함 류)
    mockSeriesFetch.mockRejectedValueOnce(new Error("assemble boom"));
    const hard = renderHook(() => useDataServiceSeries<Row>({ ...BASE_OPTS }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hard.result.current.status).toBe("error");
    hard.unmount();

    // soft: 성공 후 재fetch reject → 기존 유지
    mockSeriesFetch
      .mockResolvedValueOnce({
        groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
        failedSymbols: [],
      })
      .mockRejectedValueOnce(new Error("refresh boom"));
    const soft = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const series = soft.result.current.series;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(soft.result.current.status).toBe("ready");
    expect(soft.result.current.series).toBe(series);
    warnSpy.mockRestore();
  });

  it("inFlight 겹침 가드: 느린 fetch 중 타이머 재발화는 skip (W2-2)", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    // 첫 fetch 를 수동 제어 pending 으로 붙잡는다.
    mockSeriesFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
              failedSymbols: [],
            });
        }),
    );
    renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 10_000 }),
    );
    // fetch 1이 pending 인 채로 타이머 3회 경과 — 겹침 fetch 없어야 함.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);
    // 해소 후 다음 타이머부터 재fetch 재개.
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(2);
  });

  it("enabled 토글 pause→resume: false 로 idle 정지, true 복귀 시 재fetch (W2-3)", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    const { result, rerender } = renderHook(
      (p: { enabled: boolean }) =>
        useDataServiceSeries<Row>({ ...BASE_OPTS, enabled: p.enabled }),
      { initialProps: { enabled: true } },
    );
    await flushFetch();
    expect(result.current.status).toBe("ready");
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);

    rerender({ enabled: false }); // 오프스크린 pause
    await flushFetch();
    expect(result.current.status).toBe("idle");
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1); // 정지 중 fetch 없음

    rerender({ enabled: true }); // 복귀 → 재fetch (loading 경유)
    await flushFetch();
    expect(result.current.status).toBe("ready");
    expect(mockSeriesFetch).toHaveBeenCalledTimes(2);
  });

  it("중복 심볼 dedupe: ['BTC','BTC'] → fetch 1심볼 + key 충돌 없음 (S3)", async () => {
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    const { result } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, symbols: ["BTCUSDT", "BTCUSDT"] }),
    );
    await flushFetch();
    expect(mockSeriesFetch.mock.calls[0]![0].symbols).toEqual(["BTCUSDT"]);
    expect(result.current.series).toHaveLength(1);
  });

  it("unmount 시 타이머 정리 — 이후 재fetch 없음", async () => {
    vi.useFakeTimers();
    mockSeriesFetch.mockResolvedValue({
      groups: [group("BTCUSDT", [["2026-07-08T01:00:00Z", 100]])],
      failedSymbols: [],
    });
    const { unmount } = renderHook(() =>
      useDataServiceSeries<Row>({ ...BASE_OPTS, refreshIntervalMs: 30_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(mockSeriesFetch).toHaveBeenCalledTimes(1);
  });
});

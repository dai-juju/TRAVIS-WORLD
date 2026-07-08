// seriesFetch 단위 테스트 (Composable Stage 2 Step 2, 2026-07-08).
//
// initialFetch 를 mock 해 "심볼당 병렬 + DESC→reverse + 부분 실패 graceful" 계약을 검증.
// ★ IN 금지 가드: 이 orchestrator 가 `in` 필터를 절대 조립하지 않음을 박제
//   (backend-infra 실측 2026-07-08 — 600만행 시계열에 in+order+limit = 500ms 디스크 폭탄).

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../initialFetch", () => ({
  initialFetch: vi.fn(),
}));

import { initialFetch } from "../initialFetch";
import { seriesFetch } from "../seriesFetch";

const mockFetch = vi.mocked(initialFetch);

interface Row extends Record<string, unknown> {
  symbol: string;
  recorded_at: string;
  open_interest: number;
}

/** DESC(최신 먼저) 모양의 mock rows — 실제 쿼리 반환 형태. */
function descRows(symbol: string, times: string[]): Row[] {
  return times.map((t) => ({ symbol, recorded_at: t, open_interest: 1 }));
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("seriesFetch — 심볼당 병렬 fetch 계약", () => {
  it("심볼 N개 = initialFetch N회 병렬, 각각 eq symbol + order DESC + limit (IN 미사용)", async () => {
    mockFetch.mockResolvedValue([]);
    await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["BTCUSDT", "ETHUSDT"],
      exchange: "binance",
      marketType: "futures_usdm",
      interval: "5m",
      timeField: "recorded_at",
      maxPoints: 288,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const calls = mockFetch.mock.calls.map(([opts]) => opts);
    // 각 호출: eq 축 3개 + symbol 1개, order DESC, limit = maxPoints.
    for (const [i, symbol] of ["BTCUSDT", "ETHUSDT"].entries()) {
      const opts = calls[i]!;
      expect(opts.datasource).toBe("test_history");
      expect(opts.eq).toEqual([
        { column: "exchange", value: "binance" },
        { column: "market_type", value: "futures_usdm" },
        { column: "interval", value: "5m" },
        { column: "symbol", value: symbol },
      ]);
      expect(opts.order).toEqual({ column: "recorded_at", ascending: false });
      expect(opts.limit).toBe(288);
      // ★ IN 금지 + fetchAll 금지 박제 — 시계열 테이블 디스크 폭탄/정렬 충돌 가드.
      expect(opts.in).toBeUndefined();
      expect(opts.fetchAll).toBeUndefined();
    }
  });

  it("DESC 반환을 oldest-first 로 reverse (SeriesGroup 계약)", async () => {
    mockFetch.mockResolvedValue(
      descRows("BTCUSDT", ["2026-07-08T03:00:00Z", "2026-07-08T02:00:00Z", "2026-07-08T01:00:00Z"]),
    );
    const { groups } = await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["BTCUSDT"],
      timeField: "recorded_at",
      maxPoints: 10,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((r) => r.recorded_at)).toEqual([
      "2026-07-08T01:00:00Z",
      "2026-07-08T02:00:00Z",
      "2026-07-08T03:00:00Z",
    ]);
  });

  it("부분 실패 — 실패 심볼만 failedSymbols, 성공분은 입력 순서 보존 (graceful)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce(descRows("BTCUSDT", ["2026-07-08T01:00:00Z"]))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(descRows("SOLUSDT", ["2026-07-08T01:00:00Z"]));
    const { groups, failedSymbols } = await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      timeField: "recorded_at",
      maxPoints: 10,
    });
    expect(groups.map((g) => g.symbol)).toEqual(["BTCUSDT", "SOLUSDT"]);
    expect(failedSymbols).toEqual(["ETHUSDT"]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("fulfilled 빈 배열 = '데이터 없음'(정상) — rows:[] 그룹으로 포함 (rejected 와 구분)", async () => {
    mockFetch.mockResolvedValue([]);
    const { groups, failedSymbols } = await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["NEWCOINUSDT"],
      timeField: "recorded_at",
      maxPoints: 10,
    });
    expect(groups).toEqual([{ key: "NEWCOINUSDT", symbol: "NEWCOINUSDT", rows: [] }]);
    expect(failedSymbols).toEqual([]);
  });

  it("lookbackMs 지정 시 timeField gte ISO range / 생략 시 range 없음", async () => {
    mockFetch.mockResolvedValue([]);
    const before = Date.now();
    await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["BTCUSDT"],
      timeField: "recorded_at",
      lookbackMs: 60_000,
      maxPoints: 10,
    });
    const withLookback = mockFetch.mock.calls[0]![0];
    expect(withLookback.range).toHaveLength(1);
    const r = withLookback.range![0]!;
    expect(r.column).toBe("recorded_at");
    expect(r.op).toBe("gte");
    // ISO 문자열 + 대략 now-60s 근방 (테스트 실행 지연 허용).
    const ts = Date.parse(String(r.value));
    expect(ts).toBeGreaterThanOrEqual(before - 60_000 - 5_000);
    expect(ts).toBeLessThanOrEqual(Date.now() - 60_000 + 5_000);

    mockFetch.mockClear();
    await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["BTCUSDT"],
      timeField: "recorded_at",
      maxPoints: 10,
    });
    expect(mockFetch.mock.calls[0]![0].range).toBeUndefined();
  });

  it("eq 축 생략 시 symbol eq 만 조립 (무제약 기계 — 정책은 상위 소관)", async () => {
    mockFetch.mockResolvedValue([]);
    await seriesFetch<Row>({
      datasource: "test_history",
      symbols: ["BTCUSDT"],
      timeField: "recorded_at",
      maxPoints: 10,
    });
    expect(mockFetch.mock.calls[0]![0].eq).toEqual([
      { column: "symbol", value: "BTCUSDT" },
    ]);
  });
});

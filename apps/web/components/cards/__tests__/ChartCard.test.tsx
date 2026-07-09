// ChartCard 상태 분기 테스트 (Composable 사이클 2 Step 4, 2026-07-08).
//
// uPlot(canvas — jsdom 미지원)과 useDataServiceSeries(네트워크)를 mock 해
// form 의 graceful 상태 분기와 config→훅 옵션 번역만 검증한다.
// ★ Step 5 (2026-07-09) 실등록 전환: Step 4 의 합성(test-only) chart-card 등록을 폐기하고
//   registerDefaults() 의 실제 엔트리로 검증 — 테스트 픽스처와 실 registry 의 drift 차단.
//   "coming soon" 은 chart-card dataShapes 밖 datasource(now_spot_ticker)로 표현.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { registerDefaults } from "@travis/shared";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";

// uPlot mock — 생성/파괴/데이터만 흉내 (jsdom canvas 부재).
const uplotInstances: Array<{ setData: ReturnType<typeof vi.fn> }> = [];
vi.mock("uplot", () => ({
  default: class MockUplot {
    setData = vi.fn();
    setSize = vi.fn();
    destroy = vi.fn();
    constructor() {
      uplotInstances.push(this as unknown as { setData: ReturnType<typeof vi.fn> });
    }
  },
}));

// dataService — series 훅만 mock (배럴의 나머지는 원본 유지).
const mockUseSeries = vi.fn();
vi.mock("@/lib/dataService", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    useDataServiceSeries: (opts: unknown) => mockUseSeries(opts),
  };
});

import ChartCard, { resolveChartSymbols } from "../ChartCard";

// 실제 registry 부트스트랩 — chart-card 실등록 엔트리(dataShapes=history 6종)로 검증.
registerDefaults();

function makeConfig(
  overrides: Partial<CardComponentProps["config"]["data"]> = {},
): CardComponentProps["config"] {
  return {
    id: "c1",
    componentId: "chart-card",
    size: "md",
    updateMode: "value",
    data: {
      datasource: "open_interest_history",
      marketType: "futures_usdm",
      symbol: "BTCUSDT",
      interval: "1h",
      ...overrides,
    },
  } as CardComponentProps["config"];
}

const READY_SERIES = {
  series: [
    {
      key: "BTCUSDT",
      symbol: "BTCUSDT",
      rows: [
        { recorded_at: "2026-07-08T01:00:00Z", open_interest: 100 },
        { recorded_at: "2026-07-08T02:00:00Z", open_interest: 110 },
      ],
    },
  ],
  status: "ready" as const,
  error: null,
  lastUpdatedAt: 1_780_000_000_000,
};

beforeEach(() => {
  mockUseSeries.mockReset();
  mockUseSeries.mockReturnValue({
    series: [],
    status: "idle",
    error: null,
    lastUpdatedAt: null,
  });
  uplotInstances.length = 0;
});

describe("resolveChartSymbols — config → 오버레이 심볼 번역", () => {
  it("단일 symbol 우선 / filters `symbol in` = 오버레이 / `=` 단일 / 없음 = []", () => {
    expect(resolveChartSymbols("BTCUSDT", undefined)).toEqual(["BTCUSDT"]);
    expect(
      resolveChartSymbols(undefined, [
        { field: "symbol", operator: "in", value: ["BTCUSDT", "ETHUSDT"] },
      ]),
    ).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(
      resolveChartSymbols(undefined, [
        { field: "symbol", operator: "=", value: "ETHUSDT" },
      ]),
    ).toEqual(["ETHUSDT"]);
    expect(resolveChartSymbols(undefined, [])).toEqual([]);
    // symbol 외 필드는 무시 + 비배열 in 은 graceful []
    expect(
      resolveChartSymbols(undefined, [
        { field: "notional", operator: ">", value: 1 },
      ]),
    ).toEqual([]);
  });
});

describe("ChartCard — 상태 분기 (graceful)", () => {
  it("dataShapes 밖 datasource = coming soon + 훅 disabled (registry 파생 렌더 게이트)", () => {
    // Step 5 실등록 후: chart-card 는 history 6종만 지원 — set datasource(now_spot_ticker)
    //   는 권한 없음 → graceful coming soon (F3 깨진 화면 재발 차단과 동형).
    render(<ChartCard config={makeConfig({ datasource: "now_spot_ticker" })} />);
    expect(screen.getByText("this data view is coming soon")).toBeTruthy();
    const opts = mockUseSeries.mock.calls.at(-1)![0] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("marketType 누락 (market_type 필수 datasource) = missing market scope + 훅 disabled", () => {
    // 라이브 G2 hotfix (2026-07-09): AI 가 marketType 을 생략하면 PK prefix 미정합
    //   풀스캔(9.8초 실측) → 500. 가드가 fetch 를 원천 차단하는지 회귀 박제.
    render(<ChartCard config={makeConfig({ marketType: undefined })} />);
    expect(screen.getByText("missing market scope")).toBeTruthy();
    const opts = mockUseSeries.mock.calls.at(-1)![0] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("symbol 도 filters 도 없음 = missing symbol scope", () => {
    render(
      <ChartCard config={makeConfig({ symbol: undefined, filters: undefined })} />,
    );
    expect(screen.getByText("missing symbol scope")).toBeTruthy();
  });

  it("error 상태 = chart data error", () => {
    mockUseSeries.mockReturnValue({
      series: [],
      status: "error",
      error: new Error("x"),
      lastUpdatedAt: null,
    });
    render(<ChartCard config={makeConfig()} />);
    expect(screen.getByText("! chart data error")).toBeTruthy();
  });

  it("ready + 빈 시계열 = no data in this window (에러 아님)", () => {
    mockUseSeries.mockReturnValue({
      series: [{ key: "BTCUSDT", symbol: "BTCUSDT", rows: [] }],
      status: "ready",
      error: null,
      lastUpdatedAt: 1,
    });
    render(<ChartCard config={makeConfig()} />);
    expect(screen.getByText("no data in this window")).toBeTruthy();
  });

  it("ready + 데이터 = 차트 생성 + 훅 옵션 번역 (interval 비례 refresh/maxPoints/timeField)", () => {
    mockUseSeries.mockReturnValue(READY_SERIES);
    render(<ChartCard config={makeConfig()} />);
    // 상태 문구 없음 + uPlot 1회 생성
    expect(screen.queryByText("no data in this window")).toBeNull();
    expect(uplotInstances).toHaveLength(1);
    const opts = mockUseSeries.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(opts.symbols).toEqual(["BTCUSDT"]);
    expect(opts.interval).toBe("1h");
    expect(opts.refreshIntervalMs).toBe(600_000); // 1h/2 → 상한 클램프
    expect(opts.maxPoints).toBe(300); // limit 생략 = 픽셀 밀도 인프라 상한
    expect(opts.timeField).toBe("recorded_at");
  });

  it("interval 생략 시 descriptor.defaultInterval fallback (생략=의미 부재 축)", () => {
    mockUseSeries.mockReturnValue(READY_SERIES);
    render(<ChartCard config={makeConfig({ interval: undefined })} />);
    const opts = mockUseSeries.mock.calls.at(-1)![0] as { interval: string };
    expect(opts.interval).toBe("1h"); // open_interest_history defaultInterval
  });

  it("다중 심볼 오버레이 = 범례 스와치 N개", () => {
    mockUseSeries.mockReturnValue({
      ...READY_SERIES,
      series: [
        READY_SERIES.series[0]!,
        {
          key: "ETHUSDT",
          symbol: "ETHUSDT",
          rows: [{ recorded_at: "2026-07-08T01:00:00Z", open_interest: 50 }],
        },
      ],
    });
    render(
      <ChartCard
        config={makeConfig({
          symbol: undefined,
          filters: [
            { field: "symbol", operator: "in", value: ["BTCUSDT", "ETHUSDT"] },
          ],
        })}
      />,
    );
    expect(screen.getByText("BTCUSDT")).toBeTruthy();
    expect(screen.getByText("ETHUSDT")).toBeTruthy();
  });
});

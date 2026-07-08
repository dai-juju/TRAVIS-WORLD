// ChartCard 상태 분기 테스트 (Composable 사이클 2 Step 4, 2026-07-08).
//
// uPlot(canvas — jsdom 미지원)과 useDataServiceSeries(네트워크)를 mock 해
// form 의 graceful 상태 분기와 config→훅 옵션 번역만 검증한다.
// ★ Step 4 = 미등록 격리: chart-card 는 registry 에 없어 renderable=false → 기본은
//   "coming soon". 렌더 경로 검증은 테스트 안에서 합성 chart-card 를 등록해 수행.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { registerComponent } from "@travis/shared";
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

/** 합성 chart-card 등록 — Step 5 실등록 전의 테스트 전용 렌더 권한. */
function registerTestChartCard(): void {
  registerComponent({
    id: "chart-card",
    name: "Chart Card (test)",
    description: "test-only registration",
    supportedSizes: ["md", "lg"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      { datasourceId: "open_interest_history", requiredFields: ["open_interest"] },
    ],
    supportedInteractions: [],
    defaultSize: "md",
    acceptsShapes: ["series"],
  });
}

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
  it("미등록(Step 4 격리 상태) = coming soon + 훅 disabled", () => {
    // chart-card 미등록 시나리오 — registerTestChartCard() 안 부름.
    // (같은 파일 내 다른 테스트가 등록하므로 이 테스트가 첫 번째로 실행되는
    //  순서 의존을 피해 미지원 datasource 로 표현: dataShapes 밖 = 권한 없음.)
    registerTestChartCard();
    render(<ChartCard config={makeConfig({ datasource: "basis_history" })} />);
    expect(screen.getByText("this data view is coming soon")).toBeTruthy();
    const opts = mockUseSeries.mock.calls.at(-1)![0] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("symbol 도 filters 도 없음 = missing symbol scope", () => {
    registerTestChartCard();
    render(
      <ChartCard config={makeConfig({ symbol: undefined, filters: undefined })} />,
    );
    expect(screen.getByText("missing symbol scope")).toBeTruthy();
  });

  it("error 상태 = chart data error", () => {
    registerTestChartCard();
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
    registerTestChartCard();
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
    registerTestChartCard();
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
    registerTestChartCard();
    mockUseSeries.mockReturnValue(READY_SERIES);
    render(<ChartCard config={makeConfig({ interval: undefined })} />);
    const opts = mockUseSeries.mock.calls.at(-1)![0] as { interval: string };
    expect(opts.interval).toBe("1h"); // open_interest_history defaultInterval
  });

  it("다중 심볼 오버레이 = 범례 스와치 N개", () => {
    registerTestChartCard();
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

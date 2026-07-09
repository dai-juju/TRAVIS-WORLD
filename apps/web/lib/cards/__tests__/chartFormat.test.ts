// chartFormat 순수 함수 테스트 (Composable 사이클 2 Step 4, 2026-07-08).

import { describe, expect, it } from "vitest";
import type { SeriesGroup } from "@/lib/dataService";
import { CHART_DESCRIPTORS } from "../chartDescriptors";
import {
  buildAlignedData,
  buildChartOptions,
  downsampleAligned,
  intervalToMs,
  midlinePlugin,
  refreshMsForInterval,
  seriesStrokes,
  tooltipPlugin,
  withAlpha,
  SERIES_STROKE_VARS,
  type ChartThemeTokens,
} from "../chartFormat";

const THEME: ChartThemeTokens = {
  ink: "#0a0a0a",
  inkFaint: "#eeeeee",
  inkMuted: "#888888",
  up: "oklch(0.65 0.13 180)",
  down: "oklch(0.58 0.22 25)",
};

type Row = Record<string, unknown>;
const g = (symbol: string, points: Array<[string, number | null]>): SeriesGroup<Row> => ({
  key: symbol,
  symbol,
  rows: points.map(([recorded_at, open_interest]) => ({ recorded_at, open_interest })),
});

describe("intervalToMs / refreshMsForInterval", () => {
  it("9종 interval 전부 매핑 + 미지 값 null (graceful)", () => {
    expect(intervalToMs("5m")).toBe(300_000);
    expect(intervalToMs("1h")).toBe(3_600_000);
    expect(intervalToMs("1d")).toBe(86_400_000);
    expect(intervalToMs("7m")).toBeNull();
    expect(intervalToMs(undefined)).toBeNull();
  });

  it("refresh = interval/2, 30초~10분 클램프 (backend-infra: interval 비례 필수)", () => {
    expect(refreshMsForInterval("5m")).toBe(150_000);
    expect(refreshMsForInterval("15m")).toBe(450_000);
    expect(refreshMsForInterval("1d")).toBe(600_000); // 상한 클램프
    expect(refreshMsForInterval("1h")).toBe(600_000); // 30분/2=... 1h/2=30분 → 상한 600s
    expect(refreshMsForInterval(undefined)).toBe(60_000); // 미지 — 보수적 1분
  });
});

describe("buildAlignedData", () => {
  it("timestamp 합집합 오름차순 + 결측은 null gap (0 아님 — crypto-domain)", () => {
    const data = buildAlignedData(
      [
        g("BTC", [["2026-07-08T01:00:00Z", 10], ["2026-07-08T02:00:00Z", 11]]),
        g("ETH", [["2026-07-08T02:00:00Z", 5], ["2026-07-08T03:00:00Z", 6]]),
      ],
      "recorded_at",
      "open_interest",
    );
    const base = Date.parse("2026-07-08T01:00:00Z") / 1000;
    expect(data[0]).toEqual([base, base + 3600, base + 7200]);
    expect(data[1]).toEqual([10, 11, null]); // BTC — 03시 없음 = gap
    expect(data[2]).toEqual([null, 5, 6]); // ETH — 01시 없음 = gap
  });

  it("null/비숫자 값은 null, 파싱 불가 timestamp 행은 제외 (graceful)", () => {
    const data = buildAlignedData(
      [
        g("BTC", [
          ["2026-07-08T01:00:00Z", null],
          ["not-a-date", 99],
          ["2026-07-08T02:00:00Z", 7],
        ]),
      ],
      "recorded_at",
      "open_interest",
    );
    expect(data[0]).toHaveLength(2); // not-a-date 제외
    expect(data[1]).toEqual([null, 7]);
  });
});

describe("downsampleAligned", () => {
  const mk = (n: number) => {
    const xs = Array.from({ length: n }, (_, i) => i);
    const ys = Array.from({ length: n }, (_, i) => i * 2);
    return [xs, ys] as [number[], number[]];
  };

  it("target 이하면 원본 참조 그대로 (setData 절약)", () => {
    const data = mk(100);
    expect(downsampleAligned(data, 300)).toBe(data);
  });

  it("★ null/평평한 꼬리 시리즈도 x↔y 길이 동일 — 인덱스 기준 균일 적용 (reviewer C1 회귀)", () => {
    const n = 5001; // stride 가 마지막 index 를 안 밟는 크기
    const xs = Array.from({ length: n }, (_, i) => i);
    const flatTail = Array.from({ length: n }, (_, i) => (i < n - 10 ? i : 42)); // 끝 평평
    const nullTail = Array.from({ length: n }, (_, i): number | null =>
      i < n - 10 ? i : null,
    ); // 끝 null (COINM global 류)
    const out = downsampleAligned([xs, flatTail, nullTail] as never, 100);
    expect(out[1]!.length).toBe(out[0]!.length);
    expect(out[2]!.length).toBe(out[0]!.length);
    expect(out[0]![out[0]!.length - 1]).toBe(n - 1); // 최신 timestamp 보존
    expect(out[2]![out[2]!.length - 1]).toBeNull(); // null 꼬리는 null 그대로 (gap)
  });

  it("초과 시 stride 축소 + 마지막(최신) 포인트 보존, 전 시리즈 동일 index", () => {
    const data = mk(5000);
    const out = downsampleAligned(data, 100); // target 200
    const xs = out[0]!;
    const ys = out[1]!;
    expect(xs.length).toBeLessThanOrEqual(202);
    expect(xs[xs.length - 1]).toBe(4999); // 최신 보존
    expect(ys[ys.length - 1]).toBe(9998); // y 도 같은 index
    expect(xs.length).toBe(ys.length); // 정렬 보존
  });
});

describe("seriesStrokes / SERIES_STROKE_VARS 등치", () => {
  it("캔버스 슬롯(해석색)과 DOM 범례 슬롯(var)의 의미 순서 1:1 — ink/up/down/muted", () => {
    expect(seriesStrokes(THEME)).toEqual([THEME.ink, THEME.up, THEME.down, THEME.inkMuted]);
    expect(SERIES_STROKE_VARS).toEqual([
      "var(--ink)",
      "var(--up)",
      "var(--down)",
      "var(--ink-3)",
    ]);
  });
});

describe("buildChartOptions", () => {
  const descriptor = CHART_DESCRIPTORS.top_ls_ratio_accounts_history!;

  it("프리셋 — 커서 on(호버 툴팁)·drag off·legend off + spanGaps:false + 시리즈 = 라벨 순서", () => {
    const opts = buildChartOptions({
      descriptor,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT", "ETHUSDT"],
    });
    // 사용자 UIUX 결정 (2026-07-09): 커서 수직선+스냅 포인트 활성 — 단 drag/select 는
    //   계속 off (wheel/드래그 소유권 = React Flow 캔버스).
    expect(opts.cursor?.show).toBe(true);
    expect(opts.cursor?.drag).toEqual({ x: false, y: false });
    expect(opts.legend?.show).toBe(false);
    expect(opts.series).toHaveLength(3); // x + 2
    expect(opts.series[1]?.label).toBe("BTCUSDT");
    expect(opts.series[1]?.spanGaps).toBe(false);
    expect(opts.series[1]?.stroke).toBe(THEME.ink); // 슬롯 1 = ink
    expect(opts.series[2]?.stroke).toBe(THEME.up); // 슬롯 2 = up (심볼 식별자)
  });

  it("midline 있는 descriptor 는 plugin 2개(midline+tooltip) / OI(없음)는 1개(tooltip)", () => {
    const withMid = buildChartOptions({
      descriptor,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    // 툴팁 플러그인 상시 1개 (UIUX 2026-07-09) — midline 유무로 2/1 분기.
    expect(withMid.plugins).toHaveLength(2);
    const oi = buildChartOptions({
      descriptor: CHART_DESCRIPTORS.open_interest_history!,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    expect(oi.plugins).toHaveLength(1);
    // OI = area → fill 존재 / LSR = line → fill 없음
    expect(oi.series[1]?.fill).toBeDefined();
    expect(withMid.series[1]?.fill).toBeUndefined();
  });

  it("y축 값 포맷 = descriptor.formatValue 파생 (시맨틱 레이어)", () => {
    const opts = buildChartOptions({
      descriptor,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    const values = opts.axes?.[1]?.values as (u: unknown, t: number[]) => string[];
    expect(values(null, [1.2345])).toEqual(["1.2345"]); // formatLSR 4자리
  });
});

describe("midlinePlugin — graceful", () => {
  it("y 범위 밖이면 그리지 않음 / ctx 예외는 삼킴 (차트 본체 보호)", () => {
    const plugin = midlinePlugin(1, "#888");
    const calls: string[] = [];
    const fakeCtx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_t, prop) => {
        calls.push(String(prop));
        return () => undefined;
      },
      set: () => true,
    });
    const draw = plugin.hooks.draw;
    // 범위 밖 — 아무것도 안 그림
    draw({
      ctx: fakeCtx,
      valToPos: () => 0,
      bbox: { left: 0, top: 0, width: 100, height: 100 },
      scales: { y: { min: 2, max: 3 } },
    });
    expect(calls).toHaveLength(0);
    // 범위 안 — 그리기 시도 (stroke 호출 흔적)
    draw({
      ctx: fakeCtx,
      valToPos: () => 50,
      bbox: { left: 0, top: 0, width: 100, height: 100 },
      scales: { y: { min: 0, max: 2 } },
    });
    expect(calls).toContain("stroke");
    // scales 자체가 없어도 throw 안 함
    expect(() =>
      draw({
        ctx: fakeCtx,
        valToPos: () => 0,
        bbox: { left: 0, top: 0, width: 0, height: 0 },
        scales: {},
      }),
    ).not.toThrow();
  });
});

describe("tooltipPlugin — 내용 + graceful (UIUX 2026-07-09)", () => {
  const makeU = (idx: number | null) =>
    ({
      over: document.createElement("div"),
      cursor: { idx, left: idx == null ? -1 : 50, top: 20 },
      data: [
        [1_780_000_000, 1_780_003_600],
        [100, 110],
        [50, null],
      ],
    }) as never;

  it("idx 스냅 값 표시(오버레이 = 심볼 병기 + null 은 —) / idx null = 숨김 / destroy = 제거", () => {
    const plugin = tooltipPlugin(CHART_DESCRIPTORS.open_interest_history!, [
      "BTCUSDT",
      "ETHUSDT",
    ]);
    const over = document.createElement("div");
    plugin.hooks.init({ over } as never);
    const tip = over.firstElementChild as HTMLDivElement;
    expect(tip).toBeTruthy();

    const u = makeU(1);
    (u as { over: HTMLElement }).over = over;
    plugin.hooks.setCursor(u);
    expect(tip.style.display).toBe("block");
    expect(tip.textContent).toContain("BTCUSDT");
    expect(tip.textContent).toContain("110"); // formatAmount(110)
    expect(tip.textContent).toContain("—"); // ETHUSDT null = gap 값 graceful

    const uNull = makeU(null);
    (uNull as { over: HTMLElement }).over = over;
    plugin.hooks.setCursor(uNull);
    expect(tip.style.display).toBe("none");

    plugin.hooks.destroy();
    expect(over.childElementCount).toBe(0);
  });

  it("단일 심볼은 심볼 라벨 없이 값만 (범례 중복 회피)", () => {
    const plugin = tooltipPlugin(CHART_DESCRIPTORS.open_interest_history!, ["BTCUSDT"]);
    const over = document.createElement("div");
    plugin.hooks.init({ over } as never);
    const u = makeU(0);
    (u as { over: HTMLElement }).over = over;
    plugin.hooks.setCursor(u);
    const tip = over.firstElementChild as HTMLDivElement;
    expect(tip.textContent).toContain("100");
    expect(tip.textContent).not.toContain("BTCUSDT");
  });

  it("init 전 setCursor / 깨진 u 객체도 throw 안 함 (차트 본체 보호)", () => {
    const plugin = tooltipPlugin(CHART_DESCRIPTORS.open_interest_history!, ["BTCUSDT"]);
    expect(() => plugin.hooks.setCursor(makeU(0))).not.toThrow(); // init 전 = tip null
    const over = document.createElement("div");
    plugin.hooks.init({ over } as never);
    expect(() =>
      plugin.hooks.setCursor({ over, cursor: {}, data: [] } as never),
    ).not.toThrow();
  });
});

describe("withAlpha", () => {
  it("6자리 hex → 8자리 / oklch → `/ a` 삽입 / 미지 형식은 원색 (graceful)", () => {
    expect(withAlpha("#0a0a0a", 0.12)).toBe("#0a0a0a1f");
    expect(withAlpha("oklch(0.65 0.13 180)", 0.12)).toBe("oklch(0.65 0.13 180 / 0.12)");
    expect(withAlpha("teal", 0.5)).toBe("teal");
  });
});

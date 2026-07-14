// chartFormat 순수 함수 테스트 (Composable 사이클 2 Step 4, 2026-07-08).

import { describe, expect, it } from "vitest";
import type { SeriesGroup } from "@/lib/dataService";
import { CHART_DESCRIPTORS } from "../chartDescriptors";
import {
  buildAlignedData,
  buildChartOptions,
  downsampleAligned,
  formatChartTime,
  intervalToMs,
  midlinePlugin,
  refreshMsForInterval,
  seriesStrokes,
  tooltipPlugin,
  withAlpha,
  yAxisSize,
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

  // ─── seriesStyle="bars" (사이클 2 Step 6 — 펀딩 정산이 첫 사용자) ──────────

  it("bars 단일 심볼 = paths 주입 + width 0(disp.fill 활성 조건) + 폴백 fill", () => {
    const opts = buildChartOptions({
      descriptor: CHART_DESCRIPTORS.funding_history!,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    const s = opts.series[1]!;
    expect(typeof s.paths).toBe("function"); // uPlot.paths.bars 팩토리 산출물
    expect(s.width).toBe(0); // disp.fill 팩트 활성 조건 (uPlot 1.6.32 내부)
    expect(s.fill).toBeDefined(); // 중립 폴백 fill (directional 은 disp 가 per-point 덮음)
    expect(s.spanGaps).toBe(false);
  });

  it("bars 오버레이(labels>1) = stepped 자동 전환 (막대 겹침 판독 불가 — form 픽셀 정책)", () => {
    const opts = buildChartOptions({
      descriptor: CHART_DESCRIPTORS.funding_history!,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT", "ETHUSDT"],
    });
    for (const idx of [1, 2]) {
      const s = opts.series[idx]!;
      expect(typeof s.paths, `series[${idx}]`).toBe("function"); // stepped 팩토리
      expect(s.width, `series[${idx}]`).toBe(1); // 계단선 = 일반 스트로크 (bars width 0 아님)
      expect(s.fill, `series[${idx}]`).toBeUndefined(); // 채움 없음 = line 계열
    }
  });

  it("bars 는 y 스케일 0 포함 강제 / 격자 지표(line·area)는 auto 만 (0 앵커 금지 유지)", () => {
    const bars = buildChartOptions({
      descriptor: CHART_DESCRIPTORS.funding_history!,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    const range = bars.scales?.y?.range as
      | ((u: unknown, min: number, max: number) => [number, number])
      | undefined;
    expect(typeof range).toBe("function");
    // 전부 양수 구간에서도 0 지불선이 보여야 방향이 읽힌다.
    expect(range!(null, 0.0001, 0.0005)).toEqual([0, 0.0005]);
    // 전부 음수 구간도 대칭.
    expect(range!(null, -0.0004, -0.0001)).toEqual([-0.0004, 0]);
    // 격자 지표는 range 함수 없음 (auto 그대로 = 0 앵커 금지).
    const line = buildChartOptions({
      descriptor,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    expect(line.scales?.y?.range).toBeUndefined();
  });

  it("line/area 시리즈는 bars 경로와 무관 — paths 미주입 (uPlot 기본 linear, 회귀 0)", () => {
    for (const key of ["top_ls_ratio_accounts_history", "open_interest_history"]) {
      const opts = buildChartOptions({
        descriptor: CHART_DESCRIPTORS[key]!,
        theme: THEME,
        width: 320,
        height: 160,
        labels: ["BTCUSDT"],
      });
      expect(opts.series[1]?.paths, key).toBeUndefined();
      expect(opts.series[1]?.width, key).toBe(1);
    }
  });
});

// ─── 스타일 override 파생 descriptor (사이클 4a [10-101], 2026-07-12) ─────────
//
// AI 계약 style.series 가 descriptor 기본값을 치환한 "파생 descriptor" 가 픽셀
// 레이어에 들어왔을 때의 거동 핀 — override 는 seriesStyle 1축만 바꾸고
// tone/midline(도메인 가드레일)은 원본 유지가 계약(ChartCard 가 spread 생성).
describe("buildChartOptions — 스타일 override 파생 descriptor ([10-101])", () => {
  it("funding bars→line override: y 0강제 해제(auto) + midline 0(가드레일) 유지", () => {
    const derived = { ...CHART_DESCRIPTORS.funding_history!, seriesStyle: "line" as const };
    const opts = buildChartOptions({
      descriptor: derived,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    expect(opts.series[1]?.paths).toBeUndefined(); // 일반 라인
    expect(opts.series[1]?.width).toBe(1);
    expect(opts.series[1]?.fill).toBeUndefined(); // area 아님
    expect(opts.scales?.y?.range).toBeUndefined(); // 0 포함 강제는 bars 기하 소속 — 해제
    expect(opts.plugins).toHaveLength(2); // midline 0 + tooltip — 기준선은 스타일과 직교
  });

  it("OI area→bars override: 0 포함 스케일 + 중립(모노크롬) 폴백 fill — tone 은 원본 유지", () => {
    const derived = { ...CHART_DESCRIPTORS.open_interest_history!, seriesStyle: "bars" as const };
    const opts = buildChartOptions({
      descriptor: derived,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    expect(typeof opts.series[1]?.paths).toBe("function"); // bars 팩토리
    expect(opts.series[1]?.width).toBe(0);
    expect(opts.series[1]?.fill).toBeDefined(); // neutral tone = 중립 폴백 fill (부호색 없음)
    expect(typeof opts.scales?.y?.range).toBe("function"); // bars 기하 = 0 포함
  });

  it("override bars + 오버레이(labels>1) = stepped 자동 전환 유지 (가독성 form 정책 불변)", () => {
    const derived = { ...CHART_DESCRIPTORS.open_interest_history!, seriesStyle: "bars" as const };
    const opts = buildChartOptions({
      descriptor: derived,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT", "ETHUSDT"],
    });
    for (const idx of [1, 2]) {
      expect(typeof opts.series[idx]?.paths, `series[${idx}]`).toBe("function"); // stepped
      expect(opts.series[idx]?.width, `series[${idx}]`).toBe(1); // bars(0) 아님 = 계단선
      expect(opts.series[idx]?.fill, `series[${idx}]`).toBeUndefined();
    }
  });
});

describe("커서 줌 보정 + 동적 y축 폭 (라이브 G2 신규 결함 회귀, 2026-07-10)", () => {
  const descriptor = CHART_DESCRIPTORS.funding_history!;
  const opts = buildChartOptions({
    descriptor,
    theme: THEME,
    width: 320,
    height: 160,
    labels: ["BTCUSDT"],
  });

  it("cursor.move — 시각/논리 비율(React Flow scale)로 나눠 좌표계 통일, 줌=1 은 no-op (event 부재 폴백)", () => {
    const move = opts.cursor?.move as (
      u: unknown,
      l: number,
      t: number,
    ) => [number, number];
    expect(typeof move).toBe("function");
    // 줌 0.5: 시각 200×100 / 논리 400×200 → 시각 오프셋을 논리로 환산 (×2)
    const zoomed = {
      over: {
        getBoundingClientRect: () => ({ width: 200, height: 100 }),
        offsetWidth: 400,
        offsetHeight: 200,
      },
    };
    expect(move(zoomed, 100, 50)).toEqual([200, 100]);
    // 줌 1: no-op
    const flat = {
      over: {
        getBoundingClientRect: () => ({ width: 400, height: 200 }),
        offsetWidth: 400,
        offsetHeight: 200,
      },
    };
    expect(move(flat, 100, 50)).toEqual([100, 50]);
    // 깨진 over — 무보정 좌표 폴백 (graceful, 차트 본체 보호)
    expect(move({ over: null }, 7, 8)).toEqual([7, 8]);
  });

  it("cursor.move — event 존재 시 clientX + fresh rect 직접 환산 (uPlot stale rect 캐시 우회, 2026-07-14)", () => {
    // 재발 근본: uPlot 이 넘겨준 left 는 자기 캐시 rect 기준 — 동적 y축 setSize/RF
    //   transform 뒤 캐시가 stale 이면 offset 이 오염된다. event.clientX 경로는 그
    //   캐시를 아예 안 쓰므로, "uPlot 이 stale 좌표(left)를 줘도" 정답을 낸다.
    const move = opts.cursor?.move as (
      u: unknown,
      l: number,
      t: number,
    ) => [number, number];
    const u = {
      over: {
        // fresh rect: 화면상 left=1000, 시각 폭 200 (논리 400 = 줌 0.5)
        getBoundingClientRect: () => ({ left: 1000, top: 500, width: 200, height: 100 }),
        offsetWidth: 400,
        offsetHeight: 200,
      },
      cursor: { event: { clientX: 1200, clientY: 550 } },
    };
    // 마우스 = rect 우측 물리 끝(1000+200) → 논리 400 = 100% 도달. uPlot 이 넘긴
    //   stale left(예: 37)는 무시된다.
    expect(move(u, 37, 13)).toEqual([400, 100]);
    // event 는 있으나 clientX 비수치(터치/프로그램적) → 배율 폴백
    const noXY = { ...u, cursor: { event: {} } };
    expect(move(noXY, 100, 50)).toEqual([200, 100]);
  });

  it("y축 size — 함수형 + 최장 라벨 실측, 부호/천단위 잘림 방지 ([10-92]④ 회귀)", () => {
    const size = opts.axes?.[1]?.size as (
      u: unknown,
      values: string[] | null,
      axisIdx: number,
      cycleNum: number,
    ) => number;
    expect(typeof size).toBe("function");
    // "+0.01000%"(9자) — 근사 6px/자 기준으로도 구 고정값 64 초과 = 부호 안 잘림
    expect(
      size({ axes: [] }, ["+0.01000%", "-0.00500%"], 1, 0),
    ).toBeGreaterThanOrEqual(9 * 6 + 21);
    // 초기 레이아웃 패스(values 미확정) = 64 폴백
    expect(size({ axes: [] }, null, 1, 0)).toBe(64);
    // 재레이아웃 수렴 패스(cycleNum>1) — 직전 크기 유지 (uPlot 문서 예제)
    expect(size({ axes: [{}, { _size: 80 }] }, ["x"], 1, 2)).toBe(80);
  });

  it("yAxisSize — 빈/미확정 64 폴백 + 하한 40 (축 소멸 방지)", () => {
    expect(yAxisSize(null)).toBe(64);
    expect(yAxisSize([])).toBe(64);
    expect(yAxisSize(["1"])).toBeGreaterThanOrEqual(40);
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

describe("[10-99] 절대 시각 표기 = UTC 통일 (2026-07-13 사용자 확정)", () => {
  it("formatChartTime — UTC 값 결정 핀 (종전 로컬 표기는 머신 TZ 의존이라 핀 불가였음)", () => {
    // hour12:false(h23)에선 hour:"numeric" 도 2자리 패딩 — Node ICU 실측 (2026-07-13).
    expect(formatChartTime(Date.UTC(2026, 6, 10, 8, 0))).toBe("Jul 10, 08:00");
    expect(formatChartTime(Number.NaN)).toBe("—");
  });

  it("buildChartOptions — x축 tzDate = UTC (uPlot 기본 = 브라우저 로컬 렌더 차단)", () => {
    const opts = buildChartOptions({
      descriptor: CHART_DESCRIPTORS.open_interest_history!,
      theme: THEME,
      width: 320,
      height: 160,
      labels: ["BTCUSDT"],
    });
    expect(typeof opts.tzDate).toBe("function");
    // uPlot tzDate 계약: 반환 Date 의 "로컬" getter 가 UTC 벽시계를 읽음 — 1970-01-01 01:00 UTC.
    const d = (opts.tzDate as (ts: number) => Date)(3600);
    expect(d.getFullYear()).toBe(1970);
    expect(d.getHours()).toBe(1);
    expect(d.getMinutes()).toBe(0);
  });

  it("tooltipPlugin — 시간 헤더에 'UTC' 라벨 부착 + UTC 환산 결정 핀", () => {
    const plugin = tooltipPlugin(CHART_DESCRIPTORS.open_interest_history!, ["BTCUSDT"]);
    const over = document.createElement("div");
    plugin.hooks.init({ over } as never);
    plugin.hooks.setCursor({
      over,
      cursor: { idx: 0, left: 50, top: 20 },
      data: [[1_780_000_000], [100]],
    } as never);
    const tip = over.firstElementChild as HTMLDivElement;
    // 1_780_000_000s = 2026-05-28T20:26:40Z — UTC 환산 + 라벨 결정 핀.
    expect(tip.textContent).toContain("May 28, 20:26 UTC");
  });
});

describe("withAlpha", () => {
  it("6자리 hex → 8자리 / oklch → `/ a` 삽입 / 미지 형식은 원색 (graceful)", () => {
    expect(withAlpha("#0a0a0a", 0.12)).toBe("#0a0a0a1f");
    expect(withAlpha("oklch(0.65 0.13 180)", 0.12)).toBe("oklch(0.65 0.13 180 / 0.12)");
    expect(withAlpha("teal", 0.5)).toBe("teal");
  });
});

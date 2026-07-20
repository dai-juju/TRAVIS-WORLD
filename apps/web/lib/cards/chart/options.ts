// apps/web/lib/cards/chart/options.ts
//
// uPlot 옵션 조립 — chartFormat 분할 (M3-step3b Step 0, 2026-07-20, [10-98] 회수).
// 순수 이동: 로직 원본 그대로. (value import 는 paths 팩토리(bars/stepped) 접근용 —
// uPlot 모듈 top-level 은 domEnv 가드라 SSR/vitest 안전 실측, 사이클 2 Step 6.
// 인스턴스 생성은 여전히 useUplot 전용.)
//
// ─── 저사양(UHD620) 절제 원칙 (nextjs-frontend 자문 2026-07-08) ───
//   - 다운샘플: 컨테이너 픽셀폭 기준 ~2 point/px (최대 성능 레버) — align.ts.
//   - 커서/애니메이션/legend 전부 off — wheel 소유권은 React Flow 캔버스 줌.
//   - null 은 gap (spanGaps:false — COINM global 미제공 등, crypto-domain 판정).

import uPlot from "uplot";
import type { Options as UplotOptions, Series } from "uplot";
import type { ChartDescriptor } from "../chartDescriptors";
import { AXIS_FONT, yAxisSize } from "./axisMeasure";
import { midlinePlugin, tooltipPlugin } from "./plugins";
import { seriesStrokes, withAlpha, type ChartThemeTokens } from "./theme";

export interface BuildChartOptionsParams {
  descriptor: ChartDescriptor;
  theme: ChartThemeTokens;
  width: number;
  height: number;
  /** 시리즈 라벨(심볼) — symbols[] 입력 순서. 색 슬롯과 1:1. */
  labels: string[];
}

/**
 * 이벤트 막대(bars) path 빌더 — 사이클 2 Step 6 (펀딩 정산이 첫 사용자).
 *
 * ★ 부호색 = uPlot 내장 disp.fill 컬러 팩트(unit 3 = Color, per-datapoint 색).
 *   pos/neg 를 시리즈 2개로 쪼개는 방식은 labels↔시리즈 1:1 계약(툴팁/범례/seriesKey)
 *   4곳을 깨서 기각 (Plan 검증 2026-07-09). disp 팩트는 series.width=0 조건과 한 몸
 *   (uPlot 1.6.32 내부 조건: strokeWidth==0 || dispStrokes — buildChartOptions 가 설정).
 * ★ null 값은 bars 루프가 자체 skip = gap 자동 — 팩트 배열의 해당 원소는 읽히지 않음.
 * 팩토리 부재(비정상 빌드) 시 undefined 반환 → uPlot 기본 line 폴백 (graceful).
 */
function eventBarsPaths(
  descriptor: ChartDescriptor,
  theme: ChartThemeTokens,
): Series["paths"] | undefined {
  // ?. 이중: paths 자체가 없는 환경(테스트 mock 등)에서도 throw 없이 line 폴백.
  const factory = uPlot.paths?.bars;
  if (!factory) return undefined;
  return factory({
    size: [0.6, 100], // 막대 폭 = 슬롯의 60%, 최대 100px (희소 이벤트에서 과대 방지)
    ...(descriptor.tone === "directional"
      ? {
          disp: {
            fill: {
              // 3 = BarsPathBuilderFacetUnit.Color — ambient const enum 이라 런타임
              // import 불가(isolatedModules) → 리터럴 + 주석으로 의미 고정.
              unit: 3,
              values: (u, seriesIdx) => {
                const ys = u.data[seriesIdx] as ArrayLike<number | null>;
                const out: (string | null)[] = [];
                for (let i = 0; i < ys.length; i++) {
                  const v = ys[i];
                  // 양수 = 롱이 숏에 지불(과열) / 음수 = 반대 — 부호가 곧 방향.
                  out.push(v == null ? null : v >= 0 ? theme.up : theme.down);
                }
                return out;
              },
            },
          },
        }
      : {}),
  });
}

/** 이벤트 계단(stepped) path 빌더 — bars 오버레이 전환용. align 1 = "다음 이벤트까지 유지". */
function eventSteppedPaths(): Series["paths"] | undefined {
  const factory = uPlot.paths?.stepped;
  if (!factory) return undefined;
  return factory({ align: 1 });
}

/**
 * uPlot 옵션 조립 — 저사양 절제 프리셋.
 * 커서 = 수직선+스냅 포인트+플로팅 툴팁 (사용자 UIUX 결정 2026-07-09 — 이전의
 * 전부-off 에서 개정. wheel 소유권은 여전히 React Flow 캔버스 줌 — `nowheel` 금지),
 * legend off, 축 값 포맷 = descriptor.formatValue(시맨틱 레이어 파생).
 *
 * seriesStyle="bars" (사이클 2 Step 6): 단일 심볼 = 부호색 막대 / 오버레이(labels>1) =
 * 계단선 자동 전환 (막대 겹침 판독 불가 — 사용자 결정, 데이터별 하드코딩 아닌 form
 * 픽셀 정책). y 스케일은 0 포함 강제 (막대 기준선 = 0 지불 경계 — OI 의 "0 앵커
 * 금지"와 반대인 이유: 레벨 지표가 아니라 부호 이벤트라 0 이 의미의 중심).
 */
export function buildChartOptions(params: BuildChartOptionsParams): UplotOptions {
  const { descriptor, theme, width, height, labels } = params;
  const strokes = seriesStrokes(theme);
  const isBars = descriptor.seriesStyle === "bars";
  const useBars = isBars && labels.length === 1;
  const useStepped = isBars && labels.length > 1;
  const barsPaths = useBars ? eventBarsPaths(descriptor, theme) : undefined;
  const steppedPaths = useStepped ? eventSteppedPaths() : undefined;

  const series: Series[] = [
    {}, // x
    ...labels.map((label, i): Series => {
      const stroke = strokes[i % strokes.length]!;
      return {
        label,
        stroke,
        // bars 는 width 0 필수 (disp.fill 팩트 활성 조건) — 외곽선 없이 fill 만.
        width: useBars && barsPaths ? 0 : 1,
        spanGaps: false, // null=gap — 없는 데이터를 이어 그리지 않는다 (crypto-domain)
        points: { show: false }, // 저사양 — 포인트 마커 off
        ...(descriptor.seriesStyle === "area"
          ? { fill: withAlpha(stroke, 0.12) }
          : {}),
        ...(useBars && barsPaths
          ? {
              paths: barsPaths,
              // 중립(neutral) bars 폴백 색 — directional 은 disp.fill 이 per-point 로 덮음.
              fill: withAlpha(stroke, 0.85),
            }
          : {}),
        ...(useStepped && steppedPaths ? { paths: steppedPaths } : {}),
      };
    }),
  ];

  const plugins = [
    ...(descriptor.midline !== undefined
      ? [midlinePlugin(descriptor.midline, theme.inkMuted)]
      : []),
    // 호버 툴팁 (사용자 UIUX 결정 2026-07-09 — Binance 식 플로팅).
    tooltipPlugin(descriptor, labels),
  ];

  return {
    width,
    height,
    // 커서 = 수직선 + 스냅 포인트 (호버 툴팁의 앵커). drag/select 는 계속 off —
    //   wheel/드래그 소유권은 React Flow 캔버스. y 수평선은 생략(라인 가림 절제).
    cursor: {
      show: true,
      x: true,
      y: false,
      drag: { x: false, y: false },
      points: { show: true },
      // ★ React Flow 줌 + stale rect 보정 (2026-07-10 1차 → 2026-07-14 근본 재수정):
      //   uPlot 은 over 의 rect 를 **캐시**하고 window resize/scroll/mouseenter 에만
      //   갱신한다(uPlot.cjs L2829-2833/L5698) — RF pan·zoom(CSS transform)과
      //   setSize 는 캐시를 무효화하지 않는다. 특히 동적 yAxisSize 확정이 첫 렌더
      //   직후 setSize 를 일으켜 캐시 rect(위치+크기)가 hover 내내 stale 로 남았고,
      //   1차 수정(배율만 나누기)은 넘어온 left 에 이미 박힌 위치(offset) 오염을
      //   못 고쳐 "커서 점선 ≠ 스냅 idx + 우측 최신 구간 도달 불가"가 재발했다
      //   (라이브 G2 사용자 실측 2026-07-14). → 원본 이벤트 clientX 를 **그 순간
      //   새로 잰 rect** 로 직접 환산해 캐시 의존을 제거한다(offset+scale 동시 교정).
      //   우측 물리 끝 vx=r.width → 논리 w = 100% 도달 보장. cursor.event 는
      //   cacheMouse 가 cursor.move 이전에 채움(uPlot.cjs L5731/L3585 실재 확인).
      move: (
        u: { over: HTMLElement; cursor?: { event?: unknown } },
        left: number,
        top: number,
      ): [number, number] => {
        try {
          const r = u.over.getBoundingClientRect(); // 매 이동마다 fresh 측정
          const w = u.over.offsetWidth; // = plotWidCss (논리 폭, transform 무반영)
          const h = u.over.offsetHeight;
          // 시각→논리 배율 (rect.width = offsetWidth × RF줌). 줌=1 이면 1 = no-op.
          const kx = w > 0 && r.width > 0 ? w / r.width : 1;
          const ky = h > 0 && r.height > 0 ? h / r.height : 1;
          const ev = u.cursor?.event as
            | { clientX?: number; clientY?: number }
            | undefined;
          if (ev && typeof ev.clientX === "number" && typeof ev.clientY === "number") {
            const vx = ev.clientX - r.left; // fresh 시각 오프셋 (캐시 rect 미사용)
            const vy = ev.clientY - r.top;
            return [vx * kx, vy * ky];
          }
          // 이벤트 부재(프로그램적 setCursor 등) — 넘어온 좌표를 배율만 보정
          //   (1차 수정과 수치 동일: left/(r.width/w) === left*kx).
          return [left * kx, top * ky];
        } catch {
          return [left, top]; // 보정 실패 = 무보정 좌표 (차트 본체 보호)
        }
      },
    },
    legend: { show: false },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    // [10-99] x축 눈금/자정 경계 = UTC (uPlot 기본은 브라우저 로컬 렌더 — 사이트 대조
    //   시차 혼동 차단, 사용자 확정 2026-07-13). uPlot 1.6.32 static tzDate 실재 확인
    //   (dist/uPlot.d.ts L148, 2026-07-13 조회). 툴팁/freshness 는 자체 UTC 포매터라 독립.
    tzDate: (ts: number) => uPlot.tzDate(new Date(ts * 1000), "Etc/UTC"),
    // pxRatio: uPlot 1.6.32 는 옵션도 정적 설정도 불가(클로저 변수, 2026-07-09 정정)
    //   — DPR 네이티브 렌더 수용. 표시 크기는 uPlot.min.css(canvas 100%)가 담당.
    series,
    scales: {
      x: { time: true },
      // 0 앵커 금지 (OI/비율 전부) — 데이터 범위 auto-scale (crypto-domain).
      // ★ 예외 = bars (이산 부호 이벤트): 막대 기준선 0 이 의미의 중심이라 0 포함 강제
      //   (전부 양수인 구간에서도 0 지불선이 보여야 방향이 읽힌다).
      y: isBars
        ? {
            auto: true,
            range: (_u: unknown, min: number, max: number): [number, number] => [
              Math.min(min, 0),
              Math.max(max, 0),
            ],
          }
        : { auto: true },
    },
    axes: [
      {
        stroke: theme.inkMuted,
        grid: { stroke: theme.inkFaint, width: 1 },
        ticks: { stroke: theme.inkFaint },
        // AXIS_FONT 참조 필수 (reviewer W1): 측정(yAxisSize)과 렌더가 별도 리터럴이면
        // 어긋나는 순간 라벨 잘림(부호 소실)이 무음 재발 — 단일 상수로 커플링 고정.
        font: AXIS_FONT,
      },
      {
        stroke: theme.inkMuted,
        grid: { stroke: theme.inkFaint, width: 1 },
        ticks: { stroke: theme.inkFaint },
        font: AXIS_FONT,
        // ★ 라벨 폭 = 최장 라벨 실측 (고정 64 는 부호/천단위 잘림 — yAxisSize 헤더 참조).
        //   cycleNum>1 은 uPlot 재레이아웃 수렴 패스 — 문서 예제대로 직전 크기 유지.
        size: (
          u: { axes: Array<{ _size?: number }> },
          values: string[] | null,
          axisIdx: number,
          cycleNum: number,
        ): number => {
          if (cycleNum > 1) return u.axes[axisIdx]?._size ?? 64;
          return yAxisSize(values);
        },
        values: (_u: unknown, ticks: number[]) =>
          ticks.map((v) => descriptor.formatValue(v)),
      },
    ],
    plugins,
  } as UplotOptions;
}

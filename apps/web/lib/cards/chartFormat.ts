// apps/web/lib/cards/chartFormat.ts
//
// Chart form 의 픽셀 매핑 — 순수 함수 (Composable 사이클 2 Step 4, 2026-07-08).
//
// chartDescriptors(시맨틱: 무엇을 어떤 의미로) → 여기(픽셀: uPlot 옵션·정렬 데이터·
// 다운샘플·색 슬롯) → useUplot(생명주기) → ChartCard(form 조립) 4분할의 두 번째 층.
// tableCardFormat/feedCardFormat 동형 — React/DOM/uPlot 인스턴스를 만들지 않는다
// (타입만 import). 전 함수 순수 = 단위 테스트 직접 대상.
//
// ─── 저사양(UHD620) 절제 원칙 (nextjs-frontend 자문 2026-07-08) ───
//   - 다운샘플: 컨테이너 픽셀폭 기준 ~2 point/px (최대 성능 레버).
//   - 커서/애니메이션/legend 전부 off — wheel 소유권은 React Flow 캔버스 줌.
//   - null 은 gap (spanGaps:false — COINM global 미제공 등, crypto-domain 판정).

import type { Options as UplotOptions, AlignedData, Series } from "uplot";
import type { ChartDescriptor } from "./chartDescriptors";
import type { SeriesGroup } from "@/lib/dataService";

// ─── 시간/주기 헬퍼 ─────────────────────────────────

/** interval 문자열 → ms. 미지 값은 null (graceful — 호출자가 기본값 결정). */
export function intervalToMs(interval: string | undefined): number | null {
  switch (interval) {
    case "5m": return 5 * 60_000;
    case "15m": return 15 * 60_000;
    case "30m": return 30 * 60_000;
    case "1h": return 3_600_000;
    case "2h": return 2 * 3_600_000;
    case "4h": return 4 * 3_600_000;
    case "6h": return 6 * 3_600_000;
    case "12h": return 12 * 3_600_000;
    case "1d": return 24 * 3_600_000;
    default: return null;
  }
}

/** 주기 pull 간격 — interval/2 비례 (backend-infra: 5m 봉을 30초마다 재fetch 하는
 *  낭비 차단, 닫힌 봉은 안 바뀌어 신선도 손실 0). 30초~10분 클램프. */
export function refreshMsForInterval(interval: string | undefined): number {
  const ms = intervalToMs(interval);
  if (ms === null) return 60_000; // 미지 interval — 보수적 1분
  return Math.min(Math.max(ms / 2, 30_000), 600_000);
}

/** AI limit 생략 시 series 당 포인트 기본 상한 — 픽셀 밀도 기준 인프라 상한.
 *  ("생략=전부"가 아님: 카드 폭을 넘는 포인트는 표현 불가능이라 AI 의도 덮어쓰기가
 *   아니다 — Feed 링버퍼 기본 100 과 동격의 form 인프라 상한.) */
export const DEFAULT_CHART_POINTS = 300;

// ─── 데이터 정렬 (SeriesGroup[] → uPlot AlignedData) ─────────────────

/**
 * 심볼별 곡선들을 uPlot 정렬 데이터로 변환.
 * - x = 전 곡선 timestamp 의 합집합(오름차순, epoch 초 — uPlot 기본 단위).
 * - 각 곡선 y = 해당 timestamp 에 값 없으면 null(gap). 숫자 아닌 값도 null.
 * - 훅(oldest-first 보증) 계약 전제 — 여기서 재정렬하지 않음(합집합 정렬만).
 */
export function buildAlignedData<T extends Record<string, unknown>>(
  groups: SeriesGroup<T>[],
  timeField: string,
  valueField: string,
): AlignedData {
  // timestamp 합집합 (epoch 초). 파싱 불가 행은 제외 (graceful).
  const tsSet = new Set<number>();
  const perSeries: Map<number, number | null>[] = groups.map((g) => {
    const m = new Map<number, number | null>();
    for (const row of g.rows) {
      const raw = row[timeField];
      // ★ number 는 epoch **ms** 로만 해석 (초 epoch datasource 가 생기면 여기서 변환
      //   책임을 명시적으로 추가할 것 — reviewer S3, 현 history 는 ISO 문자열이라 안전).
      const ms =
        typeof raw === "string" || typeof raw === "number"
          ? new Date(raw).getTime()
          : NaN;
      if (Number.isNaN(ms)) continue;
      const sec = Math.floor(ms / 1000);
      tsSet.add(sec);
      const v = row[valueField];
      m.set(sec, typeof v === "number" && Number.isFinite(v) ? v : null);
    }
    return m;
  });
  const xs = [...tsSet].sort((a, b) => a - b);
  const ys = perSeries.map((m) => xs.map((t) => m.get(t) ?? null));
  return [xs, ...ys] as AlignedData;
}

/**
 * 픽셀폭 기준 stride 다운샘플 — 폭 300px 카드에 수천 포인트는 낭비 (UHD620 최대 레버).
 * target = widthPx × 2 (point/px). 이하면 원본 그대로(참조 유지 = uPlot setData 절약).
 * ★ 전 시리즈 같은 index 를 유지해야 정렬 보존 — x/y 를 같은 stride 로 자른다.
 */
export function downsampleAligned(
  data: AlignedData,
  widthPx: number,
): AlignedData {
  const xs = data[0];
  const target = Math.max(Math.floor(widthPx) * 2, 50);
  if (xs.length <= target) return data;
  const stride = Math.ceil(xs.length / target);
  const lastIdx = xs.length - 1;
  // ★ 마지막(최신) 포인트 보존 여부는 **인덱스로 1회** 판정해 전 시리즈에 균일 적용
  //   (reviewer C1: 시리즈별 '값' 비교로 판단하면 null/평평한 꼬리를 가진 y 시리즈만
  //    push 를 건너뛰어 x↔y 길이가 어긋남 → uPlot AlignedData 계약 위반 = 차트 무음 실종).
  const appendLast = lastIdx % stride !== 0;
  const pick = <V>(arr: ArrayLike<V>): V[] => {
    const out: V[] = [];
    for (let i = 0; i < arr.length; i += stride) out.push(arr[i]!);
    if (appendLast) out.push(arr[lastIdx]!);
    return out;
  };
  return data.map((series) => pick(series as ArrayLike<number | null>)) as AlignedData;
}

// ─── 테마/색 슬롯 ────────────────────────────────────

/** 캔버스용으로 해석된 테마 토큰 (CSS var 는 canvas 불가 — useUplot 이 해석해 주입). */
export interface ChartThemeTokens {
  ink: string;
  inkFaint: string; // 축/그리드 (--ink-5 급)
  inkMuted: string; // 축 라벨 (--ink-3 급)
  up: string;
  down: string;
}

/**
 * 다중 심볼 오버레이의 시리즈 색 슬롯 — 순서 = symbols[] 입력 순서(범례와 1:1).
 * ★ 오버레이에서 색은 방향이 아니라 **심볼 식별자** (tone 의 teal/vermilion 방향
 *   의미와 별개 축 — 단일 심볼 방향색 표현은 midline 기준 fill 등 미래 확장,
 *   MVP 는 스트로크 = 슬롯 색). UI-3 2색 예외 원칙 안에서 4슬롯이 실용 상한.
 */
export function seriesStrokes(theme: ChartThemeTokens): string[] {
  return [theme.ink, theme.up, theme.down, theme.inkMuted];
}

/**
 * 위 seriesStrokes 의 CSS 변수 쌍둥이 — DOM 범례용 (캔버스는 해석된 실색, 범례는
 * var() 로 테마 토글 즉응). ★ 순서가 seriesStrokes 와 1:1 이어야 범례↔곡선 색이
 * 일치한다 — 등치는 chartFormat.test 가 박제.
 */
export const SERIES_STROKE_VARS = [
  "var(--ink)",
  "var(--up)",
  "var(--down)",
  "var(--ink-3)",
] as const;

// ─── uPlot 옵션 조립 ────────────────────────────────

export interface BuildChartOptionsParams {
  descriptor: ChartDescriptor;
  theme: ChartThemeTokens;
  width: number;
  height: number;
  /** 시리즈 라벨(심볼) — symbols[] 입력 순서. 색 슬롯과 1:1. */
  labels: string[];
}

/**
 * midline(1.0 균형선 / 0 contango 경계) 그리기 훅 — uPlot plugin 형태의 순수 팩토리.
 * 시맨틱(값)은 descriptor 소유, 픽셀(색·점선)은 여기(form) 소유.
 */
export function midlinePlugin(value: number, stroke: string) {
  return {
    hooks: {
      draw: (u: {
        ctx: CanvasRenderingContext2D;
        valToPos: (v: number, scale: string, canvas?: boolean) => number;
        bbox: { left: number; top: number; width: number; height: number };
        scales: Record<string, { min?: number | null; max?: number | null }>;
      }) => {
        try {
          const y = u.scales.y;
          // midline 이 현재 y 범위 밖이면 그리지 않음 (화면 왜곡 방지).
          if (y?.min == null || y?.max == null) return;
          if (value < y.min || value > y.max) return;
          const px = u.valToPos(value, "y", true);
          const { ctx, bbox } = u;
          ctx.save();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(bbox.left, px);
          ctx.lineTo(bbox.left + bbox.width, px);
          ctx.stroke();
          ctx.restore();
        } catch {
          // 기준선은 장식 — 실패해도 차트 본체는 살린다 (graceful).
        }
      },
    },
  };
}

/**
 * uPlot 옵션 조립 — 저사양 절제 프리셋.
 * 커서/legend off(wheel 소유권 = React Flow 캔버스 줌 — `nowheel` 금지),
 * 축 값 포맷 = descriptor.formatValue(시맨틱 레이어 파생).
 */
export function buildChartOptions(params: BuildChartOptionsParams): UplotOptions {
  const { descriptor, theme, width, height, labels } = params;
  const strokes = seriesStrokes(theme);

  const series: Series[] = [
    {}, // x
    ...labels.map((label, i): Series => {
      const stroke = strokes[i % strokes.length]!;
      return {
        label,
        stroke,
        width: 1,
        spanGaps: false, // null=gap — 없는 데이터를 이어 그리지 않는다 (crypto-domain)
        points: { show: false }, // 저사양 — 포인트 마커 off
        ...(descriptor.seriesStyle === "area"
          ? { fill: withAlpha(stroke, 0.12) }
          : {}),
      };
    }),
  ];

  const plugins =
    descriptor.midline !== undefined
      ? [midlinePlugin(descriptor.midline, theme.inkMuted)]
      : [];

  return {
    width,
    height,
    // 저사양: 커서/셀렉트/legend 전부 off — 인터랙션 wheel 은 React Flow 소유.
    cursor: { show: false, drag: { x: false, y: false } },
    legend: { show: false },
    select: { show: false, left: 0, top: 0, width: 0, height: 0 },
    // pxRatio: uPlot 1.6.32 는 옵션도 정적 설정도 불가(클로저 변수, 2026-07-09 정정)
    //   — DPR 네이티브 렌더 수용. 표시 크기는 uPlot.min.css(canvas 100%)가 담당.
    series,
    scales: {
      x: { time: true },
      // 0 앵커 금지 (OI/비율 전부) — 데이터 범위 auto-scale (crypto-domain).
      y: { auto: true },
    },
    axes: [
      {
        stroke: theme.inkMuted,
        grid: { stroke: theme.inkFaint, width: 1 },
        ticks: { stroke: theme.inkFaint },
        font: "10px JetBrains Mono, monospace",
      },
      {
        stroke: theme.inkMuted,
        grid: { stroke: theme.inkFaint, width: 1 },
        ticks: { stroke: theme.inkFaint },
        font: "10px JetBrains Mono, monospace",
        size: 64, // 값 라벨 폭 (formatValue 문자열)
        values: (_u: unknown, ticks: number[]) =>
          ticks.map((v) => descriptor.formatValue(v)),
      },
    ],
    plugins,
  } as UplotOptions;
}

/**
 * 색 문자열에 알파 적용 — area fill 용. oklch/hex 모두 색공간 함수로 감싼다
 * (canvas 는 `color-mix` 미지원 브라우저가 있어 단순 접근: oklch 는 `/ alpha`
 * 삽입이 안전하지 않아 rgba fallback 대신 **투명도는 8자리 hex 일 때만** 적용,
 * 그 외(oklch 등)는 원색 유지 + 브라우저의 globalAlpha 미사용 — MVP 절제).
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${a}`;
  }
  if (/^oklch\(/.test(hex) && !hex.includes("/")) {
    // oklch(L C H) → oklch(L C H / a) — CSS Color 4 문법, canvas 지원 브라우저 대상.
    return hex.replace(/\)\s*$/, ` / ${alpha})`);
  }
  return color; // 미지 형식 — 원색 유지 (graceful)
}

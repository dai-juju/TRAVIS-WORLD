// apps/web/lib/cards/chartFormat.ts
//
// Chart form 의 픽셀 매핑 — 순수 함수 (Composable 사이클 2 Step 4, 2026-07-08).
//
// chartDescriptors(시맨틱: 무엇을 어떤 의미로) → 여기(픽셀: uPlot 옵션·정렬 데이터·
// 다운샘플·색 슬롯) → useUplot(생명주기) → ChartCard(form 조립) 4분할의 두 번째 층.
// tableCardFormat/feedCardFormat 동형 — React/DOM/uPlot **인스턴스를 만들지 않는다**.
// (value import 는 paths 팩토리(bars/stepped) 접근용 — uPlot 모듈 top-level 은 domEnv
//  가드라 SSR/vitest 안전 실측, 사이클 2 Step 6. 인스턴스 생성은 여전히 useUplot 전용.)
// 전 함수 순수 = 단위 테스트 직접 대상.
//
// ─── 저사양(UHD620) 절제 원칙 (nextjs-frontend 자문 2026-07-08) ───
//   - 다운샘플: 컨테이너 픽셀폭 기준 ~2 point/px (최대 성능 레버).
//   - 커서/애니메이션/legend 전부 off — wheel 소유권은 React Flow 캔버스 줌.
//   - null 은 gap (spanGaps:false — COINM global 미제공 등, crypto-domain 판정).

import uPlot from "uplot";
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
 * 플로팅 툴팁 플러그인 — 호버 시 커서 옆에 시간+심볼별 값 박스 (사용자 UIUX 결정
 * 2026-07-09, Binance 식). uPlot 소유 DOM(u.over 자식)이라 React 밖 명령형 격리 —
 * CSS 는 var() 참조(테마 토글 즉응). 값 포맷 = descriptor.formatValue(시맨틱 파생).
 * 저사양: setCursor 마다 textContent+transform 만 갱신(레이아웃 스래싱 없음).
 */
export function tooltipPlugin(
  descriptor: ChartDescriptor,
  labels: string[],
) {
  let tip: HTMLDivElement | null = null;
  return {
    hooks: {
      init: (u: { over: HTMLElement }) => {
        try {
          tip = document.createElement("div");
          tip.style.cssText =
            "position:absolute;top:0;left:0;pointer-events:none;display:none;" +
            "z-index:20;padding:4px 7px;white-space:nowrap;" +
            "font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.5;" +
            "background:var(--paper);color:var(--ink);" +
            "border:1px solid var(--ink-5);border-radius:4px;";
          u.over.appendChild(tip);
        } catch {
          tip = null; // 툴팁 생성 실패 = 차트만 유지 (crash 금지)
        }
      },
      setCursor: (u: {
        over: HTMLElement;
        cursor: { idx?: number | null; left?: number; top?: number };
        data: ArrayLike<ArrayLike<number | null>>;
      }) => {
        if (!tip) return;
        try {
          const idx = u.cursor.idx;
          const left = u.cursor.left ?? -1;
          const top = u.cursor.top ?? -1;
          if (idx == null || left < 0) {
            tip.style.display = "none";
            return;
          }
          const ts = u.data[0]?.[idx];
          // [10-99] 툴팁 헤더 = hover 당 1회 표시라 "UTC" 접미 부착 지점으로 적합.
          const timeLabel =
            typeof ts === "number" ? `${formatChartTime(ts * 1000)} UTC` : "—";
          const lines = [timeLabel];
          for (let s = 0; s < labels.length; s++) {
            const v = u.data[s + 1]?.[idx];
            const valueText = descriptor.formatValue(
              typeof v === "number" ? v : null,
            );
            // 단일 심볼은 값만, 오버레이는 심볼 라벨 병기 (범례와 1:1 순서).
            lines.push(
              labels.length > 1 ? `${labels[s]}  ${valueText}` : valueText,
            );
          }
          tip.textContent = "";
          for (const line of lines) {
            const row = document.createElement("div");
            row.textContent = line;
            tip.appendChild(row);
          }
          tip.style.display = "block";
          // 커서 우측 12px — 우측 경계에 닿으면 좌측으로 뒤집기 (라인 가림 최소화).
          const overW = u.over.clientWidth;
          const tipW = tip.offsetWidth;
          const flip = left + 12 + tipW > overW;
          const x = flip ? Math.max(0, left - 12 - tipW) : left + 12;
          const y = Math.max(0, Math.min(top - 8, u.over.clientHeight - tip.offsetHeight));
          tip.style.transform = `translate(${x}px, ${y}px)`;
        } catch {
          tip.style.display = "none"; // 어떤 실패도 차트를 못 건드림
        }
      },
      destroy: () => {
        try {
          tip?.remove();
        } catch {
          // ignore
        }
        tip = null;
      },
    },
  };
}

/**
 * 차트 시간 라벨(날짜+시각, **UTC**) — 툴팁 + freshness 24h+ 날짜 병기([10-92]②)가 공유.
 * [10-99] 절대 시각 = 전 앱 UTC 통일 — 값만 포맷하고 "UTC" 라벨은 소비처(툴팁 접미 /
 * ChartCard freshness 조립)가 1회 부착. 정책 = canonical-metrics.md §시각 표기.
 */
export function formatChartTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

// ─── y축 라벨 폭 (동적 산정) ─────────────────────────
//
// ★ 고정 size:64 회귀 금지 ([10-92]④ + 라이브 G2 신규 결함 2026-07-10): 라벨이
//   가용 폭을 넘으면 캔버스 왼쪽 밖으로 잘리는데, 잘리는 첫 글자가 하필 부호라
//   "-0.00500%" 가 "0.00500%" 로 보였다(음수 펀딩을 양수로 오독 = misread 부류).
//   OI 의 ",000,000" 잘림도 같은 뿌리 — 최장 라벨 실측으로 폭을 정한다.

/** 축 라벨 폰트 — buildChartOptions 의 axes[].font 와 동일해야 실측이 유효. */
const AXIS_FONT = "10px JetBrains Mono, monospace";

/** 라벨 폭 실측용 공유 ctx — 최초 1회 생성, 실패/미지원 환경은 null 고정. */
let axisMeasureCtx: CanvasRenderingContext2D | null | undefined;

/** 한 라벨의 CSS px 폭 — canvas 실측, 불가 환경(jsdom 등)은 mono 10px 근사(6px/자). */
function measureAxisLabel(text: string): number {
  if (axisMeasureCtx === undefined) {
    try {
      axisMeasureCtx = document.createElement("canvas").getContext("2d");
    } catch {
      axisMeasureCtx = null;
    }
  }
  if (axisMeasureCtx) {
    try {
      axisMeasureCtx.font = AXIS_FONT;
      const w = axisMeasureCtx.measureText(text).width;
      if (Number.isFinite(w) && w > 0) return w;
    } catch {
      // 측정 실패 — 아래 근사 폭으로 폴백 (graceful)
    }
  }
  return text.length * 6; // JetBrains Mono 10px advance ≈ 6px
}

/**
 * y축 전체 폭(px) = 최장 라벨 실측 + tick(10)+gap(5)+여유(6). values 미확정(초기
 * 레이아웃 패스)은 64 폴백. 하한 40 — 빈/짧은 라벨에서 축이 소멸하지 않게.
 */
export function yAxisSize(values: readonly string[] | null | undefined): number {
  if (!values || values.length === 0) return 64;
  let maxW = 0;
  for (const v of values) maxW = Math.max(maxW, measureAxisLabel(String(v)));
  return Math.max(Math.ceil(maxW) + 21, 40);
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
      // ★ React Flow 줌 보정 (라이브 G2 신규 결함 2026-07-10): uPlot 은 마우스
      //   오프셋(시각 px)을 자기 논리 폭 px 로 그대로 해석 — 캔버스 줌 0.69 에서
      //   우측 끝 hover 가 69% 지점(주 단위로 다른 날짜!)에 스냅했고, 시간축 뒤쪽
      //   31%(최신 구간)는 도달 자체가 불가였다. 시각/논리 비율로 나눠 좌표계 통일.
      //   줌=1 이면 비율 1 = no-op. getBoundingClientRect 는 transform 반영(시각),
      //   offsetWidth 는 미반영(논리) — 이 차이가 곧 React Flow scale.
      move: (
        u: { over: HTMLElement },
        left: number,
        top: number,
      ): [number, number] => {
        try {
          const r = u.over.getBoundingClientRect();
          const w = u.over.offsetWidth;
          const h = u.over.offsetHeight;
          const sx = w > 0 && r.width > 0 ? r.width / w : 1;
          const sy = h > 0 && r.height > 0 ? r.height / h : 1;
          return [left / sx, top / sy];
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

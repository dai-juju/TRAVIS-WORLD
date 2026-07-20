// apps/web/lib/cards/chart/align.ts
//
// 데이터 정렬/다운샘플 (SeriesGroup[] → uPlot AlignedData) — chartFormat 분할
// (M3-step3b Step 0, 2026-07-20, [10-98] 회수). 순수 이동: 로직 원본 그대로.

import type { AlignedData } from "uplot";
import type { SeriesGroup } from "@/lib/dataService";

/** 다중 필드 정렬 사양 — invert 는 표시층 부호 반전(다이버징 대향, [10-121]). */
interface AlignFieldSpec {
  field: string;
  invert?: boolean;
}

/**
 * 심볼별 곡선들을 uPlot 정렬 데이터로 변환.
 * - x = 전 곡선 timestamp 의 합집합(오름차순, epoch 초 — uPlot 기본 단위).
 * - 각 곡선 y = 해당 timestamp 에 값 없으면 null(gap). 숫자 아닌 값도 null.
 * - 훅(oldest-first 보증) 계약 전제 — 여기서 재정렬하지 않음(합집합 정렬만).
 *
 * ★ 다중 필드 ([10-121] M3-step3b, 2026-07-20): valueFields 에 배열을 주면 한 행의
 *   여러 컬럼(long/short_notional)이 각각 시리즈가 된다. 시리즈 순서 = groups 외측
 *   × fields 내측 (실사용은 "N그룹×1필드" 또는 "1그룹×M필드" 둘뿐 — resolvePlotSpecs
 *   가 오버레이×성분 조합을 total 폴백으로 차단). 문자열 하나 = 기존 거동 완전 불변.
 * ★ invert 는 **숫자에만** `-v` — null 은 null 그대로(gap). "0으로 plot 금지" 규칙과
 *   무충돌: 반전은 값 생성이 아니라 표시층 부호 변환이다(툴팁은 원값으로 복원).
 */
export function buildAlignedData<T extends Record<string, unknown>>(
  groups: SeriesGroup<T>[],
  timeField: string,
  valueFields: string | ReadonlyArray<AlignFieldSpec>,
): AlignedData {
  const fieldSpecs: ReadonlyArray<AlignFieldSpec> =
    typeof valueFields === "string" ? [{ field: valueFields }] : valueFields;
  // timestamp 합집합 (epoch 초). 파싱 불가 행은 제외 (graceful).
  const tsSet = new Set<number>();
  const perSeries: Map<number, number | null>[] = groups.flatMap((g) => {
    const maps = fieldSpecs.map(() => new Map<number, number | null>());
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
      for (let fi = 0; fi < fieldSpecs.length; fi++) {
        const spec = fieldSpecs[fi]!;
        const v = row[spec.field];
        const num =
          typeof v === "number" && Number.isFinite(v)
            ? spec.invert
              ? -v
              : v
            : null;
        maps[fi]!.set(sec, num);
      }
    }
    return maps;
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

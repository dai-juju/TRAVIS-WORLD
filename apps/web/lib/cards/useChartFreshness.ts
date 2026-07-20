// apps/web/lib/cards/useChartFreshness.ts
//
// ChartCard 의 데이터 상태 파생 훅 (freshness + 부분 결측) — ChartCard 분할
// (M3-step3b Step 0, 2026-07-20, [10-120]① 회수). 순수 이동: 로직·주석 원본 그대로.

import { useMemo } from "react";
import type { ChartDescriptor } from "@/lib/cards/chartDescriptors";
import { formatChartTime } from "@/lib/cards/chart/time";
import type { SeriesGroup } from "@/lib/dataService";
import { useNow } from "@/lib/hooks/useNow";
import { formatEventTime } from "@/lib/format/marketUnits";
import { formatRelativeTime } from "@/lib/format/relativeTime";

export function useChartFreshness<T extends Record<string, unknown>>(
  series: SeriesGroup<T>[],
  descriptor: ChartDescriptor | undefined,
) {
  // ── freshness: 마지막 "데이터 포인트" 시각 (fetch 시각 아님 — 사용자 결정 2026-07-09).
  //   forward-fill 순회 lag([10-35])로 우측 끝이 수 시간 전일 수 있어, 표기 없이 두면
  //   "지금 데이터"로 오인 = 신뢰 문제 (crypto-trader E). ISO(+00:00 고정 포맷) 문자열
  //   그룹 간 최댓값은 Date.parse 숫자 비교(reviewer W1 — buildAlignedData 와 해석
  //   방식 통일: 문자열 사전식은 "Z" vs "+00:00" 포맷 갈림에 무음 취약). now 는
  //   useNow 5s 틱(렌더 중 Date.now() impure 회피 — IndicatorCard freshness 선례).
  const now = useNow();
  const lastPointIso = useMemo(() => {
    const timeField = descriptor?.timeField;
    if (!timeField) return null;
    let latestIso: string | null = null;
    let latestMs = -Infinity;
    for (const g of series) {
      const raw = g.rows[g.rows.length - 1]?.[timeField];
      if (typeof raw !== "string") continue;
      const ms = Date.parse(raw);
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
        latestIso = raw;
      }
    }
    return latestIso;
  }, [series, descriptor]);
  // 24h 이상 지난 포인트는 시각만으론 어제/그제 구분 불가 → 날짜 병기 ([10-92]②,
  // crypto-trader S1 적중 — 라이브 1d 토글에서 "09:00:00 (1D AGO)" 가 어느 날인지 모호).
  const lastPointMs = lastPointIso ? Date.parse(lastPointIso) : NaN;
  const lastPointLabel =
    lastPointIso && Number.isFinite(lastPointMs)
      ? now - lastPointMs >= 86_400_000
        ? formatChartTime(lastPointMs)
        : formatEventTime(lastPointIso)
      : null;
  // [10-99] 절대 시각 = UTC — 라벨은 두 경로(24h± 포매터) 공통으로 여기서 1회 부착.
  const freshness = lastPointLabel
    ? `last point ${lastPointLabel} UTC (${formatRelativeTime(lastPointIso, now)})`
    : null;

  // ★ 부분 결측 감지 (code-reviewer C2, 2026-07-19) — descriptor 가 무결성 컬럼을
  //   선언한 datasource 만. 값이 **전부** 결측인 버킷은 SUM 이 NULL 이라 gap 으로
  //   정직하게 빠지지만, **일부만** 결측이면 막대가 그려지되 조용히 과소 표시된다.
  //   그 창을 보고 있을 때만 고지를 승격한다(상시 경고는 늑대소년).
  const hasIncompleteBuckets = useMemo(() => {
    const field = descriptor?.integrityField;
    if (!field) return false;
    return series.some((g) =>
      g.rows.some((r) => {
        const v = Number((r as Record<string, unknown>)[field]);
        return Number.isFinite(v) && v > 0;
      }),
    );
  }, [series, descriptor]);

  return { freshness, hasIncompleteBuckets };
}

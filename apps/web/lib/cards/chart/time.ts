// apps/web/lib/cards/chart/time.ts
//
// 시간/주기 헬퍼 — chartFormat 분할 (M3-step3b Step 0, 2026-07-20, [10-98] 회수).
// 순수 이동: 로직·시그니처·기본값 전부 chartFormat.ts(사이클 2 Step 4) 원본 그대로.

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

/**
 * 시간창 절단 감지 (code-reviewer W1, M3-step3b 2026-07-20).
 *
 * ★ 왜 필요한가: fetch 두 경로(rpc/table) 모두 "창 안에서 최신 N개"(DESC limit)라,
 *   AI 시간창(fromIso)이 limit×interval 보다 넓으면 **창 앞부분이 조용히 잘린다** —
 *   subtitle 은 "Jul 1–20"인데 화면은 7일치만 = 요청≠표시 신뢰 갭. 동작 자체는
 *   합리적(포인트 상한은 픽셀 인프라 한계)이므로 자르되, **무음이면 안 된다**.
 *
 * 판정: 어떤 그룹이든 (rows 가 limit 에 꽉 참) ∧ (가장 오래된 포인트가 요청 from
 * 보다 1버킷 초과 늦음) 이면 절단. rows 는 oldest-first 계약(rows[0] = 최고령).
 */
export function isSeriesWindowTrimmed(
  groups: ReadonlyArray<{ rows: ReadonlyArray<Record<string, unknown>> }>,
  timeField: string,
  fromIso: string,
  maxPoints: number,
  bucketMs: number | null,
): boolean {
  const fromMs = new Date(fromIso).getTime();
  if (Number.isNaN(fromMs)) return false;
  const tolerance = bucketMs ?? 0;
  return groups.some((g) => {
    if (g.rows.length < maxPoints) return false; // limit 미도달 = 창을 다 담음
    const raw = g.rows[0]?.[timeField];
    const ms =
      typeof raw === "string" || typeof raw === "number"
        ? new Date(raw).getTime()
        : NaN;
    return Number.isFinite(ms) && ms - fromMs > tolerance;
  });
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

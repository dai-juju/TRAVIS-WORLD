// useChartScope 순수 함수 테스트 (M3-step3b, 2026-07-20).
//
// resolveChartTimeRange — AI filters 의 시간축 범위 연산자 → 절대 시간창 번역
// ([10-120]② 배선의 카드 층 진입점). 훅 본체는 ChartCard.test(렌더 매트릭스)가 커버.

import { describe, expect, it } from "vitest";
import { resolveChartTimeRange } from "../useChartScope";

const f = (field: string, operator: string, value: unknown) => ({
  field,
  operator,
  value,
});

describe("resolveChartTimeRange — 연산자 표 ([10-120]②)", () => {
  it(">=/> → fromIso, <=/< → toIso (>` 는 inclusive 근사)", () => {
    expect(
      resolveChartTimeRange(
        [
          f("bucket_time", ">=", "2026-07-20T02:00:00Z"),
          f("bucket_time", "<=", "2026-07-20T08:00:00Z"),
        ],
        "bucket_time",
      ),
    ).toEqual({
      fromIso: "2026-07-20T02:00:00.000Z",
      toIso: "2026-07-20T08:00:00.000Z",
    });
    expect(
      resolveChartTimeRange([f("bucket_time", ">", "2026-07-20T02:00:00Z")], "bucket_time"),
    ).toEqual({ fromIso: "2026-07-20T02:00:00.000Z" });
    expect(
      resolveChartTimeRange([f("bucket_time", "<", "2026-07-20T08:00:00Z")], "bucket_time"),
    ).toEqual({ toIso: "2026-07-20T08:00:00.000Z" });
  });

  it("복수 제약 = 교집합 (from 은 max, to 는 min)", () => {
    expect(
      resolveChartTimeRange(
        [
          f("recorded_at", ">=", "2026-07-20T01:00:00Z"),
          f("recorded_at", ">=", "2026-07-20T03:00:00Z"), // 더 좁은 from
          f("recorded_at", "<=", "2026-07-20T10:00:00Z"),
          f("recorded_at", "<", "2026-07-20T08:00:00Z"), // 더 좁은 to
        ],
        "recorded_at",
      ),
    ).toEqual({
      fromIso: "2026-07-20T03:00:00.000Z",
      toIso: "2026-07-20T08:00:00.000Z",
    });
  });

  it("다른 필드/등치 연산자/파싱 불가 값은 무시 — 시간창 무관 필터와 공존 (graceful)", () => {
    expect(
      resolveChartTimeRange(
        [
          f("side", "=", "SELL"), // 시간축 아님
          f("bucket_time", "=", "2026-07-20T02:00:00Z"), // 등치 — 범위 아님(미광고)
          f("bucket_time", ">=", "not-a-date"), // 파싱 불가
          f("bucket_time", ">=", "2026-07-20T02:00:00Z"),
        ],
        "bucket_time",
      ),
    ).toEqual({ fromIso: "2026-07-20T02:00:00.000Z" });
  });

  it("filters/timeField 부재 = 빈 창 (기존 lookback 경로 무영향)", () => {
    expect(resolveChartTimeRange(undefined, "bucket_time")).toEqual({});
    expect(resolveChartTimeRange([f("bucket_time", ">=", "2026-07-20T02:00:00Z")], undefined)).toEqual({});
    expect(resolveChartTimeRange([], "bucket_time")).toEqual({});
  });

  it("epoch ms 숫자 값도 수용 (ISO 로 정규화)", () => {
    expect(
      resolveChartTimeRange(
        [f("recorded_at", ">=", Date.UTC(2026, 6, 20, 2))],
        "recorded_at",
      ),
    ).toEqual({ fromIso: "2026-07-20T02:00:00.000Z" });
  });
});

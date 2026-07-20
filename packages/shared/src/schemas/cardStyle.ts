/**
 * CardStyle — AI 계약의 "표현 스타일" 축 (사이클 4a `[10-101]`, 2026-07-12).
 *
 * 배경: seriesStyle(line/area/bars)이 chartDescriptors(시맨틱 레이어)에 고정돼
 *   유저가 "funding as a simple line chart" 를 요구해도 표현할 통로가 없었다.
 *   PRD §2 "쿼리 자유도"(모든 데이터 × 모든 form × 표현 스타일) 실현 축.
 *
 * 설계 (Plan 자문 Q1, 2026-07-12):
 * - top-level `style` 객체 — data(무엇을 fetch)가 아닌 표현 계층(Form↔Data 직교).
 *   미래 스타일 축(표 밀도·피드 컴팩트 등)은 이 객체 내부로만 확장 —
 *   top-level 키 산탄 방지.
 * - descriptor 의 seriesStyle 은 **default(도메인 관례)로 강등** — AI 가 유저의
 *   명시 요구를 받았을 때만 override. 도메인 가드레일(tone 방향색/midline 기준선)은
 *   스타일과 직교라 descriptor 소유 불변.
 * - "stepped" 는 enum 에 없음 — 오버레이 겹침 판독 불가 시 form 이 자동 전환하는
 *   픽셀 정책(form 소유)이지 유저가 고르는 스타일이 아니다 (chartFormat 참조).
 */

import { z } from "zod";

/** 시리즈 렌더 스타일 — web chartDescriptors.ChartSeriesStyle 과 단일 진실. */
export const SeriesStyleSchema = z.enum(["line", "area", "bars"]);

export type SeriesStyle = z.infer<typeof SeriesStyleSchema>;

/**
 * 카드 표현 스타일 다이얼 묶음. 전부 optional — 생략 = 도메인 기본(descriptor).
 * 스타일을 소비하지 않는 컴포넌트에 오면 form 이 무시(graceful, 데이터 무영향).
 */
export const CardStyleSchema = z
  .object({
    series: SeriesStyleSchema.optional().describe(
      // 다이얼의 기능 사실만 — "어떤 쿼리면 어떤 값" 정책 금지 (limit describe 동형).
      'Rendering style override for TRAVIS-drawn time-series charts. Omit to use the metric\'s domain-default style; set only when the user explicitly asks for a specific style (e.g. "as a line chart").',
    ),
    // ── breakdown ([10-121] M3-step3b, 2026-07-20) ──
    //   표현 축 — fetch 는 완전 동일(집계 RPC 가 성분 컬럼을 항상 반환), 어느 컬럼을
    //   플롯하느냐만 다름. subset 축(filters side=)과 직교: side 필터가 데이터 자체를
    //   한쪽으로 좁히면 성분분해가 무의미하므로 form 이 breakdown 을 무시한다.
    //   describe 는 기능 사실만 (큐레이션 금지 — series describe 동형).
    breakdown: z
      .enum(["total", "components"])
      .optional()
      .describe(
        "For time-series metrics with domain-defined components (e.g. long vs short " +
          "liquidation volume): 'components' plots the components as opposing series " +
          "in one chart sharing one axis — fits requests to see the parts separately. " +
          "'total' plots the single aggregate — set it when the user asks for one " +
          "combined/overall series. Omit to use the metric's domain default. Ignored " +
          "when a filter already narrows the data to one component, when the metric " +
          "has no components, or when multiple symbols are overlaid in one chart " +
          "(per-symbol totals are shown).",
      ),
  })
  .strict();

export type CardStyle = z.infer<typeof CardStyleSchema>;

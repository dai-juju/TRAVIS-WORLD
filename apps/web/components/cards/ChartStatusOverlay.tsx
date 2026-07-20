"use client";
/**
 * ChartStatusOverlay — ChartCard 의 오버레이 계층 (M3-step3b Step 0 분할, 2026-07-20,
 * [10-120]① 회수). 순수 이동: 렌더 분기·주석 원본(ChartCard.tsx) 그대로.
 *
 * 부모(ChartCard)의 relative 컨테이너 안에서 3겹을 그린다:
 *   ① x축 상시 "UTC" 표식 ② descriptor disclosure(데이터 한계 상시 고지)
 *   ③ 상태 오버레이(coming soon → missing scope → loading → error → no data).
 */

import { LoadingOrStale, StatusLine } from "@/components/cards/TableCardStatus";
import { COMING_SOON_LABEL } from "@/lib/cards/renderableDatasource";
import type { DataServiceStatus } from "@/lib/dataService";

interface ChartStatusOverlayProps {
  renderable: boolean;
  hasDescriptor: boolean;
  missingMarketScope: boolean;
  hasScopeTarget: boolean;
  hasData: boolean;
  status: DataServiceStatus;
  stale: boolean;
  disclosure: string | undefined;
  hasIncompleteBuckets: boolean;
}

export function ChartStatusOverlay({
  renderable,
  hasDescriptor,
  missingMarketScope,
  hasScopeTarget,
  hasData,
  status,
  stale,
  disclosure,
  hasIncompleteBuckets,
}: ChartStatusOverlayProps) {
  return (
    <>
      {/* [10-109]① x축 상시 "UTC" 표식 (M3-step1 웜업, 2026-07-16) — 눈금 값의
          타임존 단서를 hover(툴팁) 없이 상시 노출 (TradingView 하단 타임존 표시
          관례). pointer-events-none = 차트 커서/툴팁 무간섭. 상태 오버레이(z-10,
          paper bg)가 뜨면 자연히 가려진다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-1 bottom-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-[color:var(--ink-4)]"
      >
        UTC
      </span>
      {/* [10-84] 데이터 한계 상시 고지 (M3-step3a, 2026-07-19) — descriptor 가
          선언한 datasource 만. ★ 차트는 y축 자체가 "이 구간의 총액"을 암시해
          피드보다 오독 대가가 크다 → AI subtitle 위임에만 의존하지 않고 시맨틱
          레이어가 바닥선을 보장(crypto-domain 판정). form 은 "있으면 그린다"만
          안다 = 하드코딩 0. pointer-events-none 으로 차트 커서 무간섭. */}
      {disclosure && hasData && (
        <span
          className="pointer-events-none absolute bottom-0.5 left-1 max-w-[75%] truncate font-mono text-[8px] uppercase tracking-[0.1em] text-[color:var(--ink-4)]"
          title={
            hasIncompleteBuckets
              ? `${disclosure} Some points in this window are incomplete (missing values were skipped).`
              : disclosure
          }
        >
          {disclosure}
          {hasIncompleteBuckets && " · some points incomplete"}
        </span>
      )}
      {/* 상태 오버레이 — absolute 로 차트 위에 정확히 겹침 (reviewer S4:
          normal-flow 형제면 차트 div 가 안내문을 밀어냄). */}
      {(!renderable ||
        !hasDescriptor ||
        missingMarketScope ||
        !hasScopeTarget ||
        !hasData) && (
        // z-10: 마운트 div 도 absolute 라 paint 순서를 DOM 순서에 안 맡기고 명시.
        <div className="absolute inset-0 z-10 flex items-start bg-[color:var(--paper)]">
          {!renderable || !hasDescriptor ? (
            <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
          ) : missingMarketScope ? (
            // marketType 누락 = 위 가드가 fetch 자체를 차단한 상태 (500 원천 차단).
            <StatusLine tone="neutral">missing market scope</StatusLine>
          ) : !hasScopeTarget ? (
            // ★ 유일한 1차 방어선 (reviewer W1, 2026-07-09): 현재 스키마는 chart-card
            //   의 symbol 존재를 강제하지 않음 — 주기 pull·비-토픽 카드라 superRefine
            //   (2.5) 대상 밖. shape 파생 강제는 [10-91]([10-78] 동류, Stage 1b/4).
            <StatusLine tone="neutral">missing symbol scope</StatusLine>
          ) : status === "error" ? (
            <StatusLine tone="down">! chart data error</StatusLine>
          ) : status === "loading" ? (
            <LoadingOrStale stale={stale} />
          ) : (
            // ready + 빈 시계열 = 이 창에 데이터 없음 (에러 아님 — 신규 상장/retention 밖).
            <StatusLine tone="neutral">no data in this window</StatusLine>
          )}
        </div>
      )}
    </>
  );
}

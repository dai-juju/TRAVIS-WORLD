"use client";
/**
 * FeedCard — 모양-제네릭 events 피드 (Composable Expressiveness Stage 3, ff#2 재개 Step 3).
 *
 * 역할:
 *   "어떤 events datasource 든 받는 하나의 피드(tape)." 시간순 도착 사건을 newest-first
 *   로 흘리며, 시각/배지/라벨/컬럼은 전부 feedDescriptors 레시피에서 파생한다.
 *   컴포넌트는 데이터 필드명을 모른다 — 옛 계획의 LiquidationFeedCard(데이터-잠금)를
 *   만들지 않은 이유. 뉴스·체결이 events 로 합류하면 descriptor 팩만 추가된다.
 *   PRD §3 `content` updateMode(항목 동적 추가/제거)의 첫 실사용 카드.
 *
 * 데이터 흐름 (경로 A 전용):
 *   useDataServiceFeed(append-only ring buffer, 불변식 A~F) ← ws_direct 토픽 직결.
 *   초기 fetch 없음 — 카드 생성 순간부터의 사건만 쌓인다(과거 범위 질의는 Table form 의
 *   몫 — "watch"=Feed / "biggest/recent 범위"=Table, AI 가 form 을 자율 선택).
 *
 * [10-73] filter forward-application (YAGNI 확정, 사용자 2026-07-05):
 *   훅의 filter 는 ref 라이브 적용이라 임계값 "강화" 시 기존 버퍼 항목이 잔류하지만,
 *   임계값은 AI 쿼리로만 조절(카드 내 라이브 컨트롤 없음) = 조건 변경은 새 카드 →
 *   잔류 문제가 원천적으로 없다. filterKey opt-in 은 만들지 않음.
 *
 * limit 의미 (링버퍼 상한):
 *   피드는 무한 스트림이라 "생략=전부" 개념이 없다 — 생략 시 훅 기본 100 은 AI 의도
 *   덮어쓰기가 아니라 ring buffer 인프라 상한(fetch 레이어의 DEFAULT_INITIAL_LIMIT 동격).
 *   AI 가 숫자를 지정하면 그 수가 버퍼 상한.
 *
 * 상태 분기 (전부 graceful, crash 금지):
 *   coming soon(미지원/레시피 없음) → offline(Phase A 휴면 = transport realtime)
 *   → connecting(loading) → listening(ready+빈 피드 = 조용한 장, 정상) → tape.
 */

import { memo, useCallback, useMemo } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  getFeedDescriptor,
  type FeedDescriptor,
  type FeedRow,
} from "@/lib/cards/feedDescriptors";
import {
  feedBadgeStyle,
  feedCellStyle,
  feedGridTemplateColumns,
  formatFeedTime,
  visibleFeedEvents,
} from "@/lib/cards/feedCardFormat";
import {
  COMING_SOON_LABEL,
  isDatasourceSupportedByComponent,
} from "@/lib/cards/renderableDatasource";
import { LoadingOrStale, StatusLine } from "@/components/cards/TableCardStatus";
import {
  resolveTransport,
  useDataServiceFeed,
  type FeedEvent,
} from "@/lib/dataService";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { evaluateFilters } from "@/lib/realtime/filterEvaluator";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

function FeedCardInner({ config }: CardComponentProps) {
  const { datasource, exchange, marketType, symbol, filters, limit } =
    config.data;

  // 표시 레시피 — 렌더 게이트 아님 (권한 진실 = registry dataShapes, TableCard 동형).
  const descriptor = useMemo(() => getFeedDescriptor(datasource), [datasource]);
  const renderable = isDatasourceSupportedByComponent(
    config.componentId,
    datasource,
  );

  // Phase A 휴면(transport realtime) ↔ 라이브(ws_direct) 구분 — 빈 상태 카피 분기용.
  const live = resolveTransport(datasource) === "ws_direct";

  // 토픽 selector — 필수 market_type + 선택 symbol (tape/심볼별 분기, ff#2 Step 1 ②).
  //   marketType 누락은 스키마(subscribesByTopic refine)가 이미 차단 — 여기는 방어선.
  const selector = useMemo(
    () =>
      marketType
        ? { market_type: marketType, ...(symbol ? { symbol } : {}) }
        : undefined,
    [marketType, symbol],
  );

  // AI filters 클라 평가 (피드는 fetch pushdown 없음 — 스트림 도착분에 적용) +
  //   exchange 스코프 (TableCard 스코핑 미러). 훅이 ref 라이브 적용(불변식 F).
  const filter = useCallback(
    (row: FeedRow) => {
      if (exchange && row.exchange !== exchange) return false;
      return evaluateFilters(row, filters);
    },
    [exchange, filters],
  );

  const { events, status } = useDataServiceFeed<FeedRow>({
    datasource,
    selector,
    filter,
    ...(limit !== undefined ? { limit } : {}),
    // selector 없음(marketType 누락)은 화면 분기가 안내 — 구독 자체를 막아 낭비/경고 제거 (reviewer S1).
    enabled: Boolean(datasource) && renderable && live && Boolean(selector),
  });

  // 표시 cap — 버퍼(AI limit=데이터 의도)와 분리된 form 픽셀 정책 (nextjs 자문 W1).
  const visible = visibleFeedEvents(events);

  const title = config.title ?? descriptor?.defaultTitle ?? "Feed";
  // sampled 고지는 AI subtitle 위임이 원칙 — AI 생략 시 안전망 기본값에도 명시.
  const subtitle = config.subtitle ?? `${events.length} events · sampled stream`;
  const kicker = config.kicker ?? descriptor?.kicker;
  const gridTemplate = descriptor ? feedGridTemplateColumns(descriptor) : "";
  // title 은 안정값 — flush(4Hz)마다 sanitize 정규식 재실행 방지 (nextjs 자문 S4).
  const safeTitle = useMemo(() => sanitizeTitle(title), [title]);

  const { stale } = useLoadingTimeout({
    hasData: events.length > 0,
    initialDelayMs: 8000,
  });

  return (
    <div className="flex h-full flex-col px-3 py-2 font-sans text-foreground">
      <header className="flex-shrink-0 border-b border-[color:var(--ink-5)] pb-2">
        {kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {kicker}
          </div>
        )}
        <h3
          className="mt-0.5 font-serif text-[18px] leading-tight tracking-tight"
          dangerouslySetInnerHTML={{ __html: safeTitle }}
        />
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {subtitle}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!renderable || !descriptor ? (
          <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
        ) : !live ? (
          // Phase A 과도기(워커 방송 전 플립 전) — 에러가 아닌 중립 안내.
          <StatusLine tone="neutral">live feed offline</StatusLine>
        ) : !selector ? (
          // 스키마가 차단하는 케이스의 런타임 방어선 (필수 selector 누락).
          <StatusLine tone="neutral">missing market scope</StatusLine>
        ) : status === "error" ? (
          <StatusLine tone="down">! live feed error</StatusLine>
        ) : status === "loading" && events.length === 0 ? (
          <LoadingOrStale stale={stale} />
        ) : events.length === 0 ? (
          // ready + 빈 피드 = 조용한 장 (정상 — 에러 아님).
          <StatusLine tone="neutral">listening — no events yet</StatusLine>
        ) : (
          <div role="table" className="w-full font-mono text-[11px]">
            {visible.map((event) => (
              <FeedCardRow
                key={event.seq}
                event={event}
                descriptor={descriptor}
                gridTemplate={gridTemplate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 피드 라인 1개 — [시각][배지][라벨][데이터 컬럼들] grid.
 * memo: flush 마다 배열은 새로 오지만 FeedEvent 객체 참조는 보존 → 기존 행 재렌더 skip.
 * 모든 표시 값은 React text node = 자동 escape (외부 payload 필드 XSS 방어).
 * (테스트 위해 export — 데이터 훅 없이 descriptor 렌더만 검증, TableCardRow 동형.)
 */
export const FeedCardRow = memo(function FeedCardRow({
  event,
  descriptor,
  gridTemplate,
}: {
  event: FeedEvent<FeedRow>;
  descriptor: FeedDescriptor;
  gridTemplate: string;
}) {
  const row = event.row;
  return (
    <div
      role="row"
      className="grid items-center gap-x-2 border-b border-[color:var(--ink-5)] py-1"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <span className="text-[color:var(--ink-3)]">
        {formatFeedTime(row, descriptor.timeField)}
      </span>
      <span className="font-semibold" style={feedBadgeStyle(descriptor, row)}>
        {descriptor.badge.text(row)}
      </span>
      <span className="truncate font-semibold text-foreground">
        {String(row[descriptor.labelField] ?? "—")}
      </span>
      {descriptor.columns.map((col) => (
        <span
          key={col.key}
          className="text-right tabular-nums"
          style={feedCellStyle(col, row)}
        >
          {col.value(row)}
        </span>
      ))}
    </div>
  );
});

export const FeedCard = memo(FeedCardInner);
FeedCard.displayName = "FeedCard";

export default FeedCard;

"use client";
/**
 * DetailCard — 모양-제네릭 단일-record "전 필드 리스트" form (Stage 1b Step 3, 2026-07-14).
 *
 * 역할:
 *   `record` shape datasource 의 **모든 필드**(role 무관 — primary 는 큰 줄, 나머지는
 *   label/value 양끝 정렬)를 세로 metric 리스트로 렌더한다. 옛 IndicatorCard(지표 5종
 *   전용)의 MetricLine 렌더를 계승하되, 어떤 record datasource 든 받는다 —
 *   티커 Detail("BTCUSDT 24h stats")이 이 일반화가 처음 여는 조합.
 *
 * BigValue 와의 분업 (role 소비 규약 — recordDescriptors 헤더):
 *   BigValue = "value at a glance"(primary/badge/secondary 만) / Detail = "full metric
 *   breakdown"(전 필드). 같은 descriptor pack 을 두 form 이 다르게 소비 — form 별
 *   descriptor 맵을 만들지 않는 것이 [10-74] 재발 방지의 핵심.
 *
 * 데이터 경로: useSingleRecord 공용 엔진 + useReconnectIndicator (BigValueCard 동형).
 * 렌더 게이트: registry dataShapes + !descriptor 방어선 2중 (기존 form 골격 동형).
 */

import { memo, useMemo } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import type { SymbolMeta } from "@/lib/hooks/useSymbolMeta";
import { defaultRecordSubtitle, toneColor } from "@/lib/cards/recordCardFormat";
import {
  getRecordDescriptor,
  resolveRecordTitle,
  type RecordDescriptor,
  type RecordField,
  type RecordRow,
} from "@/lib/cards/recordDescriptors";
import {
  COMING_SOON_LABEL,
  isDatasourceSupportedByComponent,
} from "@/lib/cards/renderableDatasource";
import { formatRelativeTime } from "@/lib/format/relativeTime";
import { useNow } from "@/lib/hooks/useNow";
import { useReconnectIndicator } from "@/lib/hooks/useReconnectIndicator";
import { useSingleRecord } from "@/lib/hooks/useSingleRecord";
import { useSymbolMeta } from "@/lib/hooks/useSymbolMeta";
import { sanitizeTitle } from "@/lib/sanitizeTitle";
import { LoadingOrStale, StatusLine } from "./TableCardStatus";

function DetailCardInner({ config }: CardComponentProps) {
  const { datasource, symbol, exchange, marketType } = config.data;

  const descriptor = useMemo(() => getRecordDescriptor(datasource), [datasource]);
  const renderable =
    isDatasourceSupportedByComponent(config.componentId, datasource) &&
    Boolean(descriptor) &&
    Boolean(symbol);

  const { data, status, stale } = useSingleRecord({
    binding: config.data,
    enabled: renderable,
    watchColumns: descriptor?.watchColumns,
  });

  const symbolMeta = useSymbolMeta({ exchange, marketType, symbol, enabled: renderable });
  const now = useNow(5000);
  const { reconnecting, showReconnectLabel } = useReconnectIndicator({
    status,
    hasData: Boolean(data),
    now,
  });

  // 헤더 — config(AI) 우선 ?? descriptor 안전망 (S2 순서 불변).
  const title =
    config.title ?? resolveRecordTitle(descriptor, { symbol }) ?? config.componentId;
  const kicker = config.kicker ?? descriptor?.kicker;
  const subtitle = config.subtitle ?? defaultRecordSubtitle(config.data);

  return (
    <div className="flex h-full flex-col px-4 py-3 font-sans text-foreground">
      <header className="flex-shrink-0">
        {kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {kicker}
          </div>
        )}
        <h3
          className="mt-1 font-serif text-[18px] leading-tight tracking-tight text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeTitle(title) }}
        />
        {subtitle && (
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
            {subtitle}
          </div>
        )}
      </header>

      <div className="mt-3 flex flex-1 flex-col">
        {!renderable || !descriptor ? (
          <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
        ) : status === "error" ? (
          <StatusLine tone="down">! realtime error</StatusLine>
        ) : !data ? (
          <LoadingOrStale stale={stale} />
        ) : (
          <>
            {/* 값 영역 — 재연결 중 흐림. freshness 라인은 래퍼 바깥(항상 선명). */}
            <div
              className={`flex flex-1 flex-col transition-opacity duration-300 ${
                reconnecting ? "opacity-40" : "opacity-100"
              }`}
            >
              <DetailBody descriptor={descriptor} row={data} meta={symbolMeta} />
            </div>
            <div className="mt-2 flex-shrink-0 font-mono text-[8px] uppercase tracking-[0.15em] text-[color:var(--ink-4)]">
              {showReconnectLabel
                ? "reconnecting…"
                : `updated ${formatRelativeTime(data.updated_at, now)}`}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 전 필드 리스트 본문 — 순수 표시 (테스트용 export). role 무관 전 필드를 필드
 * 선언 순서대로 렌더 (지표 pack 은 옛 IndicatorCard 와 동일 순서 — 등가 테스트 박제).
 */
export function DetailBody({
  descriptor,
  row,
  meta,
}: {
  descriptor: RecordDescriptor;
  row: RecordRow;
  meta: SymbolMeta | null;
}) {
  return (
    <dl className="flex flex-1 flex-col gap-1.5">
      {descriptor.fields.map((field) => (
        <MetricLine
          key={field.label}
          field={field}
          row={row}
          meta={meta}
          primary={field.role === "primary"}
        />
      ))}
    </dl>
  );
}

/** metric 한 줄 — primary 면 큰 글씨, 아니면 label/value 양끝 정렬 (옛 IndicatorCard 이식). */
function MetricLine({
  field,
  row,
  meta,
  primary,
}: {
  field: RecordField;
  row: RecordRow;
  meta: SymbolMeta | null;
  primary: boolean;
}) {
  const tone = field.tone?.(row) ?? "neutral";
  const value = field.value(row, meta);
  const hintBadge = field.hint ? (
    <span
      className="ml-1 border border-[color:var(--ink-4)] px-1 py-0 text-[8px] uppercase tracking-[0.1em] text-[color:var(--ink-4)]"
      title={field.hintTitle}
    >
      {field.hint}
    </span>
  ) : null;

  if (primary) {
    return (
      <div className="flex flex-col">
        <dt className="font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {field.label}
        </dt>
        <dd
          className="font-serif text-[32px] leading-[0.95] tracking-tight tabular-nums"
          style={{ color: toneColor(tone) }}
        >
          {value}
          {hintBadge}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
        {field.label}
      </dt>
      <dd
        className="font-mono text-[12px] tabular-nums"
        style={{ color: toneColor(tone) }}
      >
        {value}
        {hintBadge}
      </dd>
    </div>
  );
}

export const DetailCard = memo(DetailCardInner);
DetailCard.displayName = "DetailCard";

export default DetailCard;

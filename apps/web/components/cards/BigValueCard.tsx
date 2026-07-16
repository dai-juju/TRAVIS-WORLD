"use client";
/**
 * BigValueCard — 모양-제네릭 단일-record "대표값 강조" form (Stage 1b Step 2, 2026-07-14).
 *
 * 역할:
 *   `record` shape(한 대상의 여러 필드) datasource 를 recordDescriptors 의 role 축으로
 *   소비한다: primary=huge 값(+flashField raw 변동 flash) / badge=테두리 뱃지(표시문자열
 *   변경 flash) / secondary=보조 mono 라인 / detail=표시 안 함(Detail form 소관).
 *   옛 TickerCard(티커 전용 하드코딩)의 시각·거동을 무회귀 이식하되, 어떤 record
 *   datasource 든("BTC open interest as big number" — PRD §2 비전 문장) 받는다.
 *
 * 데이터 경로:
 *   useSingleRecord 공용 엔진 (경로 A ws_direct → 자동 폴백 경로 B) — 옛 두 카드의
 *   동형 중복을 이식한 훅. 재연결 표시 = useReconnectIndicator (옵션 C).
 *
 * Flash 애니메이션 (React 19 `react-hooks/set-state-in-effect` 회피 — ref+classList):
 *   - primary: descriptor.flashField 의 raw 값 변동 (옛 TickerCard 가격 flash verbatim).
 *     지표 pack 은 flashField 생략 = flash 없음 (옛 IndicatorCard 동형).
 *   - badge: **표시 문자열(value())** 이 바뀔 때만, 방향은 raw 증감 (옛 ChangeBadge
 *     verbatim — 24h% 는 1초 가격 변동으로 미세 변동 → raw 기준이면 매 틱 노이즈).
 *
 * 렌더 게이트: registry dataShapes(isDatasourceSupportedByComponent) = 권한 진실 +
 *   !descriptor 방어선 (2중 — 기존 3 form 골격과 동형). 상태 분기 전부 graceful.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import type { SymbolMeta } from "@/lib/hooks/useSymbolMeta";
import {
  defaultRecordSubtitle,
  rawNumber,
  toneColor,
} from "@/lib/cards/recordCardFormat";
import {
  getRecordDescriptor,
  recordTextEchoes,
  resolveRecordKicker,
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
import { useClickWithoutDrag } from "@/lib/interaction/useClickWithoutDrag";
import { sanitizeTitle } from "@/lib/sanitizeTitle";
import { LoadingOrStale, StatusLine } from "./TableCardStatus";

function BigValueCardInner({ config, interaction }: CardComponentProps) {
  const { datasource, symbol, exchange, marketType } = config.data;

  // 렌더 게이트 — 권한 진실 = registry dataShapes. descriptor 는 표시 lookup(거울).
  const descriptor = useMemo(() => getRecordDescriptor(datasource), [datasource]);
  const renderable =
    isDatasourceSupportedByComponent(config.componentId, datasource) &&
    Boolean(descriptor) &&
    Boolean(symbol);

  const { data, status, stale } = useSingleRecord({
    binding: config.data,
    enabled: renderable,
    // [10-7] — descriptor 의 도메인 컬럼만 watch (지표 pack. 티커 pack 은 undefined=전부).
    watchColumns: descriptor?.watchColumns,
  });

  // [10-9] symbols 메타 1회 조회 — funding interval/tickSize/base·quote asset 라벨 보강.
  const symbolMeta = useSymbolMeta({ exchange, marketType, symbol, enabled: renderable });

  // freshness 틱 (5s) — push 사이에도 "updated Ns ago" 가 흘러가도록.
  const now = useNow(5000);
  const { reconnecting, showReconnectLabel } = useReconnectIndicator({
    status,
    hasData: Boolean(data),
    now,
  });

  // 헤더 — config(AI) 우선 ?? descriptor 안전망 (S2: 이 순서 불변).
  //   kicker 폴백은 함수형 해석 ([10-111]① — 티커는 marketType 파생 PERP/SPOT/COINM).
  const title =
    config.title ?? resolveRecordTitle(descriptor, { symbol }) ?? config.componentId;
  const kicker = config.kicker ?? resolveRecordKicker(descriptor, { marketType });
  const subtitle = config.subtitle ?? defaultRecordSubtitle(config.data);

  // [10-111]② 3중 에코 정리 — **코드 폴백 텍스트만** 생략 대상 (AI 원문 보존):
  //   kicker 는 폴백일 때만, primary 라벨은 항상 코드 소유라 표시 title 과 겹치면 생략.
  const kickerEchoesTitle = !config.kicker && recordTextEchoes(kicker, title);
  const primaryField = descriptor?.fields.find((f) => f.role === "primary");
  const hidePrimaryLabel = recordTextEchoes(primaryField?.label, title);

  // 헤더 클릭 → spawn (M3-step1). record 카드의 클릭 표면 = 헤더 (행이 없음).
  //   data 도착 전엔 비활성 — 클릭해도 방출할 레코드가 없다. 어포던스 규약
  //   (nodrag + 4px 임계 + 커서/5% 오버레이)은 TableCardRow 헤더 주석 참조.
  const headerGuard = useClickWithoutDrag(
    interaction?.canSpawnOnHeaderClick && data
      ? () => interaction.emit("header-click", data)
      : undefined,
  );

  return (
    <div className="flex h-full flex-col px-4 py-3 font-sans text-foreground">
      <header
        className={`flex-shrink-0${
          headerGuard
            ? " nodrag cursor-pointer rounded-sm transition-colors hover:bg-foreground/5"
            : ""
        }`}
        {...(headerGuard ?? {})}
      >
        {kicker && !kickerEchoesTitle && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {kicker}
          </div>
        )}
        <h3
          className="mt-1 font-serif text-[20px] leading-tight tracking-tight text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeTitle(title) }}
        />
        {subtitle && (
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
            {subtitle}
          </div>
        )}
      </header>

      <div className="mt-3 flex flex-1 flex-col justify-center">
        {!renderable || !descriptor ? (
          <StatusLine tone="neutral">{COMING_SOON_LABEL}</StatusLine>
        ) : status === "error" ? (
          <StatusLine tone="down">! realtime error</StatusLine>
        ) : !data ? (
          <LoadingOrStale stale={stale} />
        ) : (
          <>
            {/* 값 영역 — 재연결 중 흐림(opacity). flash classList 조작과 충돌하지 않도록
                opacity 는 별도 래퍼 (React className 갱신이 flash 클래스를 지우는 일 방지). */}
            <div
              className={`transition-opacity duration-300 ${
                reconnecting ? "opacity-40" : "opacity-100"
              }`}
            >
              <BigValueBody
                descriptor={descriptor}
                row={data}
                meta={symbolMeta}
                flashRaw={rawNumber(data, descriptor.flashField)}
                hidePrimaryLabel={hidePrimaryLabel}
              />
            </div>

            {/* freshness / 재연결 라인 (옵션 C) — 흐림 래퍼 바깥(항상 선명). brownout
                (연결 생존·push 정지)도 상대시간이 흘러 얼어붙은 값을 사용자가 본다. */}
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
 * role 구동 본문 — 순수 표시 (테스트용 export). 컴포넌트는 필드명을 모르고
 * descriptor.fields 의 role/value/tone 만 해석한다.
 */
export function BigValueBody({
  descriptor,
  row,
  meta,
  flashRaw,
  hidePrimaryLabel,
}: {
  descriptor: RecordDescriptor;
  row: RecordRow;
  meta: SymbolMeta | null;
  /** primary flash 비교 대상 raw 값 (flashField 파생, null=flash 없음). */
  flashRaw: number | null;
  /** [10-111]② — primary 라벨이 카드 title 과 에코일 때 생략 (라벨=코드 소유). */
  hidePrimaryLabel?: boolean;
}) {
  const primary = descriptor.fields.find((f) => f.role === "primary");
  const badges = descriptor.fields.filter((f) => f.role === "badge");
  const secondaries = descriptor.fields.filter((f) => f.role === "secondary");

  return (
    <div>
      {primary && (
        <PrimaryValue
          field={primary}
          row={row}
          meta={meta}
          flashRaw={flashRaw}
          hideLabel={hidePrimaryLabel}
        />
      )}
      {(secondaries.length > 0 || badges.length > 0) && (
        <div className="mt-3 flex items-baseline justify-between gap-2">
          {secondaries[0] ? (
            <SecondaryLine field={secondaries[0]} row={row} meta={meta} />
          ) : (
            <span />
          )}
          {badges.length > 0 && (
            <span className="flex items-baseline gap-1">
              {badges.map((b) => (
                <RecordBadge key={b.label} field={b} row={row} meta={meta} />
              ))}
            </span>
          )}
        </div>
      )}
      {secondaries.slice(1).map((f) => (
        <div key={f.label} className="mt-2">
          <SecondaryLine field={f} row={row} meta={meta} />
        </div>
      ))}
      {/* detail role 은 여기서 표시하지 않음 — 전 필드 리스트는 Detail form 소관. */}
    </div>
  );
}

/** primary — huge 값 + raw 변동 flash (옛 TickerCard 가격 flash 이식). */
function PrimaryValue({
  field,
  row,
  meta,
  flashRaw,
  hideLabel,
}: {
  field: RecordField;
  row: RecordRow;
  meta: SymbolMeta | null;
  flashRaw: number | null;
  hideLabel?: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (flashRaw === null) {
      // null 갭 후 복귀 값이 stale prev 와 비교돼 유령 flash 하는 것 방지 (reviewer S2).
      prevRef.current = null;
      return;
    }
    const el = elRef.current;
    if (!el) return;
    const prev = prevRef.current;
    if (prev !== null && flashRaw !== prev) {
      const cls = flashRaw > prev ? "flash-up" : "flash-down";
      el.classList.add(cls);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => {
        el.classList.remove(cls);
      }, 600);
    }
    prevRef.current = flashRaw;
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [flashRaw]);

  const tone = field.tone?.(row) ?? "neutral";
  return (
    <div className="flex flex-col">
      {/* [10-111]② — 라벨이 카드 title 에코일 때 생략 (title 이 라벨 역할 겸임). */}
      {!hideLabel && (
        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {field.label}
        </div>
      )}
      <div
        ref={elRef}
        className="font-serif text-[48px] leading-[0.9] tracking-tight tabular-nums"
        style={{ color: toneColor(tone) }}
      >
        {field.value(row, meta)}
      </div>
    </div>
  );
}

/** badge — 테두리 뱃지, 표시문자열 변경 시 flash·방향은 raw 증감 (옛 ChangeBadge 이식). */
function RecordBadge({
  field,
  row,
  meta,
}: {
  field: RecordField;
  row: RecordRow;
  meta: SymbolMeta | null;
}) {
  const elRef = useRef<HTMLSpanElement>(null);
  const prevDisplayRef = useRef<string | null>(null);
  const prevRawRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raw = rawNumber(row, field.key);
  const display = field.value(row, meta);

  useEffect(() => {
    if (raw === null) {
      // null 갭 후 유령 flash 방지 — PrimaryValue 와 대칭 (reviewer S2).
      prevDisplayRef.current = null;
      prevRawRef.current = null;
      return;
    }
    const el = elRef.current;
    if (!el) return;
    const prevDisplay = prevDisplayRef.current;
    const prevRaw = prevRawRef.current;
    // 표시값이 실제로 바뀌었고 직전 값이 있을 때만 — 방향은 raw 증감으로 결정.
    if (prevDisplay !== null && display !== prevDisplay && prevRaw !== null) {
      const cls = raw > prevRaw ? "flash-up" : "flash-down";
      el.classList.add(cls);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => el.classList.remove(cls), 600);
    }
    prevDisplayRef.current = display;
    prevRawRef.current = raw;
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [raw, display]);

  // 값 부재 = 옛 ChangeBadge null 스타일 (흐린 "—" 뱃지).
  if (raw === null) {
    return (
      <span className="border border-[color:var(--ink-5)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--ink-4)]">
        {display}
      </span>
    );
  }
  // tone → 테두리+글자색. neutral(0 등 방향 없음) = 흑백 (0=teal 이던 옛 거동의
  // 의도적 개선 — Stage 1 티커 표와 동일 결정, G2 고지 항목).
  const tone = field.tone?.(row) ?? "neutral";
  const colorClass =
    tone === "up"
      ? "border-[color:var(--up)] text-[color:var(--up)]"
      : tone === "down"
        ? "border-[color:var(--down)] text-[color:var(--down)]"
        : "border-[color:var(--ink-4)] text-foreground";
  return (
    <span
      ref={elRef}
      className={`border ${colorClass} px-1.5 py-0.5 font-mono text-[11px] tabular-nums`}
    >
      {display}
    </span>
  );
}

/** secondary — 라벨 + 값 mono 한 줄 (+ hint 뱃지: 예 "approx"). */
function SecondaryLine({
  field,
  row,
  meta,
}: {
  field: RecordField;
  row: RecordRow;
  meta: SymbolMeta | null;
}) {
  const tone = field.tone?.(row) ?? "neutral";
  return (
    <span className="inline-flex items-baseline gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
      <span>{field.label}</span>
      <span className="tabular-nums" style={{ color: toneColor(tone) }}>
        {field.value(row, meta)}
      </span>
      {field.hint && (
        <span
          className="border border-[color:var(--ink-4)] px-1 py-0 text-[8px] uppercase tracking-[0.1em] text-[color:var(--ink-4)]"
          title={field.hintTitle}
        >
          {field.hint}
        </span>
      )}
    </span>
  );
}

export const BigValueCard = memo(BigValueCardInner);
BigValueCard.displayName = "BigValueCard";

export default BigValueCard;

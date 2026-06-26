"use client";
/**
 * IndicatorCard — 단일 심볼 선물 지표 카드 (M2 테마 A Step 2, 2026-06-09).
 *
 * 역할:
 *   now_futures_indicator (Binance USDM/COINM 통합 지표 테이블)의 단일 심볼 row 를
 *   Supabase Realtime 으로 구독하고, AI 가 고른 datasource(premium_index / basis /
 *   open_interest / long_short_ratio / taker_long_short)에 따라 해당 metric 그룹을
 *   적응 렌더한다. F3([10-3]) "realtime error" 의 근본 회수 — 실데이터는 이미 DB 에
 *   있었고(766행), 그릴 전용 카드만 없었다.
 *
 * 적응 렌더 (확장성):
 *   카드 1종 + descriptor 테이블(indicatorDescriptors.ts). 새 metric/그룹은 descriptor
 *   에 행/엔트리만 추가하면 자동 지원. AI 는 datasource description 으로 의도 추론 →
 *   "쿼리→컴포넌트 하드매핑" 아님 (CLAUDE.md).
 *
 * 데이터 경로:
 *   B (Hetzner 워커 → Supabase upsert → Realtime → front). TickerCard 와 동일.
 *
 * [10-7] fan-out 차단:
 *   premium_index / open_interest 등은 같은 물리 테이블(now_futures_indicator)을 공유해
 *   channel 이 하나다. markPrice WS 가 1초마다 row 전체를 push 하므로, descriptor 의
 *   watchColumns 를 useDataServiceRow 에 넘겨 "내 관심 컬럼이 실제 바뀐 payload" 만
 *   통과시킨다 (저사양 UHD620 다중 카드 재렌더 절감).
 *
 * 색 (사용자 결정 2026-06-09): 기존 흑백 + 방향성 2색 하이브리드 일관 적용.
 *   descriptor 의 tone() 이 up(teal)/down(vermilion)/neutral 을 결정.
 *
 * freshness:
 *   OI/LSR/taker 는 ~5분 폴링이라 숫자가 거의 안 변해 "멈춘 것처럼" 보일 수 있어
 *   (crypto-trader Q5), updated_at 상대시간 라인으로 살아있음 신호.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  getIndicatorDescriptor,
  type IndicatorRow,
  type MetricTone,
} from "@/lib/cards/indicatorDescriptors";
import {
  COMING_SOON_LABEL,
} from "@/lib/cards/renderableDatasource";
import {
  initialFetch as dsInitialFetch,
  useDataServiceRow,
  type EqFilter,
} from "@/lib/dataService";
import { formatRelativeTime } from "@/lib/format/relativeTime";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { useNow } from "@/lib/hooks/useNow";
import { useSymbolMeta } from "@/lib/hooks/useSymbolMeta";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

function IndicatorCardInner({ config }: CardComponentProps) {
  const { datasource, symbol, exchange, marketType } = config.data;

  // self-gate: descriptor 가 있는 datasource 만 렌더. 없으면 coming soon
  //   (ticker allowlist 와 분리 — indicator 카드는 자기 descriptor 키 집합이 곧 allowlist).
  const descriptor = getIndicatorDescriptor(datasource);
  const renderable = Boolean(descriptor) && Boolean(symbol);

  // PK 매처 — dataService 가 server-side filter 미사용 → symbol/exchange/marketType 책임.
  const match = useCallback(
    (row: IndicatorRow) =>
      row.symbol === symbol &&
      (!exchange || row.exchange === exchange) &&
      (!marketType || row.market_type === marketType),
    [symbol, exchange, marketType],
  );

  // 초기 SELECT — datasource 는 논리 id (premium_index 등) → initialFetch 가
  //   resolveDatasourceTable 로 now_futures_indicator 에 매핑.
  const initialFetch = useCallback(async (): Promise<IndicatorRow | null> => {
    if (!symbol) return null;
    const eq: EqFilter[] = [{ column: "symbol", value: symbol }];
    if (exchange) eq.push({ column: "exchange", value: exchange });
    if (marketType) eq.push({ column: "market_type", value: marketType });
    const row = await dsInitialFetch<IndicatorRow>({
      datasource,
      eq,
      single: true,
    });
    return Array.isArray(row) ? null : row;
  }, [datasource, symbol, exchange, marketType]);

  // 경로 A(ws_direct) 전용 — 토픽 조립 selector (fast-follow #1 Step 5 플립, 2026-06-26, 활성).
  //   premium_index(마크/펀딩)는 transport=ws_direct → useDataServiceRow 가 buildLiveTopic 에
  //   이 selector 를 넘겨 구독 토픽을 조립한다(경로 A). 나머지 4개(basis/open_interest/
  //   long_short_ratio/taker_long_short)는 realtime 유지 → 이 selector 무시(경로 B).
  //   liveTopicSpec.selectorKeys=["market_type","symbol"] 와 키 일치 필수 (TickerCard 동형).
  const selector = useMemo(
    () => (symbol && marketType ? { market_type: marketType, symbol } : undefined),
    [marketType, symbol],
  );

  const { data, status } = useDataServiceRow<IndicatorRow>({
    datasource,
    match,
    initialFetch,
    selector,
    enabled: renderable,
    // [10-7] — descriptor 의 도메인 컬럼만 watch (fan-out 재렌더 차단).
    watchColumns: descriptor?.watchColumns,
  });

  const { stale } = useLoadingTimeout({
    hasData: data !== null && data !== undefined,
    initialDelayMs: 8000,
  });

  // [10-9] symbols 메타 1회 조회 — funding interval 라벨 / tickSize 가격 정밀도 /
  // OI base asset / basis quote. 실패 시 null → 라벨 없는 기존 표시 fallback.
  const symbolMeta = useSymbolMeta({
    exchange,
    marketType,
    symbol,
    enabled: renderable,
  });

  // freshness 틱 (5s) — 데이터 push 사이에도 상대시간이 흘러가도록.
  const now = useNow(5000);

  // 옵션 C 재연결 거동 (M2 경로 A fast-follow #1 Step 5, [10-53](a), TickerCard 동형):
  //   premium_index 가 ws_direct 로 플립되면(Step 5), 연결이 끊길 때 liveTopicManager.
  //   mapStatus 가 활성 토픽 동안의 errored/closed 를 낙관적으로 subscribing(=loading)으로
  //   매핑한다 → "status==='loading' && data" 가 "값은 있는데 재연결 중" 신호.
  //   ① 값 흐림(opacity) ② "updated Ns ago" 로 마지막 갱신 노출 ③ 5초 유예 후 중립 문구.
  //   ★ 빨간 error 금지 — 경로 B(Realtime)가 라이브러리로 재연결을 흡수하던 체감 재현.
  //   realtime datasource(OI/LSR 등 경로 B)에서는 mapStatus 가 이 낙관 매핑을 안 해
  //   reconnecting 이 거의 안 켜짐 → 기존 거동 유지(경로 A 플립된 premium_index 만 활성).
  //   W2 가드: 최초 연결(connecting)도 loading 이라, 한 번이라도 ready 였는지로 초기로딩 구분.
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (status === "ready") hasConnectedRef.current = true;
  }, [status]);

  const reconnecting = hasConnectedRef.current && status === "loading" && Boolean(data);
  const reconnectStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (reconnecting) {
      if (reconnectStartRef.current === null) reconnectStartRef.current = Date.now();
    } else {
      reconnectStartRef.current = null;
    }
  }, [reconnecting]);

  // 5초 유예 경과 여부 — now(5s 틱) 기준이라 라벨은 5~10초 사이 등장(브리프 깜빡임엔 안 뜸).
  const reconnectedFor =
    reconnecting && reconnectStartRef.current !== null ? now - reconnectStartRef.current : 0;
  const showReconnectLabel = reconnecting && reconnectedFor >= 5000;

  const title = config.title ?? descriptor?.defaultTitle ?? config.componentId;
  const kicker = config.kicker ?? descriptor?.kicker;
  const subtitle = config.subtitle ?? defaultSubtitle(config.data);

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
          <Stub tone="neutral">{COMING_SOON_LABEL}</Stub>
        ) : status === "error" ? (
          <Stub tone="down">! realtime error</Stub>
        ) : !data ? (
          <LoadingStub stale={stale} />
        ) : (
          <>
            {/* 값 영역 — 재연결 중이면 흐림(opacity). freshness 라인은 흐림 래퍼 바깥(항상 선명). */}
            <div
              className={`flex flex-1 flex-col transition-opacity duration-300 ${
                reconnecting ? "opacity-40" : "opacity-100"
              }`}
            >
              <dl className="flex flex-1 flex-col gap-1.5">
                {descriptor.rows.map((row) => {
                  const tone = row.tone ? row.tone(data) : "neutral";
                  return (
                    <MetricLine
                      key={row.label}
                      label={row.label}
                      value={row.value(data, symbolMeta)}
                      tone={tone}
                      primary={row.primary}
                    />
                  );
                })}
              </dl>
            </div>
            {/* freshness / 재연결 상태 라인 (옵션 C) — 정상: "updated Ns ago" 살아있음 신호.
                재연결 5초+: "reconnecting…" 중립 문구(빨간 error 금지). brownout(연결은
                살아있는데 push 만 멈춤)도 상대시간이 흘러 사용자가 얼어붙은 피드를 본다. */}
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

/** tone → CSS 색 변수. neutral 은 흑백(foreground). */
function toneColor(tone: MetricTone): string {
  if (tone === "up") return "var(--up)";
  if (tone === "down") return "var(--down)";
  return "var(--foreground)";
}

/** metric 한 줄 — primary 면 큰 글씨, 아니면 label/value 양끝 정렬. */
function MetricLine({
  label,
  value,
  tone,
  primary,
}: {
  label: string;
  value: string;
  tone: MetricTone;
  primary?: boolean;
}) {
  if (primary) {
    return (
      <div className="flex flex-col">
        <dt className="font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {label}
        </dt>
        <dd
          className="font-serif text-[32px] leading-[0.95] tracking-tight tabular-nums"
          style={{ color: toneColor(tone) }}
        >
          {value}
        </dd>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
        {label}
      </dt>
      <dd
        className="font-mono text-[12px] tabular-nums"
        style={{ color: toneColor(tone) }}
      >
        {value}
      </dd>
    </div>
  );
}

function defaultSubtitle(d: CardComponentProps["config"]["data"]): string {
  const parts: string[] = [];
  if (d.exchange) parts.push(d.exchange);
  if (d.marketType) parts.push(d.marketType);
  if (d.symbol) parts.push(d.symbol);
  return parts.join(" · ");
}

function LoadingStub({ stale }: { stale: boolean }) {
  if (stale) {
    return (
      <div className="space-y-1 font-mono text-[10px] uppercase tracking-[0.15em]">
        <div className="text-[color:var(--ink-4)]">··· loading (8s+)</div>
        <div className="text-[color:var(--down)] normal-case tracking-normal">
          Connection issue possible — check Supabase/worker status
        </div>
      </div>
    );
  }
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--ink-4)]">
      ··· loading
    </div>
  );
}

function Stub({
  tone,
  children,
}: {
  tone: "neutral" | "down";
  children: string;
}) {
  const color = tone === "down" ? "var(--down)" : "var(--ink-4)";
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color }}
    >
      {children}
    </div>
  );
}

export const IndicatorCard = memo(IndicatorCardInner);
IndicatorCard.displayName = "IndicatorCard";

export default IndicatorCard;

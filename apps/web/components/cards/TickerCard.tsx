"use client";
/**
 * TickerCard — 단일 심볼 실시간 가격 카드 (M1.4 Step 3-2, 2026-04-21).
 *
 * 역할:
 *   config.data.symbol 로 지정된 단일 심볼의 now_{spot|futures}_ticker row 를
 *   Supabase Realtime 으로 구독하고, UI-3 Monochrome 톤으로 huge price + 24h
 *   변동률 + volume_chg_5m (근사) 뱃지를 렌더.
 *
 * 데이터 경로:
 *   B (Hetzner 워커 → Supabase upsert → Realtime → front). PRD §2 정책 준수.
 *   WS 직접 릴레이(경로 A) 는 L.3 Launch Readiness 단계에서 도입.
 *
 * 복합 PK 처리:
 *   Supabase postgres_changes filter 는 단일 컬럼만 지원한다. exchange +
 *   market_type + symbol 3중 PK 중 symbol 만 서버 필터로 보내고, exchange /
 *   market_type 은 useRealtimeRow options.match 콜백으로 보조 검증 (bandwidth
 *   절감 + 정확한 PK 매칭).
 *
 * Flash 애니메이션:
 *   React 19 `react-hooks/set-state-in-effect` 규칙을 만족시키기 위해 useState
 *   대신 ref + classList.add 패턴 채택. globals.css 의 .flash-up/.flash-down
 *   keyframes 가 600ms 동안 배경을 up/down 색으로 번쩍인다.
 *
 * volume_chg_5m (근사) 뱃지:
 *   프로젝트 메모리 §volume_chg_5m UI 정책 — M1.3 Step 5 WS 완료 전까지는
 *   5분 폴링 기반 근사값이라 "(근사)" 뱃지 + Tooltip 필수. Step 5 전환 후 뱃지
 *   제거 예정.
 */

import { memo, useCallback, useEffect, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { useRealtimeRow } from "@/lib/hooks/useRealtimeRow";
import { sanitizeTitle } from "@/lib/sanitizeTitle";
import { supabase } from "@/lib/supabase";

/**
 * now_{spot|futures}_ticker row 의 최소 스키마.
 * 실제 컬럼명은 M1.3 마이그레이션(`20260418000002_create_now_tables.sql`) 기준:
 *   - 24h 변동률 = `price_change_pct` (NOT `change_24h_pct`)
 *   - 고/저가 = `high_price` / `low_price` (NOT `high_24h` / `low_24h`)
 *   - USD 거래대금 = `quote_volume` (NOT `volume_24h_usd`)
 *   - `last_price` 는 nullable (거래소 응답 누락 방어)
 *
 * `& Record<string, unknown>` 인터섹션 이유:
 *   useRealtimeRow 제네릭 제약이 `T extends Record<string, unknown>` — interface
 *   는 index signature 자동 부여가 없어서 type alias + intersection 으로 통과.
 */
type TickerRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  last_price: number | null;
  price_change_pct: number | null;
  high_price: number | null;
  low_price: number | null;
  quote_volume: number | null;
  /** M1.3 Step 4 사전 계산 — 5분 폴링 근사값. Step 5 WS 완료 시 실시간. */
  volume_chg_5m: number | null;
  updated_at: string;
} & Record<string, unknown>;

/**
 * Supabase generated type 이 from() 인자로 literal union 을 요구한다.
 * AI 가 내려주는 datasource 는 string 이므로 TickerCard 가 수용하는 테이블
 * 범위를 이 union 에 한정해 cast — 안전 가드 역할.
 */
type NowTickerTable = "now_spot_ticker" | "now_futures_ticker";

function TickerCardInner({ config }: CardComponentProps) {
  const { datasource, symbol, exchange, marketType } = config.data;

  const priceElRef = useRef<HTMLDivElement>(null);
  const prevPriceRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 보조 매처 — exchange / market_type 이 지정된 경우만 비교. useCallback 으로
  // 참조 고정해 useRealtimeRow 재구독 루프 방지.
  const match = useCallback(
    (row: TickerRow) =>
      (!exchange || row.exchange === exchange) &&
      (!marketType || row.market_type === marketType),
    [exchange, marketType],
  );

  // 초기 SELECT — Realtime 이벤트가 도착하기 전 최초 1회 값을 채운다. enabled
  // 가 false 이면 useRealtimeRow 내부에서 호출 자체가 스킵된다.
  const initialFetch = useCallback(async (): Promise<TickerRow | null> => {
    if (!supabase || !symbol) return null;
    // datasource 를 NowTickerTable 로 narrow — TickerCard 는 ticker 테이블만 허용.
    let query = supabase
      .from(datasource as NowTickerTable)
      .select("*")
      .eq("symbol", symbol);
    if (exchange) query = query.eq("exchange", exchange);
    if (marketType) query = query.eq("market_type", marketType);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return (data as TickerRow | null) ?? null;
  }, [datasource, symbol, exchange, marketType]);

  const { data, status } = useRealtimeRow<TickerRow>({
    table: datasource,
    filter: symbol ? `symbol=eq.${symbol}` : "",
    initialFetch,
    match,
    enabled: Boolean(symbol && datasource),
  });

  // Step 4-4 (2026-04-22) — 8 초 이상 로딩 지속 시 사용자에게 알림.
  // worker 미가동 / Supabase 보트 중 같은 상황을 "앱 죽음" 으로 오판하지 않도록.
  const { stale } = useLoadingTimeout({
    hasData: data !== null && data !== undefined,
    initialDelayMs: 8000,
  });

  // Flash 애니메이션 — ref + classList 로 setState 우회 (React 19 규칙 준수).
  useEffect(() => {
    if (!data || data.last_price === null) return;
    const el = priceElRef.current;
    if (!el) return;
    const prev = prevPriceRef.current;
    const current = data.last_price;
    if (prev !== null && current !== prev) {
      const cls = current > prev ? "flash-up" : "flash-down";
      el.classList.add(cls);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => {
        el.classList.remove(cls);
      }, 600);
    }
    prevPriceRef.current = current;
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [data]);

  // 헤더 텍스트 — AI 자유 텍스트가 없으면 symbol 을 fallback title 로.
  const title = config.title ?? config.data.symbol ?? config.componentId;
  const subtitle = config.subtitle ?? defaultSubtitle(config.data);

  return (
    <div className="flex h-full flex-col px-4 py-3 font-sans text-foreground">
      {/* 헤더 ── UI-3 저널 스타일 kicker + title + subtitle */}
      <header className="flex-shrink-0">
        {config.kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {config.kicker}
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

      {/* 바디 ── huge price + 24h change + volume_chg_5m 근사 뱃지 */}
      <div className="mt-3 flex flex-1 flex-col justify-center">
        {status === "error" ? (
          <ErrorStub />
        ) : !data ? (
          <LoadingStub stale={stale} />
        ) : (
          <>
            <div
              ref={priceElRef}
              className="font-serif text-[48px] leading-[0.9] tracking-tight tabular-nums"
            >
              {data.last_price !== null ? `$${formatPrice(data.last_price)}` : "—"}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                24H {formatRange(data.low_price, data.high_price)}
              </span>
              <ChangeBadge pct={data.price_change_pct} />
            </div>
            {data.volume_chg_5m !== null && (
              <div className="mt-2 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                <span className="text-foreground">
                  VOL 5M {formatPct(data.volume_chg_5m)}
                </span>
                <span
                  className="border border-[color:var(--ink-4)] px-1 py-0 text-[8px] uppercase tracking-[0.1em] text-[color:var(--ink-4)]"
                  title="M1.3 Step 4 폴링 기반 근사값. Step 5 WS 완료 시 실시간 전환 예정."
                >
                  근사
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 가격 포맷 — 스케일별 소수점 자리 차별화.
 *   p < 1         → 6자리 (DOGE/SHIB 등 저가 코인)
 *   p < 100       → 4자리 (알트 대부분)
 *   그 외         → 2자리 + 천단위 콤마 (BTC/ETH)
 */
function formatPrice(p: number): string {
  if (p < 1) return p.toFixed(6);
  if (p < 100) return p.toFixed(4);
  return p.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

function formatRange(lo: number | null, hi: number | null): string {
  if (lo === null || hi === null) return "—";
  return `L ${formatPrice(lo)} · H ${formatPrice(hi)}`;
}

function defaultSubtitle(d: CardComponentProps["config"]["data"]): string {
  const parts: string[] = [];
  if (d.exchange) parts.push(d.exchange);
  if (d.marketType) parts.push(d.marketType);
  if (d.symbol) parts.push(d.symbol);
  return parts.join(" · ");
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="border border-[color:var(--ink-5)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--ink-4)]">
        —
      </span>
    );
  }
  const positive = pct >= 0;
  const colorClass = positive ? "text-[color:var(--up)]" : "text-[color:var(--down)]";
  const borderClass = positive
    ? "border-[color:var(--up)]"
    : "border-[color:var(--down)]";
  return (
    <span
      className={`border ${borderClass} ${colorClass} px-1.5 py-0.5 font-mono text-[11px] tabular-nums`}
    >
      {formatPct(pct)}
    </span>
  );
}

function LoadingStub({ stale }: { stale: boolean }) {
  if (stale) {
    return (
      <div className="space-y-1 font-mono text-[10px] uppercase tracking-[0.15em]">
        <div className="text-[color:var(--ink-4)]">··· loading (8s+)</div>
        <div className="text-[color:var(--down)] normal-case tracking-normal">
          연결 문제 가능 — Supabase/worker 상태 확인 권장
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

function ErrorStub() {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--down)]">
      ! realtime error
    </div>
  );
}

export const TickerCard = memo(TickerCardInner);
TickerCard.displayName = "TickerCard";

export default TickerCard;

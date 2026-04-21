"use client";
/**
 * CoinListCard — content-mode 코인 목록 카드 (M1.4 Step 3-3, 2026-04-21).
 *
 * 역할:
 *   now_{spot|futures}_ticker 전체 테이블을 Supabase Realtime 으로 구독하고,
 *   AI 가 발행한 filters + sort + limit 로 실시간 스크리닝. 조건을 만족하는 코인
 *   이 들어오거나(새 심볼 충족) 빠지면(기존 심볼 이탈) UI 가 동적 갱신된다.
 *
 * updateMode:
 *   'content' — 카드 안의 "항목" 이 동적으로 추가/제거. AI 프롬프트 발행 시점
 *   의 스냅샷이 아니라 실시간 재평가. PRD §3 참조.
 *
 * 성능:
 *   useRealtimeTable 이 500ms throttle 로 flush → Map<pk, row> 반환.
 *   1,400+ 심볼 규모에서 초당 ~2 리렌더, 필터·정렬은 useMemo 로 rows 참조
 *   변경 시만 재계산. backend-infra-specialist (M1.3) throttle 전략 재사용.
 *
 * 디자인:
 *   UI-3 Monochrome 테이블 — ink 테두리, mono 11px, change_24h_pct 은 up/down
 *   2색 예외 적용 + opacity 로 강도 표현 (|pct|/10 정규화, halftone 미사용 —
 *   heatmap 이 아니라 정렬 리스트라 가독성 우선).
 */

import { memo, useCallback, useMemo } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { supabase } from "@/lib/supabase";
import { evaluateFilters } from "@/lib/realtime/filterEvaluator";

type NowTickerTable = "now_spot_ticker" | "now_futures_ticker";

/**
 * now_{spot|futures}_ticker row 의 최소 스키마 — CoinListCard 가 직접 쓰는 필드만.
 * 실제 컬럼명(M1.3 마이그레이션 기준):
 *   - 24h 변동률 = `price_change_pct`
 *   - USD 거래대금 = `quote_volume`
 *   - `last_price` 는 nullable
 */
type CoinRow = {
  exchange: string;
  market_type: string;
  symbol: string;
  last_price: number | null;
  price_change_pct: number | null;
  quote_volume: number | null;
  volume_chg_5m: number | null;
  updated_at: string;
} & Record<string, unknown>;

/** 초기 SELECT 상한 — 일단 500 개로 제한해 큰 테이블 풀-필드 로드 방지. */
const INITIAL_FETCH_CAP = 500;

function CoinListCardInner({ config }: CardComponentProps) {
  const {
    datasource,
    exchange,
    marketType,
    filters,
    sort,
    limit = 20,
  } = config.data;

  // 복합 PK 직렬화 — 정확한 Map key 로 사용. useRealtimeTable 재구독 루프 방지용 stable 참조.
  const pk = useCallback(
    (row: CoinRow) => `${row.exchange}:${row.market_type}:${row.symbol}`,
    [],
  );

  // 초기 전체 fetch — exchange/marketType 이 있으면 서버 쪽에서 좁혀 와서 트래픽 절감.
  const initialFetch = useCallback(async (): Promise<CoinRow[]> => {
    if (!supabase) return [];
    let query = supabase.from(datasource as NowTickerTable).select("*");
    if (exchange) query = query.eq("exchange", exchange);
    if (marketType) query = query.eq("market_type", marketType);
    const { data, error } = await query.limit(INITIAL_FETCH_CAP);
    if (error) throw error;
    // Supabase generated type 은 2 테이블(spot/futures) 의 union 을 반환한다.
    // CoinRow 는 두 변형 공통 서브셋만 참조하므로 unknown 경유 캐스트 후 사용.
    return (data ?? []) as unknown as CoinRow[];
  }, [datasource, exchange, marketType]);

  const { rows, status } = useRealtimeTable<CoinRow>({
    table: datasource,
    pk,
    initialFetch,
    throttleMs: 500,
    enabled: Boolean(datasource),
  });

  // 필터 + 정렬 + 상한.
  //   rows 참조가 바뀔 때만 재계산 (throttle flush 시 매번 새 Map 참조).
  //   exchange / marketType 은 서버 필터로 이미 좁혀 왔지만 Realtime INSERT 에서
  //   다른 거래소 row 가 흘러들 가능성에 대비해 한 번 더 방어.
  const displayed = useMemo(() => {
    const list: CoinRow[] = [];
    for (const row of rows.values()) {
      if (exchange && row.exchange !== exchange) continue;
      if (marketType && row.market_type !== marketType) continue;
      if (!evaluateFilters(row, filters)) continue;
      list.push(row);
    }
    if (sort) {
      const { field, direction } = sort;
      const mul = direction === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (typeof av === "number" && typeof bv === "number") {
          return (av - bv) * mul;
        }
        return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
      });
    } else {
      // 기본 정렬: 24h 변동률 내림차순 — "지금 뜨거운 코인 위로".
      list.sort(
        (a, b) =>
          (b.price_change_pct ?? -Infinity) - (a.price_change_pct ?? -Infinity),
      );
    }
    return list.slice(0, limit);
  }, [rows, exchange, marketType, filters, sort, limit]);

  const title = config.title ?? "Market board";
  const subtitle =
    config.subtitle ?? `${displayed.length} of ${rows.size} symbols`;

  return (
    <div className="flex h-full flex-col px-3 py-2 font-sans text-foreground">
      <header className="flex-shrink-0 border-b border-[color:var(--ink-5)] pb-2">
        {config.kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {config.kicker}
          </div>
        )}
        <h3
          className="mt-0.5 font-serif text-[18px] leading-tight tracking-tight"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
          {subtitle}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {status === "error" ? (
          <StatusLine tone="down">! realtime error</StatusLine>
        ) : rows.size === 0 ? (
          <StatusLine tone="neutral">··· loading</StatusLine>
        ) : displayed.length === 0 ? (
          <StatusLine tone="neutral">no matches</StatusLine>
        ) : (
          <table className="w-full font-mono text-[11px]">
            <tbody>
              {displayed.map((row) => (
                <CoinListRow key={pk(row)} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CoinListRow({ row }: { row: CoinRow }) {
  const pct = row.price_change_pct ?? 0;
  // 정규화 강도 — |pct| 가 10% 가 되면 포화(opacity 1.0). 이하는 선형.
  const intensity = Math.min(1, Math.abs(pct) / 10);
  const isUp = pct >= 0;
  return (
    <tr className="border-b border-[color:var(--ink-5)]">
      <td className="py-1 text-foreground font-semibold">{row.symbol}</td>
      <td className="py-1 text-right tabular-nums text-[color:var(--ink-2)]">
        {row.last_price !== null ? `$${formatPrice(row.last_price)}` : "—"}
      </td>
      <td
        className="py-1 text-right tabular-nums"
        style={{
          color: isUp ? "var(--up)" : "var(--down)",
          opacity: 0.55 + intensity * 0.45,
        }}
      >
        {isUp ? "+" : ""}
        {pct.toFixed(2)}%
      </td>
    </tr>
  );
}

function StatusLine({
  tone,
  children,
}: {
  tone: "neutral" | "down";
  children: string;
}) {
  const color = tone === "down" ? "var(--down)" : "var(--ink-4)";
  return (
    <div
      className="p-3 font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color }}
    >
      {children}
    </div>
  );
}

function formatPrice(p: number): string {
  if (p < 1) return p.toFixed(6);
  if (p < 100) return p.toFixed(4);
  return p.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const CoinListCard = memo(CoinListCardInner);
CoinListCard.displayName = "CoinListCard";

export default CoinListCard;

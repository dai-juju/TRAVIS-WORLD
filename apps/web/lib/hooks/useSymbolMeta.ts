/**
 * useSymbolMeta — symbols 테이블의 심볼 메타 1회 조회 훅 ([10-9] 회수, 2026-06-10).
 *
 * 역할:
 *   IndicatorCard 등이 funding interval (1h/4h/8h) 라벨 / 가격 tickSize 정밀도 /
 *   OI base asset 라벨 / basis quote 라벨을 표시하려면 now_futures_indicator 외에
 *   symbols 테이블 메타가 필요하다 (canonical-metrics.md D9/D15).
 *
 * 설계:
 *   - **1회 fetch, Realtime 구독 없음** — symbols 메타는 정적에 가깝고
 *     (fundingInfoTask 24h 갱신), 카드 수명 내 변동을 무시해도 안전.
 *   - graceful: 조회 실패/미존재 시 null 유지 → 호출측은 라벨 없는 기존 표시로
 *     자연 fallback (오라벨보다 무라벨 — [10-9] 의 §9 위생 원칙).
 *   - datasource 는 registry 논리 id "symbols_meta" (table=symbols) 경유 —
 *     dataService 추상화 준수 (supabase.from 직접 호출 금지).
 */

import { useEffect, useState } from "react";
import {
  initialFetch as dsInitialFetch,
  type EqFilter,
} from "@/lib/dataService";

/** 카드 표시 보강에 쓰이는 symbols 메타 부분집합. */
export interface SymbolMeta {
  /** 펀딩 정산 주기 (1/4/8 등). null = SPOT 또는 미동기 → 라벨 생략. */
  funding_interval_hours: number | null;
  /** 가격 최소 단위 — formatPrice 정밀도 입력. */
  tick_size: number | null;
  /** OI 단위 라벨 (예: "BTC"). */
  base_asset: string | null;
  /** basis 단위 라벨 (예: "USDT"/"USDC"/"USD"). */
  quote_asset: string | null;
}

/** DB numeric 이 string 으로 올 수 있어 방어적 변환. 비정상은 null. */
function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function useSymbolMeta(params: {
  exchange?: string;
  marketType?: string;
  symbol?: string;
  /** false 면 조회 자체를 생략 (coming soon 카드 등). */
  enabled?: boolean;
}): SymbolMeta | null {
  const { exchange, marketType, symbol, enabled = true } = params;
  // meta 를 "어느 심볼 키의 결과인지" 와 함께 저장 → 키 불일치 시 파생적으로 null
  // 반환 (effect 본문 동기 setState reset 불필요 — react-hooks/set-state-in-effect 준수).
  const [fetched, setFetched] = useState<{
    key: string;
    meta: SymbolMeta;
  } | null>(null);

  const key =
    enabled && symbol ? `${exchange ?? ""}|${marketType ?? ""}|${symbol}` : null;

  useEffect(() => {
    if (!key || !symbol) return;
    let cancelled = false; // unmount/심볼 변경 후 setState 방지 (mounted guard 패턴)
    (async () => {
      try {
        const eq: EqFilter[] = [{ column: "symbol", value: symbol }];
        if (exchange) eq.push({ column: "exchange", value: exchange });
        if (marketType) eq.push({ column: "market_type", value: marketType });
        const row = await dsInitialFetch<Record<string, unknown>>({
          datasource: "symbols_meta",
          eq,
          single: true,
        });
        if (cancelled || !row || Array.isArray(row)) return;
        setFetched({
          key,
          meta: {
            funding_interval_hours: toNum(row.funding_interval_hours),
            tick_size: toNum(row.tick_size),
            base_asset: toStr(row.base_asset),
            quote_asset: toStr(row.quote_asset),
          },
        });
      } catch {
        // graceful — 메타 없이 기존 표시 유지 (라벨/정밀도 보강만 생략됨)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, exchange, marketType, symbol]);

  return key !== null && fetched?.key === key ? fetched.meta : null;
}

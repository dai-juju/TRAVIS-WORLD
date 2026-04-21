"use client";
/**
 * KlineChartCard — TradingView Advanced Chart 임베드 카드 (M1.4 Step 3-4, 2026-04-21).
 *
 * 역할:
 *   config.data.symbol + interval 로 TradingView widget iframe 을 조립해 캔들 차트
 *   렌더. 자체 차트 엔진 대신 TradingView 를 쓰는 근거는 프로젝트 메모리
 *   §TradingView chart policy 에 명시 — 품질/완성도 압도적 + 번들 사이즈 절감.
 *
 * 테마 동기화:
 *   next-themes 의 useTheme() 훅에서 resolvedTheme 을 읽어 TradingView widget 의
 *   theme 쿼리 파라미터로 전달. iframe 은 src 변경을 감지하지 않으므로 src 에
 *   tvTheme 을 포함시키고 key 속성으로 리마운트를 유도 → 토글 시 차트가 새
 *   테마로 다시 로드된다 (애니메이션 없이 즉시).
 *
 * Graceful fallback:
 *   toTradingViewSymbol 이 null 을 반환하면 (COIN-M 등 미지원) "해당 차트 없음"
 *   placeholder 를 UI-3 톤으로 렌더. M1.5+ 에서 자체 차트 도입 시 대체.
 */

import { memo, useMemo } from "react";
import { useTheme } from "next-themes";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  toTradingViewSymbol,
  toTradingViewResolution,
} from "@/lib/tvSymbolMap";

function KlineChartCardInner({ config }: CardComponentProps) {
  const { resolvedTheme } = useTheme();
  const { exchange, marketType, symbol, interval } = config.data;

  const tvSymbol = useMemo(
    () => toTradingViewSymbol(exchange, marketType, symbol),
    [exchange, marketType, symbol],
  );
  const tvResolution = toTradingViewResolution(interval);
  const tvTheme = resolvedTheme === "dark" ? "dark" : "light";

  const title = config.title ?? symbol ?? "Kline chart";
  const subtitle =
    config.subtitle ??
    [exchange, marketType, interval].filter(Boolean).join(" · ");

  const iframeSrc = useMemo(() => {
    if (!tvSymbol) return null;
    const params = new URLSearchParams({
      symbol: tvSymbol,
      interval: tvResolution,
      theme: tvTheme,
      style: "1", // 캔들
      locale: "en",
      hidesidetoolbar: "1",
      symboledit: "0",
      saveimage: "0",
      hideideas: "1",
      timezone: "Etc/UTC",
      toolbarbg: tvTheme === "dark" ? "1a1a1a" : "fafaf9",
    });
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [tvSymbol, tvResolution, tvTheme]);

  return (
    <div className="flex h-full flex-col font-sans text-foreground">
      <header className="flex-shrink-0 border-b border-[color:var(--ink-5)] px-3 py-2">
        {config.kicker && (
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
            {config.kicker}
          </div>
        )}
        <h3
          className="mt-0.5 font-serif text-[18px] leading-tight tracking-tight"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        {subtitle && (
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
            {subtitle}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-hidden">
        {iframeSrc ? (
          <iframe
            // 심볼/해상도/테마 변경 시 리마운트 — TradingView widget 은 src 교체
            // 만으로 전환되지만 일부 내부 상태가 남아 이전 테마 잔상이 보일 때가
            // 있어 key 로 강제 재생성.
            key={`${tvSymbol}-${tvResolution}-${tvTheme}`}
            src={iframeSrc}
            className="h-full w-full border-0"
            title={`${tvSymbol} candle chart`}
            allow="clipboard-write"
            // 저사양 UHD 620 대응 — sandbox 는 생략 (TradingView 와 호환성 문제).
            // loading lazy 는 React Flow 노드가 화면 밖이면 자동 생략 (onlyRenderVisibleElements).
            loading="lazy"
          />
        ) : (
          <NotSupportedStub
            exchange={exchange}
            marketType={marketType}
            symbol={symbol}
          />
        )}
      </div>
    </div>
  );
}

/**
 * TradingView 미지원 심볼(대부분 COIN-M 선물) 일 때의 placeholder.
 * M1.5+ 에서 자체 차트 컴포넌트가 도입되면 이 분기를 대체.
 */
function NotSupportedStub({
  exchange,
  marketType,
  symbol,
}: {
  exchange: string | undefined;
  marketType: string | undefined;
  symbol: string | undefined;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[color:var(--ink-4)]">
        chart unavailable
      </div>
      <div className="font-serif text-[18px] italic leading-tight text-[color:var(--ink-2)]">
        {symbol ?? "no symbol"}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[color:var(--ink-3)]">
        {[exchange, marketType].filter(Boolean).join(" · ") || "unknown source"}
      </div>
      <div className="mt-2 max-w-xs font-sans text-[10px] leading-tight text-[color:var(--ink-4)]">
        TradingView 에서 해당 심볼을 지원하지 않습니다. M1.5+ 자체 차트에서 표시
        예정.
      </div>
    </div>
  );
}

export const KlineChartCard = memo(KlineChartCardInner);
KlineChartCard.displayName = "KlineChartCard";

export default KlineChartCard;

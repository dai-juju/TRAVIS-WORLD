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
 *   A (Hetzner 워커 WS 서버 → 프론트 직결, Supabase 미경유). M2 경로 A Step 4 Phase B
 *   (2026-06-24) 에서 경로 B → A 플립. transport="ws_direct" 인 ticker datasource 를
 *   useDataServiceRow 가 liveTopicManager 로 라우팅. 경로 B 의 500ms throttle("박동")
 *   제거가 목적. datasource 가 realtime 이면 자동으로 경로 B(Supabase Realtime) 로 폴백.
 *
 * 복합 PK 처리:
 *   Supabase postgres_changes filter 는 단일 컬럼만 지원한다. exchange +
 *   market_type + symbol 3중 PK 중 symbol 만 서버 필터로 보내고, exchange /
 *   market_type 은 useDataServiceRow options.match 콜백으로 보조 검증.
 *   M1.6 Step 3 (2026-04-26) 부터 dataService 가 datasource 단위 단일 channel 운영 →
 *   서버측 filter 미사용. match 가 symbol/exchange/marketType 매칭 모두 책임진다.
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

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { CardComponentProps } from "@/lib/cardComponentRegistry";
import {
  COMING_SOON_LABEL,
  isDatasourceSupportedByComponent,
} from "@/lib/cards/renderableDatasource";
import {
  initialFetch as dsInitialFetch,
  useDataServiceRow,
  type EqFilter,
} from "@/lib/dataService";
// M1.8 §8.5-b (2026-05-26) — 표시 단위 헬퍼 단일 진실 원천 경유.
// raw toFixed/toLocaleString 직접 호출 금지 (grep gate 검증). 자세한 정의: docs/canonical-metrics.md.
import { formatPct, formatPrice } from "@/lib/format/marketUnits";
import { formatRelativeTime } from "@/lib/format/relativeTime";
import { useLoadingTimeout } from "@/lib/hooks/useLoadingTimeout";
import { useNow } from "@/lib/hooks/useNow";
import { sanitizeTitle } from "@/lib/sanitizeTitle";

/**
 * now_{spot|futures}_ticker row 의 최소 스키마.
 * 실제 컬럼명은 M1.3 마이그레이션(`20260418000002_create_now_tables.sql`) 기준:
 *   - 24h 변동률 = `price_change_pct` (NOT `change_24h_pct`)
 *   - 고/저가 = `high_price` / `low_price` (NOT `high_24h` / `low_24h`)
 *   - USD 거래대금 = `quote_volume` (NOT `volume_24h_usd`)
 *   - `last_price` 는 nullable (거래소 응답 누락 방어)
 *
 * `& Record<string, unknown>` 인터섹션 이유:
 *   useDataServiceRow 제네릭 제약이 `T extends Record<string, unknown>` — interface
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

function TickerCardInner({ config }: CardComponentProps) {
  const { datasource, symbol, exchange, marketType } = config.data;

  // 렌더 가능성 가드 (테마 A Step 5 — registry dataShapes 파생):
  // 지원 선언하지 않은 datasource 면 구독 skip + graceful "coming soon".
  // schema superRefine(1차) 를 안 거친 경로의 표시 계층 2차 방어선.
  const renderable = isDatasourceSupportedByComponent(config.componentId, datasource);

  const priceElRef = useRef<HTMLDivElement>(null);
  const prevPriceRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PK 매처 — dataService 가 server-side filter 를 쓰지 않으므로 symbol 까지 모두 책임.
  // useCallback 으로 참조 고정해 useDataServiceRow 재구독 루프 방지.
  const match = useCallback(
    (row: TickerRow) =>
      row.symbol === symbol &&
      (!exchange || row.exchange === exchange) &&
      (!marketType || row.market_type === marketType),
    [symbol, exchange, marketType],
  );

  // 초기 SELECT — Realtime 이벤트 도착 전 최초 1회 값 채움.
  // env 누락 / SSR 호출 시 graceful null 반환 (CLAUDE.md "절대 crash 금지").
  // M1.6 Step 6c (2026-05-03, security-auditor W-1 회수): supabase.from() 직접 호출을
  // dataService 의 initialFetch helper (single mode) 로 통합 — 단일 choke point 원칙 복원.
  const initialFetch = useCallback(async (): Promise<TickerRow | null> => {
    if (!symbol) return null;
    const eq: EqFilter[] = [{ column: "symbol", value: symbol }];
    if (exchange) eq.push({ column: "exchange", value: exchange });
    if (marketType) eq.push({ column: "market_type", value: marketType });
    const row = await dsInitialFetch<TickerRow>({
      datasource,
      eq,
      single: true,
    });
    return Array.isArray(row) ? null : row;
  }, [datasource, symbol, exchange, marketType]);

  // 경로 A(ws_direct) 전용 — 토픽 조립 selector (M2 경로 A Step 4 Phase B, 활성).
  //   datasource 의 liveTopicSpec.selectorKeys=["market_type","symbol"] 와 키 일치 필수.
  //   ★ Phase B 플립(2026-06-24)으로 ticker transport=ws_direct → 이 selector 가 활성:
  //   useDataServiceRow 가 buildLiveTopic 에 넘겨 구독 토픽을 조립한다.
  //   realtime datasource(폴백 경로 B)에서는 무시됨.
  const selector = useMemo(
    () => (symbol && marketType ? { market_type: marketType, symbol } : undefined),
    [marketType, symbol],
  );

  const { data, status } = useDataServiceRow<TickerRow>({
    datasource,
    match,
    initialFetch,
    selector,
    enabled: Boolean(symbol && datasource) && renderable,
  });

  // Step 4-4 (2026-04-22) — 8 초 이상 로딩 지속 시 사용자에게 알림.
  // worker 미가동 / Supabase 보트 중 같은 상황을 "앱 죽음" 으로 오판하지 않도록.
  const { stale } = useLoadingTimeout({
    hasData: data !== null && data !== undefined,
    initialDelayMs: 8000,
  });

  // freshness 틱 (5s) — push 사이에도 "updated Ns ago" 가 흘러가도록 (IndicatorCard 재사용).
  const now = useNow(5000);

  // 옵션 C 재연결 거동 (M2 경로 A Step 4 Phase B, [10-53](a), crypto-trader 자문 + 사용자 결정):
  //   경로 A(ws_direct)에서 연결이 끊기면 liveTopicManager.mapStatus 가 활성 토픽 동안의
  //   errored/closed 를 낙관적으로 subscribing(=loading)으로 매핑한다 → 여기서
  //   "status==='loading' && data" 가 "값은 있는데 재연결 중" 신호.
  //   ① 값 흐림(opacity) ② "updated Ns ago" 로 마지막 갱신 노출 ③ 5초 유예 후 중립 문구 승격.
  //   ★ 빨간 error 금지 — 경로 B(Supabase)가 라이브러리로 재연결을 흡수하던 체감을 재현.
  //
  // W2 가드: mapStatus 는 최초 연결(connecting)도 loading 으로 매핑한다. initialFetch 가
  //   DB 값을 먼저 채운 상태에서 아직 한 번도 ready 를 못 본 "초기 로딩"을 "재연결"로
  //   오판하면 첫 화면이 흐릿하게 뜬다 → "한 번이라도 ready 였는가" 플래그로 구분.
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (status === "ready") hasConnectedRef.current = true;
  }, [status]);

  const reconnecting = hasConnectedRef.current && status === "loading" && Boolean(data);
  const reconnectStartRef = useRef<number | null>(null);
  useEffect(() => {
    // 재연결 시작 시각 기록 / 복구 시 리셋. ref 갱신만 (React 19 setState-in-effect 회피).
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
          <div className="font-mono text-[9px] tracking-[0.2em] text-[color:var(--ink-3)] uppercase">
            {config.kicker}
          </div>
        )}
        <h3
          className="mt-1 font-serif text-[20px] leading-tight tracking-tight text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeTitle(title) }}
        />
        {subtitle && (
          <div className="mt-0.5 font-mono text-[9px] tracking-[0.15em] text-[color:var(--ink-3)] uppercase">
            {subtitle}
          </div>
        )}
      </header>

      {/* 바디 ── huge price + 24h change + volume_chg_5m 근사 뱃지 */}
      <div className="mt-3 flex flex-1 flex-col justify-center">
        {!renderable ? (
          <ComingSoonStub />
        ) : status === "error" ? (
          <ErrorStub />
        ) : !data ? (
          <LoadingStub stale={stale} />
        ) : (
          <>
            {/* 값 영역 — 재연결 중이면 흐림(opacity). priceElRef 의 flash classList 조작과
                충돌하지 않도록 opacity 는 별도 래퍼에 둔다(React className 갱신이 flash
                클래스를 지우는 일 방지). */}
            <div
              className={`transition-opacity duration-300 ${
                reconnecting ? "opacity-40" : "opacity-100"
              }`}
            >
              <div
                ref={priceElRef}
                className="font-serif text-[48px] leading-[0.9] tracking-tight tabular-nums"
              >
                {data.last_price !== null ? `$${formatPrice(data.last_price)}` : "—"}
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="font-mono text-[9px] tracking-[0.1em] text-[color:var(--ink-3)] uppercase">
                  24H {formatRange(data.low_price, data.high_price)}
                </span>
                <ChangeBadge pct={data.price_change_pct} />
              </div>
              {data.volume_chg_5m !== null && (
                <div className="mt-2 flex items-center gap-1 font-mono text-[9px] tracking-[0.1em] text-[color:var(--ink-3)] uppercase">
                  <span className="text-foreground">VOL 5M {formatPct(data.volume_chg_5m)}</span>
                  <span
                    className="border border-[color:var(--ink-4)] px-1 py-0 text-[8px] tracking-[0.1em] text-[color:var(--ink-4)] uppercase"
                    title="M1.3 Step 4 폴링 기반 근사값. Step 5 WS 완료 시 실시간 전환 예정."
                  >
                    근사
                  </span>
                </div>
              )}
            </div>

            {/* freshness / 재연결 상태 라인 (옵션 C) — 흐림 래퍼 바깥(항상 선명).
                정상: "updated just now/Ns ago" 살아있음 신호. ★ 항상 노출 이유:
                  status=ready 인데 push 만 멈추는 "brownout"(연결은 살아있지만 데이터만
                  0 — [10-11] @arr stall 의 실패 모드)은 재연결 감지로 안 잡힌다. 이때
                  상대시간이 "47s ago" 로 흘러 얼어붙은 피드를 사용자가 본다(방어 가치).
                재연결 5초+: "reconnecting…" 중립 문구(빨간 error 금지).
                (정상 시 노이즈 vs 방어 가치는 B-3 라이브에서 @crypto-trader 재판단.) */}
            <div className="mt-2 flex-shrink-0 font-mono text-[8px] tracking-[0.15em] text-[color:var(--ink-4)] uppercase">
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

// formatPrice / formatPct → `@/lib/format/marketUnits` 로 이전 (M1.8 §8.5-b).
// 단일 진실 원천 원칙 — 카드별 중복 정의 금지.

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
  const borderClass = positive ? "border-[color:var(--up)]" : "border-[color:var(--down)]";
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
      <div className="space-y-1 font-mono text-[10px] tracking-[0.15em] uppercase">
        <div className="text-[color:var(--ink-4)]">··· loading (8s+)</div>
        <div className="tracking-normal text-[color:var(--down)] normal-case">
          연결 문제 가능 — Supabase/worker 상태 확인 권장
        </div>
      </div>
    );
  }
  return (
    <div className="font-mono text-[10px] tracking-[0.15em] text-[color:var(--ink-4)] uppercase">
      ··· loading
    </div>
  );
}

function ErrorStub() {
  return (
    <div className="font-mono text-[10px] tracking-[0.15em] text-[color:var(--down)] uppercase">
      ! realtime error
    </div>
  );
}

// F3 즉시 안전망 (테마 A Step 0) — 아직 전용 카드가 없는 indicator 계열 datasource 안내.
function ComingSoonStub() {
  return (
    <div className="font-mono text-[10px] tracking-[0.15em] text-[color:var(--ink-4)] uppercase">
      {COMING_SOON_LABEL}
    </div>
  );
}

export const TickerCard = memo(TickerCardInner);
TickerCard.displayName = "TickerCard";

export default TickerCard;

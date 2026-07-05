/**
 * 기본 레지스트리 항목 등록.
 *
 * M1.2: Binance 기반 반실제 dummy 4건.
 * M1.3 Step 3 (2026-04-19): dummy → 실제 레지스트리 강화 (Binance spot+usdm+coinm,
 *   8개 datasource, 1개 component ticker-card).
 * M1.5 Step 4a' (2026-04-23):
 *   - **누락된 AI-facing component 2건 등록** — `coin-list-card`, `kline-chart-card`
 *     이전에는 `apps/web/lib/registerCards.ts` 의 *React* 렌더 매핑에만 있고
 *     `componentRegistry` (AI 가 시스템 프롬프트로 보는 메타데이터) 에는 없어
 *     AI 가 두 컴포넌트의 존재를 모르고 임의 id 를 환각으로 뱉고 있었다.
 *   - **신규 `kline` datasource 추가** — kline-chart-card 의 dataShape 를 만족.
 *     실제 데이터는 TradingView widget 이 가져오지만, 의미적 완결을 위해
 *     registry 에 선언 (AI 는 "symbol + interval 을 요구한다" 는 사실만 알면 됨).
 *   - **description 영문화** — TRAVIS 는 글로벌 English-only 제품이므로
 *     AI-facing metadata 는 전부 영어. 주석은 한국어 유지 (CLAUDE.md 코드 스타일).
 *
 * M1.6 Step 0.1 긴급 수정 (2026-04-24, deferred-task §1 [1-3] 선행 회수):
 *   - **`ticker_spot` / `ticker_futures` → `now_spot_ticker` / `now_futures_ticker`**
 *     로 id 통일. 이전에는 registry id 와 실제 Supabase 테이블명이 달라 프론트
 *     카드(`CoinListCard.tsx:75`, `TickerCard.tsx:93`) 가 `supabase.from(datasource)`
 *     에 넘기는 id 가 존재하지 않는 테이블을 조회 → Realtime CHANNEL_ERROR → UI
 *     에 "! realtime error" 노출. 2024-04-24 사용자 테스트 세션에서 발견.
 *   - **대안 A 임시 적용** — id 자체를 테이블명과 일치시켜 급한 불 진화. 정식
 *     구조 결정(대안 B: `tableName` 필드 분리)은 `[3-7]` M1.6 Step 4 에서
 *     `@zod-schema-architect` 자문 경유 확정 예정. 그 시점에 대안 A 유지 /
 *     대안 B 로 승격 / Zod enum 방어선 추가 일괄 재검토.
 *   - **변경 범위는 2개 id 만** (YAGNI) — premium_index / open_interest /
 *     long_short_ratio / taker_long_short / symbols_meta / liquidation 은 현재
 *     프론트에서 사용처가 없어 이번엔 건드리지 않음. M1.6 Step 4 일괄 처리.
 *
 * 설계 원칙 (feedback_no_query_to_component_hardcoding):
 *   각 컴포넌트·데이터소스의 `description` 필드는 AI 가 **유저 의도 매칭** 에
 *   사용하는 유일한 신호다. "차트/봉/kline 키워드 → kline-chart-card" 같은
 *   하드 매핑은 절대 추가하지 않고, 대신 각 엔트리가 자기 유스케이스를
 *   명확히 선언해 AI 가 description 읽고 추론하게 한다.
 */

import { registerExchange } from "./exchangeRegistry";
import { registerDatasource } from "./datasourceRegistry";
import { registerComponent } from "./componentRegistry";
import { registerInteraction } from "./interactionRegistry";

/** 4개 레지스트리에 기본 항목을 등록한다. */
export function registerDefaults(): void {
  // ─── 거래소: Binance (spot + USDM + COINM) ──────────
  registerExchange({
    id: "binance",
    name: "Binance",
    marketTypes: ["spot", "futures_usdm", "futures_coinm"],
    baseRestUrl: "https://api.binance.com",
    baseWsUrl: "wss://stream.binance.com:9443",
    batchSupport: true,
  });

  // ─── 데이터소스: 현물 티커 ──────────────────────────
  // M1.6 Step 4 확장 (2026-04-28, [3-32] 회수): 4 → 19 필드
  //   M1.6 Step 3.5 hotfix 의 6개 새 컬럼 (price_change, weighted_avg_price,
  //   trade_count, open_time, close_time, prev_close_price) + open/high/low_price
  //   + 사전 계산 변화율 (price_chg_5m~4h, volume_chg_5m~1h, volume_ratio).
  // crypto-domain-expert 자문 (2026-04-28).
  registerDatasource({
    id: "now_spot_ticker",
    table: "now_spot_ticker",
    name: "Spot 24h Ticker",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    // 경로 A (M2 경로 A Step 4, 2026-06-23) — WS 직결 토픽 형식 선언 + 활성화(Phase B).
    //   워커(방송)·프론트(구독) 양쪽이 buildLiveTopic 으로 같은 토픽을 조립(단일 진실).
    //   prefix 에 market_type 미포함 → selectorKeys 의 market_type 세그먼트가
    //   spot/futures 를 구분(같은 prefix 공유해도 토픽 충돌 없음).
    //   ★ Phase B 플립(2026-06-24): transport "ws_direct" — 가격이 DB(경로 B)를 안 거치고
    //   워커 WS 서버에서 프론트로 직접 방송. 경로 B 의 500ms throttle("박동") 제거가 목적.
    //   배포 순서 불변식: 워커 재배포(방송 능력)가 이 플립(프론트 구독)보다 반드시 먼저.
    transport: "ws_direct",
    liveTopicSpec: {
      prefix: "binance:ticker",
      selectorKeys: ["market_type", "symbol"],
    },
    description:
      "Spot market 24h rolling ticker. Source: Binance `!ticker@arr` WS (1s push) " +
      "+ REST initial snapshot. Site parity: https://www.binance.com/en/markets/spot. " +
      "Use for single-symbol live price cards and for filtered/sorted list cards " +
      "over spot markets. Includes ALL pairs Binance API returns — USDT/USDC/FDUSD/" +
      "BTC/ETH/BNB stablecoin/crypto quotes AND regional fiat quotes (IDR/JPY/TRY/" +
      "BRL/etc.). The user may filter by quote_asset in their query (e.g. 'show " +
      "USDT pairs only', 'exclude fiat'). Note: raw quote_volume across mixed quote " +
      "currencies is not directly comparable (IDR raw values dwarf USDT due to " +
      "currency unit differences); when sorting by volume across mixed quotes, " +
      "consider filtering quote_asset first or wait for quote_volume_usd column " +
      "(deferred [3-54], M1.7 Step 7 / M2). Does NOT contain coin metadata (use " +
      "`symbols_meta`) or market-cap data (not collected).",
    queryableFields: [
      // ─── 견적통화 (M2 테마 B [10-2], 2026-06-11) ───
      //   단일 진실 = symbols.quote_asset 의 복제 컬럼 (worker tickerWsHandler 매 upsert 채움).
      //   string 유지 (enum 금지) — Binance 가 새 quote 통화를 추가해도 registry 수정 없이 자동 수용.
      //   ⚠️ not_in 은 FilterClauseSchema 에 없음 — 여기 넣으면 AI emit → schema reject 함정.
      { name: "quote_asset", type: "string", operators: ["=", "in", "!="],
        description: "Quote currency of the pair (e.g. USDT, USDC, FDUSD, BTC, BNB, TRY, IDR, EUR, JPY). Use when the user wants pairs of a specific quote currency ('USDT pairs only') or wants to exclude regional fiat quotes" },
      // ─── 가격 (Binance 사이트 'Last Price' 컬럼) ───
      { name: "last_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Latest traded price (last fill, not mark/index)", sortable: true },
      // ─── 24h 변화 (사이트 '24h Change' / '24h Change%') ───
      { name: "price_change", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in absolute terms (USDT)", sortable: true },
      { name: "price_change_pct", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in percent", sortable: true },
      // ─── 시초/고저/가중평균/이전종가 (사이트 'Open' / 'High' / 'Low') ───
      { name: "weighted_avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h volume-weighted average price (VWAP-like)", sortable: true },
      { name: "open_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Price at the start of the 24h window", sortable: true },
      { name: "high_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Highest price during the 24h window", sortable: true },
      { name: "low_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Lowest price during the 24h window", sortable: true },
      { name: "prev_close_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Price immediately before the 24h window started", sortable: true },
      // ─── 거래량 (사이트 '24h Volume(BTC)' / '24h Volume(USDT)') ───
      { name: "volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h base-asset volume (e.g. BTC for BTCUSDT)", sortable: true },
      { name: "quote_volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h quote-asset volume (e.g. USDT for BTCUSDT). Use for 'top by liquidity' screens", sortable: true },
      // ─── 체결 수 (사이트 '24h Trades') ───
      { name: "trade_count", type: "number", operators: [">", "<", ">=", "<="],
        description: "Number of trades in the 24h window", sortable: true },
      // ─── 윈도우 timestamp ───
      { name: "open_time", type: "number", operators: [">", "<", "="],
        description: "Start of the 24h window (epoch ms)" },
      { name: "close_time", type: "number", operators: [">", "<", "="],
        description: "End of the 24h window (epoch ms)" },
      // ─── 사전 계산 변화율 (TRAVIS 자체 계산, M1.3 Step 5+) ───
      { name: "price_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute price change in percent (rolling, computed by TRAVIS worker)", sortable: true },
      { name: "price_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute price change in percent (rolling)", sortable: true },
      { name: "price_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour price change in percent (rolling)", sortable: true },
      { name: "price_chg_4h", type: "number", operators: [">", "<", ">=", "<="],
        description: "4-hour price change in percent (rolling)", sortable: true },
      { name: "volume_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute volume change in percent (1m kline 5-bucket sum vs prior 5)", sortable: true },
      { name: "volume_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute volume change in percent (rolling)", sortable: true },
      { name: "volume_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour volume change in percent (rolling)", sortable: true },
      { name: "volume_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "Current volume / moving-average volume (relative-volume)", sortable: true },
      // bid_price/ask_price (b/B/a/A) — [3-40] deferred (worker 미적재).
    ],
  });

  // ─── 데이터소스: 선물 티커 (USDM + COINM 통합) ──────
  // M1.6 Step 4 확장 (2026-04-28, [3-32] 회수): 5 → 20 필드 (market_type override 포함).
  //   USDM/COINM 24hr ticker 에 bid/ask 미포함 (context7 검증 2026-04-28) —
  //   별도 `<symbol>@bookTicker` stream 필요, [3-40] deferred.
  // crypto-domain-expert 자문 (2026-04-28).
  registerDatasource({
    id: "now_futures_ticker",
    table: "now_futures_ticker",
    name: "Futures 24h Ticker",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    // 경로 A (M2 경로 A Step 4, 2026-06-23) — now_spot_ticker 와 동일 형식.
    //   USDM·COINM 모두 같은 prefix, market_type 세그먼트로 구분(spot 과도 충돌 없음).
    //   ★ Phase B 플립(2026-06-24): spot 과 함께 "ws_direct" 동시 전환(비대칭 금지 —
    //   transport.test.ts 의 ticker 2종 단언이 한쪽만 켜는 실수를 회귀 가드).
    transport: "ws_direct",
    liveTopicSpec: {
      prefix: "binance:ticker",
      selectorKeys: ["market_type", "symbol"],
    },
    description:
      "USDT-M and COIN-M perpetual futures 24h ticker. Source: Binance " +
      "`!ticker@arr` WS (1s push) + REST snapshot. Site parity: " +
      "https://www.binance.com/en/futures/markets. The `market_type` field " +
      "distinguishes futures_usdm vs futures_coinm. Use for derivatives price " +
      "cards and filtered lists over perpetual markets. " +
      "Note: this datasource does NOT contain coin metadata (use `symbols_meta`) " +
      "or bid/ask quotes (use a bookTicker stream — currently unavailable).",
    queryableFields: [
      // market_type override — commonField 의 spot 포함 enum 이 아닌, 선물 2종만.
      { name: "market_type", type: "enum", operators: ["=", "in"],
        enumValues: ["futures_usdm", "futures_coinm"],
        description: "Distinguishes USDT-margined ('futures_usdm') from coin-margined ('futures_coinm') perpetuals" },
      // ─── 견적통화 (M2 테마 B [10-2], 2026-06-11) — spot 과 동일 패턴 ───
      { name: "quote_asset", type: "string", operators: ["=", "in", "!="],
        description: "Quote currency — USDM is mostly USDT with some USDC pairs; COINM is USD. Use to narrow to USDT- or USDC-quoted perpetuals" },
      // 가격 (last/change/wap/open/high/low) ─ SPOT 과 동일 의미
      { name: "last_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Latest traded price (distinct from mark price)", sortable: true },
      { name: "price_change", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in absolute terms", sortable: true },
      { name: "price_change_pct", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h price change in percent", sortable: true },
      { name: "weighted_avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h volume-weighted average price", sortable: true },
      { name: "open_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Price at start of the 24h window", sortable: true },
      { name: "high_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Highest price during the 24h window", sortable: true },
      { name: "low_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Lowest price during the 24h window", sortable: true },
      // 거래량 (USDM/COINM 단위 다름 — 단위 변환은 [3-48] deferred)
      { name: "volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h volume — USDM: base-asset units; COINM: number of contracts (USD comparison needs conversion, [3-48])", sortable: true },
      { name: "quote_volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h quote volume in USDT (USDM only; COINM returns NULL)", sortable: true },
      { name: "base_volume", type: "number", operators: [">", "<", ">=", "<="],
        description: "24h base-asset volume (COINM only; USDM returns NULL)", sortable: true },
      // 체결 수 + 윈도우
      { name: "trade_count", type: "number", operators: [">", "<", ">=", "<="],
        description: "Number of trades in the 24h window", sortable: true },
      { name: "open_time", type: "number", operators: [">", "<", "="],
        description: "Start of the 24h window (epoch ms)" },
      { name: "close_time", type: "number", operators: [">", "<", "="],
        description: "End of the 24h window (epoch ms)" },
      // 사전 계산 변화율 (SPOT 과 동일 구조)
      { name: "price_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute price change in percent (rolling)", sortable: true },
      { name: "price_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute price change in percent (rolling)", sortable: true },
      { name: "price_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour price change in percent (rolling)", sortable: true },
      { name: "price_chg_4h", type: "number", operators: [">", "<", ">=", "<="],
        description: "4-hour price change in percent (rolling)", sortable: true },
      { name: "volume_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute volume change in percent", sortable: true },
      { name: "volume_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute volume change in percent", sortable: true },
      { name: "volume_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour volume change in percent", sortable: true },
      { name: "volume_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "Current volume / moving-average volume", sortable: true },
    ],
  });

  // ─── 데이터소스: premiumIndex (펀딩레이트 + 마크가) ─
  // M1.6 Step 4 확장 (2026-04-28): 3 → 6 필드. crypto-domain-expert 자문.
  // M2 테마 A Step 2 재정합 (2026-06-09, [10-7] 동반 + registry↔DB drift 회수):
  //   M1.8 §8.1 에서 DB 가 `last_funding_rate` → `predicted_funding_rate` 로 RENAME
  //   되고 `last_settled_funding_rate` / `last_settled_funding_time` 가 신설됐는데
  //   registry 는 옛 이름을 그대로 들고 있던 drift 를 수정. canonical-metrics.md §2.1
  //   "Predicted vs Realized 2분리" 와 정합 (crypto-domain-expert 자문 2026-06-09).
  //   ⚠️ basis 3종은 별도 `basis` datasource 로 분리 (사이트 위젯 경계 다름).
  registerDatasource({
    id: "premium_index",
    table: "now_futures_indicator",
    name: "Futures Premium Index (Funding + Mark)",
    category: "_now",
    refreshTier: "high",
    exchangeId: "binance",
    // 경로 A fast-follow #1 Step 5 (2026-06-26) — ★ transport 플립: 마크/펀딩이 DB(경로 B)를
    //   안 거치고 워커 WS 서버에서 프론트로 직접 방송(경로 A). 경로 B 의 500ms throttle
    //   ("박동") 제거가 목적. ticker(2026-06-24) 와 동일 패턴.
    //   ★ 배포 순서 불변식: 워커 재배포(방송 능력, B-1)가 이 플립(프론트 구독)보다 먼저.
    transport: "ws_direct",
    // markPrice WS 는 7컬럼만 부분 방송 → "partial" 병합 필수: REST 폴러가 채운
    //   last_settled_funding_rate / interest_rate(8h 고정)를 1초 markPrice push 가
    //   덮어 지우지 않도록 prev seed 위에 덮어쓰기 (Step 2 mergeRow).
    mergeMode: "partial",
    // 워커(방송)·프론트(구독)가 buildLiveTopic 으로 같은 토픽을 조립(단일 진실).
    //   prefix 가 네임스페이스 통째 = 다른 datasource 와 충돌 없음. selectorKeys 의
    //   market_type 세그먼트가 USDM/COINM 구분. (Step 3 추가, Step 5 에서 transport 와 정합.)
    liveTopicSpec: {
      prefix: "binance:premium_index",
      selectorKeys: ["market_type", "symbol"],
    },
    description:
      "Perpetual futures mark price, index price, next funding time, and " +
      "funding rate (both predicted-next and last-settled). Source: Binance " +
      "`!markPrice@arr@1s` WS (predicted) + `/fapi/v1/premiumIndex` REST (settled). " +
      "Site parity: https://www.binance.com/en/futures/funding-history/perpetual/real-time-funding-rate. " +
      "Funding settles every 4h or 8h depending on the symbol (discrete event); " +
      "for history use `history_futures_indicator`.",
    queryableFields: [
      { name: "mark_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Mark price — used for liquidation and unrealized P&L. Smoothed, distinct from last_price", sortable: true },
      { name: "index_price", type: "number", operators: [">", "<", ">=", "<=", "="],
        description: "Spot index price (basket of major spot exchanges)", sortable: true },
      { name: "estimated_settle_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Estimated settlement price (only meaningful within 1h before delivery for dated contracts; perpetuals hide it)", sortable: true },
      { name: "predicted_funding_rate", type: "number", operators: [">", "<", ">=", "<="],
        description: "Predicted next funding rate (updates every 1s). Positive = longs pay shorts. Decimal (0.0001 = 0.01%) — display layer must `*100` for %", sortable: true },
      { name: "last_settled_funding_rate", type: "number", operators: [">", "<", ">=", "<="],
        description: "Realized funding rate from the last settlement (fixed until next settlement). Decimal — display layer must `*100` for %", sortable: true },
      { name: "last_settled_funding_time", type: "number", operators: [">", "<", "="],
        description: "Timestamp of the last funding settlement (epoch ms)" },
      { name: "interest_rate", type: "number", operators: [">", "<", ">=", "<="],
        description: "Reference interest rate component of funding (typically 0.0001 = 0.01% per interval)", sortable: true },
      { name: "next_funding_time", type: "number", operators: [">", "<", "="],
        description: "Next funding settlement timestamp (epoch ms). Funding settles every 4h or 8h", sortable: true },
    ],
  });

  // ─── 데이터소스: Basis (선물-현물 괴리) ─────────────
  // M2 테마 A Step 2 신설 (2026-06-09, crypto-domain-expert 자문):
  //   basis 는 funding/mark 와 사이트 위젯 경계가 다른 별개 패널이라 premium_index 에
  //   합치지 않고 별도 논리 datasource 로 분리 (물리 테이블은 now_futures_indicator 공유).
  //   annualized_basis_rate 는 PERPETUAL 환경에서 Binance 가 빈 문자열로 비워 → DB 컬럼만
  //   존재하고 queryableField 로는 노출 안 함 (canonical-metrics.md §2.5, 값 자체 부재).
  registerDatasource({
    id: "basis",
    table: "now_futures_indicator",
    name: "Futures Basis (Futures − Index)",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Perpetual futures basis — the gap between futures price and the spot " +
      "index. Source: Binance `/futures/data/basis` (contractType=PERPETUAL) REST " +
      "polling. Stored in `now_futures_indicator`. Positive basis = futures trading " +
      "above spot (contango); negative = below (backwardation). Distinct from funding.",
    queryableFields: [
      { name: "basis", type: "number", operators: [">", "<", ">=", "<="],
        description: "Basis in quote currency (futuresPrice − indexPrice, USD absolute)", sortable: true },
      { name: "basis_rate", type: "number", operators: [">", "<", ">=", "<="],
        description: "Basis as a fraction of index price (decimal, 0.0002 = 0.02%) — display layer must `*100` for %", sortable: true },
    ],
  });

  // ─── 데이터소스: Open Interest (미결제약정) ─────────
  // M1.6 Step 4 확장 (2026-04-28): 1 → 5 필드 — oi_chg_5m/15m/1h/4h 추가.
  //   워커는 이미 계산하고 있었으나 registry 미등록으로 AI 가 모르고 있던 결함.
  //   crypto-domain-expert 자문 (2026-04-28).
  // 단위 변환 deferred [3-48]: USDM = base-asset units, COINM = contract count.
  registerDatasource({
    id: "open_interest",
    table: "now_futures_indicator",
    name: "Futures Open Interest",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Aggregate futures open interest (OI). Source: Binance `/fapi/v1/openInterest` " +
      "REST polling (~5min). Site parity: https://www.binance.com/en/futures/funding-history/perpetual/open-interest-statistics. " +
      "Used for trend reversal and liquidation-risk scanning. Stored in " +
      "`now_futures_indicator`.",
    queryableFields: [
      { name: "open_interest", type: "number", operators: [">", "<", ">=", "<="],
        description: "Total open interest. USDM: base-asset units; COINM: contract count (USD comparison needs conversion, [3-48])", sortable: true },
      { name: "oi_chg_5m", type: "number", operators: [">", "<", ">=", "<="],
        description: "5-minute OI change in percent (rolling)", sortable: true },
      { name: "oi_chg_15m", type: "number", operators: [">", "<", ">=", "<="],
        description: "15-minute OI change in percent (rolling)", sortable: true },
      { name: "oi_chg_1h", type: "number", operators: [">", "<", ">=", "<="],
        description: "1-hour OI change in percent (rolling)", sortable: true },
      { name: "oi_chg_4h", type: "number", operators: [">", "<", ">=", "<="],
        description: "4-hour OI change in percent (rolling)", sortable: true },
    ],
  });

  // ─── 데이터소스: Long/Short Ratio ───────────────────
  // M1.6 Step 4 확장 (2026-04-28): 2 → 9 필드 — top trader (account/position 양 축)
  //   + global account 분리. crypto-domain-expert 자문 (2026-04-28).
  // 트레이더 관점: LSR > 1 ≠ 강세. 흔히 contrarian 지표 (개미 다수 = 반대 방향).
  registerDatasource({
    id: "long_short_ratio",
    table: "now_futures_indicator",
    name: "Long/Short Account Ratio",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Long/short account and position ratios. Source: Binance " +
      "`/futures/data/topLongShortAccountRatio` + `globalLongShortAccountRatio` " +
      "REST polling. Site parity: https://www.binance.com/en/futures/funding-history/perpetual/long-short-ratio. " +
      "Top-trader vs global metrics distinguish 'whale' vs 'crowd' sentiment.",
    queryableFields: [
      // Top traders — account count basis
      { name: "top_ls_ratio_accounts", type: "number", operators: [">", "<", ">=", "<="],
        description: "Top-trader long/short ratio by account count. >1 means more accounts long than short", sortable: true },
      { name: "top_long_account", type: "number", operators: [">", "<", ">=", "<="],
        description: "Fraction of top-trader accounts that are net long (0..1)" },
      { name: "top_short_account", type: "number", operators: [">", "<", ">=", "<="],
        description: "Fraction of top-trader accounts that are net short (0..1)" },
      // Top traders — position size basis
      { name: "top_ls_ratio_positions", type: "number", operators: [">", "<", ">=", "<="],
        description: "Top-trader long/short ratio by position size (notional). Different from account-count ratio", sortable: true },
      { name: "top_long_position", type: "number", operators: [">", "<", ">=", "<="],
        description: "Fraction of top-trader notional that is long (0..1)" },
      { name: "top_short_position", type: "number", operators: [">", "<", ">=", "<="],
        description: "Fraction of top-trader notional that is short (0..1)" },
      // All traders (USDM only)
      { name: "global_ls_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "All-trader long/short account ratio (USDM only; NULL for COINM)", sortable: true },
      { name: "global_long_account", type: "number", operators: [">", "<", ">=", "<="],
        description: "Fraction of all accounts net long (0..1, USDM only)" },
      { name: "global_short_account", type: "number", operators: [">", "<", ">=", "<="],
        description: "Fraction of all accounts net short (0..1, USDM only)" },
    ],
  });

  // ─── 데이터소스: Taker Long/Short Volume Ratio ──────
  // M1.6 Step 4 확장 (2026-04-28): 1 → 3 필드 — taker_buy_vol / taker_sell_vol 절대값 추가.
  //   crypto-domain-expert 자문 (2026-04-28).
  // 트레이더 관점: LSR 은 '포지션', taker 비율은 '체결' — 다른 신호.
  registerDatasource({
    id: "taker_long_short",
    table: "now_futures_indicator",
    name: "Taker Buy/Sell Volume Ratio",
    category: "_now",
    refreshTier: "mid",
    exchangeId: "binance",
    description:
      "Taker-side aggressive buy vs sell volume. Source: Binance " +
      "`/futures/data/takerlongshortRatio` REST polling (5m bucket). " +
      "Site parity: https://www.binance.com/en/futures/funding-history/perpetual/taker-buy-sell-volume. " +
      "Immediate read of aggressive side dominance; commonly used by scalpers " +
      "as momentum signal.",
    queryableFields: [
      { name: "taker_buy_sell_ratio", type: "number", operators: [">", "<", ">=", "<="],
        description: "Taker buy volume / taker sell volume. >1 = aggressive buyers dominate. Distinct from long/short ratio", sortable: true },
      { name: "taker_buy_vol", type: "number", operators: [">", "<", ">=", "<="],
        description: "Taker buy volume in the period (typically 5m bucket)", sortable: true },
      { name: "taker_sell_vol", type: "number", operators: [">", "<", ">=", "<="],
        description: "Taker sell volume in the period", sortable: true },
    ],
  });

  // ─── 데이터소스: 심볼 마스터 ─────────────────────────
  // M1.6 Step 4 확장 (2026-04-28): 3 → 8 필드 — contract_type / onboard_date /
  //   delivery_date / price_precision / quantity_precision 추가.
  //   crypto-domain-expert 자문 (2026-04-28).
  // M1.4 Step 4.7 사고 (SETTLING 심볼이 +391% 로 등장) 의 핵심 필드 status.
  registerDatasource({
    id: "symbols_meta",
    table: "symbols",
    name: "Symbol Metadata",
    category: "exchange",
    refreshTier: "low",
    exchangeId: "binance",
    description:
      "Tradable symbol catalog and exchange filters (tick_size, step_size, " +
      "min_notional). Source: Binance `/api/v3/exchangeInfo` (spot) + " +
      "`/fapi/v1/exchangeInfo` (USDM) + `/dapi/v1/exchangeInfo` (COINM). " +
      "Site parity: exchange 'Markets' tabs. Stored in the `symbols` table. " +
      "Note: this datasource does NOT contain price/volume/OI data — use " +
      "`now_spot_ticker` / `now_futures_ticker` / `open_interest` for those.",
    queryableFields: [
      { name: "base_asset", type: "string", operators: ["=", "in", "contains"],
        description: "Base asset code (e.g. 'BTC' for BTCUSDT). Use to find all markets for a coin" },
      { name: "quote_asset", type: "string", operators: ["=", "in", "contains"],
        description: "Quote asset code (e.g. 'USDT', 'USD', 'BTC')" },
      { name: "status", type: "enum", operators: ["=", "in"],
        enumValues: ["TRADING", "HALT", "BREAK", "SETTLING", "CLOSE", "PENDING_TRADING"],
        description: "Trading lifecycle status. Only 'TRADING' is normal — others are pre-launch, halted, or delisted" },
      // [10-22] (2026-06-11): TRADIFI_PERPETUAL 추가 — DB 에 28종 실존 (tokenized
      //   stock perp, 예: SKHYNIXUSDT). registry enum 누락 drift 수정.
      { name: "contract_type", type: "enum", operators: ["=", "in"],
        enumValues: ["PERPETUAL", "CURRENT_QUARTER", "NEXT_QUARTER", "TRADIFI_PERPETUAL"],
        description: "Futures contract type (NULL for spot). PERPETUAL has no expiry; quarterly contracts deliver; TRADIFI_PERPETUAL are tokenized-stock perpetuals" },
      { name: "onboard_date", type: "number", operators: [">", "<", ">=", "<="],
        description: "Listing date (epoch ms). Use to filter recently-listed coins", sortable: true },
      { name: "delivery_date", type: "number", operators: [">", "<", ">=", "<="],
        description: "Delivery date for dated futures (far-future for perpetuals)" },
      { name: "price_precision", type: "number", operators: ["=", ">", "<"],
        description: "Decimal places for price (e.g. 2 means $123.45)" },
      { name: "quantity_precision", type: "number", operators: ["=", ">", "<"],
        description: "Decimal places for quantity" },
    ],
  });

  // ─── 데이터소스: Liquidation ───────────────────────
  // M1.6 Step 4 확장 (2026-04-28): 3 → 9 필드 — price / avg_price / last_filled_qty /
  //   accumulated_qty / order_status / recorded_at 추가.
  //   crypto-domain-expert 자문 (2026-04-28).
  // 트레이더 관점: BUY 청산 = 숏 강제청산 (가격 위로 튐). SELL 청산 = 롱 강제청산 (가격 아래로).
  //   직관과 반대 방향이라 토스트/카드 표기 시 주의.
  registerDatasource({
    id: "liquidation",
    table: "history_futures_liquidation",
    name: "Liquidation Event Log",
    category: "_history",
    refreshTier: "realtime",
    exchangeId: "binance",
    // 경로 A fast-follow #2 Step 3b (2026-06-27) — liveTopicSpec 선등록(휴면).
    //   기존 경로 B(Realtime INSERT on history_futures_liquidation)는 그대로 두고 경로 A
    //   토픽 조립 능력만 추가. ★ "둘 다"(사용자 결정): selectorKeys["market_type"](전체 tape)
    //   + optionalSelectorKeys["symbol"](심볼별) → AI 가 카드에 symbol 넣으면 심볼 토픽,
    //   비우면 tape 토픽(buildLiveTopics fan-out, Step 3a 토대).
    //   ★ transport 는 realtime 유지(휴면, 과도기 console.warn 의도된 것) — 워커 재배포(방송)
    //   후 Phase B(Step 6)에서 ws_direct 플립. ff#1 premium_index 배포 순서 불변식과 동일.
    liveTopicSpec: {
      prefix: "binance:liquidation",
      selectorKeys: ["market_type"],
      optionalSelectorKeys: ["symbol"],
    },
    // [10-72] (2026-07-05) under-report 명시: Binance 는 심볼당 초당 최대 1건만
    //   push(sampled) → "총 청산액" 표방 금지가 도메인 위생. AI 가 이 특성을 읽고
    //   subtitle 에 자연어로 고지(사용자 결정 — 카드 하드 뱃지 대신 registry-driven).
    description:
      "Forced liquidation events on perpetual futures (USDM and COINM; spot " +
      "has no liquidations). Source: Binance `!forceOrder@arr` WS. Covers the " +
      "whole market as an event tape, or a single symbol when one is specified. " +
      "IMPORTANT: Binance emits at most ONE event per symbol per second — this " +
      "is a sampled stream that under-reports true liquidation totals. Never " +
      "present these events as complete/total liquidation volume; card " +
      "subtitles should disclose the sampled nature (e.g. 'sampled stream'). " +
      "Although `_history` category, supports real-time queries for " +
      "'last N minutes' liquidation patterns.",
    queryableFields: [
      { name: "side", type: "enum", operators: ["=", "in"],
        enumValues: ["BUY", "SELL"],
        description: "Liquidation side. BUY = a SHORT position was force-closed (price went up). SELL = a LONG position was force-closed (price went down)" },
      { name: "price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Liquidation price", sortable: true },
      { name: "avg_price", type: "number", operators: [">", "<", ">=", "<="],
        description: "Average fill price across the liquidation", sortable: true },
      // [10-72] USD 명목가 — 워커 enrich (USDM z×ap / COINM z×contractSize).
      //   임계값 필터("liquidations over $100k")·biggest 정렬의 canonical 타깃.
      { name: "notional", type: "number", operators: [">", "<", ">=", "<="],
        description: "USD notional value of the liquidation (works across USDM and COINM). Preferred field for size thresholds (e.g. 'over $100k') and 'biggest liquidations' sorting. NULL for events recorded before 2026-07",
        sortable: true },
      { name: "quantity", type: "number", operators: [">", "<", ">=", "<="],
        description: "Liquidation order size (USDM: base-asset units, COINM: contracts). For USD size prefer `notional`", sortable: true },
      { name: "last_filled_qty", type: "number", operators: [">", "<", ">=", "<="],
        description: "Quantity filled in the last partial fill" },
      { name: "accumulated_qty", type: "number", operators: [">", "<", ">=", "<="],
        description: "Cumulative filled quantity" },
      { name: "order_status", type: "enum", operators: ["=", "in"],
        enumValues: ["FILLED", "PARTIALLY_FILLED"],
        description: "Order final state" },
      { name: "trade_time", type: "number", operators: [">", "<", "="],
        description: "Liquidation timestamp (epoch ms via timestamptz). Use for 'last N minutes' filters", sortable: true },
      { name: "recorded_at", type: "number", operators: [">", "<", "="],
        description: "When TRAVIS recorded the row (DB-side timestamp)", sortable: true },
    ],
  });

  // ─── 데이터소스: Kline (OHLC candlestick) ──────────
  // M1.5 Step 4a' 신규 — kline-chart-card 의 dataShape 를 만족시키기 위한
  //   의미적 등록. 실제 데이터는 TradingView 위젯이 외부에서 가져온다
  //   (chart 렌더링 경로와 데이터 경로 양쪽을 TV 가 담당).
  //   AI 에게는 "symbol + interval 을 요구하는 candlestick chart data source"
  //   로만 노출되면 충분.
  registerDatasource({
    id: "kline",
    name: "Candlestick OHLC (Klines)",
    category: "exchange",
    refreshTier: "realtime",
    exchangeId: "binance",
    description:
      "Open/High/Low/Close candlestick (kline) data for a single symbol " +
      "at a chosen timeframe interval (e.g. 1m, 5m, 15m, 1h, 4h, 1d). " +
      "Rendered via embedded TradingView chart widget; the widget fetches " +
      "its own data, so card configs only need to specify symbol and interval.",
    queryableFields: [
      {
        name: "interval",
        type: "enum",
        operators: ["=", "in"],
        enumValues: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
        description: "Candle timeframe",
      },
    ],
  });

  // ─── 컴포넌트: TickerCard ──────────────────────────
  registerComponent({
    id: "ticker-card",
    name: "Ticker Card",
    description:
      "Compact card showing a single symbol's live price with its 24h " +
      "percent change and quote volume. Use when the user wants to track " +
      "the current value of one specific market. Updates via Supabase " +
      "Realtime row subscription (updateMode: value).",
    supportedSizes: ["sm", "md"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "sm",
    // 경로 A 단일 토픽 구독 카드 — 필수 selectorKey(market_type+symbol) 스키마 강제 대상.
    subscribesByTopic: true,
  });

  // ─── 컴포넌트: TableCard (모양-제네릭 표) ──────────
  // Composable Expressiveness Stage 1 (2026-06-30) — coin-list-card(티커 전용)와
  //   indicator-list-card(지표 전용)를 하나로 수렴. "표는 어떤 set datasource 든
  //   받는다" (Form↔Data 직교, PRD §2). dataShapes 7종(티커 2 + 지표 5) union →
  //   AI 가 datasource description 으로 의도 추론해 무엇이든 표로 렌더 (하드매핑 X).
  registerComponent({
    id: "table-card",
    name: "Table Card",
    description:
      "Generic multi-symbol table that renders many symbols at once as " +
      "sortable rows, for any supported snapshot dataset — live price tickers " +
      "or perpetual-futures indicators (funding, basis, open interest, " +
      "long/short ratios, taker buy/sell). Rows join and leave reactively as " +
      "underlying rows match or unmatch the filter/sort/limit criteria " +
      "(updateMode: content). Columns, units, and ordering adapt to the chosen " +
      "data source. Use for leaderboards, screeners, rankings, or " +
      "'top N by <metric>' over many symbols — e.g. top gainers, highest " +
      "funding, largest open interest. Tip: open interest units differ between " +
      "futures_usdm (base asset) and futures_coinm (contracts) — filter " +
      "market_type to keep rankings comparable.",
    supportedSizes: ["md", "lg", "xl"],
    supportedUpdateModes: ["content"],
    dataShapes: [
      // quote_volume 는 표시 컬럼이 아니라 정렬 타깃(예시 프롬프트 "24h Volume Leaders").
      //   now_futures_ticker 는 그 정렬 수요가 약해 미요구 — 옛 두 카드 비대칭 그대로 계승(S1/S3 자문).
      {
        datasourceId: "now_spot_ticker",
        requiredFields: ["last_price", "price_change_pct", "quote_volume"],
      },
      {
        datasourceId: "now_futures_ticker",
        requiredFields: ["last_price", "price_change_pct"],
      },
      {
        datasourceId: "premium_index",
        requiredFields: ["predicted_funding_rate", "mark_price", "next_funding_time"],
      },
      {
        datasourceId: "basis",
        requiredFields: ["basis", "basis_rate"],
      },
      {
        datasourceId: "open_interest",
        requiredFields: ["open_interest", "oi_chg_1h"],
      },
      {
        datasourceId: "long_short_ratio",
        requiredFields: ["top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio"],
      },
      {
        datasourceId: "taker_long_short",
        requiredFields: ["taker_buy_sell_ratio", "taker_buy_vol"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "md",
  });

  // ─── 컴포넌트: KlineChartCard ──────────────────────
  registerComponent({
    id: "kline-chart-card",
    name: "Kline Chart Card",
    description:
      "Candlestick (OHLC) chart for a single symbol at a chosen timeframe " +
      "interval (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w). Renders via embedded " +
      "TradingView widget. Use when the user wants a visual price history " +
      "(keywords they may use: chart, candle, kline, candlestick, " +
      "OHLC, timeframe, minute/hour/day chart).",
    supportedSizes: ["md", "lg", "xl"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      {
        datasourceId: "kline",
        requiredFields: ["interval"],
      },
    ],
    supportedInteractions: [],
    defaultSize: "lg",
  });

  // ─── 컴포넌트: IndicatorCard ──────────────────────
  // M2 테마 A Step 2 신규 (2026-06-09) — now_futures_indicator 의 단일 심볼 지표 카드.
  //   AI 가 고른 datasource(premium_index / basis / open_interest / long_short_ratio /
  //   taker_long_short)에 따라 해당 metric 그룹을 적응 렌더. dataShapes 로 5개 indicator
  //   datasource 모두 지원 선언 → AI 가 description 읽고 의도 추론해 datasource 선택.
  registerComponent({
    id: "indicator-card",
    name: "Indicator Card",
    description:
      "Single-symbol derivatives indicator card for perpetual futures. Shows " +
      "one metric group at a time depending on the chosen data source: funding " +
      "rate (predicted + last settled) with mark/index and countdown, basis, " +
      "open interest with its change rates, long/short ratios (top accounts, top " +
      "positions, global) with taker buy/sell, or taker buy/sell volume. Use when " +
      "the user wants to see funding, open interest, long/short ratio, taker flow, " +
      "or basis for one specific symbol (updateMode: value). For a multi-symbol " +
      "ranked screen of these metrics, use a list-style card instead.",
    supportedSizes: ["sm", "md"],
    supportedUpdateModes: ["value"],
    dataShapes: [
      {
        datasourceId: "premium_index",
        requiredFields: ["predicted_funding_rate", "mark_price", "next_funding_time"],
      },
      {
        datasourceId: "basis",
        requiredFields: ["basis", "basis_rate"],
      },
      {
        datasourceId: "open_interest",
        requiredFields: ["open_interest", "oi_chg_1h"],
      },
      {
        datasourceId: "long_short_ratio",
        requiredFields: ["top_ls_ratio_accounts", "top_ls_ratio_positions", "global_ls_ratio"],
      },
      {
        datasourceId: "taker_long_short",
        requiredFields: ["taker_buy_sell_ratio"],
      },
    ],
    supportedInteractions: ["spawn"],
    defaultSize: "sm",
    // 경로 A 단일 토픽 구독 카드(premium_index ws_direct) — 필수 selectorKey 스키마 강제 대상.
    subscribesByTopic: true,
  });

  // ─── 인터랙션: Spawn ───────────────────────────────
  registerInteraction({
    id: "spawn",
    name: "Spawn New Card",
    type: "spawn",
    description:
      "Clicking a row in an existing card creates a new card on the canvas. " +
      "Example: clicking BTC in a coin list spawns a TickerCard for BTCUSDT.",
    params: [
      {
        name: "targetComponentId",
        type: "string",
        required: true,
        description: "ID of the component to spawn (e.g. 'ticker-card')",
      },
      {
        name: "symbol",
        type: "string",
        required: true,
        description: "Target symbol (e.g. 'BTCUSDT')",
      },
    ],
  });
}

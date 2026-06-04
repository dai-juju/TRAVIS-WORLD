// IDataService — TRAVIS 데이터 접근 추상화 계약.
//
// 모든 Supabase 호출은 이 인터페이스를 통과한다. apps/web·apps/worker·
// 향후 AI 오케스트레이터(M1.5)는 `.from(...)`을 직접 부르지 않고 반드시
// `dataService.xxx()`를 쓴다. 이로써 M2+에서 Supabase →
// TimescaleDB/ClickHouse 전환이 필요할 때, 구현체 하나만 교체하면 된다.
//
// M1.3 Step 2 범위(2026-04-19):
//   - Step 3~5 워커가 즉시 호출할 "쓰기 11개"
//   - dataService 배관 자체가 동작함을 검증할 "읽기 2개"
//
// M1.4·M1.5에서 카드/오케스트레이터용 query* 메서드가 추가될 때
// 반드시 "인터페이스 먼저 정의 → SupabaseDataService 구현"
// 순서로. 추측성 선언 금지(deferred decision 원칙).
//
// 에러 처리:
//   모든 메서드는 throw하지 않고 Result<T>를 반환. 호출자는
//   if (res.success) 패턴으로 분기. CLAUDE.md "절대 crash 금지" 준수.

import type { MarketType } from "@travis/shared";
import type {
  BehaviorLogInsert,
  ChatLogInsert,
  HistoryFuturesIndicatorInsert,
  HistoryFuturesKlineInsert,
  HistoryFuturesLiquidationInsert,
  HistoryFuturesTickerInsert,
  HistorySpotKlineInsert,
  HistorySpotTickerInsert,
  NowFuturesIndicatorInsert,
  NowFuturesTickerInsert,
  NowSpotTickerInsert,
  Result,
  SymbolInsert,
  SymbolRow,
  NowSpotTickerRow,
  ValidationFailureInsert,
} from "./types/index";

// ─── 읽기 파라미터 ─────────────────────────────────

/** getSymbols의 필터 옵션 — 선택 필드만 주면 됨. 비어있으면 전체 반환. */
export interface GetSymbolsFilter {
  exchange?: string;
  marketType?: MarketType;
  /** 'TRADING' 등 상태 필터. 생략 시 상태 무관. */
  status?: string;
}

/**
 * getMaxRecordedAt 의 조회 키 (M1.9 Step 2).
 * 자연 키 5축 중 3축으로 고정 — 나머지 (symbol, recorded_at) 은 MAX 대상이라 비움.
 */
export interface GetMaxRecordedAtFilter {
  exchange: string;
  marketType: MarketType;
  /** '5m' | '1h' | ... history 격자 interval. data-service 는 거래소 비결합 위해 string. */
  interval: string;
}

// ─── 인터페이스 ────────────────────────────────────

export interface IDataService {
  // ─── 쓰기: 심볼 마스터 ────────────────────────
  /**
   * 심볼 메타를 upsert.
   * PK (exchange, market_type, symbol) 충돌 시 전체 행 갱신.
   * 워커가 exchangeInfo 폴링 직후 호출 → 상장/폐지 자동 반영.
   */
  upsertSymbols(rows: SymbolInsert[]): Promise<Result<void>>;

  /**
   * symbols.funding_interval_hours 만 partial update (M1.8 §8.2a-2 신설, 2026-05-26).
   * fundingInfoTask 가 24h 주기로 호출 — 다른 컬럼 (base_asset / status 등) 미보유 상태에서
   * funding_interval_hours 만 갱신. `defaultToNull: false` 로 다른 컬럼 NULL 덮어쓰기 차단.
   *
   * D9 (in-memory Map + DB dual-write) 구현의 DB 측. M2 거래소 다변화 시 fundingInfo 영역
   * 확장 시 동일 패턴.
   */
  updateSymbolFundingIntervalHours(
    rows: Array<{
      exchange: string;
      market_type: string;
      symbol: string;
      funding_interval_hours: number;
    }>,
  ): Promise<Result<void>>;

  // ─── 쓰기: _now (최신 스냅샷) ─────────────────
  upsertNowSpotTicker(rows: NowSpotTickerInsert[]): Promise<Result<void>>;
  upsertNowFuturesTicker(rows: NowFuturesTickerInsert[]): Promise<Result<void>>;

  /**
   * now_spot_ticker / now_futures_ticker 의 **부분 UPDATE** (M1.6 Step 4 hotfix B).
   *
   * 사유: WS 가 매초 c/o/h/l/v/q (mini 6필드) 적재 + REST 가 1분마다 P/p/w/n/O/C
   *   (24h 변화율 6필드) 적재 — 두 소스가 서로 다른 컬럼만 update 해야 race
   *   회피. 일반 upsert 면 REST 의 1분 stale `c` 가 WS 의 1초 fresh `c` 를
   *   덮어씌움 → 가격 후퇴 버그.
   *
   * 두 가지 불변 (Indicator 와 동일):
   *  1) 반드시 **배열 시그니처**로 호출.
   *  2) 같은 배치 내 모든 row 는 동일한 key 집합.
   *     ticker24hrBatchTask 의 출력은 PK 3개 + P/p/w/n/O/C 만 — 균일.
   */
  upsertNowSpotTickerPartial(rows: NowSpotTickerInsert[]): Promise<Result<void>>;
  upsertNowFuturesTickerPartial(
    rows: NowFuturesTickerInsert[],
  ): Promise<Result<void>>;

  /**
   * now_futures_indicator의 **부분 UPDATE**.
   * 호출자는 PK 3개(exchange/market_type/symbol) + 자기 도메인 컬럼만
   * 포함한 row를 넘긴다. 객체에 없는 키는 SQL 컬럼 리스트에서 빠져
   * 다른 소스(펀딩/OI/롱숏비율)가 이미 쓴 값이 NULL로 덮어씌워지지 않는다.
   */
  upsertNowFuturesIndicatorPartial(
    rows: NowFuturesIndicatorInsert[],
  ): Promise<Result<void>>;

  // ─── 쓰기: _history (시계열 축적, INSERT only) ─
  insertHistorySpotTicker(rows: HistorySpotTickerInsert[]): Promise<Result<void>>;
  insertHistoryFuturesTicker(rows: HistoryFuturesTickerInsert[]): Promise<Result<void>>;
  insertHistoryFuturesIndicator(rows: HistoryFuturesIndicatorInsert[]): Promise<Result<void>>;

  /**
   * history_futures_indicator 자연 키 upsert (M1.8.5 Step 3, 2026-05-31).
   *
   * backfill 전용 — 6 metric 이 동일 (symbol, interval, recorded_at) 에 대해 각 endpoint 에서
   * 따로 들어와도 자연 키 5축 UNIQUE INDEX(history_futures_indicator_natural_pk) 의 ON CONFLICT
   * DO UPDATE 로 한 row 에 metric 컬럼이 누적 머지된다. defaultToNull:false 로 객체에 없는 키는
   * SQL 컬럼 리스트에서 빠져 다른 metric 이 이미 쓴 값을 NULL 로 덮지 않는다.
   *
   * ★ mixed-batch 금지 불변: 호출자는 metric 별로 배치를 분리해 호출
   *   (한 배치 = 한 metric 컬럼셋 — 같은 배치 내 모든 row 의 key 집합 동일).
   */
  upsertHistoryFuturesIndicator(rows: HistoryFuturesIndicatorInsert[]): Promise<Result<void>>;

  /**
   * kline은 id auto가 아니라 PK=(exchange,market_type,symbol,interval,open_time).
   * 미완성 봉 재폴링 시 close_price/volume 등이 갱신되므로 UPSERT가 맞음.
   */
  upsertHistorySpotKline(rows: HistorySpotKlineInsert[]): Promise<Result<void>>;
  upsertHistoryFuturesKline(rows: HistoryFuturesKlineInsert[]): Promise<Result<void>>;

  /** 청산은 이벤트성 — 같은 trade 다시 안 옴. INSERT only. */
  insertLiquidation(rows: HistoryFuturesLiquidationInsert[]): Promise<Result<void>>;

  // ─── 쓰기: 로그 ─────────────────────────────
  /** AI Zod 검증 실패 로그 — M1.5 오케스트레이터가 호출. */
  insertValidationFailure(row: ValidationFailureInsert): Promise<Result<void>>;

  /**
   * 채팅 로그 INSERT — M1.6 Step 2 신규.
   * 1 row = 1 AI 호출 = 1 비용 단위 (status='success'|'fallback' 양쪽 모두 기록).
   * route.ts 가 매 호출 직후 fire-and-forget 으로 호출.
   *
   * RLS: INSERT policy 0개 → service_role 전용. anon/authenticated 직접 INSERT 불가.
   * M1.7 rate limit 이 본 테이블의 (user_id, created_at DESC) 인덱스를 직접 read.
   */
  insertChatLog(row: ChatLogInsert): Promise<Result<void>>;

  /**
   * 행동 로그 INSERT — M1.6 Step 2 신규.
   * event_type 은 자유 문자열 (Step 3 에서 enum 결정).
   * Step 3 인스트루멘트 hook 에서 본격 호출 시작 — 현재는 시그니처만.
   */
  insertBehaviorLog(row: BehaviorLogInsert): Promise<Result<void>>;

  // ─── 읽기 ───────────────────────────────────
  /**
   * 심볼 마스터 조회. Step 3 Binance 어댑터 등록 직후 "실제로 들어갔는지"
   * 확인용. 필터 없으면 전체 반환(대량 주의 — Supabase 기본 1000행 제한).
   */
  getSymbols(filter: GetSymbolsFilter): Promise<Result<SymbolRow[]>>;

  /**
   * now_spot_ticker에서 단일 심볼 조회. smoke test 용도.
   * M1.4 TickerCard용 본격 조회는 별도 메서드(queryNowTickers 등)를
   * 그 마일스톤에서 추가.
   */
  getNowSpotTicker(
    exchange: string,
    symbol: string,
  ): Promise<Result<NowSpotTickerRow | null>>;

  /**
   * history_futures_indicator 에서 recorded_at > sinceIso 인 row 수 (M1.8.5 Step 4).
   * 용도: (a) backfill freshness skip — 이미 채워진 worker 재시작 시 6h 재실행 방지,
   *       (b) Step 5 종단 게이트 검증 쿼리 (a).
   * head:true + count:exact — row 본문 전송 0 (대량 테이블 안전).
   */
  countHistoryFuturesIndicatorSince(sinceIso: string): Promise<Result<number>>;

  /**
   * history_futures_indicator 의 (exchange, market_type, interval) 별 **최신 recorded_at** (M1.9 Step 2).
   *
   * 용도: forward-fill 증분 윈도잉의 freshness 기준 — "이미 어디까지 채웠나" 를 알아야
   *   그 다음 봉부터만 수집(매 cycle 14일 전체 재수집 방지 = IP quota 보호).
   *   row-count 임계(countHistoryFuturesIndicatorSince)는 절대 진행점이 없어 증분에 부적합 → MAX 정공.
   * 반환: row 0개(예: COINM 최초 가동 전)면 null — 호출자가 기본 lookback 으로 폴백.
   */
  getMaxRecordedAt(filter: GetMaxRecordedAtFilter): Promise<Result<string | null>>;
}

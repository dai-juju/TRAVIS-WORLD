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
} from "./types/index.js";

// ─── 읽기 파라미터 ─────────────────────────────────

/** getSymbols의 필터 옵션 — 선택 필드만 주면 됨. 비어있으면 전체 반환. */
export interface GetSymbolsFilter {
  exchange?: string;
  marketType?: MarketType;
  /** 'TRADING' 등 상태 필터. 생략 시 상태 무관. */
  status?: string;
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

  // ─── 쓰기: _now (최신 스냅샷) ─────────────────
  upsertNowSpotTicker(rows: NowSpotTickerInsert[]): Promise<Result<void>>;
  upsertNowFuturesTicker(rows: NowFuturesTickerInsert[]): Promise<Result<void>>;

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
}

// 도메인별 테이블 타입 별칭 (M1.3 Step 2).
//
// `database.generated.ts`의 긴 인덱스 접근 대신 짧은 이름을 제공한다.
// 이 파일은 수동으로 유지하되, 컬럼 구조 자체는 generated로부터 "파생"되므로
// DB가 바뀌면 generated 재생성만으로 자동 반영된다.
//
// Row vs Insert 구분:
//   - Row:    SELECT 결과 (null 가능 컬럼은 `| null` 포함, identity 컬럼 포함)
//   - Insert: INSERT/UPSERT 페이로드 (PK·NOT NULL만 required, identity는 `never`)
//     → 호출자가 row 객체에 포함하지 않은 key는 SQL에 들어가지 않아
//       기존 값이 유지됨. partial UPDATE가 이 성질 위에서 동작한다.
//
// M1.3 Step 2 범위의 메서드들은 주로 Insert 타입만 쓴다. Row 타입은
// getSymbols/getNowTicker 읽기 결과 반환용.

import type { Database } from "./database.generated";

type Tables = Database["public"]["Tables"];

// ─── 마스터 ────────────────────────────────────────
export type SymbolRow = Tables["symbols"]["Row"];
export type SymbolInsert = Tables["symbols"]["Insert"];

// ─── _now (실시간 스냅샷) ─────────────────────────
export type NowSpotTickerRow = Tables["now_spot_ticker"]["Row"];
export type NowSpotTickerInsert = Tables["now_spot_ticker"]["Insert"];

export type NowFuturesTickerRow = Tables["now_futures_ticker"]["Row"];
export type NowFuturesTickerInsert = Tables["now_futures_ticker"]["Insert"];

export type NowFuturesIndicatorRow = Tables["now_futures_indicator"]["Row"];
/**
 * 부분 UPDATE에 쓰이는 Insert 타입.
 * 호출자는 (exchange, market_type, symbol)을 항상 포함하고,
 * 자기 도메인(펀딩/OI/롱숏/테이커) 컬럼만 객체에 넣는다.
 * 다른 키는 JS 객체에 없기 때문에 SQL 컬럼 리스트에서 빠져
 * 기존 값이 유지된다.
 */
export type NowFuturesIndicatorInsert = Tables["now_futures_indicator"]["Insert"];

// ─── _history (시계열 축적) ────────────────────────
export type HistorySpotTickerRow = Tables["history_spot_ticker"]["Row"];
export type HistorySpotTickerInsert = Tables["history_spot_ticker"]["Insert"];

export type HistoryFuturesTickerRow = Tables["history_futures_ticker"]["Row"];
export type HistoryFuturesTickerInsert = Tables["history_futures_ticker"]["Insert"];

export type HistoryFuturesIndicatorRow = Tables["history_futures_indicator"]["Row"];
export type HistoryFuturesIndicatorInsert = Tables["history_futures_indicator"]["Insert"];

export type HistorySpotKlineRow = Tables["history_spot_kline"]["Row"];
export type HistorySpotKlineInsert = Tables["history_spot_kline"]["Insert"];

export type HistoryFuturesKlineRow = Tables["history_futures_kline"]["Row"];
export type HistoryFuturesKlineInsert = Tables["history_futures_kline"]["Insert"];

export type HistoryFuturesLiquidationRow = Tables["history_futures_liquidation"]["Row"];
export type HistoryFuturesLiquidationInsert = Tables["history_futures_liquidation"]["Insert"];

// 펀딩 정산 이벤트 (사이클 2 Step 6, 2026-07-09). interval 축 없음 —
// 자연키 4축 (exchange, market_type, symbol, funding_time). 정산 1회 = 1행.
export type HistoryFuturesFundingRow = Tables["history_futures_funding"]["Row"];
export type HistoryFuturesFundingInsert = Tables["history_futures_funding"]["Insert"];

// ─── 로그 ──────────────────────────────────────────
export type ValidationFailureRow = Tables["log_validation_failure"]["Row"];
export type ValidationFailureInsert = Tables["log_validation_failure"]["Insert"];

// ─── M1.6 Step 2 신규 로그 테이블 ──────────────────
// log_chat: 1 row = 1 AI 호출 = 1 비용 단위. M1.7 rate limit 직접 의존.
export type ChatLogRow = Tables["log_chat"]["Row"];
export type ChatLogInsert = Tables["log_chat"]["Insert"];

// log_behavior: 운영 이벤트 자유 적재 (event_type 자유 문자열).
export type BehaviorLogRow = Tables["log_behavior"]["Row"];
export type BehaviorLogInsert = Tables["log_behavior"]["Insert"];

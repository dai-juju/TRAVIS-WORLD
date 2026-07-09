// @travis/data-service 공개 배럴.
//
// verbatimModuleSyntax: true 하에서 타입/값을 분리해 re-export.
//   - 타입: `export type { ... }`
//   - 값(class/함수): `export { ... }`
//
// 앱 consumer(apps/web, apps/worker)는 이 파일만 import한다.
// 내부 하위 모듈(`./types/tables` 등)을 직접 import하지 말 것 — 모듈 경로
// 리팩터링 시 깨지는 면적이 커진다.

// ─── 추상 계약 ─────────────────────────────────
export type { IDataService, GetSymbolsFilter } from "./IDataService";

// ─── Supabase 구현체 ──────────────────────────
export { SupabaseDataService } from "./SupabaseDataService";
export type { TravisSupabaseClient } from "./SupabaseDataService";

// ─── Result + 헬퍼 ────────────────────────────
export type { Result } from "./types/Result";
export { ok, err } from "./types/Result";

// ─── 테이블 Row/Insert 타입 ───────────────────
// 워커 어댑터·AI 오케스트레이터가 DB 바인딩 때 필요.
export type {
  SymbolRow,
  SymbolInsert,
  NowSpotTickerRow,
  NowSpotTickerInsert,
  NowFuturesTickerRow,
  NowFuturesTickerInsert,
  NowFuturesIndicatorRow,
  NowFuturesIndicatorInsert,
  HistorySpotTickerRow,
  HistorySpotTickerInsert,
  HistoryFuturesTickerRow,
  HistoryFuturesTickerInsert,
  HistoryFuturesIndicatorRow,
  HistoryFuturesIndicatorInsert,
  HistorySpotKlineRow,
  HistorySpotKlineInsert,
  HistoryFuturesKlineRow,
  HistoryFuturesKlineInsert,
  HistoryFuturesLiquidationRow,
  HistoryFuturesLiquidationInsert,
  HistoryFuturesFundingRow,
  HistoryFuturesFundingInsert,
  ValidationFailureRow,
  ValidationFailureInsert,
  ChatLogRow,
  ChatLogInsert,
  BehaviorLogRow,
  BehaviorLogInsert,
} from "./types/tables";

// Database 전체 타입은 클라이언트 제네릭 지정에 필요 (worker/web bootstrap).
// Json 은 JSONB 컬럼(cards_config/canvas_state/preferences) write 시 캐스팅용.
export type { Database, Json } from "./types/database.generated";

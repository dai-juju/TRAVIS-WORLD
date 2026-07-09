// SupabaseDataService — IDataService의 Supabase 구현체 (M1.3 Step 2).
//
// 생성자 DI:
//   `new SupabaseDataService(client)`로 주입. 이 클래스는 env를 읽지 않는다.
//   apps/web는 @supabase/ssr 쿠키 기반 브라우저 클라이언트를,
//   apps/worker는 service_role service 클라이언트를 각자 만들어 주입.
//
// 에러 처리 규약:
//   모든 메서드는 throw 금지. Supabase SDK가 돌려주는 `{ error }`를
//   Result<T>.error 문자열로 납작화. try/catch는 네트워크 예외용 fallback.
//
// partial UPDATE (now_futures_indicator):
//   Supabase JS upsert에 `defaultToNull: false` 옵션을 주면 행 객체에
//   포함되지 않은 key는 SQL 컬럼 리스트에서 빠진다. 결과적으로 기존 DB 값이
//   유지 — 펀딩/OI/롱숏비율이 서로 다른 폴링 주기로 와도 안전.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GetMaxFundingTimeFilter,
  GetMaxRecordedAtFilter,
  GetSymbolsFilter,
  IDataService,
} from "./IDataService";
import { err, ok } from "./types/Result";
import type {
  BehaviorLogInsert,
  ChatLogInsert,
  Database,
  HistoryFuturesFundingInsert,
  HistoryFuturesIndicatorInsert,
  HistoryFuturesKlineInsert,
  HistoryFuturesLiquidationInsert,
  HistoryFuturesTickerInsert,
  HistorySpotKlineInsert,
  HistorySpotTickerInsert,
  NowFuturesIndicatorInsert,
  NowFuturesTickerInsert,
  NowSpotTickerInsert,
  NowSpotTickerRow,
  Result,
  SymbolInsert,
  SymbolRow,
  ValidationFailureInsert,
} from "./types/index";

/**
 * DB 타입이 확정된 Supabase 클라이언트 타입 별칭.
 * 외부에서 클라이언트를 만들 때도 이 타입으로 파라미터를 제네릭하면
 * `.from('now_spot_ticker')`가 자동완성·타입 검증된다.
 */
export type TravisSupabaseClient = SupabaseClient<Database>;

export class SupabaseDataService implements IDataService {
  private readonly client: TravisSupabaseClient;

  /**
   * @param client 외부에서 생성·설정된 Supabase 클라이언트.
   *   - web(browser): anon key 기반 @supabase/ssr 클라이언트
   *   - worker: service_role + persistSession:false
   *   - test: mock 또는 service_role (스크립트)
   */
  constructor(client: TravisSupabaseClient) {
    this.client = client;
  }

  // ─── 쓰기: 심볼 마스터 ──────────────────────────
  async upsertSymbols(rows: SymbolInsert[]): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("symbols").upsert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  // M1.8 §8.2a-2 신설 (2026-05-26) + hotfix² (2026-05-26 05:09) — per-row UPDATE 패턴.
  //
  // 함정 사례 (2026-05-26 첫 deploy + 첫 hotfix 모두 실패):
  //   - Supabase JS `.upsert(rows, { defaultToNull: false })` 가 PostgREST 에
  //     `INSERT ... ON CONFLICT (...) DO UPDATE SET ...` 로 변환.
  //   - INSERT 절의 VALUES 에 base_asset 누락 → PostgreSQL 이 NULL 로 인식 → NOT NULL 위반.
  //   - ON CONFLICT 의 UPDATE 절이 발동하기 전에 INSERT 절에서 fail.
  //   - 즉 `defaultToNull: false` 는 UPDATE 측면만 안전, INSERT 측면 NOT NULL 위반은 못 막음.
  //
  // 정공 (per-row UPDATE):
  //   - `.update().eq()` chain 사용 — INSERT 절 자체를 거치지 않음.
  //   - PK 일치 row 없으면 0 rows updated (graceful — fundingInfoTask 가 미등재 심볼 skip 이미 처리).
  //   - 24h cycle 1회 호출 + ~600 row × HTTP = ~30초 비용 (네트워크 무관 무시 가능).
  //
  // 대안 (deferred — 본 마일스톤 scope 외):
  //   - SQL function (RPC) `update_funding_interval_hours_bulk(rows JSONB)` — 단일 호출 효율 최상.
  //   - per-row 방식이 24h 주기라 ROI 낮음. M2+ 또는 외부 베타 진입 시 재평가.
  async updateSymbolFundingIntervalHours(
    rows: Array<{
      exchange: string;
      market_type: string;
      symbol: string;
      funding_interval_hours: number;
    }>,
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      let failCount = 0;
      let firstError = "";
      for (const row of rows) {
        const { error } = await this.client
          .from("symbols")
          .update({ funding_interval_hours: row.funding_interval_hours })
          .eq("exchange", row.exchange)
          .eq("market_type", row.market_type)
          .eq("symbol", row.symbol);
        if (error) {
          failCount++;
          if (!firstError) firstError = error.message;
        }
      }
      if (failCount > 0) {
        return err(`${failCount}/${rows.length} rows failed (first: ${firstError})`);
      }
      return ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  // ─── 쓰기: _now 테이블 ─────────────────────────
  async upsertNowSpotTicker(rows: NowSpotTickerInsert[]): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("now_spot_ticker").upsert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async upsertNowFuturesTicker(
    rows: NowFuturesTickerInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("now_futures_ticker").upsert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  /**
   * partial UPDATE 전용. `defaultToNull: false`는 "배치 내 객체에 없는 키는
   * SQL 컬럼 리스트에서 제외" → 기존 DB 값 유지.
   *
   * 두 가지 불변(invariant) 반드시 지킬 것:
   *  1) 반드시 **배열 시그니처**로 호출할 것. postgrest-js는 `defaultToNull`을
   *     bulk upsert 경로에서만 적용한다(PostgrestQueryBuilder.ts의 TODO(v3)
   *     주석 근거). 단일 객체 편의 메서드를 추가하면 이 보호가 깨진다.
   *  2) **같은 배치 내 모든 row는 동일한 key 집합**을 가져야 한다.
   *     SDK는 row들의 Object.keys를 union해 columns 파라미터를 만들기 때문에,
   *     한 row에만 있는 컬럼은 다른 row들에서 "누락 → DEFAULT(NULL)"로 처리되어
   *     기존 값이 NULL로 덮어씌워진다. 호출자(워커)는 도메인별(펀딩/OI/롱숏/테이커)로
   *     배치를 반드시 분리해 호출.
   */
  async upsertNowFuturesIndicatorPartial(
    rows: NowFuturesIndicatorInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("now_futures_indicator")
        .upsert(rows, { defaultToNull: false });
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  /**
   * now_spot_ticker partial UPDATE (M1.6 Step 4 hotfix B, 2026-04-28).
   * ticker24hrBatchTask 가 P/p/w/n/O/C 6 필드만 update — c/o/h/l/v/q 는
   * miniTickerWsHandler 가 매초 fresh 적재. 두 경로 컬럼 분리.
   */
  async upsertNowSpotTickerPartial(
    rows: NowSpotTickerInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("now_spot_ticker")
        .upsert(rows, { defaultToNull: false });
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  /**
   * now_futures_ticker partial UPDATE (M1.6 Step 4 hotfix B, 2026-04-28).
   * ticker24hrBatchTask 가 P/p/w/n/O/C 6 필드만 update.
   */
  async upsertNowFuturesTickerPartial(
    rows: NowFuturesTickerInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("now_futures_ticker")
        .upsert(rows, { defaultToNull: false });
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  // ─── 쓰기: _history 테이블 ─────────────────────
  async insertHistorySpotTicker(
    rows: HistorySpotTickerInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("history_spot_ticker").insert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async insertHistoryFuturesTicker(
    rows: HistoryFuturesTickerInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("history_futures_ticker").insert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async insertHistoryFuturesIndicator(
    rows: HistoryFuturesIndicatorInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("history_futures_indicator")
        .insert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  /**
   * history_futures_indicator 자연 키 upsert (M1.8.5 Step 3, 2026-05-31).
   * onConflict = 자연 키 5축 (Step 2 신설 UNIQUE INDEX). defaultToNull:false 로 metric 별 partial 머지.
   *
   * ★ mixed-batch 금지 불변 (호출자=Step 4 backfill loop 가 반드시 지킬 것):
   *   SDK 는 배치 내 모든 row 의 Object.keys 를 union 해 columns 파라미터를 만든다. 따라서
   *   한 배치에 metric 이 다른 row (예: OI row 와 basis row) 를 섞으면, 한 row 에만 있는 컬럼이
   *   다른 row 들에서 "누락 → DEFAULT(NULL)" 로 처리되어 **다른 metric 이 이미 쓴 값을 NULL 로
   *   덮어쓴다.** → 호출자는 도메인(metric)별로 배치를 분리해 호출 (한 배치 = 동일 key 집합).
   *   (upsertNowFuturesIndicatorPartial 과 동일 hazard — feedback_mixed_batch_invariant.)
   */
  async upsertHistoryFuturesIndicator(
    rows: HistoryFuturesIndicatorInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("history_futures_indicator")
        .upsert(rows, {
          onConflict: "exchange,market_type,symbol,interval,recorded_at",
          defaultToNull: false,
        });
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async upsertHistorySpotKline(
    rows: HistorySpotKlineInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("history_spot_kline").upsert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async upsertHistoryFuturesKline(
    rows: HistoryFuturesKlineInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client.from("history_futures_kline").upsert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async insertLiquidation(
    rows: HistoryFuturesLiquidationInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("history_futures_liquidation")
        .insert(rows);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  /**
   * history_futures_funding 자연 키 upsert (사이클 2 Step 6, 2026-07-09).
   * onConflict = 자연 키 4축 (interval 축 없는 정산 이벤트). 멱등 — 안전 lookback
   * 재수집 무해. defaultToNull:false — USDM(mark_price 보유)/COINM(미보장) 배치가
   * 서로의 컬럼을 NULL 로 덮지 않음 (배치는 호출자가 market 별 분리).
   */
  async upsertHistoryFuturesFunding(
    rows: HistoryFuturesFundingInsert[],
  ): Promise<Result<void>> {
    if (rows.length === 0) return ok(undefined);
    try {
      const { error } = await this.client
        .from("history_futures_funding")
        .upsert(rows, {
          onConflict: "exchange,market_type,symbol,funding_time",
          defaultToNull: false,
        });
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  // ─── 쓰기: 로그 ────────────────────────────────
  async insertValidationFailure(
    row: ValidationFailureInsert,
  ): Promise<Result<void>> {
    try {
      const { error } = await this.client.from("log_validation_failure").insert(row);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  // ─── 쓰기: 로그 (M1.6 Step 2 신규) ─────────────
  // RLS INSERT policy 0개 → service_role 클라이언트로만 실제 적재 가능.
  // anon/authenticated 클라이언트가 호출하면 Supabase 가 권한 에러 반환.

  async insertChatLog(row: ChatLogInsert): Promise<Result<void>> {
    try {
      const { error } = await this.client.from("log_chat").insert(row);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async insertBehaviorLog(row: BehaviorLogInsert): Promise<Result<void>> {
    try {
      const { error } = await this.client.from("log_behavior").insert(row);
      return error ? err(error.message) : ok(undefined);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  // ─── 읽기 ──────────────────────────────────────
  async getSymbols(filter: GetSymbolsFilter): Promise<Result<SymbolRow[]>> {
    try {
      // Supabase/PostgREST 서버측 기본 max-rows 가 1,000 이라 `.limit(N>1000)` 으로는
      // 넘을 수 없음. `.range(from, to)` 도 server cap 을 따른다. 따라서 페이지네이션
      // 루프로 전 심볼 (SPOT 3,562 + USDM 707 + COINM 30) 을 조회한다.
      // 2026-04-20 SPOT 1,000 만 로드되는 문제 실측 확인 후 도입 (사용자 "전 심볼 공평").
      const PAGE = 1_000;
      const MAX_PAGES = 20; // 안전 상한 20,000 row
      const all: SymbolRow[] = [];

      // 루프가 "MAX_PAGES 소진" 때문에 끝났는지 "데이터 끝" 때문에 끝났는지 구분.
      // 단순 `all.length === MAX_PAGES * PAGE` 검사는 "마지막 페이지가 정확히 PAGE"인
      // 경우만 맞아 오탐·미탐 둘 다 발생 → 명시적 플래그로 구분한다.
      let exhaustedByPageLimit = true;

      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE;
        const to = from + PAGE - 1;
        // .order() 없이 .range() 를 쓰면 PostgREST 가 row 순서를 보장하지 않아
        // 페이지 경계에서 중복/누락 가능. 3중 정렬은 복합 인덱스
        // (exchange, market_type, symbol) 매칭 겸 deterministic 순서 보장용 —
        // 필터가 걸려 exchange·market_type 값이 고정되더라도 tie-breaker 로 안전.
        let query = this.client
          .from("symbols")
          .select("*")
          .order("exchange")
          .order("market_type")
          .order("symbol")
          .range(from, to);
        if (filter.exchange !== undefined) {
          query = query.eq("exchange", filter.exchange);
        }
        if (filter.marketType !== undefined) {
          query = query.eq("market_type", filter.marketType);
        }
        if (filter.status !== undefined) query = query.eq("status", filter.status);

        const { data, error } = await query;
        if (error) return err(error.message);
        if (!data || data.length === 0) {
          exhaustedByPageLimit = false;
          break;
        }

        all.push(...data);
        if (data.length < PAGE) {
          exhaustedByPageLimit = false;
          break;
        }
      }

      if (exhaustedByPageLimit) {
        console.warn(
          `[dataService] getSymbols MAX_PAGES(${MAX_PAGES}) 소진 — 추가 페이지 가능성, 상한 증설 필요`,
        );
      }
      return ok(all);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async getNowSpotTicker(
    exchange: string,
    symbol: string,
  ): Promise<Result<NowSpotTickerRow | null>> {
    try {
      const { data, error } = await this.client
        .from("now_spot_ticker")
        .select("*")
        .eq("exchange", exchange)
        .eq("symbol", symbol)
        .maybeSingle();
      return error ? err(error.message) : ok(data);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async countHistoryFuturesIndicatorSince(
    sinceIso: string,
  ): Promise<Result<number>> {
    try {
      // head:true + count:exact — row 본문 전송 0, 카운트만. 대량 테이블 안전.
      const { count, error } = await this.client
        .from("history_futures_indicator")
        .select("*", { count: "exact", head: true })
        .gt("recorded_at", sinceIso);
      return error ? err(error.message) : ok(count ?? 0);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  async getMaxRecordedAt(
    filter: GetMaxRecordedAtFilter,
  ): Promise<Result<string | null>> {
    try {
      // (exchange, market_type, interval) 고정 + recorded_at DESC limit 1 — 최신 격자 시점 1개만.
      // maybeSingle: row 0개면 error 아닌 null 반환 (COINM 최초 가동 전 graceful 폴백 지점).
      // ⚠️ 저빈도 호출(forward-fill cycle 당 interval 1회) — 대량 테이블이라도 부담 낮음.
      const { data, error } = await this.client
        .from("history_futures_indicator")
        .select("recorded_at")
        .eq("exchange", filter.exchange)
        .eq("market_type", filter.marketType)
        .eq("interval", filter.interval)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return err(error.message);
      return ok(data?.recorded_at ?? null);
    } catch (e) {
      return err(toMessage(e));
    }
  }

  /**
   * history_futures_funding 의 (exchange, market_type) 별 최신 funding_time
   * (사이클 2 Step 6 — getMaxRecordedAt 의 funding 판, interval 축 없음).
   * PK(exchange, market_type, symbol, funding_time) prefix 2축 + DESC limit 1.
   * row 0개(최초 가동) = null → 호출자가 60일 lookback 폴백(첫 cycle=backfill).
   */
  async getMaxFundingTime(
    filter: GetMaxFundingTimeFilter,
  ): Promise<Result<string | null>> {
    try {
      const { data, error } = await this.client
        .from("history_futures_funding")
        .select("funding_time")
        .eq("exchange", filter.exchange)
        .eq("market_type", filter.marketType)
        .order("funding_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return err(error.message);
      return ok(data?.funding_time ?? null);
    } catch (e) {
      return err(toMessage(e));
    }
  }
}

/**
 * 네트워크·JSON 파싱 같은 "Supabase SDK가 throw하는" 예외를 문자열화.
 * SDK는 보통 error 객체로 돌려주지만 fetch 자체가 터질 수 있으므로 안전망.
 */
function toMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown error";
  }
}

// ============================================================
// markPriceWsHandler — `!markPrice@arr@1s` 스트림 처리 (M1.3 Step 5c).
//
// 책임:
//   - Binance USDM/COINM 의 `!markPrice@arr@1s` 배열 페이로드 파싱
//   - NowFuturesIndicatorInsert (premium 도메인 컬럼만) 변환
//   - upsertNowFuturesIndicatorPartial — partial UPDATE 로 OI/LSR/Taker 건드리지 않음
//   - retryOnTransient 래퍼로 deadlock/네트워크 transient 자동 재시도
//
// 페이로드 스펙 (Binance 공식 USDM/COINM):
//   Combined Stream 수신: { stream: "!markPrice@arr@1s", data: [...] }
//   data 배열 각 원소:
//     { e: "markPriceUpdate", E: 1672531200000, s: "BTCUSDT",
//       p: "mark", P: "estSettle", i: "index", r: "fundingRate", T: 1672531200000 }
//
// 주의 — 기존 premiumTask 대비 차이:
//   - interest_rate 컬럼은 WS payload 에 없음 → null 처리. 기존 DB 값이 partial
//     UPDATE 로 유지되므로 사용자 체감 영향 최소. (필요 시 follow-up 에서
//     interestRate 만 REST 저주기 폴링 추가 가능)
//   - P (estimated_settle_price) 는 Binance 공식상 일부 심볼만 제공 → 없으면 null
//
// Mixed-batch 불변 (MEMORY: feedback_mixed_batch_invariant.md):
//   배열 내 모든 row 가 동일 key 집합(symbol + premium 도메인 5개 컬럼)을 가짐 →
//   SDK 가 columns union 만들 때 문제 없음. 다른 도메인(OI/LSR/Taker)은 포함 안 함.
// ============================================================

import type {
  IDataService,
  NowFuturesIndicatorInsert,
} from "@travis/data-service";
import { retryOnTransient } from "@travis/exchange-collectors";
import type { MarketType, StreamHandler } from "../types.js";

/** Binance markPrice 원시 필드 (raw WS payload) */
interface MarkPriceRaw {
  e?: string; // "markPriceUpdate"
  E?: number; // event time
  s?: string; // symbol
  p?: string; // markPrice
  P?: string; // estimatedSettlePrice (선택)
  i?: string; // indexPrice
  r?: string; // funding rate
  T?: number; // next funding time (ms)
}

export interface MarkPriceWsHandlerDeps {
  dataService: IDataService;
  /**
   * M1.8 §8.4-d 신설 (2026-05-26) — TRADING 심볼 allowlist (tickerWsHandler 패턴 미러링).
   * BREAK / SETTLING / CLOSE 심볼이 markPrice push 받아 indicator 에 BREAK row 누적되는
   * stale 함정 차단. 8.4-a (ticker24hrBatchTask) 와 동일 영역.
   */
  tradingSymbolsByMarket?: Record<MarketType, Set<string>>;
  /**
   * 경로 A (M2 경로 A fast-follow #1 Step 3, 2026-06-26) — 정규화 + allowlist 필터가
   * 완료된 markPrice **부분 row**(7컬럼)를 프론트로 직결 방송하는 콜백 (tickerWsHandler
   * publish 선례 동형).
   * - optional: 미주입(테스트 / 경로 A 미가동) 시 호출 안 함 → 기존 동작 100% 보존
   *   ([[feedback_additive_optional_callback_extension]]).
   * - upsert(경로 B)와 **병행**: DB 왕복 전 즉시 방송(저지연). upsert 무변경.
   * - ★ **부분 row** 방송 — 프론트 dataService 의 partial-merge(Step 2 premium_index
   *   mergeMode:"partial")가 초기 DB seed 위에 이 7컬럼만 덮어써 REST 컬럼
   *   (last_settled_funding_rate / interest_rate)을 보존. ticker(full row)와의 본질 차이.
   * - 토픽 라벨 관례는 콜백(부트스트랩, index.ts)이 소유 — 핸들러는 라벨 형식에 무지.
   * - 위생 #2: allowlist 필터 통과분(rows)만 전달 → BREAK/상장폐지 심볼 방송 안 됨.
   */
  publish?: (
    marketType: MarketType,
    rows: ReadonlyArray<NowFuturesIndicatorInsert>,
  ) => void;
  /**
   * [10-77] Realtime throttle (M2 사이클 1, 2026-07-07) — markPrice **DB 쓰기 전용**
   * 시간창 코얼레서 (`MarkPriceWriteCoalescer` 구조적 타입).
   * - optional: 미주입 시 기존 즉시 upsert 100% 보존(테스트/미배선 회귀 0,
   *   [[feedback_additive_optional_callback_extension]]).
   * - 주입 시: upsert 를 창(기본 60초)당 1회로 coalescing — Realtime churn 30~60배↓.
   *   경로 A publish(위)는 이 분기보다 **상류**라 어느 쪽이든 매 배치(~1초) 그대로.
   * - enqueue 는 동기·비차단 — 핸들러 지연 0.
   */
  writeCoalescer?: {
    enqueue: (
      marketType: MarketType,
      rows: ReadonlyArray<NowFuturesIndicatorInsert>,
    ) => void;
  };
}

export function createMarkPriceWsHandler(
  deps: MarkPriceWsHandlerDeps,
): StreamHandler {
  return {
    id: "markPriceWsHandler",
    canHandle: (streamName: string, marketType: MarketType): boolean =>
      streamName === "!markPrice@arr@1s" &&
      (marketType === "futures_usdm" || marketType === "futures_coinm"),
    handle: async (
      _streamName: string,
      marketType: MarketType,
      data: unknown,
    ): Promise<void> => {
      if (!Array.isArray(data)) {
        console.warn(
          `[markPriceWsHandler] ${marketType}: data가 배열이 아님 — 무시`,
        );
        return;
      }
      if (marketType !== "futures_usdm" && marketType !== "futures_coinm") {
        return; // canHandle 에서 걸러지지만 type narrow 용도
      }
      // M1.8 §8.4-d (2026-05-26) — TRADING allowlist 적용 (tickerWsHandler 패턴 미러링).
      const allow = deps.tradingSymbolsByMarket?.[marketType];
      const rows = (data as MarkPriceRaw[])
        .map((r) => normalizeMarkPrice(r, marketType))
        .filter(
          (r): r is NowFuturesIndicatorInsert =>
            r !== null && (!allow || allow.has(r.symbol)),
        );
      if (rows.length === 0) return;

      // 경로 A: DB 왕복 전 즉시 방송 (저지연). 경로 B(upsert)는 아래에서 그대로.
      //   ★ updated_at 은 방송 payload 에만 주입 — 경로 B(DB)는 trigger/DEFAULT NOW()
      //   가 채우지만 경로 A 는 DB 우회라 이 컬럼이 없어 카드 freshness 가 깨진다.
      //   upsert 입력(rows)은 무변경 → DB 회귀 0. partial row 그대로 방송(부분 방송).
      const now = Date.now();
      deps.publish?.(marketType, withBroadcastTimestamp(rows, now));

      // [10-77] 경로 B(DB) — 코얼레서 주입 시 창(60초)당 1회 flush 로 위임.
      //   upsert 입력은 어느 분기든 동일 rows(updated_at 미포함 = DB trigger 위임).
      if (deps.writeCoalescer) {
        deps.writeCoalescer.enqueue(marketType, rows);
        return;
      }
      const res = await retryOnTransient(
        () => deps.dataService.upsertNowFuturesIndicatorPartial(rows),
        { label: `markPriceWsHandler ${marketType}` },
      );
      if (!res.success) {
        console.error(
          `[markPriceWsHandler] ${marketType} upsert 최종 실패: ${res.error}`,
        );
      }
    },
  };
}

// ─── 경로 A 방송 전용 헬퍼 ──────────────────────────

/**
 * 경로 A(WS 직결) 방송 payload 에만 updated_at(워커 수신 시각 ISO) 주입
 * (M2 경로 A fast-follow #1 Step 3, 2026-06-26 — tickerWsHandler C1 패턴 미러링).
 *
 * 왜 방송에만: 경로 B(upsert)는 updated_at 을 DB trigger/DEFAULT NOW() 가 채우므로
 *   upsert 입력(partial row)에는 넣지 않는다(검증된 DB 경로 무변경 = 회귀 0). 반면
 *   경로 A 는 DB 우회라 이 컬럼이 비어, 카드 freshness 라인("updated Ns ago", 옵션 C
 *   [10-53])이 `formatRelativeTime(undefined)` → "—" 로 깨진다.
 *   ([[feedback_ws_direct_missing_db_columns]] — 방송 payload 에만 주입, upsert 무변경.)
 * 의미: 워커가 WS 로 행을 수신한 시각 = "이 가격이 도착한 시각". 배치 전체가 같은 ts 공유.
 */
function withBroadcastTimestamp(
  rows: ReadonlyArray<NowFuturesIndicatorInsert>,
  ts: number,
): NowFuturesIndicatorInsert[] {
  const updated_at = new Date(ts).toISOString();
  return rows.map((row) => ({ ...row, updated_at }));
}

// ─── normalize ─────────────────────────────────────

/** WS 문자열 → number. 비정상은 null. */
function parseNum(v: string | undefined): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeMarkPrice(
  r: MarkPriceRaw,
  marketType: "futures_usdm" | "futures_coinm",
): NowFuturesIndicatorInsert | null {
  if (typeof r.s !== "string" || r.s.length === 0) return null;
  return {
    exchange: "binance",
    market_type: marketType,
    symbol: r.s,
    mark_price: parseNum(r.p),
    index_price: parseNum(r.i),
    estimated_settle_price: parseNum(r.P),
    // M1.8 §8.1 ✅ 2026-05-25: last_funding_rate → predicted_funding_rate RENAME
    // `r` 필드는 predicted next funding rate (1초 변동, Binance 사이트 우상단
    // funding(4h)/Countdown 박스의 큰 숫자). realized 값은 별도 컬럼
    // last_settled_funding_rate (M1.8 §8.2a-2 의 premiumIndex REST 폴링에서 채움).
    predicted_funding_rate: parseNum(r.r),
    next_funding_time: typeof r.T === "number" ? r.T : null,
    // interest_rate 는 WS payload 에 없음 → 미포함 (partial UPDATE, 기존값 유지)
    // OI/LSR/Taker 는 perSymbolTask 담당 → 미포함
    // last_settled_funding_rate / basis / basis_rate / annualized_basis_rate 는
    // M1.8 §8.2a-2 의 신규 REST fetcher 가 채움 → 미포함
  };
}

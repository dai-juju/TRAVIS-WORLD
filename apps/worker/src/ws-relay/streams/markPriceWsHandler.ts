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
import { retryOnTransient } from "../../poller/tasks/_upsertRetry.js";
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
      const rows = (data as MarkPriceRaw[])
        .map((r) => normalizeMarkPrice(r, marketType))
        .filter((r): r is NowFuturesIndicatorInsert => r !== null);
      if (rows.length === 0) return;

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
    last_funding_rate: parseNum(r.r),
    next_funding_time: typeof r.T === "number" ? r.T : null,
    // interest_rate 는 WS payload 에 없음 → 미포함 (partial UPDATE, 기존값 유지)
    // OI/LSR/Taker 는 perSymbolTask 담당 → 미포함
  };
}

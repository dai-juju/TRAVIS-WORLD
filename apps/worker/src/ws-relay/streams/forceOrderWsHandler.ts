// ============================================================
// forceOrderWsHandler — `!forceOrder@arr` 스트림 처리 (M1.3 Step 5d).
//
// 책임:
//   - Binance USDM/COINM 의 `!forceOrder@arr` 청산 이벤트 파싱
//   - HistoryFuturesLiquidationInsert 변환
//   - dataService.insertLiquidation 호출 (이벤트성 INSERT, upsert 아님)
//   - retryOnTransient 래퍼로 네트워크 transient 자동 재시도
//
// 페이로드 스펙 (Binance 공식):
//   Combined Stream 수신: { stream: "!forceOrder@arr", data: {e,E,o} }
//   **단일 객체** (ticker/markPrice 와 달리 배열 아님).
//   o 필드:
//     s: symbol, S: side("BUY"|"SELL"), o: orderType, f: timeInForce,
//     q: origQty, p: price, ap: avgPrice, X: orderStatus,
//     l: lastFilledQty, z: accumulatedFilledQty, T: tradeTime(ms)
//
// dedup 정책:
//   history_futures_liquidation 복합 고유 인덱스가 자연 처리. 중복 INSERT는 DB 에러로
//   걸러지나, 복합 PK (exchange, market_type, symbol, recorded_at) 구조상
//   한 심볼이 같은 밀리초에 두 번 청산되는 케이스는 극히 드물어 실질 문제 없음.
//
// side 값 주의:
//   Binance 가 보내는 `S` 는 **청산 주문의 side** — 롱 청산은 반대 방향 매도 주문이라
//   "SELL"로 옴. 트레이더가 "롱 청산" = "SELL" 로 해석하는 것이 맞음.
// ============================================================

import type {
  HistoryFuturesLiquidationInsert,
  IDataService,
} from "@travis/data-service";
import { retryOnTransient } from "../../poller/tasks/_upsertRetry.js";
import type { MarketType, StreamHandler } from "../types.js";

/** forceOrder 원시 페이로드 (Binance 공식) */
interface ForceOrderRaw {
  e?: string; // "forceOrder"
  E?: number; // event time
  o?: ForceOrderDetail;
}

interface ForceOrderDetail {
  s?: string; // symbol
  S?: string; // side (BUY|SELL)
  o?: string; // order type (LIMIT|MARKET)
  f?: string; // time in force
  q?: string; // orig qty
  p?: string; // price
  ap?: string; // avg price
  X?: string; // order status (FILLED|...)
  l?: string; // last filled qty
  z?: string; // accumulated filled qty
  T?: number; // trade time (ms)
}

export interface ForceOrderWsHandlerDeps {
  dataService: IDataService;
}

export function createForceOrderWsHandler(
  deps: ForceOrderWsHandlerDeps,
): StreamHandler {
  return {
    id: "forceOrderWsHandler",
    canHandle: (streamName: string, marketType: MarketType): boolean =>
      streamName === "!forceOrder@arr" &&
      (marketType === "futures_usdm" || marketType === "futures_coinm"),
    handle: async (
      _streamName: string,
      marketType: MarketType,
      data: unknown,
    ): Promise<void> => {
      if (marketType !== "futures_usdm" && marketType !== "futures_coinm") {
        return;
      }
      if (typeof data !== "object" || data === null) {
        console.warn(
          `[forceOrderWsHandler] ${marketType}: data가 객체가 아님 — 무시`,
        );
        return;
      }
      const row = normalizeForceOrder(data as ForceOrderRaw, marketType);
      if (row === null) return;

      const res = await retryOnTransient(
        () => deps.dataService.insertLiquidation([row]),
        { label: `forceOrderWsHandler ${marketType}` },
      );
      if (!res.success) {
        console.error(
          `[forceOrderWsHandler] ${marketType} insert 최종 실패: ${res.error}`,
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

/** epoch ms → ISO string. 비정상 ts 는 null. */
function parseTimeIso(ts: number | undefined): string | null {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  try {
    return new Date(ts).toISOString();
  } catch {
    return null;
  }
}

function normalizeForceOrder(
  raw: ForceOrderRaw,
  marketType: "futures_usdm" | "futures_coinm",
): HistoryFuturesLiquidationInsert | null {
  const o = raw.o;
  if (!o || typeof o.s !== "string" || typeof o.S !== "string") return null;

  const price = parseNum(o.p);
  const quantity = parseNum(o.q);
  const tradeTime = parseTimeIso(o.T);
  if (price === null || quantity === null || tradeTime === null) return null;

  return {
    exchange: "binance",
    market_type: marketType,
    symbol: o.s,
    side: o.S,
    price,
    quantity,
    trade_time: tradeTime,
    avg_price: parseNum(o.ap),
    last_filled_qty: parseNum(o.l),
    accumulated_qty: parseNum(o.z),
    order_status: typeof o.X === "string" ? o.X : null,
    // recorded_at: 생략 → DB DEFAULT NOW() 적용
    // id: identity 자동
  };
}

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
import { retryOnTransient } from "@travis/exchange-collectors";
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
  /**
   * M2 경로 A fast-follow #2 Step 2 (2026-06-27) — TRADING 심볼 allowlist
   *   (markPrice/ticker 패턴 미러링). 경로 A 방송 시 SETTLING/상장폐지 심볼 청산을
   *   피드에서 제외(위생 #1/#2 — crypto-domain-expert 지적). 미주입 시 전부 허용(graceful).
   *   ★ 경로 B(history INSERT)는 이 필터 무관 — 이력 보존(무회귀).
   */
  tradingSymbolsByMarket?: Record<MarketType, Set<string>>;
  /**
   * 경로 A (M2 fast-follow #2 Step 2) — 정규화 + allowlist 통과 청산 이벤트를 토픽으로 방송.
   *   ★ insert(경로 B) await **전**에 호출 = 저지연(경로 A 의 본질). 미주입 시 no-op
   *   (경로 A 미활성, 경로 B 수집은 그대로). makeTopicPublisher 가 buildLiveTopics 로
   *   tape + 심볼별 양쪽 fan-out(Step 3a "둘 다").
   */
  publish?: (
    marketType: MarketType,
    rows: ReadonlyArray<HistoryFuturesLiquidationInsert>,
  ) => void;
  /**
   * [10-72] (ff#2 재개 Step 2, 2026-07-05) — COINM symbol → contractSize(계약당 USD).
   *   notional(USD) 계산 재료: COINM = zEff × contractSize (인버스 계약 — 가격 곱하지 않음).
   *   ★ 갱신은 반드시 in-place clear+refill — 핸들러가 생성 시 이 Map **객체를 캡처**하므로
   *     참조를 새 Map 으로 교체하면 부팅 스냅샷에 영원히 고정된다(컴파일러·테스트 사각).
   *     (allowlist 는 record 프로퍼티를 매 호출 재조회라 참조 교체 가능 — 정반대 메커니즘.)
   *   미주입/미스 시 COINM notional=null (graceful — 오산 대신 결측, 위생 #5).
   */
  coinmContractSizeBySymbol?: ReadonlyMap<string, number>;
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
      const row = normalizeForceOrder(
        data as ForceOrderRaw,
        marketType,
        deps.coinmContractSizeBySymbol,
      );
      if (row === null) return;

      // 경로 A (M2 fast-follow #2 Step 2): allowlist 통과 심볼만 저지연 방송 (insert await 전).
      //   미접속(구독자 0)이면 makeTopicPublisher 가 idle no-op. 미주입(Phase A 휴면)이면 no-op.
      const allow = deps.tradingSymbolsByMarket?.[marketType];
      if (!allow || allow.has(row.symbol)) {
        deps.publish?.(marketType, [row]);
      }

      // 경로 B (기존): history_futures_liquidation INSERT (allowlist 무관 = 이력 보존, 무회귀).
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

/**
 * notional(USD) sanity 상한 (위생 #5) — 이 값을 넘는 계산 결과는 입력 이상
 * (contractSize 오적재/파싱 이상) 신호로 보고 null 처리 + 경고. 역대 최대 단일
 * 청산이 수천만 달러 수준이라 $1B 는 여유 있는 상한.
 */
const NOTIONAL_SANITY_MAX_USD = 1_000_000_000;

/**
 * 청산 notional(USD) 계산 ([10-72], canonical-metrics.md §Liquidation).
 *
 * 수량 폴백(z→q) × 가격 폴백(ap→p) 의 2축 곱 — 체결분(z)·체결가(ap) 우선.
 * USDM : zEff × apEff (zEff = z>0 ? z : q, apEff = ap>0 ? ap : p).
 * COINM: zEff × contractSize (인버스 계약 — 가격 곱하지 않음).
 *        contractSize 미보유 심볼은 null (오산 대신 결측 — 카드 "—" graceful).
 *
 * ref: crypto-domain 라이브 검증 2026-07-05 (dapi exchangeInfo contractSize
 *      BTCUSD_PERP=100/ETHUSD_PERP=10 실측 + Liquidation Order Streams 공식 docs).
 */
function computeNotional(args: {
  marketType: "futures_usdm" | "futures_coinm";
  price: number;
  quantity: number;
  avgPrice: number | null;
  accumulatedQty: number | null;
  contractSize: number | undefined;
}): number | null {
  const { marketType, price, quantity, avgPrice, accumulatedQty, contractSize } =
    args;
  const zEff =
    accumulatedQty !== null && accumulatedQty > 0 ? accumulatedQty : quantity;

  let notional: number | null;
  if (marketType === "futures_coinm") {
    notional = contractSize !== undefined ? zEff * contractSize : null;
  } else {
    const priceEff = avgPrice !== null && avgPrice > 0 ? avgPrice : price;
    notional = zEff * priceEff;
  }

  // 0 이하 = degenerate(0달러 청산 등) — 표시 가치 없는 값은 결측 처리 (reviewer S2).
  if (notional === null || !Number.isFinite(notional) || notional <= 0) {
    return null;
  }
  if (notional > NOTIONAL_SANITY_MAX_USD) {
    // 위생 #5 — 이상값은 표시하지 않는다 (사용자에게 "이상한 숫자" 노출 금지).
    console.warn(
      `[forceOrderWsHandler] notional sanity 초과 (${notional}) — null 처리`,
    );
    return null;
  }
  return notional;
}

function normalizeForceOrder(
  raw: ForceOrderRaw,
  marketType: "futures_usdm" | "futures_coinm",
  coinmContractSizeBySymbol?: ReadonlyMap<string, number>,
): HistoryFuturesLiquidationInsert | null {
  const o = raw.o;
  if (!o || typeof o.s !== "string" || typeof o.S !== "string") return null;

  const price = parseNum(o.p);
  const quantity = parseNum(o.q);
  const tradeTime = parseTimeIso(o.T);
  if (price === null || quantity === null || tradeTime === null) return null;

  const avgPrice = parseNum(o.ap);
  const accumulatedQty = parseNum(o.z);

  return {
    exchange: "binance",
    market_type: marketType,
    symbol: o.s,
    side: o.S,
    price,
    quantity,
    trade_time: tradeTime,
    avg_price: avgPrice,
    last_filled_qty: parseNum(o.l),
    accumulated_qty: accumulatedQty,
    order_status: typeof o.X === "string" ? o.X : null,
    // [10-72] USD 명목가 — 방송 payload + DB 저장 양쪽 동일값 (drift 0).
    notional: computeNotional({
      marketType,
      price,
      quantity,
      avgPrice,
      accumulatedQty,
      contractSize:
        marketType === "futures_coinm"
          ? coinmContractSizeBySymbol?.get(o.s)
          : undefined,
    }),
    // recorded_at: 생략 → DB DEFAULT NOW() 적용
    // id: identity 자동
  };
}

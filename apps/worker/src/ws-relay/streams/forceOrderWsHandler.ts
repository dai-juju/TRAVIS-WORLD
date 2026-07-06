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
  // ── CM migration (effective 2026-06-30) 신규 필드 ──
  // Binance All Market Liquidation Order Streams — UM+CM MERGED after migration.
  // 병합 후 fstream·dstream 양쪽에서 UM+CM 전체가 push 되며 st 가 권위 판별자.
  //   st = 1 → UM (USDⓈ-M) / st = 2 → CM (COIN-M). ps = pair symbol.
  // ref: developers.binance.com .../coin-margined-futures/websocket-market-streams/
  //      All-Market-Liquidation-Order-Streams + change-log 2026-06-10(effective 6-30)
  //      "COIN-M integrating with USDⓈ-M". context7 조회 2026-07-06 (crypto-domain).
  st?: number;
  ps?: string;
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

      // ★ 공급자 교차 오염 가드 (2026-07-06 hotfix, Phase B 전 라이브 발견 → crypto-domain 규명).
      //   원인 = Binance CM migration(effective 2026-06-30): !forceOrder@arr 가 UM+CM
      //   병합 스트림이 되어 dstream(COINM 연결)이 USDM 청산까지 push → COINM 라벨
      //   오염 insert 21.4만 행 (역방향은 4월 초기 롤아웃 fstream 1.4천 행).
      //   우리 UM 정본은 per-symbol <symbol>@forceOrder 경로가 수신 중 → dstream 의
      //   UM 이벤트는 중복(double-count)이라 리라벨이 아닌 drop 이 정답.
      //
      //   2단 가드: ① st(거래소 권위 판별자, 1=UM/2=CM) 가 있으면 그것만 신뢰 —
      //   dated 계약(BTCUSD_260925)·신규 상장 오폭 완전 면역. ② st 부재(구판 페이로드)
      //   는 교차 멤버십 폴백 — 반대편 마켓 allowlist 실존 + 자기 마켓 부재면 drop.
      //   양쪽 모두 부재(SETTLING·신규상장 창)는 기존 이력 보존 정책 유지.
      const st = (data as ForceOrderRaw).st;
      const expectedSt = marketType === "futures_coinm" ? 2 : 1;
      if (typeof st === "number") {
        // 예상 밖 st(미래 세그먼트/이상값)는 보수적으로 drop 하되 무음 금지 —
        //   조용히 사라지면 "청산이 안 들어온다"가 최난이도 무음 손실이 됨 (위생 #5, reviewer W1).
        if (st !== 1 && st !== 2 && !warnedUnknownSt) {
          warnedUnknownSt = true;
          console.warn(
            `[forceOrderWsHandler] 미지의 st=${st} 수신 — drop (Binance 세그먼트 확장? 이후 동일 경보 생략)`,
          );
        }
        if (st !== expectedSt) return; // 병합 스트림의 반대편 마켓 이벤트 — 중복/오염
      } else {
        const otherMarket =
          marketType === "futures_usdm" ? "futures_coinm" : "futures_usdm";
        const ownSet = deps.tradingSymbolsByMarket?.[marketType];
        const otherSet = deps.tradingSymbolsByMarket?.[otherMarket];
        if (otherSet?.has(row.symbol) && !ownSet?.has(row.symbol)) {
          return;
        }
      }

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

/** 미지의 st 값 1회 경보용 (로그 폭주 방지 — StreamCoalescer warnedRules 동형). */
let warnedUnknownSt = false;

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

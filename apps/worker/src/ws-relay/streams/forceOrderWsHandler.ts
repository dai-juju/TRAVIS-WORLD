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
// dedup 정책 (2026-07-22 [10-117] 사실 정정 — 옛 서술은 성립한 적 없음):
//   DB 는 중복 INSERT 를 막지 않는다 — 실제 제약은 PRIMARY KEY(id) 뿐이고 두 보조
//   인덱스는 비유니크다 (2026-07-19 KORUUSDT 712행 완전중복 실측이 증거. 옛 주석의
//   "복합 고유 인덱스가 자연 처리"는 거짓이었다). 따라서 병합 스트림의 반대편 마켓
//   사본(double-count)은 반드시 수집 시점에 drop 해야 한다 — handle 안의
//   fail-closed 심볼 게이트가 그 유일한 애플리케이션 방어선이다.
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
  // ★ st/ps 는 페이로드 최상위가 아니라 o 객체 **안**에 실린다
  //   ([10-117] 라이브 캡처 확정 2026-07-22 — dstream !forceOrder@arr raw:
  //   {"e":"forceOrder","E":...,"o":{...,"ps":"ZHIPUUSDT","st":1}}).
  //   공식 문서 예시는 최상위에 표기 = 문서↔와이어 괴리. 구 코드(2026-07-06)는
  //   최상위에서 읽어(raw.st = 항상 undefined) st 분기가 통째로 죽은 코드였고,
  //   그 결과 fail-open 폴백만 남아 COINM 오염 1,232행이 발생했다
  //   (task-record/M3-step3a §근본원인 — "st 부재" 진단의 실체는 이 중첩 오독).
  //   최상위에는 절대 선언하지 않는다 — 여기 선언하면 오독이 재발한다.
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
  // ── CM migration(2026-06-30) 병합 판별자 — o 안에 실린다 (ForceOrderRaw 주석) ──
  st?: number; // 1 = UM(USDⓈ-M) / 2 = CM(COIN-M). 라이브 캡처 2026-07-22 확정.
  ps?: string; // pair symbol (COIN-M inverse 특성 필드)
}

export interface ForceOrderWsHandlerDeps {
  dataService: IDataService;
  /**
   * TRADING 심볼 allowlist (markPrice/ticker 패턴 미러링).
   *   [10-117] (M3-step4, 2026-07-22): 방송(경로 A)뿐 아니라 **insert(경로 B)도
   *   이 allowlist 로 fail-closed 게이트** — 자기 마켓에 있는 심볼만 수용.
   *   종전의 "경로 B 는 필터 무관 = 이력 보존" 정책은 병합 스트림 오염(반대편
   *   마켓 사본·신규 상장 오폭)의 통로였고, 청산은 TRADING 심볼에서만 발생하므로
   *   이 게이트로 잃는 실제 이력은 없다 (handle 안 게이트 주석 참조).
   *   미주입 시 전부 허용(graceful — 테스트/부분 조립용).
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

      // ★ [10-117] 마켓 판별 2단 가드 (M3-step4, 2026-07-22 — fail-open 근본 수정).
      //
      //   역사: CM migration(2026-06-30)으로 dstream !forceOrder@arr 가 UM+CM 병합
      //   스트림이 되어 COINM 연결에 USDM 청산까지 push 된다 (UM 정본은 per-symbol
      //   <symbol>@forceOrder 경로가 수신 중 → 병합 사본은 리라벨이 아닌 drop 이 정답).
      //   2026-07-06 가드가 뚫린 원인 2가지를 모두 수정했다:
      //   ① st 를 페이로드 **최상위**에서 읽었다 — 실제 와이어는 **o.st**
      //     (라이브 캡처 2026-07-22 확정. 문서 예시는 최상위 = 문서↔와이어 괴리)
      //     → 분기가 죽은 코드였다. 이제 o.st 를 읽어 권위 판별이 실동작한다.
      //   ② st 부재 폴백이 "반대편 allowlist 실존 확인 시만 drop" = fail-open —
      //     신규 상장 심볼(양쪽 allowlist 가 모름)이 통과해 COINM 오염 1,232행
      //     (2026-07-09~17, [10-14] 3번째 적중) → inclusion(fail-closed)으로 반전.
      //   DB 트리거(trg_liq_reject_mislabeled_coinm)는 2중 안전망으로 존치.
      //
      //   1단 — o.st 권위 판별 (allowlist 신선도 무관): 자기 마켓과 다르면 drop.
      //   신규 상장(상장 0초부터)·dated 계약(BTCUSD_260925)도 정확 판별.
      const st = (data as ForceOrderRaw).o?.st;
      const expectedSt = marketType === "futures_coinm" ? 2 : 1;
      if (typeof st === "number") {
        if (st !== 1 && st !== 2) {
          // 예상 밖 st(미래 세그먼트/이상값)는 보수적으로 drop 하되 무음 금지 —
          //   조용히 사라지면 "청산이 안 들어온다"가 최난이도 무음 손실 (위생 #5).
          if (!warnedUnknownSt) {
            warnedUnknownSt = true;
            console.warn(
              `[forceOrderWsHandler] 미지의 o.st=${st} 수신 — drop (Binance 세그먼트 확장? 이후 동일 경보 생략)`,
            );
          }
          return;
        }
        if (st !== expectedSt) return; // 병합 스트림의 반대편 마켓 사본 — drop
      } else {
        // 2단 — o.st 부재(구판/타 경로 페이로드) 폴백 = fail-closed inclusion:
        //   자기 마켓 TRADING allowlist 에 있는 심볼만 수용 (ticker/markPrice 동형).
        //   도메인 정합성: 청산은 거래 중(TRADING) 심볼에서만 발생한다 — SETTLING/
        //   CLOSE 는 거래 정지 = forceOrder 발생 불가 — 이 게이트로 잃는 실제
        //   이력은 없다 (step3a 결정 8의 "존재 게이트"는 과거 *집계*의 원칙,
        //   수집 시점 게이트는 TRADING inclusion 이 정확). 신규 상장 창(allowlist
        //   반영 전 ≤1h)은 1h refresh([10-118] 차선책) + 자기 재시작이 좁힌다.
        //   allowlist 미주입(테스트 등) 시 전부 허용 — markPrice 와 동일 graceful.
        const allow = deps.tradingSymbolsByMarket?.[marketType];
        if (allow && !allow.has(row.symbol)) {
          // 관측 (reviewer S3): 이 drop 은 정상 방어지만 무음이면 "신규 상장 창
          //   유실이 실제로 얼마나 무는지" 볼 수 없다. 심볼당 1회만 경보
          //   (st-mismatch drop 은 병합 사본이라 정상 고빈도 — 로그하지 않음).
          if (
            !warnedDroppedSymbols.has(row.symbol) &&
            warnedDroppedSymbols.size < WARNED_DROPPED_SYMBOLS_MAX
          ) {
            warnedDroppedSymbols.add(row.symbol);
            console.warn(
              `[forceOrderWsHandler] fail-closed drop: ${marketType}:${row.symbol} — 자기 마켓 allowlist 미등재 (신규 상장 창이면 ≤1h 내 refresh/자기 재시작으로 수용. 동일 심볼 경보 이후 생략)`,
            );
          }
          return;
        }
      }

      // 경로 A (M2 fast-follow #2 Step 2): 저지연 방송 (insert await 전).
      //   위 fail-closed 게이트를 통과한 row 는 이미 allowlist 검증 완료 — 바로 방송.
      //   미접속(구독자 0)이면 makeTopicPublisher 가 idle no-op. 미주입(Phase A 휴면)이면 no-op.
      deps.publish?.(marketType, [row]);

      // 경로 B: history_futures_liquidation INSERT.
      //   [10-117] 부터 위 fail-closed 게이트 이후에만 도달 — 오염/사본은 여기 못 온다.
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

/** 미지의 o.st 값 1회 경보용 (로그 폭주 방지 — StreamCoalescer warnedRules 동형). */
let warnedUnknownSt = false;

/** fail-closed 폴백 drop 관측 — 심볼당 1회 경보 (reviewer S3). 상한 = 메모리 캡. */
const warnedDroppedSymbols = new Set<string>();
const WARNED_DROPPED_SYMBOLS_MAX = 200;

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

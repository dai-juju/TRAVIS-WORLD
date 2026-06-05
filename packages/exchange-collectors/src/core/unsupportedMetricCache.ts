// ============================================================
// unsupportedMetricCache — basis 미지원 (symbol, metric) 학습 캐시 ([8-33], 2026-06-05).
//
// 문제 (라이브 적발 2026-06-04~05):
//   Binance USDM 에 금속(XAU/XAG/XPT/XPD = COMMODITY) · 주식(AAPL/TSLA... = EQUITY)
//   · 프리마켓(ANTHROPIC/OPENAI = PREMARKET) · 한국주식(SAMSUNG = KR_EQUITY) 등
//   **75종의 TRADIFI_PERPETUAL 심볼**이 상장됨. 이들은 /futures/data/basis?contractType=PERPETUAL
//   요청 시 매 cycle `-4104 Invalid contract type` 을 반환 (graceful skip 중이나 불필요
//   요청 + 로그 노이즈). 다른 5 metric(OI/LSR/taker)은 이 심볼들도 정상 지원 → basis 만 문제.
//
// 왜 contract_type / underlyingType 컬럼으로 사전 제외하지 않나 (라이브 교차검증 결론):
//   - symbols 테이블엔 underlyingType 컬럼이 없음 (contract_type 까지만 존재).
//   - contract_type 으로 거르면 INDEX 2종(BTCDOMUSDT·ALLUSDT, contractType=PERPETUAL)이
//     문제처럼 보이지만, 라이브 확인 결과 INDEX 2종은 **basis 를 정상 지원**한다
//     (XAUUSDT→-4104 / BTCDOMUSDT→정상 응답, 2026-06-05 fapi 실측). 즉 underlyingType
//     기반 제외는 INDEX 2종을 과잉 차단(false positive)한다.
//   - 진짜 -4104 원인은 "contractType=TRADIFI_PERPETUAL 심볼인데 PERPETUAL 로 요청"한 것.
//     이 경계는 DB 컬럼으로 깔끔히 못 긋는다.
//   → **응답 학습(reactive)** 이 정공: 실제로 -4104 가 난 (symbol, metric) 만 이후 skip.
//     거래소/심볼이 추가돼도 자동 적응 + DB 스키마 변경 불필요(이번 Step scope 내).
//     비용: 심볼당 metric당 "최초 1회"만 -4104 요청 (이미 graceful skip 중이던 그 요청).
//
// 근거(공식문서 + 라이브): /futures/data/basis 는 contractType ∈ {PERPETUAL,CURRENT_QUARTER,
//   NEXT_QUARTER} 만 허용 (TRADIFI_PERPETUAL 미허용). 2026-06-05 fapi exchangeInfo + basis 실측.
//
// 범위: 프로세스 메모리 한정 in-memory Set (재시작 시 초기화 — 첫 cycle 에 다시 학습, 무해).
//   영속 캐시는 YAGNI (재학습 비용 = 심볼당 1회 graceful skip).
// ============================================================

/** 학습된 미지원 (marketType, symbol, metric) 키 집합. */
const unsupported = new Set<string>();

/**
 * 캐시 키 — marketType 까지 포함해 USDM/COINM 격리 (같은 심볼명 충돌 방어).
 * ★ interval 은 키에 의도적으로 미포함: basis 미지원은 contractType 차원이라 interval 무관.
 *   (XAUUSDT basis 5m 이 -4104 면 1h/1d 도 동일 미지원 → interval 별 학습 시 9배 헛요청.)
 */
function key(marketType: string, symbol: string, metric: string): string {
  return `${marketType}:${symbol}:${metric}`;
}

/** 이 (marketType, symbol, metric) 이 이전 cycle 에서 미지원(-4104)으로 학습됐는지. */
export function isUnsupportedMetric(
  marketType: string,
  symbol: string,
  metric: string,
): boolean {
  return unsupported.has(key(marketType, symbol, metric));
}

/** (marketType, symbol, metric) 을 미지원으로 학습 — 이후 cycle 부터 fetch 건너뜀. */
export function markUnsupportedMetric(
  marketType: string,
  symbol: string,
  metric: string,
): void {
  unsupported.add(key(marketType, symbol, metric));
}

/**
 * fetch error 문자열이 "미지원 contract type(-4104)" 인지 판별.
 *
 * -4104 는 client.ts 에서 **두 경로**로 전파되며 substring 매칭은 둘 다 정확히 잡는다 (의도적):
 *   ① 비-2xx(400) 경로 → `Binance 400: {"code":-4104,"msg":"Invalid contract type."}`
 *      (라이브 실측 형태, deferred `[8-33]` 기록과 일치 — 더 흔함)
 *   ② 2xx 에러 envelope 경로 → `Binance -4104: Invalid contract type.`
 * 정확한 code 추출 대신 substring 을 쓰는 이유 = 두 경로 형태가 달라서. 향후 정확 매칭으로
 *   리팩터링 시 ① 400 경로를 반드시 함께 처리할 것.
 *
 * client.ts 는 -4104 를 재시도하지 않는다 (-1003/-1015 만 재시도). 코드 문자열 매칭으로
 *   영구 오류(-4104)와 일시 오류(-1003 rate limit 등)를 엄격 분리 — -1003 은 절대 학습 금지
 *   (정상 심볼이 영구 skip 되는 치명 버그 방지).
 */
export function isUnsupportedContractTypeError(error: string): boolean {
  return error.includes("-4104");
}

/** 테스트 전용 — 캐시 초기화 (프로덕션 코드에서 호출 금지). */
export function _resetUnsupportedMetricCacheForTest(): void {
  unsupported.clear();
}

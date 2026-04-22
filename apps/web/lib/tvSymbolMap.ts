// apps/web/lib/tvSymbolMap.ts
//
// Binance/OKX/Bybit/Bitget 심볼 → TradingView widget 심볼 변환.
// (M1.4 Step 3-4 도입, M1.5 Step 0 에서 USDM/COIN-M .P 규격 정정)
//
// 정책:
//   프로젝트 메모리 §TradingView chart policy — TradingView 임베드 우선, 미지원
//   시에만 자체 차트 컴포넌트. 이 모듈이 "임베드 가능한가?" 의 judge 역할.
//
// 반환값:
//   - 변환 성공 → "BINANCE:BTCUSDT" / "BINANCE:BTCUSDT.P" / "BINANCE:BTCUSD.P" 같은 TV symbol
//   - 변환 불가 → null (KlineChartCard 의 NotSupportedStub 이 graceful fallback 렌더)
//
// TradingView 심볼 규격 (2026-04-22 조사, 데이터 소스 위생 원칙 #8):
//   - Spot:         BINANCE:BTCUSDT      https://www.tradingview.com/symbols/BTCUSDT/?exchange=BINANCE
//   - USDM Perp:    BINANCE:BTCUSDT.P    https://www.tradingview.com/symbols/BTCUSDT.P/
//   - COIN-M Perp:  BINANCE:BTCUSD.P     https://www.tradingview.com/symbols/BTCUSD.P/?exchange=BINANCE
//   - USDC-M Perp:  BINANCE:BTCUSDC.P    (시도 후 TV iframe 에 맡김 — 사용자 결정 2026-04-22)
//   - Delivery(BTCUSDT_250627 등): TradingView 에 심볼 규격 없음 → graceful null
//
// 미지원 케이스 → null → NotSupportedStub 렌더:
//   - USDM / COIN-M delivery futures (만기 포함 분기 계약)
//   - 등록되지 않은 거래소
//   - 심볼 누락 / 거래소 누락
//
// TradingView 미등록 심볼 (신규 메메코인, 중국어 밈 심볼 등) 은 iframe 내부의
// "Symbol not found" + 돋보기 검색 UI 에 위임 (사용자 결정 2026-04-22). 우리
// 앱이 이 경우를 감지하거나 대체 UI 를 제공하지 않는다.

/** 거래소 id → TradingView prefix 매핑. 소문자 keys. */
const EXCHANGE_PREFIX: Record<string, string> = {
  binance: "BINANCE",
  okx: "OKX",
  bybit: "BYBIT",
  bitget: "BITGET",
};

/** interval 코드 → TradingView resolution. 대소문자 모두 허용. */
const RESOLUTION_MAP: Record<string, string> = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
  "1w": "W",
  "1M": "M",
};

/**
 * 거래소 + 마켓 타입 + 심볼 → TradingView widget symbol.
 *
 * @returns "BINANCE:BTCUSDT" 형식 문자열, 변환 불가 시 null.
 */
export function toTradingViewSymbol(
  exchange: string | undefined,
  marketType: string | undefined,
  symbol: string | undefined,
): string | null {
  if (!exchange || !symbol) return null;

  const prefix = EXCHANGE_PREFIX[exchange.toLowerCase()];
  if (!prefix) return null;

  // COIN-M (inverse perpetual): "BTCUSD_PERP" → "BINANCE:BTCUSD.P"
  // Delivery 계약 (예: BTCUSD_250627) 은 TV 심볼 규격이 없어 graceful null.
  if (marketType === "futures_coinm") {
    if (!symbol.endsWith("_PERP")) return null;
    const base = symbol.replace("_PERP", "");
    return `${prefix}:${base}.P`;
  }

  // USDM (USDⓈ-M perpetual): "BTCUSDT" → "BINANCE:BTCUSDT.P"
  // USDC-M perpetual (BTCUSDC 등) 도 동일 .P 컨벤션으로 시도 후 TV 에 맡김.
  // Delivery 계약 (underscore 포함, 예: BTCUSDT_250627) 은 null.
  if (marketType === "futures_usdm") {
    if (symbol.includes("_")) return null;
    return `${prefix}:${symbol}.P`;
  }

  // Spot: "BTCUSDT" → "BINANCE:BTCUSDT"
  return `${prefix}:${symbol}`;
}

/**
 * interval 코드 → TradingView resolution.
 *   "15m" → "15" / "1h" → "60" / "1d" → "D" 등.
 *   대소문자 비교 전 정규화 (`1d` / `1D` 모두 D 로).
 *   미매핑 시 기본값 "15" (15분봉 — 스캘퍼~스윙 중간값).
 */
export function toTradingViewResolution(interval: string | undefined): string {
  if (!interval) return "15";
  const key = normalizeInterval(interval);
  return RESOLUTION_MAP[key] ?? "15";
}

function normalizeInterval(s: string): string {
  // 1분~월봉은 숫자 + 단위 한 글자. 단위만 소문자화 (M 은 월이라 대문자 유지 필요 — 처리).
  if (s === "1M") return "1M";
  return s.toLowerCase();
}

// apps/web/lib/tvSymbolMap.ts
//
// Binance/OKX/Bybit/Bitget 심볼 → TradingView widget 심볼 변환 (M1.4 Step 3-4).
//
// 정책:
//   프로젝트 메모리 §TradingView chart policy — TradingView 임베드 우선, 미지원
//   시에만 자체 차트 컴포넌트. 이 모듈이 "임베드 가능한가?" 의 judge 역할.
//
// 반환값:
//   - 변환 성공 → "BINANCE:BTCUSDT" 같은 TradingView symbol string
//   - 변환 불가 → null (KlineChartCard 가 graceful "해당 차트 없음" placeholder 표시)
//
// 미지원 케이스 (M1.4 기준):
//   - COIN-M 선물 (예: BTCUSD_PERP): TradingView 에서 대부분 미지원. null 반환.
//   - 등록되지 않은 거래소: null.
//   - 심볼 누락: null.

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

  // COIN-M 선물 (inverse perpetual) 은 TradingView 광범위 미지원.
  // M1.5 에서 자체 차트 컴포넌트가 도입되기 전까지는 graceful fallback.
  if (marketType === "futures_coinm") return null;

  // USDM 선물은 대부분 USDT-margined perpetual 로 BINANCE:BTCUSDT 심볼과 공유.
  // TradingView 는 동일 심볼 + style=1 로 일반 캔들 차트 표시.
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

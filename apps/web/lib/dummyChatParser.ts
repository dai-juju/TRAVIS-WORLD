/**
 * dummyChatParser — M1.4 Step 4-3 에서만 쓰는 임시 자연어 → mock OrchestrateResponse 변환기.
 *
 * 왜 "dummy" 라는 이름을 명시했나:
 *   M1.5 에서 Claude Haiku 가 이 자리를 대체한다. 파일명으로 임시성을 분명히 해
 *   실수로 프로덕션 로직이 이 파일에 의존하지 않도록 경고. M1.5 진입 시 이
 *   파일은 **삭제 또는 deprecated 주석 처리** 예정.
 *
 * 파싱 규칙 (단순 키워드 기반):
 *   - "ticker" / "price" / "가격"                 → TickerCard
 *   - "top" / "gainer" / "list" / "상위"           → CoinListCard
 *   - "chart" / "kline" / "캔들" / "차트"          → KlineChartCard
 *   - 매칭 없음                                    → 빈 cards + 안내 notes
 *
 * 심볼 추출:
 *   텍스트에서 [A-Z]{3,} 패턴 첫 매치 → BTCUSDT 처럼 이미 suffix 가 붙어 있으면 그대로,
 *   아니면 USDT 자동 부착 (예: "BTC" → "BTCUSDT"). 매칭 없으면 기본값 BTCUSDT.
 *
 * Interval 추출 (chart 전용):
 *   "15m", "1h", "4h", "1d" 등 패턴 매치 → 그대로 사용. 없으면 기본 "15m".
 *
 * 부족한 점 (M1.5 에서 대체됨):
 *   - 한국어 자유 표현 불가 ("비트 코인 가격 보여줘" 실패)
 *   - CoinListCard 필터 파싱 불가 ("5% 이상 상승" → hard-coded 5% threshold)
 *   - 다중 카드 생성 불가 (항상 1장)
 *
 * 사용자에게는 이 한계를 placeholder 예시로만 노출. crypto-trader 자문 시 이
 * 파일에 대한 UX 평가는 무의미 (M1.4 임시 구현임을 명시).
 */

import type { OrchestrateResponse } from "@travis/shared";

type CardKind = "ticker" | "coinList" | "klineChart";

const KEYWORDS_TICKER = ["ticker", "price", "가격"];
const KEYWORDS_LIST = ["top", "gainer", "list", "상위", "목록"];
const KEYWORDS_CHART = ["chart", "kline", "캔들", "차트"];

// 예약어 — 키워드 단어를 심볼로 오인하지 않도록 화이트리스트에서 제외.
// code-reviewer H-2 (2026-04-22): "TOP gainers" 같은 placeholder 예시 문구에서
// "TOP" 이 심볼로 잡혀 "TOPUSDT" 로 해석되는 오인 방지.
const RESERVED_WORDS = new Set([
  "TOP", "LIST", "CHART", "PRICE", "GAINER", "GAINERS",
  "LOSER", "LOSERS", "HOT", "HIGH", "LOW", "USDT", "USDC",
  "BUSD", "BINANCE", "OKX", "BYBIT", "DARK", "LIGHT",
]);

const INTERVAL_RE = /\b(1m|3m|5m|15m|30m|1h|2h|4h|6h|12h|1d|1w)\b/i;

function detectKind(text: string): CardKind | null {
  const lower = text.toLowerCase();
  if (KEYWORDS_CHART.some((k) => lower.includes(k.toLowerCase()))) return "klineChart";
  if (KEYWORDS_LIST.some((k) => lower.includes(k.toLowerCase()))) return "coinList";
  if (KEYWORDS_TICKER.some((k) => lower.includes(k.toLowerCase()))) return "ticker";
  return null;
}

function extractSymbol(text: string): string {
  // 모든 후보 중 예약어가 아닌 첫 번째를 선택.
  const matches = text.matchAll(/\b([A-Z]{3,10})(?:\/|-|_)?([A-Z]{3,5})?\b/g);
  for (const m of matches) {
    const base = m[1];
    if (!base || RESERVED_WORDS.has(base)) continue;
    const quote = m[2];
    if (/USDT|USDC|BUSD/.test(base)) return base;
    if (quote && !RESERVED_WORDS.has(quote)) return `${base}${quote}`;
    return `${base}USDT`;
  }
  return "BTCUSDT";
}

function extractInterval(text: string): string {
  const match = text.match(INTERVAL_RE);
  return match?.[1] ? match[1].toLowerCase() : "15m";
}

/**
 * 자연어 → mock OrchestrateResponse.
 * 매칭 실패 시 cards=[] + 안내 notes (actionDispatcher 가 토스트로 노출).
 */
export function buildDummyOrchestrateResponse(text: string): OrchestrateResponse {
  const kind = detectKind(text);
  if (!kind) {
    return {
      cards: [],
      notes: '힌트: "ticker", "list", "chart" 중 하나를 포함해 주세요',
    };
  }

  const symbol = extractSymbol(text);
  const idSeed = Date.now().toString(36);

  if (kind === "ticker") {
    return {
      cards: [
        {
          id: `ticker-${idSeed}`,
          componentId: "ticker",
          size: "md",
          updateMode: "value",
          kicker: "SPOT · LIVE",
          title: symbol,
          subtitle: `binance · ${symbol} · realtime`,
          data: {
            datasource: "now_spot_ticker",
            exchange: "binance",
            marketType: "spot",
            symbol,
          },
        },
      ],
    };
  }

  if (kind === "coinList") {
    return {
      cards: [
        {
          id: `coinlist-${idSeed}`,
          componentId: "coinList",
          size: "lg",
          updateMode: "content",
          kicker: "DERIVATIVES · USDM",
          title: "Top gainers",
          subtitle: "binance futures · price_change_pct > 5",
          data: {
            datasource: "now_futures_ticker",
            exchange: "binance",
            marketType: "futures_usdm",
            filters: [
              { field: "price_change_pct", operator: ">", value: 5 },
            ],
            sort: { field: "price_change_pct", direction: "desc" },
            limit: 20,
          },
        },
      ],
    };
  }

  // klineChart
  const interval = extractInterval(text);
  return {
    cards: [
      {
        id: `kline-${idSeed}`,
        componentId: "klineChart",
        size: "lg",
        updateMode: "value",
        kicker: `${interval.toUpperCase()} · DARK`,
        title: `${symbol} ${interval}`,
        subtitle: `binance · ${interval} candle`,
        data: {
          datasource: "now_futures_ticker",
          exchange: "binance",
          marketType: "futures_usdm",
          symbol,
          interval,
        },
      },
    ],
  };
}

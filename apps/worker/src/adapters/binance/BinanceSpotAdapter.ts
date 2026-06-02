// ============================================================
// Binance Spot (현물) REST 어댑터 (M1.3 Step 3b).
//
// 제공 기능:
//   - fetchExchangeInfo(): /api/v3/exchangeInfo → SymbolInsert[]
//   - fetchTicker24hr(): /api/v3/ticker/24hr → NowSpotTickerInsert[] (전체 배치)
//
// kline·per-symbol 지표 등은 spot에는 해당 없거나 Step 4 이후. 현재는
// M1.3 "최소 루프 증명"을 위해 심볼 메타 + 24h 시세만 수집.
// ============================================================

import type { FetchResult } from "../IExchangeAdapter.js";
import type { NowSpotTickerInsert, SymbolInsert } from "@travis/data-service";
import { binanceFetch } from "@travis/exchange-collectors";
import { normalizeSpotSymbol, normalizeSpotTicker } from "./normalize.js";
import type { BinanceSpotExchangeInfo, BinanceSpotTicker } from "./types.js";

const BASE_URL = "https://api.binance.com";

export class BinanceSpotAdapter {
  readonly exchangeId = "binance";
  readonly marketType = "spot" as const;
  readonly baseRestUrl = BASE_URL;

  /**
   * 전 심볼 메타 수집. TRADING 상태만 upsert할지는 호출자 판단 —
   * 여기선 원본 그대로 반환해 delisted도 symbols 테이블에 반영(status 필드로 구분).
   */
  async fetchExchangeInfo(): Promise<FetchResult<SymbolInsert[]>> {
    const res = await binanceFetch<BinanceSpotExchangeInfo>({
      baseUrl: BASE_URL,
      path: "/api/v3/exchangeInfo",
    });
    if (!res.success) return res;
    const rows = res.data.symbols.map(normalizeSpotSymbol);
    return { success: true, data: rows };
  }

  /**
   * 전 심볼 24h ticker 배치 수집.
   * ticker/24hr는 symbol 파라미터 생략 시 전체 반환.
   * weight: spot 40 (전체 호출), 단건 2. 전체 호출이 압도적으로 효율.
   */
  async fetchTicker24hr(): Promise<FetchResult<NowSpotTickerInsert[]>> {
    const res = await binanceFetch<BinanceSpotTicker[]>({
      baseUrl: BASE_URL,
      path: "/api/v3/ticker/24hr",
    });
    if (!res.success) return res;
    const rows = res.data.map(normalizeSpotTicker);
    return { success: true, data: rows };
  }
}

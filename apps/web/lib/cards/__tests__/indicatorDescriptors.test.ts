// indicatorDescriptors — symbols 메타 주입 표시 보강 테스트 ([10-9] 회수, 2026-06-10).
//
// 검증:
//   - meta 주입 시: funding interval 라벨 / tickSize 가격 정밀도 / OI base asset /
//     basis quote_asset 이 표시 문자열에 반영되는가.
//   - meta 미주입(null) 시: 라벨 없는 기존 표시로 자연 fallback (오라벨보다 무라벨).

import { describe, expect, it } from "vitest";
import {
  INDICATOR_DESCRIPTORS,
  type IndicatorRow,
  type SymbolMeta,
} from "../indicatorDescriptors";

/** BTCUSDT 라이브 형태의 최소 row (2026-06-10 DB 실측 값 기반). */
const ROW: IndicatorRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  mark_price: 61133.1,
  index_price: 61166.68369565,
  predicted_funding_rate: -0.0000403,
  last_settled_funding_rate: 0.00002908,
  next_funding_time: 1_781_078_400_000,
  basis: -23.51,
  basis_rate: -0.0004,
  open_interest: 97630.299,
  oi_chg_5m: null,
  oi_chg_15m: null,
  oi_chg_1h: null,
  oi_chg_4h: null,
  top_ls_ratio_accounts: 1.9577,
  top_ls_ratio_positions: null,
  global_ls_ratio: null,
  taker_buy_sell_ratio: null,
  taker_buy_vol: null,
  taker_sell_vol: null,
  updated_at: "2026-06-10T05:10:54.675774+00:00",
};

const META: SymbolMeta = {
  funding_interval_hours: 8,
  tick_size: 0.1,
  base_asset: "BTC",
  quote_asset: "USDT",
};

function rowByLabel(descriptorKey: string, label: string) {
  const d = INDICATOR_DESCRIPTORS[descriptorKey];
  const row = d?.rows.find((r) => r.label === label);
  if (!row) throw new Error(`row not found: ${descriptorKey}/${label}`);
  return row;
}

describe("indicatorDescriptors × SymbolMeta ([10-9])", () => {
  it("funding: meta 주입 시 interval 라벨 + 5자리 percent", () => {
    const r = rowByLabel("premium_index", "Funding (predicted)");
    expect(r.value(ROW, META)).toBe("-0.00403% (8h)");
  });

  it("funding: meta 미주입(null) 시 라벨 생략 fallback", () => {
    const r = rowByLabel("premium_index", "Funding (predicted)");
    expect(r.value(ROW, null)).toBe("-0.00403%");
    expect(r.value(ROW)).toBe("-0.00403%"); // 인자 생략도 동일
  });

  it("mark price: meta.tick_size(0.1) → 사이트 정밀도 1자리", () => {
    const r = rowByLabel("premium_index", "Mark price");
    expect(r.value(ROW, META)).toBe("61,133.1");
  });

  it("OI: meta.base_asset → 'BTC' 단위 라벨 (USDM)", () => {
    const r = rowByLabel("open_interest", "Open interest");
    expect(r.value(ROW, META)).toBe("97,630.3 BTC");
    expect(r.value(ROW, null)).toBe("97,630.3"); // 미주입 시 숫자만
  });

  it("basis: meta.quote_asset 우선 (미주입 시 marketType 근사 유지)", () => {
    const r = rowByLabel("basis", "Basis");
    expect(r.value(ROW, { ...META, quote_asset: "USDC" })).toBe("-23.51 USDC");
    expect(r.value(ROW, null)).toBe("-23.51 USDT"); // 기존 근사 fallback
  });
});

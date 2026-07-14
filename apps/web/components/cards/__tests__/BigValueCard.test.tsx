// BigValueCard — role 구동 렌더 테스트 (Composable Stage 1b Step 2, 2026-07-14).
//
// 범위: 데이터 훅 없이 BigValueBody(순수 표시)만 mount — "descriptor 의 role 축이
//   무엇을 어느 강조로 그리는가"라는 일반화의 핵심을 검증 (TableCard 테스트 동형).
//   색(var(--..))은 jsdom 이 떨굴 수 있어 텍스트/구조/속성만 확인. 전체 카드
//   (엔진 훅·재연결·flash 타이밍)는 검증된 코드 이식 + Step 5 라이브 G2 가 커버.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getRecordDescriptor, type RecordRow } from "@/lib/cards/recordDescriptors";
import { BigValueBody } from "../BigValueCard";

const TICKER_ROW: RecordRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  last_price: 61133.1,
  price_change_pct: 2.34,
  high_price: 62000.5,
  low_price: 60100.2,
  volume_chg_5m: 3.21,
  open_price: 60500,
  weighted_avg_price: 61050.7,
  quote_volume: 1234567.8,
  volume: 20.5,
  trade_count: 987654,
  price_chg_1h: -0.12,
  updated_at: "2026-07-14T05:10:54.000Z",
};

const INDICATOR_ROW: RecordRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  mark_price: 61133.1,
  index_price: 61166.68,
  predicted_funding_rate: -0.0000403,
  last_settled_funding_rate: 0.00002908,
  next_funding_time: 1_781_078_400_000,
  updated_at: "2026-07-14T05:10:54.000Z",
};

function renderBody(datasource: string, row: RecordRow, flashRaw: number | null = null) {
  const descriptor = getRecordDescriptor(datasource);
  if (!descriptor) throw new Error(`descriptor missing: ${datasource}`);
  return render(
    <BigValueBody descriptor={descriptor} row={row} meta={null} flashRaw={flashRaw} />,
  );
}

describe("BigValueBody — role 구동 렌더", () => {
  it("티커: primary($ huge) + badge(%) + secondary(range/vol5m) 렌더, detail 은 skip", () => {
    const { container } = renderBody("now_spot_ticker", TICKER_ROW);
    const text = container.textContent ?? "";
    expect(text).toContain("Last price");
    expect(text).toContain("$"); // huge 가격
    expect(text).toContain("%"); // 24h change 뱃지
    expect(text).toContain("24h range");
    expect(text).toContain("Vol 5m");
    expect(text).toContain("approx"); // 근사값 고지 hint
    // detail role 은 BigValue 에서 표시 안 함 (Detail form 소관).
    expect(text).not.toContain("Trades (24h)");
    expect(text).not.toContain("VWAP (24h)");
    expect(text).not.toContain("1h change");
  });

  it("티커: approx hint 뱃지에 tooltip(title) 이 달린다", () => {
    const { container } = renderBody("now_spot_ticker", TICKER_ROW);
    const hint = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "approx",
    );
    expect(hint).toBeDefined();
    expect(hint?.getAttribute("title")).toContain("Approximate");
  });

  it("지표(premium_index): primary=Funding(predicted) + secondary 2줄, Mark/Index(detail) skip", () => {
    const { container } = renderBody("premium_index", INDICATOR_ROW);
    const text = container.textContent ?? "";
    expect(text).toContain("Funding (predicted)");
    expect(text).toContain("Next funding");
    expect(text).toContain("Funding (last settled)");
    expect(text).not.toContain("Mark price");
    expect(text).not.toContain("Index price");
  });

  it("지표(open_interest): 'OI as big number' — primary=Open interest + secondary(OI 1h/Mark)", () => {
    const row: RecordRow = {
      ...INDICATOR_ROW,
      open_interest: 97630.299,
      oi_chg_5m: null,
      oi_chg_15m: null,
      oi_chg_1h: 0.42,
      oi_chg_4h: null,
    };
    const { container } = renderBody("open_interest", row);
    const text = container.textContent ?? "";
    expect(text).toContain("Open interest");
    expect(text).toContain("OI 1h");
    expect(text).toContain("Mark price"); // OI pack 에선 mark 가 secondary (다이버전스 대조)
    expect(text).not.toContain("OI 5m"); // detail skip
    expect(text).not.toContain("OI 4h");
  });

  it("null primary/badge → '—' graceful (sparse row)", () => {
    const sparse: RecordRow = {
      ...TICKER_ROW,
      last_price: null,
      price_change_pct: null,
      low_price: null,
      high_price: null,
      volume_chg_5m: null,
    };
    const { container } = renderBody("now_spot_ticker", sparse);
    const text = container.textContent ?? "";
    expect(text).toContain("—");
    expect(() => renderBody("now_spot_ticker", sparse)).not.toThrow();
  });
});

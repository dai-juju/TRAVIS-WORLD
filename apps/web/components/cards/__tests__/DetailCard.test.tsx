// DetailCard — 전 필드 리스트 렌더 테스트 (Composable Stage 1b Step 3, 2026-07-14).
//
// 범위: DetailBody(순수 표시)만 mount — "전 role 필드를 선언 순서대로 그린다"는
//   일반화의 핵심 검증 (BigValueCard 테스트 동형). 지표 pack 출력이 옛 IndicatorCard
//   와 동일한지는 recordDescriptors 의 옛↔새 등가 테스트가 값 층위에서 박제 —
//   여기선 구조(순서/primary 강조/전 필드 표시)를 확인.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getRecordDescriptor, type RecordRow } from "@/lib/cards/recordDescriptors";
import { DetailBody } from "../DetailCard";

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

function renderBody(datasource: string, row: RecordRow) {
  const descriptor = getRecordDescriptor(datasource);
  if (!descriptor) throw new Error(`descriptor missing: ${datasource}`);
  return render(<DetailBody descriptor={descriptor} row={row} meta={null} />);
}

/** <dt> 라벨들을 문서 순서대로 추출. */
function labels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("dt")).map((el) => el.textContent ?? "");
}

describe("DetailBody — 전 필드 리스트 렌더", () => {
  it("지표(premium_index): 전 5 필드가 옛 IndicatorCard 와 동일 순서로 렌더", () => {
    const { container } = renderBody("premium_index", INDICATOR_ROW);
    expect(labels(container)).toEqual([
      "Funding (predicted)",
      "Next funding",
      "Funding (last settled)",
      "Mark price",
      "Index price",
    ]);
  });

  it("지표: primary(Funding predicted)는 serif 큰 글씨(dd), 나머지는 mono 줄", () => {
    const { container } = renderBody("premium_index", INDICATOR_ROW);
    const dds = Array.from(container.querySelectorAll("dd"));
    expect(dds[0]?.className).toContain("font-serif"); // primary 강조
    expect(dds[1]?.className).toContain("font-mono"); // 일반 줄
  });

  it("티커 Detail (신규 조합): 전 10 필드 렌더 — BigValue 가 skip 하는 detail 도 포함", () => {
    const { container } = renderBody("now_spot_ticker", TICKER_ROW);
    const ls = labels(container);
    expect(ls).toHaveLength(10);
    expect(ls[0]).toBe("Last price"); // primary 도 리스트의 일원
    expect(ls).toContain("Trades (24h)"); // detail role 포함
    expect(ls).toContain("VWAP (24h)");
    expect(ls).toContain("1h change");
  });

  it("티커 Detail: vol 5m 근사 hint 뱃지 + tooltip 유지", () => {
    const { container } = renderBody("now_spot_ticker", TICKER_ROW);
    const hint = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "approx",
    );
    expect(hint).toBeDefined();
    expect(hint?.getAttribute("title")).toContain("Approximate");
  });

  it("sparse row → 전 값 '—'/문자열 graceful (throw 없음)", () => {
    const sparse: RecordRow = {
      exchange: "binance",
      market_type: "spot",
      symbol: "NULLUSDT",
      last_price: null,
      price_change_pct: null,
      high_price: null,
      low_price: null,
      volume_chg_5m: null,
      open_price: null,
      weighted_avg_price: null,
      quote_volume: null,
      volume: null,
      trade_count: null,
      price_chg_1h: null,
      updated_at: "2026-07-14T05:10:54.000Z",
    };
    const { container } = renderBody("now_spot_ticker", sparse);
    for (const dd of Array.from(container.querySelectorAll("dd"))) {
      expect((dd.textContent ?? "").length).toBeGreaterThan(0);
    }
  });
});

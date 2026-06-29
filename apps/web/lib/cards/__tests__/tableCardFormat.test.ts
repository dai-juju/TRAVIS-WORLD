// tableCardFormat — form-side 픽셀 매핑 순수 테스트 (Composable Stage 1 Step 2, 2026-06-29).
//
// 검증: tone→색 / intensity→opacity(바닥 0.55, graceful 클램프) / 복합 식별키 /
//       grid-template 조립 / 정렬·flash 숫자 추출. descriptor 의미 신호를 픽셀로
//       번역하는 form 책임이 정확·방어적인지.

import { describe, expect, it } from "vitest";
import {
  OPACITY_FLOOR,
  buildRowKey,
  cellStyle,
  compareByField,
  gridTemplateColumns,
  intensityOpacity,
  labelText,
  numericField,
  toneColor,
} from "../tableCardFormat";
import { getTableDescriptor, type TableRow } from "../tableDescriptors";

const TICKER_ROW: TableRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  last_price: 61133.1,
  price_change_pct: 2.34,
};

function tickerColumn(key: string) {
  const d = getTableDescriptor("now_spot_ticker");
  const col = d?.columns.find((c) => c.key === key);
  if (!col) throw new Error(`ticker column not found: ${key}`);
  return col;
}

describe("toneColor", () => {
  it("방향 → 테마 색 토큰, 미지정=neutral", () => {
    expect(toneColor("up")).toBe("var(--up)");
    expect(toneColor("down")).toBe("var(--down)");
    expect(toneColor("neutral")).toBe("var(--ink-2)");
    expect(toneColor(undefined)).toBe("var(--ink-2)");
  });
});

describe("intensityOpacity (바닥 0.55, graceful 클램프)", () => {
  it("0..1 → [FLOOR, 1] 선형", () => {
    expect(intensityOpacity(0)).toBeCloseTo(OPACITY_FLOOR, 10);
    expect(intensityOpacity(1)).toBeCloseTo(1, 10);
    expect(intensityOpacity(0.5)).toBeCloseTo(OPACITY_FLOOR + 0.5 * (1 - OPACITY_FLOOR), 10);
  });
  it("범위 밖·비숫자는 graceful (undefined/NaN=1.0, 클램프)", () => {
    expect(intensityOpacity(undefined)).toBe(1);
    expect(intensityOpacity(Number.NaN)).toBe(1);
    expect(intensityOpacity(-0.5)).toBeCloseTo(OPACITY_FLOOR, 10); // 음수 → 0 클램프
    expect(intensityOpacity(1.5)).toBeCloseTo(1, 10); // 초과 → 1 클램프
  });
});

describe("cellStyle (의미 → 픽셀)", () => {
  it("intensity 컬럼(티커 24H%) → 색 + opacity", () => {
    const style = cellStyle(tickerColumn("price_change_pct"), TICKER_ROW);
    expect(style.color).toBe("var(--up)"); // +2.34% → up
    expect(typeof style.opacity).toBe("number");
    expect(style.opacity).toBeGreaterThan(OPACITY_FLOOR);
    expect(style.opacity).toBeLessThanOrEqual(1);
  });
  it("비-intensity 컬럼(티커 PRICE) → 색만, opacity 키 없음", () => {
    const style = cellStyle(tickerColumn("last_price"), TICKER_ROW);
    expect(style.color).toBe("var(--ink-2)"); // tone 없음 → neutral
    expect("opacity" in style).toBe(false); // 불필요 no-op 스타일 제거
  });
});

describe("buildRowKey / labelText", () => {
  it("복합 식별키 직렬화", () => {
    expect(buildRowKey(TICKER_ROW, ["exchange", "market_type", "symbol"])).toBe(
      "binance:futures_usdm:BTCUSDT",
    );
  });
  it("누락 필드는 빈 세그먼트(graceful)", () => {
    expect(buildRowKey(TICKER_ROW, ["symbol", "nope"])).toBe("BTCUSDT:");
  });
  it("labelText = labelColumn(symbol) 값", () => {
    const d = getTableDescriptor("now_spot_ticker");
    if (!d) throw new Error("ticker descriptor missing");
    expect(labelText(TICKER_ROW, d)).toBe("BTCUSDT");
  });
});

describe("gridTemplateColumns (가상 grid 조립)", () => {
  it("티커: 라벨 minmax + width 지정 컬럼", () => {
    const d = getTableDescriptor("now_spot_ticker");
    if (!d) throw new Error("ticker descriptor missing");
    expect(gridTemplateColumns(d)).toBe("minmax(0, 1fr) 6rem 4.5rem");
  });
  it("지표(width 미지정): auto fallback", () => {
    const d = getTableDescriptor("premium_index");
    if (!d) throw new Error("premium_index descriptor missing");
    // FUNDING / MARK / NEXT 3컬럼, 전부 width 미지정 → auto.
    expect(gridTemplateColumns(d)).toBe("minmax(0, 1fr) auto auto auto");
  });
});

describe("numericField (정렬·flash 추출)", () => {
  it("숫자 컬럼 → 값, null/비숫자/누락 → null", () => {
    expect(numericField(TICKER_ROW, "last_price")).toBe(61133.1);
    expect(numericField(TICKER_ROW, "missing")).toBeNull();
    expect(numericField({ ...TICKER_ROW, last_price: null }, "last_price")).toBeNull();
    expect(numericField({ ...TICKER_ROW, symbol: "X" }, "symbol")).toBeNull();
  });
});

describe("compareByField (숫자/문자열 datatype 합집합 — 두 옛 카드 능력 보존)", () => {
  const lo: TableRow = { exchange: "binance", market_type: "futures_usdm", symbol: "AAA", v: 1 };
  const hi: TableRow = { exchange: "binance", market_type: "futures_usdm", symbol: "BBB", v: 2 };
  const nullRow: TableRow = { exchange: "binance", market_type: "futures_usdm", symbol: "CCC", v: null };

  it("숫자: 방향 적용", () => {
    expect(compareByField(lo, hi, "v", "asc")).toBeLessThan(0); // 1 before 2
    expect(compareByField(lo, hi, "v", "desc")).toBeGreaterThan(0); // 2 before 1
  });
  it("한쪽만 숫자: 숫자가 위(방향 무관)", () => {
    expect(compareByField(lo, nullRow, "v", "asc")).toBe(-1); // 숫자 a 위
    expect(compareByField(nullRow, lo, "v", "desc")).toBe(1); // 숫자 b 위
  });
  it("둘 다 비숫자: 문자열 알파벳(symbol 정렬 — CoinListCard 능력 보존)", () => {
    expect(compareByField(lo, hi, "symbol", "asc")).toBeLessThan(0); // AAA before BBB
    expect(compareByField(lo, hi, "symbol", "desc")).toBeGreaterThan(0);
  });
});

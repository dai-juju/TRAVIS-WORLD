// TableCard — TableRow descriptor 구동 렌더 테스트 (Composable Stage 1 Step 2, 2026-06-29).
//
// 범위: 데이터 훅(useDataServiceTable) 없이 TableRow 만 mount — "descriptor 가 컬럼/값/
//   강조를 구동한다"는 일반화의 핵심을 검증. 색(var(--..)) 은 jsdom 이 떨굴 수 있어
//   순수 tableCardFormat.test 에 맡기고, 여기선 컬럼 수·텍스트·opacity(jsdom 안전)로 확인.
//   전체 카드(가상화 임계값·fetchAll·FLIP)는 라이브 데이터가 필요 → Step 5 G2 가 커버
//   (그 경로는 라이브 검증된 CoinListCard 에서 거의 그대로 이식).

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getTableDescriptor, type TableRow as TRow } from "@/lib/cards/tableDescriptors";
import { TableCardRow } from "../TableCardRow";

function tds(container: HTMLElement): HTMLTableCellElement[] {
  return Array.from(container.querySelectorAll("td"));
}

function renderRow(datasource: string, row: TRow, flashValue: number | null = null) {
  const descriptor = getTableDescriptor(datasource);
  if (!descriptor) throw new Error(`descriptor missing: ${datasource}`);
  return render(
    <table>
      <tbody>
        <TableCardRow row={row} descriptor={descriptor} flipKey="k" flashValue={flashValue} />
      </tbody>
    </table>,
  );
}

const TICKER_ROW: TRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  last_price: 61133.1,
  price_change_pct: 2.34,
};

const INDICATOR_ROW: TRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  predicted_funding_rate: -0.0000403,
  mark_price: 61133.1,
  next_funding_time: 1_781_078_400_000,
};

describe("TableCard TableRow — descriptor 구동 렌더", () => {
  it("티커: 심볼 + PRICE + 24H% = 3 셀, 값 렌더", () => {
    const { container } = renderRow("now_spot_ticker", TICKER_ROW);
    const cells = tds(container);
    expect(cells).toHaveLength(3); // 라벨 + 2 데이터 컬럼
    expect(cells[0]?.textContent).toBe("BTCUSDT");
    expect(cells[1]?.textContent).toContain("$"); // PRICE
    expect(cells[2]?.textContent).toContain("%"); // 24H %
  });

  it("티커: 24H%(intensity 컬럼)는 opacity 스타일, PRICE(비-intensity)는 없음", () => {
    const { container } = renderRow("now_spot_ticker", TICKER_ROW);
    const cells = tds(container);
    expect(cells[2]?.style.opacity).not.toBe(""); // intensity → opacity 적용
    expect(cells[1]?.style.opacity).toBe(""); // 비-intensity → opacity 없음
  });

  it("티커: null 가격 → '—' graceful", () => {
    const { container } = renderRow("now_spot_ticker", { ...TICKER_ROW, last_price: null });
    expect(tds(container)[1]?.textContent).toBe("—");
  });

  it("지표(premium_index): 심볼 + FUNDING/MARK/NEXT = 4 셀 (컬럼이 datasource 로 달라짐)", () => {
    const { container } = renderRow("premium_index", INDICATOR_ROW);
    const cells = tds(container);
    expect(cells).toHaveLength(4); // 라벨 + 3 데이터 컬럼
    expect(cells[0]?.textContent).toBe("BTCUSDT");
    for (const c of cells) {
      expect((c.textContent ?? "").length).toBeGreaterThan(0); // 전부 graceful 렌더
    }
    // 지표 컬럼은 연속 색농도(intensity) 미사용 → opacity 없음.
    expect(cells[1]?.style.opacity).toBe("");
  });

  it("헤더 라벨 = descriptor.labelColumn.header", () => {
    const { container } = renderRow("now_spot_ticker", TICKER_ROW);
    // thead 는 TableCard 본체 소관이라 여기선 라벨 셀 텍스트로 식별 컬럼 동작만 확인.
    expect(tds(container)[0]?.textContent).toBe("BTCUSDT");
  });
});

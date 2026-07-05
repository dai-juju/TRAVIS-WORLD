// FeedCard — FeedCardRow descriptor 구동 렌더 테스트 (ff#2 재개 Step 3, 2026-07-05).
//
// 범위 (TableCard.test 미러): 데이터 훅 없이 FeedCardRow 만 mount — "descriptor 가
//   시각/배지/라벨/컬럼을 구동한다"는 일반화 핵심을 검증. 전체 카드(훅 상태 분기·
//   라이브 스트림)는 Phase B 라이브 G2 가 커버. + 미등록 상태의 FeedCard 전체가
//   coming soon 으로 graceful 한지 1건 (Step 5 등록 전 안전망).

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AiCardConfig } from "@travis/shared";
import {
  getFeedDescriptor,
  type FeedRow,
} from "@/lib/cards/feedDescriptors";
import {
  FEED_DISPLAY_CAP,
  feedGridTemplateColumns,
  visibleFeedEvents,
} from "@/lib/cards/feedCardFormat";
import FeedCard, { FeedCardRow } from "../FeedCard";

const LIQ_ROW: FeedRow = {
  exchange: "binance",
  market_type: "futures_usdm",
  symbol: "BTCUSDT",
  side: "SELL",
  price: 60000,
  quantity: 1.5,
  avg_price: 59950,
  accumulated_qty: 1.5,
  notional: 89925,
  trade_time: "2026-07-05T12:34:56.000Z",
};

function renderRow(row: FeedRow, seq = 1) {
  const descriptor = getFeedDescriptor("liquidation")!;
  return render(
    <FeedCardRow
      event={{ seq, arrivedAt: 1_751_700_000_000, row }}
      descriptor={descriptor}
      gridTemplate={feedGridTemplateColumns(descriptor)}
    />,
  );
}

describe("FeedCardRow — descriptor 구동 렌더", () => {
  it("청산 라인: 시각 + LONG LIQ 배지 + 심볼 + VALUE/PRICE 컬럼 렌더", () => {
    const { container } = renderRow(LIQ_ROW);
    const text = container.textContent ?? "";
    expect(text).toContain("LONG LIQ");
    expect(text).toContain("BTCUSDT");
    expect(text).toContain("$89.9K"); // notional compact
    expect(text).toContain("59,950"); // ap 우선
    // 시각 HH:MM:SS (로컬 tz 라 정확값 대신 형식만).
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("BUY = SHORT LIQ 라벨 (텍스트 병기 — 색만으로 방향 전달 금지)", () => {
    const { container } = renderRow({ ...LIQ_ROW, side: "BUY" });
    expect(container.textContent).toContain("SHORT LIQ");
  });

  it("결측 행 graceful: notional null → '—', ap null → p 폴백", () => {
    const { container } = renderRow({
      ...LIQ_ROW,
      notional: null,
      avg_price: null,
    });
    const text = container.textContent ?? "";
    expect(text).toContain("—");
    expect(text).toContain("60,000");
  });

  it("비정상 시각 값 → '—' (한 줄이 카드 전체를 깨지 않음)", () => {
    const { container } = renderRow({ ...LIQ_ROW, trade_time: "not-a-date" });
    expect(container.textContent).toContain("—");
  });
});

describe("visibleFeedEvents — 표시 cap (버퍼=AI 의도와 분리된 form 픽셀 정책, nextjs W1)", () => {
  it("cap 이하 → 원본 배열 참조 그대로 (memo 무해)", () => {
    const arr = [1, 2, 3];
    expect(visibleFeedEvents(arr)).toBe(arr);
  });

  it("cap 초과 → 앞쪽(최신) FEED_DISPLAY_CAP 개만 표시", () => {
    const arr = Array.from({ length: FEED_DISPLAY_CAP + 50 }, (_, i) => i);
    const v = visibleFeedEvents(arr);
    expect(v.length).toBe(FEED_DISPLAY_CAP);
    expect(v[0]).toBe(0); // newest-first 앞쪽 보존
  });
});

describe("FeedCard — 상태 분기 안전망", () => {
  it("등록됐지만 transport 휴면(realtime) → 'live feed offline' (Phase A 과도기 graceful)", () => {
    // Step 5 등록 후: renderable=true, 단 liquidation transport 가 아직 realtime →
    //   ws_direct 플립(Step 6) 전까지 중립 안내. 플립 후 이 분기는 자연 소멸.
    const config = {
      id: "liq-feed-test",
      componentId: "feed-card",
      size: "md",
      updateMode: "content",
      data: { datasource: "liquidation", marketType: "futures_usdm" },
    } as unknown as AiCardConfig;
    const { container } = render(<FeedCard config={config} />);
    expect(container.textContent).toContain("live feed offline");
  });

  it("dataShapes 밖 datasource → coming soon graceful (crash 0)", () => {
    const config = {
      id: "feed-wrong-ds",
      componentId: "feed-card",
      size: "md",
      updateMode: "content",
      data: { datasource: "premium_index", marketType: "futures_usdm" },
    } as unknown as AiCardConfig;
    const { container } = render(<FeedCard config={config} />);
    expect(container.textContent).toContain("coming soon");
  });
});

// useUplot 생명주기 테스트 (사이클 2 Step 4, reviewer W3).
//
// uPlot 을 mock(캔버스 부재 jsdom)해 미묘한 생명주기 4경로를 박제:
//   ① 마운트 시 data=null → 인스턴스 0, 비동기 도착 후 생성(createRef 경유)
//   ② seriesKey 변경 → 기존 파괴 + 재생성 (동수 심볼 스왑 포함 — reviewer S1)
//   ③ unmount → 파괴
//   ④ 데이터 소멸(null 전환) → 파괴 (stale 곡선 잔존 방지 — reviewer S2)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { AlignedData } from "uplot";

interface MockInstance {
  setData: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  data: AlignedData;
}
const instances: MockInstance[] = [];
vi.mock("uplot", () => ({
  default: class MockUplot {
    setData = vi.fn();
    setSize = vi.fn();
    destroy = vi.fn();
    data: AlignedData;
    constructor(_opts: unknown, data: AlignedData) {
      this.data = data;
      instances.push(this as unknown as MockInstance);
    }
  },
}));
// uPlot.min.css 는 vitest.config 의 전역 CSS alias(styleStub)가 빈 모듈로 대체.

import { useUplot } from "../useUplot";

const DATA_A: AlignedData = [[1, 2], [10, 11]] as AlignedData;
const DATA_B: AlignedData = [[1, 2, 3], [10, 11, 12]] as AlignedData;

function mountHook(initial: { data: AlignedData | null; seriesKey: string }) {
  const el = document.createElement("div");
  const containerRef = { current: el };
  const makeOptions = vi.fn(() => ({ width: 100, height: 60, series: [{}] }));
  const view = renderHook(
    (p: { data: AlignedData | null; seriesKey: string }) =>
      useUplot({
        containerRef,
        data: p.data,
        makeOptions: makeOptions as never,
        seriesKey: p.seriesKey,
      }),
    { initialProps: initial },
  );
  return { ...view, el, makeOptions };
}

beforeEach(() => {
  instances.length = 0;
});

describe("useUplot — 생명주기", () => {
  it("① data=null 마운트 = 생성 보류 → 비동기 도착 시 생성", () => {
    // (2026-07-09 정정) 옛 "pxRatio 전역 1 클램프(W1)" 단언 제거 — 실물 uPlot 1.6.32
    //   는 렌더가 모듈 클로저 변수라 외부 클램프가 no-op. mock 의 static 프로퍼티가
    //   통과시킨 사각 (feedback_mock_test_invariant_blind_spot 동류).
    const { rerender } = mountHook({ data: null, seriesKey: "BTCUSDT" });
    expect(instances).toHaveLength(0); // 데이터 오기 전 생성 안 함
    rerender({ data: DATA_A, seriesKey: "BTCUSDT" });
    expect(instances).toHaveLength(1);
    expect(instances[0]!.data).toBe(DATA_A);
  });

  it("데이터 갱신 = setData 만 (재생성 없음 — 드래그 중 재생성 금지 원칙의 근간)", () => {
    const { rerender } = mountHook({ data: DATA_A, seriesKey: "BTCUSDT" });
    expect(instances).toHaveLength(1);
    rerender({ data: DATA_B, seriesKey: "BTCUSDT" });
    expect(instances).toHaveLength(1); // 재생성 없음
    expect(instances[0]!.setData).toHaveBeenCalledWith(DATA_B);
  });

  it("② seriesKey 변경(동수 심볼 스왑 포함) = 파괴 + 재생성 (S1)", () => {
    const { rerender } = mountHook({ data: DATA_A, seriesKey: "BTCUSDT" });
    rerender({ data: DATA_A, seriesKey: "ETHUSDT" }); // 개수 같아도 구성 변경
    expect(instances).toHaveLength(2);
    expect(instances[0]!.destroy).toHaveBeenCalled();
  });

  it("③ unmount = 파괴 (crash 없이)", () => {
    const { unmount } = mountHook({ data: DATA_A, seriesKey: "BTCUSDT" });
    unmount();
    expect(instances[0]!.destroy).toHaveBeenCalled();
  });

  it("④ 데이터 소멸(null 전환) = 파괴 — stale 곡선이 'no data' 아래 잔존 안 함 (S2)", () => {
    const { rerender } = mountHook({ data: DATA_A, seriesKey: "BTCUSDT" });
    expect(instances).toHaveLength(1);
    rerender({ data: null, seriesKey: "BTCUSDT" });
    expect(instances[0]!.destroy).toHaveBeenCalled();
    // 데이터 재도착 시 재생성
    rerender({ data: DATA_B, seriesKey: "BTCUSDT" });
    expect(instances).toHaveLength(2);
  });
});

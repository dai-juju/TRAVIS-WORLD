// useRowFlash — 행 flash 훅 테스트 (M2 테마 A Step 4a, 2026-06-11).
//
// 검증:
//   - 값 증가 → flash-row-up 부여 후 600ms 뒤 제거.
//   - 값 감소 → flash-row-down.
//   - 첫 값(이전 비교 대상 없음)·동일 값·null 은 flash 없음.

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRowFlash } from "../useRowFlash";

function Probe({ value }: { value: number | null }) {
  const ref = useRowFlash<HTMLDivElement>(value);
  return <div data-testid="row" ref={ref} />;
}

describe("useRowFlash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("값 증가 시 flash-row-up 부여 → 600ms 후 제거", () => {
    const { getByTestId, rerender } = render(<Probe value={100} />);
    const el = getByTestId("row");
    expect(el.classList.contains("flash-row-up")).toBe(false);

    rerender(<Probe value={101} />);
    expect(el.classList.contains("flash-row-up")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(el.classList.contains("flash-row-up")).toBe(false);
  });

  it("값 감소 시 flash-row-down", () => {
    const { getByTestId, rerender } = render(<Probe value={100} />);
    rerender(<Probe value={99} />);
    expect(getByTestId("row").classList.contains("flash-row-down")).toBe(true);
  });

  it("첫 값은 flash 없음 (신규 진입 행 전체 번쩍 방지)", () => {
    const { getByTestId } = render(<Probe value={100} />);
    const el = getByTestId("row");
    expect(el.classList.contains("flash-row-up")).toBe(false);
    expect(el.classList.contains("flash-row-down")).toBe(false);
  });

  it("동일 값 재렌더·null 전이는 flash 없음", () => {
    const { getByTestId, rerender } = render(<Probe value={100} />);
    const el = getByTestId("row");

    rerender(<Probe value={100} />);
    expect(el.classList.contains("flash-row-up")).toBe(false);

    rerender(<Probe value={null} />);
    expect(el.classList.contains("flash-row-up")).toBe(false);
    expect(el.classList.contains("flash-row-down")).toBe(false);
  });

  it("연속 갱신 시 방향 클래스가 교체된다 (잔존 방지)", () => {
    const { getByTestId, rerender } = render(<Probe value={100} />);
    const el = getByTestId("row");

    rerender(<Probe value={110} />);
    expect(el.classList.contains("flash-row-up")).toBe(true);

    rerender(<Probe value={105} />);
    expect(el.classList.contains("flash-row-up")).toBe(false);
    expect(el.classList.contains("flash-row-down")).toBe(true);
  });
});

// useLoadingTimeout 단위 테스트 (M1.4 Step 4-4).
//
// React hook 의 내부 동작을 node 환경에서 검증하기 위해 최소한의 mock
// 을 직접 구현한다 (renderHook 없이 로직만 재현). 본질은 "hasData=false
// 상태에서 N ms 경과 시 stale=true" 라는 단순한 타이머 관계.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// useLoadingTimeout 의 타이머 로직을 순수 함수로 재현 — 구현 1:1 미러링.
function scheduleStale(
  hasData: boolean,
  initialDelayMs: number,
  onStale: () => void,
): () => void {
  if (hasData) return () => undefined;
  const handle = setTimeout(onStale, initialDelayMs);
  return () => clearTimeout(handle);
}

describe("useLoadingTimeout 로직", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("hasData=false + 8초 경과 → stale 이 true 로 플립", () => {
    const onStale = vi.fn();
    scheduleStale(false, 8000, onStale);

    vi.advanceTimersByTime(7999);
    expect(onStale).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it("hasData=true → 타이머 예약조차 안 됨 (stale 플립 없음)", () => {
    const onStale = vi.fn();
    scheduleStale(true, 8000, onStale);

    vi.advanceTimersByTime(20000);
    expect(onStale).not.toHaveBeenCalled();
  });

  it("cleanup 이 타이머를 취소 → stale 호출 막힘 (카드 언마운트 시나리오)", () => {
    const onStale = vi.fn();
    const cleanup = scheduleStale(false, 8000, onStale);

    vi.advanceTimersByTime(4000);
    cleanup();
    vi.advanceTimersByTime(10000);
    expect(onStale).not.toHaveBeenCalled();
  });
});

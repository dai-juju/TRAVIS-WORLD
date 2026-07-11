// ============================================================
// createForwardFillTasks 단위 테스트 ([10-35] 레버 1, 2026-07-11).
//
// 핵심 회귀 핀:
//   - ★ rate 예산을 task 수로 나누지 않는다 — 각 task 의 executeHistoryBackfill 이
//     전체 예산(reqPerMin)을 그대로 받는다. 과거의 정적 분할(150÷6=25/min)이
//     5m lag 8.6h 의 직접 원인이었고, 합산 안전은 전역 token-bucket([8-31]ⓐ) 소관.
//     (이 핀이 깨지면 = 분할 재도입 = lag 회귀.)
//   - task 생성/스케줄 계약 불변: markets × GROUPS 개수, id 네이밍, restMs,
//     staggered initialDelayMs — 레버 1 이 스케줄 계약을 건드리지 않았음을 보증.
//
// task-record: docs/task-record/M2-[10-35]-forward-fill-lag.md
// ============================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDataService } from "@travis/data-service";
import { createForwardFillTasks } from "../forwardFillTask.js";

// executeHistoryBackfill 만 mock — reqPerMin 전달값 캡처용.
// computeForwardFillStartMs / INTERVAL_TO_MS 는 실물 유지 (순수 함수 — mock 할 이유 없음).
vi.mock("@travis/exchange-collectors", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@travis/exchange-collectors")>();
  return {
    ...actual,
    executeHistoryBackfill: vi.fn().mockResolvedValue({
      // BackfillResult 전체 형태 유지 (reviewer S2 — 소비자가 새 필드를 읽게 돼도 mock 정합).
      totalRows: 0,
      failedPages: 0,
      symbolCount: 0,
      elapsedMin: 0,
    }),
  };
});

import { executeHistoryBackfill } from "@travis/exchange-collectors";

const executeHistoryBackfillMock = vi.mocked(executeHistoryBackfill);

/** getMaxRecordedAt 만 필요한 최소 dataService mock (anchor 없음 → 14일 폴백 경로). */
function makeDataService(): IDataService {
  return {
    getMaxRecordedAt: vi.fn().mockResolvedValue({ success: true, data: null }),
  } as unknown as IDataService;
}

beforeEach(() => {
  executeHistoryBackfillMock.mockClear();
});

describe("createForwardFillTasks — 생성/스케줄 계약", () => {
  it("USDM 단독 = 3 task (그룹 short/mid/long), id 네이밍 계약", () => {
    const tasks = createForwardFillTasks({ dataService: makeDataService() });
    expect(tasks.map((t) => t.id)).toEqual([
      "binance-history-forward-fill-usdm-short",
      "binance-history-forward-fill-usdm-mid",
      "binance-history-forward-fill-usdm-long",
    ]);
  });

  it("USDM+COINM = 6 task + staggered initialDelayMs(30s 간격) + restMs 그룹 계약", () => {
    const tasks = createForwardFillTasks({
      dataService: makeDataService(),
      markets: ["futures_usdm", "futures_coinm"],
    });
    expect(tasks).toHaveLength(6);
    // staggered start: task index × 30s (부팅 피크 분산 — [10-35] 무접촉 불변)
    expect(tasks.map((t) => t.initialDelayMs)).toEqual([
      0, 30_000, 60_000, 90_000, 120_000, 150_000,
    ]);
    // intervalMs = 그룹 restMs (execute 완료 후 휴식 시맨틱)
    expect(tasks[0]?.intervalMs).toBe(10 * 60 * 1000); // short
    expect(tasks[1]?.intervalMs).toBe(60 * 60 * 1000); // mid
    expect(tasks[2]?.intervalMs).toBe(12 * 60 * 60 * 1000); // long
  });
});

describe("createForwardFillTasks — ★ [10-35] 레버 1: 예산 분할 없음", () => {
  it("기본 예산 150 이 task 수(6)로 나뉘지 않고 그대로 전달된다 (과거 분할값 25 금지)", async () => {
    const tasks = createForwardFillTasks({
      dataService: makeDataService(),
      markets: ["futures_usdm", "futures_coinm"],
    });
    // usdm-short task 실행 → 그룹 내 interval(5m/15m/30m)당 1회 호출
    await tasks[0]?.execute();
    expect(executeHistoryBackfillMock).toHaveBeenCalledTimes(3);
    for (const call of executeHistoryBackfillMock.mock.calls) {
      expect(call[0]?.reqPerMin).toBe(150); // ← 분할 재도입 시 25 로 깨짐 = lag 회귀 신호
    }
  });

  it("명시 reqPerMin(env 경로)도 나누지 않고 그대로 전달된다", async () => {
    const tasks = createForwardFillTasks({
      dataService: makeDataService(),
      reqPerMin: 120,
      markets: ["futures_usdm", "futures_coinm"],
    });
    await tasks[3]?.execute(); // coinm-short
    expect(
      executeHistoryBackfillMock.mock.calls.every(
        (call) => call[0]?.reqPerMin === 120,
      ),
    ).toBe(true);
  });
});

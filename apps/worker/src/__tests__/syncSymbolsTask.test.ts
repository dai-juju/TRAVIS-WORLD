// syncSymbolsTask — symbols 마스터 동기화 태스크 테스트 ([10-22], 2026-06-11).
//
// 검증:
//   - 3마켓 fetch → 마켓별 순차 upsertSymbols 호출 (동시 bulk upsert 금지 규율).
//   - 한 마켓 fetch 실패 시 graceful skip — 나머지 마켓은 계속 동기화 (부분 성공).
//   - 빈 응답 마켓은 upsert skip (기존 row 비파괴).
//   - createSyncSymbolsTask: 1h interval + initialDelayMs=1h (부팅 중복 방지, [10-23] 1단계).

import { describe, expect, it, vi } from "vitest";
import {
  createSyncSymbolsTask,
  runSyncSymbols,
  type SyncSymbolsTaskDeps,
} from "../poller/tasks/syncSymbolsTask.js";

type FetchResult =
  | { success: true; data: Array<{ symbol: string }> }
  | { success: false; error: string };

function makeDeps(overrides?: {
  spot?: FetchResult;
  usdm?: FetchResult;
  coinm?: FetchResult;
  upsertFail?: boolean;
}) {
  const ok = (symbols: string[]): FetchResult => ({
    success: true,
    data: symbols.map((s) => ({ symbol: s })),
  });
  const upsertCalls: Array<Array<{ symbol: string }>> = [];
  const deps = {
    spotAdapter: {
      fetchExchangeInfo: vi.fn(async () => overrides?.spot ?? ok(["BTCUSDT"])),
    },
    usdmAdapter: {
      fetchExchangeInfo: vi.fn(
        async () => overrides?.usdm ?? ok(["BTWUSDT", "SKHYNIXUSDT"]),
      ),
    },
    coinmAdapter: {
      fetchExchangeInfo: vi.fn(async () => overrides?.coinm ?? ok(["BTCUSD_PERP"])),
    },
    dataService: {
      upsertSymbols: vi.fn(async (rows: Array<{ symbol: string }>) => {
        upsertCalls.push(rows);
        return overrides?.upsertFail
          ? { success: false as const, error: "boom" }
          : { success: true as const, data: undefined };
      }),
    },
  };
  return { deps: deps as unknown as SyncSymbolsTaskDeps, raw: deps, upsertCalls };
}

describe("runSyncSymbols", () => {
  it("3마켓을 각각 fetch 하고 마켓별로 분리 upsert (순차)", async () => {
    const { deps, raw, upsertCalls } = makeDeps();
    await runSyncSymbols(deps);

    expect(raw.spotAdapter.fetchExchangeInfo).toHaveBeenCalledTimes(1);
    expect(raw.usdmAdapter.fetchExchangeInfo).toHaveBeenCalledTimes(1);
    expect(raw.coinmAdapter.fetchExchangeInfo).toHaveBeenCalledTimes(1);
    // 마켓별 1회씩 = 3회 (전 마켓을 한 배치로 합치지 않음)
    expect(upsertCalls).toHaveLength(3);
    expect(upsertCalls[1]?.map((r) => r.symbol)).toEqual([
      "BTWUSDT",
      "SKHYNIXUSDT",
    ]);
  });

  it("한 마켓 fetch 실패 시 해당 마켓만 skip — 나머지는 계속 (부분 성공)", async () => {
    const { deps, upsertCalls } = makeDeps({
      usdm: { success: false, error: "binance 5xx" },
    });
    await runSyncSymbols(deps); // throw 없이 완료돼야 함 (graceful)
    expect(upsertCalls).toHaveLength(2); // spot + coinm 만
  });

  it("빈 응답 마켓은 upsert skip (기존 row 비파괴)", async () => {
    const { deps, upsertCalls } = makeDeps({
      spot: { success: true, data: [] },
    });
    await runSyncSymbols(deps);
    expect(upsertCalls).toHaveLength(2); // usdm + coinm 만
  });

  it("upsert 실패도 graceful — throw 없이 다음 마켓 진행", async () => {
    const { deps, upsertCalls } = makeDeps({ upsertFail: true });
    await expect(runSyncSymbols(deps)).resolves.toBeUndefined();
    expect(upsertCalls.length).toBeGreaterThanOrEqual(3); // retry 포함 시 ≥3
  });
});

describe("createSyncSymbolsTask", () => {
  it("1h interval + initialDelayMs=1h (부팅 명시 1회와 중복 방지, [10-23] 1단계)", () => {
    const { deps } = makeDeps();
    const task = createSyncSymbolsTask(deps);
    expect(task.id).toBe("binance-sync-symbols");
    expect(task.tier).toBe("low");
    expect(task.intervalMs).toBe(60 * 60 * 1000);
    expect(task.initialDelayMs).toBe(60 * 60 * 1000);
  });
});

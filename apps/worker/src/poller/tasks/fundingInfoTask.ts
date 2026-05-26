// ============================================================
// fundingInfoTask — Binance fundingInfo 24h cache + DB dual-write (M1.8 §8.2a-2, 2026-05-26).
//
// 책임:
//   - /fapi/v1/fundingInfo 24h 주기 호출 (weight 0, IP 부담 거의 없음)
//   - 응답 (PHAROSUSDT 같은 4h 코인 + cap/floor) 를 in-memory Map 으로 캐싱
//   - symbols.funding_interval_hours DB dual-write (D9)
//   - getter export → premiumIndexTask / perSymbolTask 가 normalize 시 fundingIntervalHours 인자 주입
//
// 핵심 정책 (D13 + Binance docs):
//   - 응답에 등재된 심볼만 4h 또는 8h 명시 (실제로는 1100+ 심볼 등재)
//   - 응답에 없는 심볼 = default 8h fallback (Binance 공식 정책, negative-space 정의)
//   - getFundingIntervalHours(symbol) 가 Map miss 시 8 자동 fallback
//
// 동시성:
//   - 본 task 가 module-level Map 을 in-place 교체 (clear + set 반복)
//   - 읽기 (getFundingIntervalHours / getFundingIntervalMap) 은 race 안전
//     (JS single-threaded + Map 은 atomic Get)
//
// docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-Info (2026-05-26 조회)
// 자세한 자문 결과: docs/task-record/M1.8-step0-pre-infra.md §3 Q3 + .claude/agent-memory/crypto-domain-expert/CANONICAL_METRICS.md
// ============================================================

import type { IDataService } from "@travis/data-service";
import type { BinanceUsdmAdapter } from "../../adapters/binance/index.js";
import type { PollTask } from "../../adapters/IPoller.js";
import { retryOnTransient } from "./_upsertRetry.js";

/** 24h 주기. funding interval 변경 빈도 매우 낮음 (Binance 공지 기반). */
const INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Binance 공식 default = 8h. fundingInfo 응답 미등재 심볼은 자동 fallback. */
const DEFAULT_INTERVAL_HOURS = 8;

// ─── Module-level Map state ────────────────────────────
// 본 모듈만이 write 권한. read 는 getter 두 개 (singular + bulk) 로 외부 공개.
const fundingIntervalMap = new Map<string, number>();

/**
 * 단일 심볼의 funding interval hours 반환. Map miss 시 8 default (Binance 정책).
 * premiumIndexTask 의 normalize 시점에 매 symbol 별로 호출.
 */
export function getFundingIntervalHours(symbol: string): number {
  return fundingIntervalMap.get(symbol) ?? DEFAULT_INTERVAL_HOURS;
}

/**
 * 전체 Map 의 read-only 참조 반환. 호출자 (예: fetchPremiumIndex) 가
 * Map 전체를 받아 normalize 시 lookup. ReadonlyMap 으로 외부 write 차단.
 */
export function getFundingIntervalMap(): ReadonlyMap<string, number> {
  return fundingIntervalMap;
}

export interface FundingInfoTaskDeps {
  usdmAdapter: BinanceUsdmAdapter;
  dataService: IDataService;
}

export function createFundingInfoTask(deps: FundingInfoTaskDeps): PollTask {
  return {
    id: "binance-funding-info",
    tier: "low",
    intervalMs: INTERVAL_MS,
    execute: () => runFundingInfo(deps),
  };
}

async function runFundingInfo(deps: FundingInfoTaskDeps): Promise<void> {
  const startedAt = Date.now();

  const res = await deps.usdmAdapter.fetchFundingInfo();
  if (!res.success) {
    console.error(`[fundingInfoTask] fetch 실패: ${res.error}`);
    return;
  }

  // Map in-place 교체 — clear + set 반복.
  // 동시 read 와의 race 는 JS single-threaded + Map atomic 으로 자연스럽게 안전.
  fundingIntervalMap.clear();
  for (const row of res.data) {
    fundingIntervalMap.set(row.symbol, row.fundingIntervalHours);
  }

  const intervalDistribution = countByInterval(res.data);
  console.log(
    `[fundingInfoTask] Map 갱신: ${res.data.length}개 심볼 등재 ` +
      `(4h=${intervalDistribution.fourHour}, 8h=${intervalDistribution.eightHour}, ` +
      `other=${intervalDistribution.other}). default 8h fallback 정책.`,
  );

  // DB dual-write (D9) — symbols.funding_interval_hours partial update.
  // M1.8 §8.2a-2 hotfix (2026-05-26): symbols 테이블에 등재된 심볼만 DB sync.
  //   사고 사례: PHAROSUSDT 같은 Binance 신규 상장 직후 코인이 fundingInfo 응답에는 등재
  //   되지만 symbols 테이블엔 24h reload 안에 아직 등재 안 됨. Supabase upsert 가
  //   미등재 row → INSERT → base_asset NOT NULL 위반.
  //   in-memory Map 은 모든 619 심볼 보유 (premiumIndexTask 가 정상 활용) — DB 측만 filter.
  //   미등재 심볼은 다음 syncSymbolsTask 24h cycle 후 자연 회수.
  const symbolsRes = await deps.dataService.getSymbols({
    exchange: "binance",
    marketType: "futures_usdm",
    status: "TRADING",
  });
  const existingSymbols = symbolsRes.success
    ? new Set(symbolsRes.data.map((s) => s.symbol))
    : new Set<string>();
  if (!symbolsRes.success) {
    console.error(
      `[fundingInfoTask] symbols 조회 실패 (DB sync 스킵): ${symbolsRes.error}`,
    );
    return;
  }

  const dbRows = res.data
    .filter((row) => existingSymbols.has(row.symbol))
    .map((row) => ({
      exchange: "binance",
      market_type: "futures_usdm",
      symbol: row.symbol,
      funding_interval_hours: row.fundingIntervalHours,
    }));
  const skippedCount = res.data.length - dbRows.length;
  if (skippedCount > 0) {
    console.warn(
      `[fundingInfoTask] DB sync: ${skippedCount}개 심볼 skip (symbols 미등재, Binance 신규 상장 추정 — syncSymbolsTask 24h reload 후 자연 회수)`,
    );
  }
  if (dbRows.length === 0) {
    console.warn("[fundingInfoTask] 0개 row — DB sync 스킵");
    return;
  }

  const up = await retryOnTransient(
    () => deps.dataService.updateSymbolFundingIntervalHours(dbRows),
    { label: "fundingInfoTask DB sync" },
  );
  if (!up.success) {
    console.error(`[fundingInfoTask] DB sync 최종 실패: ${up.error}`);
  } else {
    console.log(
      `[fundingInfoTask] DB sync: ${dbRows.length}개 심볼 갱신 완료 (skip=${skippedCount})`,
    );
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`[fundingInfoTask] 완료: ${elapsedMs}ms 소요`);
}

/** 응답 row 의 fundingIntervalHours 분포 집계 (로깅용). */
function countByInterval(
  rows: ReadonlyArray<{ fundingIntervalHours: number }>,
): { fourHour: number; eightHour: number; other: number } {
  let fourHour = 0;
  let eightHour = 0;
  let other = 0;
  for (const row of rows) {
    if (row.fundingIntervalHours === 4) fourHour++;
    else if (row.fundingIntervalHours === 8) eightHour++;
    else other++;
  }
  return { fourHour, eightHour, other };
}

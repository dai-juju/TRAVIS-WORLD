// ============================================================
// forwardFillTask — history forward-fill 수집 task (M1.9 Step 2-B 본구현 / 2-D COINM 통합).
//
// 역할:
//   M1.8.5 가 채운 과거 14일 history 가 2026-05-31 에 정지(`[8-26]`)한 문제를 해소.
//   DB 최신 recorded_at(getMaxRecordedAt) 부터 증분으로 새 봉을 계속 누적한다.
//
// 구조 (§5 lock-in):
//   - market(USDM/COINM) × interval 그룹(단기/중기/장기) = 별도 PollTask.
//     단기봉 새 봉이 5분마다 나오는데 1d 를 같은 주기로 재조회하면 IP quota 낭비 → 그룹 분리.
//   - ★ market 별 별도 task = 별도 executeHistoryBackfill 호출 = 별도 upsert 배치
//     → mixed-batch 불변(USDM/COINM row 섞어 upsert 금지) 자연 보장 (feedback_mixed_batch_invariant).
//   - 한 그룹 execute = 그룹 내 각 interval 을 자기 freshness anchor 부터 증분 수집.
//     interval 마다 anchor 가 다르므로 interval 당 1회 executeHistoryBackfill 호출.
//
// 멱등: 자연키 5축 onConflict + defaultToNull:false → 안전 lookback(마지막 2봉) 재수집 무해.
// crash 금지(CLAUDE.md): interval 별 try/catch — 한 interval 실패가 다음·전체 task 를 안 죽인다.
//
// ★ COINM(2-D): scope=PERPETUAL. symbolFilter 로 `_PERP` 만 수집(분기물 BNBUSD_260626 제외).
//   롤아웃 순차(ROADMAP #3): index.ts 가 env(FORWARD_FILL_COINM)로 COINM 토글 — 기본 USDM 만.
//
// 별도 IP 근거: production worker 와 같은 IP backfill 시 Binance /futures/data IP quota 초과
//   → -1003 ban 실측(2026-05-31). 별도 Hetzner 서버(별도 IP)에서 구동.
//
// task-record: docs/task-record/M1.9-step2-forward-fill.md §2-B/§2-D
// ============================================================

import type { IDataService } from "@travis/data-service";
import {
  computeForwardFillStartMs,
  executeHistoryBackfill,
  INTERVAL_TO_MS,
  type BinanceHistoryPeriod,
} from "@travis/exchange-collectors";
import type { MarketType, PollTask } from "@travis/shared";

/**
 * 전체 IP 요청 예산 (req/min). 미설정 시 보수 기본값 = token-bucket stats 한도와 동일.
 * ★ [10-35] 레버 1 (2026-07-11): 과거엔 이 값을 동시 task 수로 나눠(150÷6=25/min) 분배했으나,
 *   그 정적 분할은 전역 token-bucket([8-31]ⓐ, futuresDataRateLimiter — stats 150/basis 30/
 *   funding 80 req/min 프로세스 전역 합산 hard cap, acquire=대기형) 도입 **이전**의 안전장치.
 *   steady-state 에선 short task 만 상시 가동이라 분할된 예산의 ~83%가 놀았고(5m lag 8.6h 실측),
 *   IP quota(1000req/5min) 안전은 token-bucket 이 홀로 보장 → 분할 제거. 각 task 는 이 값을
 *   자기 throttle floor(60000/reqPerMin)로 그대로 받고, 동시 발화 시 합산은 token-bucket 이
 *   버킷 한도에서 강제 대기시킨다(futuresDataRateLimiter.ts W2 "min() 관계 — 함께 검토" 이행).
 *   task-record: docs/task-record/M2-[10-35]-forward-fill-lag.md
 */
const DEFAULT_TOTAL_REQ_PER_MIN = 150;

/** anchor 없을 때(최초 가동, 예: COINM 첫 cycle) 폴백 lookback — 14일. */
const DEFAULT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * staggered start 간격(ms) — task 별 첫 실행 분산 (M1.9 Step 3 즉효 fix, 2026-06-04).
 *
 * ★ 배경: TierPoller.start() 가 전 task 를 0ms 동시 발화 → 부팅 catch-up 첫 윈도우에
 *   3(USDM) ~ 6(USDM+COINM) task 의 /futures/data 요청이 합산돼 Binance IP/weight 한도를
 *   순간 초과(-1003) 위험. task index × 30s 로 0/30/60/90/120/150s 분산 → 첫 5분 동시성 피크 제거.
 *   (두 번째 tick 부터는 group.restMs 휴식으로만 결정 — 이 지연은 최초 1회 only.)
 *   근본 방어는 전역 token-bucket([8-31]ⓐ, 2026-06-05 도입) — stagger 는 부팅 순간
 *   여러 task 가 버킷 앞에 한꺼번에 줄서는 대기 몰림을 줄이는 보조로 유지([10-35] 무접촉).
 */
const STAGGER_STEP_MS = 30_000;

/** 본 task 가 지원하는 market (futures 만 — spot 은 history indicator 무관). index.ts 와 공유. */
export type ForwardFillMarket = "futures_usdm" | "futures_coinm";

/** interval 그룹 + 스케줄. PollTask.intervalMs = "execute 완료 후 휴식"(§5 lock-in). */
interface ForwardFillGroup {
  name: string; // task id suffix (short/mid/long)
  intervals: BinanceHistoryPeriod[];
  restMs: number;
}

const GROUPS: ForwardFillGroup[] = [
  { name: "short", intervals: ["5m", "15m", "30m"], restMs: 10 * 60 * 1000 }, // ~10분
  { name: "mid", intervals: ["1h", "2h", "4h", "6h"], restMs: 60 * 60 * 1000 }, // ~1h
  { name: "long", intervals: ["12h", "1d"], restMs: 12 * 60 * 60 * 1000 }, // ~12h (하루 2회)
];

/** market 별 메타 — task id label + 심볼 필터(정책은 task 소유, core 는 술어만 적용). */
interface MarketSpec {
  marketType: MarketType;
  label: string;
  symbolFilter?: (symbol: string) => boolean;
}

const MARKET_SPECS: Record<ForwardFillMarket, MarketSpec> = {
  futures_usdm: { marketType: "futures_usdm", label: "usdm" },
  // ★ COINM = PERPETUAL only (분기물 제외). symbol 은 BTCUSD_PERP 형식.
  futures_coinm: {
    marketType: "futures_coinm",
    label: "coinm",
    symbolFilter: (s) => s.endsWith("_PERP"),
  },
};

export interface ForwardFillTaskDeps {
  dataService: IDataService;
  /**
   * 전체 IP 요청 예산 (req/min). 미지정 시 DEFAULT_TOTAL_REQ_PER_MIN.
   * ★ [10-35] 레버 1: task 수로 나누지 않고 각 task 의 throttle floor 로 그대로 전달 —
   *   합산 상한은 전역 token-bucket 이 강제하므로 여기서 쪼개면 예산만 논다.
   */
  reqPerMin?: number;
  /** 수집 대상 market (롤아웃 순차). 미지정 시 USDM 만. COINM 은 index.ts 가 env 로 추가. */
  markets?: ForwardFillMarket[];
  /**
   * ★ 협조적 취소 signal ([8-31]ⓑ, 2026-06-05). index.ts 가 SIGTERM/SIGINT 시 abort().
   *   각 task 의 executeHistoryBackfill 로 전파돼 진행 중 cycle 을 즉시 graceful 중단
   *   → systemd SIGKILL(TimeoutStopSec 초과) 회피. 미지정 시 취소 비활성.
   */
  signal?: AbortSignal;
}

/**
 * forward-fill task 생성 — (market × interval 그룹) PollTask 배열.
 * USDM 만이면 3개, USDM+COINM 이면 6개. 미래 그룹/마켓 추가는 GROUPS/MARKET_SPECS 확장만으로.
 *
 * ★ rate 예산 ([10-35] 레버 1): 예산을 task 수로 나누지 않는다 — 각 task 가 전체 예산을
 *   자기 throttle floor 로 받고, 동시 발화 시 합산 상한은 전역 token-bucket(stats 150/min 등)
 *   이 대기형 acquire 로 강제한다. 과거의 정적 분할(150÷taskCount)은 steady-state 에서
 *   예산 ~83%를 stranded 시켜 5m lag 8.6h 의 직접 원인이었다(cycle ≈ 심볼×metric÷reqPerMin).
 */
export function createForwardFillTasks(deps: ForwardFillTaskDeps): PollTask[] {
  // 하한 1 클램프 (reviewer S1): env 오설정(FORWARD_FILL_REQ_PER_MIN=0)이 흘러들면
  // minIntervalMs=60000/0=Infinity 로 throttle 이 무력화됨(setTimeout 클램프로 hang 은 아님).
  // TokenBucket 의 capacity<=0 가드와 대칭 — 과거 Math.max(10, 분할식)이 겸하던 방어 승계.
  const reqPerMin = Math.max(1, deps.reqPerMin ?? DEFAULT_TOTAL_REQ_PER_MIN);
  const markets = deps.markets ?? ["futures_usdm"];
  const tasks: PollTask[] = [];
  // taskIndex 로 staggered start 분산 — 첫 실행만 0/30/60s... 차등(동시 발화 피크 제거).
  let taskIndex = 0;
  for (const market of markets) {
    const spec = MARKET_SPECS[market];
    for (const group of GROUPS) {
      tasks.push({
        id: `binance-history-forward-fill-${spec.label}-${group.name}`,
        tier: "low",
        intervalMs: group.restMs,
        initialDelayMs: taskIndex * STAGGER_STEP_MS,
        execute: () =>
          runGroupForwardFill(deps.dataService, spec, group, reqPerMin, deps.signal),
      });
      taskIndex += 1;
    }
  }
  return tasks;
}

/**
 * 한 (market, 그룹) 의 interval 들을 각자 freshness anchor 부터 증분 수집.
 * interval 별 try/catch — 한 interval 실패가 다음 interval 을 막지 않음(crash 금지).
 */
async function runGroupForwardFill(
  dataService: IDataService,
  spec: MarketSpec,
  group: ForwardFillGroup,
  reqPerMin: number,
  signal?: AbortSignal,
): Promise<void> {
  const nowMs = Date.now();
  const tag = `${spec.label}-${group.name}`;
  for (const interval of group.intervals) {
    // [8-31]ⓑ: shutdown 협조 — interval 경계에서 abort 시 다음 interval 시작 안 함(즉시 종료).
    if (signal?.aborted) {
      console.log(`[forwardFill:${tag}] abort 감지 — 남은 interval 건너뜀(graceful)`);
      return;
    }
    try {
      // 1) freshness: 이 (market, interval) 을 어디까지 채웠나.
      const anchorRes = await dataService.getMaxRecordedAt({
        exchange: "binance",
        marketType: spec.marketType,
        interval,
      });
      if (!anchorRes.success) {
        console.error(
          `[forwardFill:${tag}] ${interval} freshness 조회 실패(skip): ${anchorRes.error}`,
        );
        continue;
      }

      // 2) 증분 시작점: anchor - 안전 2봉 / anchor 없으면(최초 가동) 14일 폴백.
      const anchorMs = anchorRes.data ? Date.parse(anchorRes.data) : null;
      const startMs = computeForwardFillStartMs(
        anchorMs,
        INTERVAL_TO_MS[interval],
        nowMs,
        DEFAULT_LOOKBACK_MS,
      );

      // 3) 그 시작점부터 now 까지 이 (market, interval) 만 증분 수집.
      //    marketType 별 호출 = 별도 upsert 배치 = mixed-batch 자연 분리.
      const result = await executeHistoryBackfill({
        dataService,
        marketType: spec.marketType,
        intervals: [interval],
        startMsOverride: startMs,
        symbolFilter: spec.symbolFilter,
        reqPerMin,
        signal, // [8-31]ⓑ: cycle 내부(페이지/throttle/fetch)까지 즉시 취소 전파.
        onProgress: (m) => console.log(m),
      });

      console.log(
        `[forwardFill:${tag}] ${interval} ✓ rows=${result.totalRows} ` +
          `failed=${result.failedPages} symbols=${result.symbolCount} ` +
          `from=${new Date(startMs).toISOString()}`,
      );
    } catch (e) {
      // executeHistoryBackfill 은 symbols 조회 실패 시 throw 가능 — 흡수 후 다음 interval 계속.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[forwardFill:${tag}] ${interval} 예외(graceful, 다음 interval 계속): ${msg}`,
      );
    }
  }
}

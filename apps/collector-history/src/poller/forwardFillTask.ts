// ============================================================
// forwardFillTask — history forward-fill 수집 task (M1.9 Step 2-B 본구현).
//
// 역할:
//   M1.8.5 가 채운 과거 14일 history 가 2026-05-31 에 정지(`[8-26]`)한 문제를 해소.
//   DB 최신 recorded_at(getMaxRecordedAt) 부터 증분으로 새 봉을 계속 누적한다.
//
// 구조 (§5 lock-in):
//   - interval 그룹별 **별도 PollTask** — 단기(5m/15m/30m)는 자주, 장기(12h/1d)는 드물게.
//     단기봉 새 봉이 5분마다 나오는데 1d 를 같은 주기로 재조회하면 IP quota 낭비 → 그룹 분리.
//   - 한 그룹 execute = 그룹 내 각 interval 을 **자기 freshness anchor** 부터 증분 수집.
//     interval 마다 anchor 가 다르므로(5m→05-31 12:05, 1d→05-31 00:00) interval 당 1회
//     executeHistoryBackfill(`intervals:[interval]` + 그 interval 의 startMsOverride) 호출.
//
// 멱등: 자연키 5축 onConflict + defaultToNull:false → 안전 lookback(마지막 2봉) 재수집 무해.
//
// crash 금지(CLAUDE.md): interval 별 try/catch — 한 interval 실패가 다음 interval·전체
//   task 를 죽이지 않는다. TierPoller 의 consecutiveFailures 는 throw 시 동작하나, 본 task 는
//   graceful 흡수가 원칙이라 throw 누출 0 을 목표(부분 실패는 로그).
//
// 별도 IP 근거: production worker 와 같은 IP 로 backfill 시 Binance /futures/data
//   IP quota(1000 req/5min) 초과 → -1003 ban 실측(2026-05-31). 이 수집기는 별도
//   Hetzner 서버(별도 IP)에서 돌아 충돌 회피.
//
// ⚠️ 2-B 범위 = USDM 전용. COINM(dapi) 통합 + marketType 별 별도 cycle 은 2-D.
// task-record: docs/task-record/M1.9-step2-forward-fill.md §2-B
// ============================================================

import type { IDataService } from "@travis/data-service";
import {
  computeForwardFillStartMs,
  executeHistoryBackfill,
  INTERVAL_TO_MS,
  type BinanceHistoryPeriod,
} from "@travis/exchange-collectors";
import type { PollTask } from "@travis/shared";

/** 환경변수 rate (req/min) 미설정 시 보수 기본값. */
const DEFAULT_REQ_PER_MIN = 150;

/** anchor 없을 때(최초 가동) 폴백 lookback — 14일(backfill 기본과 동일). */
const DEFAULT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

/** interval 그룹 + 스케줄. PollTask.intervalMs = "execute 완료 후 휴식"(§5 lock-in). */
interface ForwardFillGroup {
  id: string;
  intervals: BinanceHistoryPeriod[];
  /** execute 완료 후 휴식(ms). 단기 ~10분 / 중기 ~1h / 장기 ~12h. */
  restMs: number;
}

const GROUPS: ForwardFillGroup[] = [
  {
    id: "binance-history-forward-fill-short",
    intervals: ["5m", "15m", "30m"],
    restMs: 10 * 60 * 1000, // ~10분
  },
  {
    id: "binance-history-forward-fill-mid",
    intervals: ["1h", "2h", "4h", "6h"],
    restMs: 60 * 60 * 1000, // ~1h
  },
  {
    id: "binance-history-forward-fill-long",
    intervals: ["12h", "1d"],
    restMs: 12 * 60 * 60 * 1000, // ~12h (하루 2회)
  },
];

export interface ForwardFillTaskDeps {
  dataService: IDataService;
  /** rate limit (req/min). 미지정 시 DEFAULT_REQ_PER_MIN. */
  reqPerMin?: number;
}

/**
 * forward-fill task 생성 — interval 그룹별 PollTask **배열**(3개) 반환.
 * index.ts 는 각 task 를 poller.register — 미래 그룹/마켓 추가는 GROUPS 확장만으로.
 */
export function createForwardFillTasks(deps: ForwardFillTaskDeps): PollTask[] {
  const reqPerMin = deps.reqPerMin ?? DEFAULT_REQ_PER_MIN;
  return GROUPS.map(
    (group): PollTask => ({
      id: group.id,
      tier: "low",
      intervalMs: group.restMs,
      execute: () => runGroupForwardFill(deps.dataService, group, reqPerMin),
    }),
  );
}

/**
 * 한 그룹의 interval 들을 각자 freshness anchor 부터 증분 수집.
 * interval 별 try/catch — 한 interval 의 실패가 다음 interval 을 막지 않음(crash 금지).
 */
async function runGroupForwardFill(
  dataService: IDataService,
  group: ForwardFillGroup,
  reqPerMin: number,
): Promise<void> {
  const nowMs = Date.now();
  for (const interval of group.intervals) {
    try {
      // 1) freshness: 이 (USDM, interval) 을 어디까지 채웠나.
      const anchorRes = await dataService.getMaxRecordedAt({
        exchange: "binance",
        marketType: "futures_usdm",
        interval,
      });
      if (!anchorRes.success) {
        console.error(
          `[forwardFill:${group.id}] ${interval} freshness 조회 실패(skip): ${anchorRes.error}`,
        );
        continue;
      }

      // 2) 증분 시작점: anchor - 안전 2봉 / anchor 없으면 14일 폴백.
      const anchorMs = anchorRes.data ? Date.parse(anchorRes.data) : null;
      const startMs = computeForwardFillStartMs(
        anchorMs,
        INTERVAL_TO_MS[interval],
        nowMs,
        DEFAULT_LOOKBACK_MS,
      );

      // 3) 그 시작점부터 now 까지 이 interval 만 증분 수집.
      const result = await executeHistoryBackfill({
        dataService,
        marketType: "futures_usdm",
        intervals: [interval],
        startMsOverride: startMs,
        reqPerMin,
        onProgress: (m) => console.log(m),
      });

      console.log(
        `[forwardFill:${group.id}] ${interval} ✓ rows=${result.totalRows} ` +
          `failed=${result.failedPages} symbols=${result.symbolCount} ` +
          `from=${new Date(startMs).toISOString()}`,
      );
    } catch (e) {
      // executeHistoryBackfill 은 symbols 조회 실패 시 throw 가능 — 흡수 후 다음 interval 계속.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[forwardFill:${group.id}] ${interval} 예외(graceful, 다음 interval 계속): ${msg}`,
      );
    }
  }
}

// ============================================================
// syncSymbolsTask — 3마켓 exchangeInfo → symbols 마스터 동기화
// (M2 테마 A 후속 [10-22] hotfix, 2026-06-11).
//
// 배경 (사고):
//   symbols 테이블은 M1.3 시드(smokeBinance.ts 일회성 실행, 2026-04-19) 이후
//   주기 동기화 태스크가 **존재하지 않아 2달간 stale** 했다. fundingInfoTask 등의
//   주석은 "syncSymbolsTask 24h cycle 후 자연 회수" 를 가정했지만 실제 구현이
//   누락된 상태 (설계 의도 ↔ 구현 drift). 그 결과 4/19 이후 상장된 모든 심볼
//   (BTWUSDT, SKHYNIXUSDT 등 TradFi 신규 포함) 이 TRAVIS 전체에서 부재 —
//   IndicatorListCard(funding 랭킹)가 이 잠복 결함을 가시화했다
//   (사용자 G2 발견, SKHYNIXUSDT funding +0.31% = 실랭킹 2위권 누락).
//   CLAUDE.md 데이터 위생 #3 ("symbols 마스터 24h 이하 주기 자동 재로드") 의 이행.
//
// 책임:
//   - spot / futures_usdm / futures_coinm 3마켓 exchangeInfo 를 각각 fetch
//   - normalize 된 전 심볼을 마켓별 **순차** upsert (전 상태 포함 — TRADING 외
//     SETTLING/CLOSE 등도 status 전이를 DB 에 반영해야 allowlist 가 정확해짐)
//   - 마켓 단위 부분 성공 허용 (한 마켓 실패가 다른 마켓을 막지 않음)
//
// 동시성/안전:
//   - 마켓별 순차 await — 동일 테이블 동시 bulk upsert 금지 규율
//     (feedback_concurrent_upsert_deadlock).
//   - upsert 는 멱등 — 부팅 명시 1회 + 1h 주기 중복 실행 무해.
//
// 신규 상장 반영 한계 (의도된 정책):
//   - 본 태스크가 DB 를 갱신해도 ChunkedRelay WS 구독은 부팅 스냅샷 고정 —
//     신규 심볼의 markPrice/ticker WS 는 다음 워커 재시작에 합류한다.
//     그 사이 REST 폴링(premiumIndexTask 30m 등)이 값을 채운다 (단 24h refresh
//     로 allowlist 에 들어온 뒤). 동적 WS 구독은 deferred.
//
// docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information (2026-06-11 조회)
// ============================================================

import type { IDataService } from "@travis/data-service";
import type {
  BinanceCoinmAdapter,
  BinanceSpotAdapter,
  BinanceUsdmAdapter,
} from "../../adapters/binance/index.js";
import type { PollTask } from "@travis/shared";
import { retryOnTransient } from "@travis/exchange-collectors";

/**
 * 1h 주기 — [10-23] 1단계 (2026-06-12, 사용자 결정).
 * 24h 주기 시절 실측: 신규 상장 심볼이 최대 24h 동안 symbols 미등재 →
 * fundingInfoTask DB sync 에서 11시간 skip 지속 사례 (06-12 관측 세션).
 * 1h 로 단축 시 누락 창 ≤1h. exchangeInfo weight(10×3마켓/h)는 무시 수준.
 * 위생 #3 ("24h 이하 주기") 상한도 여전히 충족.
 */
const INTERVAL_MS = 60 * 60 * 1000;

export interface SyncSymbolsTaskDeps {
  spotAdapter: BinanceSpotAdapter;
  usdmAdapter: BinanceUsdmAdapter;
  coinmAdapter: BinanceCoinmAdapter;
  dataService: IDataService;
}

export function createSyncSymbolsTask(deps: SyncSymbolsTaskDeps): PollTask {
  return {
    id: "binance-sync-symbols",
    tier: "low",
    intervalMs: INTERVAL_MS,
    // 부팅 시에는 index.ts 가 runSyncSymbols 를 명시 1회 실행 (loadAllSymbols 보다
    // 먼저 — 신규 심볼이 부팅 allowlist 에 즉시 반영). poller 쪽 첫 실행은 1h 뒤로
    // 미뤄 중복 호출 제거 (staggered start 활용).
    initialDelayMs: INTERVAL_MS,
    execute: () => runSyncSymbols(deps),
  };
}

/**
 * 3마켓 exchangeInfo → symbols upsert 본체.
 * index.ts 부팅 경로에서도 직접 호출되므로 export.
 */
export async function runSyncSymbols(deps: SyncSymbolsTaskDeps): Promise<void> {
  const startedAt = Date.now();

  // 마켓별 순차 처리 — fetch 는 병렬해도 무해하나 upsert 가 순차여야 하므로
  // 단순하게 전체를 직선화 (1h 주기 저빈도 태스크라 지연 무관).
  const markets: ReadonlyArray<{
    label: string;
    fetch: () => ReturnType<BinanceSpotAdapter["fetchExchangeInfo"]>;
  }> = [
    { label: "spot", fetch: () => deps.spotAdapter.fetchExchangeInfo() },
    { label: "futures_usdm", fetch: () => deps.usdmAdapter.fetchExchangeInfo() },
    { label: "futures_coinm", fetch: () => deps.coinmAdapter.fetchExchangeInfo() },
  ];

  let okMarkets = 0;
  for (const market of markets) {
    const res = await market.fetch();
    if (!res.success) {
      // 부분 성공 허용 — 한 마켓 실패가 나머지 동기화를 막지 않는다 (graceful).
      console.error(
        `[syncSymbolsTask] ${market.label} exchangeInfo fetch 실패 (skip): ${res.error}`,
      );
      continue;
    }
    if (res.data.length === 0) {
      // 빈 응답 = 공급자 이상 신호 — 기존 row 를 지우지 않으므로 무해하지만 경고.
      console.warn(`[syncSymbolsTask] ${market.label} 응답 0개 심볼 — upsert skip`);
      continue;
    }

    const up = await retryOnTransient(
      () => deps.dataService.upsertSymbols(res.data),
      { label: `syncSymbolsTask ${market.label}` },
    );
    if (!up.success) {
      console.error(
        `[syncSymbolsTask] ${market.label} upsert 최종 실패: ${up.error}`,
      );
      continue;
    }
    okMarkets += 1;
    console.log(
      `[syncSymbolsTask] ${market.label}: ${res.data.length}개 심볼 동기화 완료`,
    );
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[syncSymbolsTask] 완료: ${okMarkets}/${markets.length} 마켓, ${elapsedMs}ms 소요`,
  );
}

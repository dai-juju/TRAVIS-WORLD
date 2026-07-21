// symbols refresh 판정 로직 (M3-step4 Step 3, 2026-07-22).
//
// symbolRefreshTimer(index.ts)가 1h 마다 호출하는 순수 판정 함수 — 부수효과 없음.
// main() 클로저에서 분리한 이유 = 단위 테스트 가능성 (shutdown.ts 와 동일 패턴).
//
// 역할 2가지:
//   1. 신규 상장 감지 ([10-118] 갭 대응): per-symbol WS 구독(청산·실시간 push)은
//      부팅 스냅샷에 고정이라 신규 상장 심볼의 데이터가 재부팅 전까지 안 들어온다.
//      refresh 스냅샷 대비 "추가된" 심볼이 있으면 호출측이 graceful 자기 재시작을
//      트리거해 구독을 재구성한다 (동적 재구독 없이 갭을 닫는 저비용 지렛대 —
//      [10-110] 풀 견고화로 재시작이 안전해졌기에 가능).
//      ★ 루프 가드 = 구조적: 판정은 1h refresh 틱에서만 발화하므로 최소 재시작
//      간격이 1h 로 보장된다 (별도 상태 불필요). 제거(상장폐지)는 재시작 사유가
//      아님 — allowlist swap 만으로 upsert 차단이 완성된다.
//   2. 빈 리스트 방어 (부분 실패 위생): loadAllSymbols 는 allSettled 부분 실패 시
//      해당 마켓을 빈 리스트로 반환한다. 이를 그대로 swap 하면 그 마켓 전 심볼이
//      1h 동안 allowlist 에서 사라져 — [10-117] fail-closed 전환 후에는 청산
//      insert 까지 — 전량 drop 된다. 기존 Set 이 비어있지 않은데 fresh 가 비면
//      부분 실패로 간주하고 swap 을 생략한다 (quote 맵도 함께 생략 — allowlist 와
//      같은 스냅샷 유지 의무, feedback_shared_pack... 계보의 lookup miss 방지).

/** 판정 대상 마켓 3종 (spot 포함 — chunked per-symbol 구독 대상과 일치). */
export const REFRESH_MARKETS = ["spot", "futures_usdm", "futures_coinm"] as const;
export type RefreshMarket = (typeof REFRESH_MARKETS)[number];

export type MarketSymbolLists = Record<RefreshMarket, readonly string[]>;
export type MarketSymbolSets = Record<RefreshMarket, ReadonlySet<string>>;

/**
 * 자기 재시작을 허용하는 "추가 심볼 수" 상한 (code-reviewer W1, 2026-07-22).
 *
 * 진짜 신규 상장은 한 번에 수 종 이내다. 수십~수백 종이 한꺼번에 "추가"로 보이는
 * 것은 상장이 아니라 **부팅 시 심볼 로드 부분 실패 후 회복** (스냅샷이 빈 마켓의
 * 전량 재등장) 또는 공급자/DB 이상 신호다. 이 경우 재시작하면 — 부팅 실패가
 * 지속되는 동안 — "부팅 실패 → 1h 후 회복 감지 → 재시작 → 또 부팅 실패" 의
 * **1h 주기 무한 재시작 루프**가 생기고, systemd StartLimit(5분 창)은 이런 저빈도
 * 루프를 못 잡는다. 상한 초과 시 재시작을 억제하고 allowlist swap 만으로 흡수한다
 * (구독 갭은 다음 정상 재시작에서 해소 — 관측 로그로 노출).
 */
export const SELF_RESTART_MAX_ADDED = 20;

export interface SymbolRefreshPlan {
  /** 스냅샷 대비 새로 나타난 심볼 — "market:symbol" 표기 (로그·재시작 판정용). */
  addedSymbols: string[];
  /** 부분 실패 의심(기존 비어있지 않은데 fresh 빈 리스트) — swap 생략 대상. */
  skippedEmptyMarkets: RefreshMarket[];
  /** swap 을 적용할 마켓 (skipped 제외 전부). */
  marketsToSwap: RefreshMarket[];
  /**
   * 자기 재시작 권고 — 추가가 1개 이상이고 SELF_RESTART_MAX_ADDED 이하일 때만.
   * 상한 초과(대량 추가)는 회복/이상 신호로 보고 억제 (위 상수 주석의 루프 방지).
   */
  selfRestartAdvised: boolean;
}

/**
 * refresh 스냅샷(fresh)을 기존 allowlist(prev)와 비교해 적용 계획을 산출한다.
 * 순수 함수 — swap 실행·로그·재시작은 호출측(index.ts) 소유.
 */
export function planSymbolRefresh(
  prev: MarketSymbolSets,
  fresh: MarketSymbolLists,
): SymbolRefreshPlan {
  const addedSymbols: string[] = [];
  const skippedEmptyMarkets: RefreshMarket[] = [];
  const marketsToSwap: RefreshMarket[] = [];

  for (const market of REFRESH_MARKETS) {
    const freshList = fresh[market];
    const prevSet = prev[market];

    if (freshList.length === 0 && prevSet.size > 0) {
      // 역할 2 — 빈 리스트는 부분 실패 신호로 보고 이 마켓 swap 생략.
      skippedEmptyMarkets.push(market);
      continue;
    }
    marketsToSwap.push(market);

    for (const sym of freshList) {
      if (!prevSet.has(sym)) addedSymbols.push(`${market}:${sym}`);
    }
  }

  return {
    addedSymbols,
    skippedEmptyMarkets,
    marketsToSwap,
    selfRestartAdvised:
      addedSymbols.length > 0 && addedSymbols.length <= SELF_RESTART_MAX_ADDED,
  };
}

/** 신규 상장 로그용 요약 (앞 5종 + 나머지 개수). */
export function formatAddedSymbols(addedSymbols: readonly string[]): string {
  const head = addedSymbols.slice(0, 5).join(", ");
  const rest = addedSymbols.length - 5;
  return rest > 0 ? `${head} 외 ${rest}종` : head;
}

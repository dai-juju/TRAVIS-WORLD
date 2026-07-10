// ============================================================
// lastSettledReflection — history_futures_funding 최신 정산값을
// now_futures_indicator.last_settled_* 로 반영하는 순수 헬퍼 (N1 hotfix, 2026-07-10).
//
// 배경 (사이클 2 Step 6 라이브 G2 도메인 결함 N1, 위생 #9 site=DB):
//   기존엔 apps/worker 의 premiumIndexTask(30분 폴링)가 premiumIndex.lastFundingRate 를
//   last_settled_funding_rate 로 채웠는데, 그 값은 realized(정산 확정값)가 아니라
//   predicted 와 같은 소스의 **스냅샷**(정산 사이 계속 변동)이었다. 실측(2026-07-10
//   BTCUSDT 00:00 UTC 정산): 공식 realized(/fapi/v1/fundingRate) = 0.00009058 vs
//   premiumIndex 스냅샷 = 0.00006198 → 카드가 틀린 "last settled" 표시(사이트=DB 위반).
//
// 해법 (Option D — Step 6 realized 파이프 재사용):
//   fundingHistoryTask 가 이미 공식 realized 를 history_futures_funding 에 적재 중이므로,
//   각 cycle 이 수집한 **심볼별 최신 (funding_time, funding_rate)** 을 골라
//   now_futures_indicator 로 partial upsert 한다. rate·time 을 **같은 정산 이벤트에서
//   한 쌍으로** 반영 (time 만 역산하면 정산 직후 mismatched pair 발생).
//
// 순수 함수로 분리한 이유: DB 무관 로직(최신 선별 + row 빌드)을 단위 테스트로 핀.
//   실제 upsert 배선/재시도는 fundingHistoryTask 가 담당.
// ============================================================

import type {
  HistoryFuturesFundingInsert,
  NowFuturesIndicatorInsert,
} from "@travis/data-service";
import type { MarketType } from "@travis/shared";

/** 심볼별 "이번 cycle 에서 본 가장 최신 정산" 누적값. */
export interface LatestFunding {
  /** funding_time(ISO)을 epoch ms 로 파싱한 값 — 최신 비교 기준. */
  fundingTimeMs: number;
  /** 그 정산의 realized funding rate (decimal). */
  fundingRate: number;
}

/**
 * 수집한 정산 row 들을 `latest` 맵에 누적 병합 (심볼별 최신 유지, in-place mutate).
 *
 * ★ 시각 비교는 **Date.parse 숫자값**으로만 (feedback_iso_lexical_vs_numeric_time_compare —
 *   "Z" vs "+00:00" 포맷 갈림에 사전식 비교는 무음 취약). 파싱 실패(NaN) row 는 skip.
 * ★ 페이지를 넘나들며 여러 번 호출해도 안전 — 각 호출이 더 최신만 갱신.
 */
export function mergeLatestFunding(
  latest: Map<string, LatestFunding>,
  rows: HistoryFuturesFundingInsert[],
): void {
  for (const row of rows) {
    const ms = Date.parse(row.funding_time);
    if (!Number.isFinite(ms)) continue; // 이상 시각 — 반영 대상 제외 (graceful)
    const prev = latest.get(row.symbol);
    if (prev === undefined || ms > prev.fundingTimeMs) {
      latest.set(row.symbol, { fundingTimeMs: ms, fundingRate: row.funding_rate });
    }
  }
}

/**
 * `latest` 맵 → now_futures_indicator partial upsert row 배열.
 *
 * 반환 row 는 전부 동일 key 집합(PK 3축 + last_settled 2컬럼) = **mixed-batch 불변 자연
 * 보장**(feedback_mixed_batch_invariant). marketType 은 단일 market task 의 값이라 균일.
 * last_settled_funding_time 은 now_futures_indicator 스키마상 epoch ms(number) 컬럼이므로
 * ISO 가 아닌 fundingTimeMs 를 그대로 싣는다 (history 는 timestamptz, now 는 bigint — 의도적).
 */
export function buildLastSettledIndicatorRows(
  marketType: MarketType,
  latest: Map<string, LatestFunding>,
): NowFuturesIndicatorInsert[] {
  const rows: NowFuturesIndicatorInsert[] = [];
  for (const [symbol, v] of latest) {
    rows.push({
      exchange: "binance",
      market_type: marketType,
      symbol,
      last_settled_funding_rate: v.fundingRate,
      last_settled_funding_time: v.fundingTimeMs,
    });
  }
  return rows;
}

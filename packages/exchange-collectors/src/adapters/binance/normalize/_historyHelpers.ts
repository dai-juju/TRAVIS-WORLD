// ============================================================
// history normalize 공통 helper (M1.9 Step 2-C, 2026-06-04 추출).
//
// 배경:
//   USDM(historyFutures.ts) 와 COINM(coinmHistoryFutures.ts) normalize 가
//   동일한 파싱/폐기 규약을 공유한다. M1.8.5 에서 USDM 만 있을 때는 private 로
//   두었으나, COINM 신설로 **삼중 복제(USDM/COINM/미래 OKX)** 위험이 생겨
//   본 파일로 추출. 기존 historyFutures.test.ts(USDM) 가 추출 후 회귀를 잡아준다.
//
// 포함:
//   - HistoryRow      : recorded_at 폐기 규약의 타입 강제 (optional → required 좁힘)
//   - num             : Binance "숫자 문자열" → number | null
//   - epochMsToIso    : epoch ms → ISO string (0/음수/누락 → null = row 폐기 신호)
//   - warnIfRatioOutOfRange : LSR 정상 범위(0.1~maxRatio) 밖 경고 (maxRatio 기본 10=USDM, COINM 상향)
//
// 자문 영구 기록:
//   .claude/agent-memory/crypto-domain-expert/project_m1_8_5_step3_history_consult.md
//   .claude/agent-memory/crypto-domain-expert/project_m1_9_step2c_coinm_history.md
// ============================================================

import type { HistoryFuturesIndicatorInsert } from "@travis/data-service";

/**
 * recorded_at 폐기 규약의 **타입 강제** (code-reviewer C1, 2026-05-31).
 *
 * generated Insert 타입의 recorded_at 은 optional(`recorded_at?: string`) 이라,
 * 폐기 가드를 빠뜨린 객체도 타입 검사를 통과해 DB DEFAULT now() 가 박힌 오염 row 가
 * 조용히 쌓일 수 있다. 반환 타입을 recorded_at 필수로 좁혀 **컴파일러가** 규약을 강제 —
 * USDM·COINM 양쪽 normalize 가 recorded_at 분기를 빠뜨리면 컴파일 에러.
 * (feedback_zod_string_not_defense 의 시계열 버전.)
 */
export type HistoryRow = HistoryFuturesIndicatorInsert & { recorded_at: string };

/** Binance "숫자 문자열" → number | null. 빈 문자열·NaN·null → null, 0 은 허용. */
export function num(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** epoch ms → ISO string. 0/음수/누락 → null (호출자가 row 폐기). */
export function epochMsToIso(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/**
 * LSR ratio 정상 범위(0.1~maxRatio) 밖이면 경고. 값 자체는 저장(워밍업/이상 거래 가능성만 알림).
 * 자문 §5: 머리수/포지션 비율이 크게 쏠리면 데이터 이상 의심.
 *
 * ★ maxRatio 파라미터화 ([8-34] 회수, 2026-06-07):
 *   상한 10 은 USDM 유동 심볼 기준. COINM 저유동 PERPETUAL(FILUSD/SUIUSD 등)은
 *   coin-margined 구조상 long 편향이 강해 LSR 이 실제 10~12 까지 정상 도달한다
 *   (2026-06-06 dapi 라이브 대조로 입증 — site=DB 6/6 소수점 일치). 상한 10 고정 시
 *   COINM 정상값이 false positive 경고를 대량 발생(27h 라이브에서 전체 로그의 ~40%).
 *   → 호출부(market_type)별로 상한 분리: USDM=10(기본 유지=회귀 0), COINM=COINM_MAX_LSR.
 *   하한 0.1 은 양쪽 공통(극단적 short 쏠림은 COINM 에서도 드묾).
 */
export function warnIfRatioOutOfRange(
  label: string,
  symbol: string,
  ratio: number | null,
  maxRatio = 10,
): void {
  if (ratio !== null && (ratio < 0.1 || ratio > maxRatio)) {
    console.warn(
      `[${label}] ${symbol} longShortRatio=${ratio} (정상 0.1~${maxRatio} 범위 밖) — 데이터 이상 의심`,
    );
  }
}

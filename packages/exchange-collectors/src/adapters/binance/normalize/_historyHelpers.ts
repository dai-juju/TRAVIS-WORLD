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
//   - warnIfRatioOutOfRange : LSR 정상 범위(0.1~10) 밖 경고
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
 * LSR ratio 정상 범위(0.1~10) 밖이면 경고. 값 자체는 저장(워밍업/이상 거래 가능성만 알림).
 * 자문 §5: 머리수/포지션 비율이 10배 이상 쏠리면 데이터 이상 의심.
 */
export function warnIfRatioOutOfRange(
  label: string,
  symbol: string,
  ratio: number | null,
): void {
  if (ratio !== null && (ratio < 0.1 || ratio > 10)) {
    console.warn(
      `[${label}] ${symbol} longShortRatio=${ratio} (정상 0.1~10 범위 밖) — 데이터 이상 의심`,
    );
  }
}

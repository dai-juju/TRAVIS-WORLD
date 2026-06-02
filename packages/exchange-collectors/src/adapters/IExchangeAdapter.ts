/**
 * 거래소 REST 수집의 최소 공용 타입 (M1.9 Step 1, 2026-06-02).
 *
 * 배경: apps/worker → packages/exchange-collectors 추출 시 client.ts /
 *   historyFetchers.ts 가 의존하는 FetchResult 만 동반 이동 (순환 회피용 최소 분리).
 *   IExchangeAdapter 인터페이스 본체(exchangeId/marketTypes)와 RawTicker/RawKline 은
 *   현재 시점(now) 어댑터 전용이라 apps/worker 에 잔류 — 본 패키지의 history 경로는
 *   FetchResult 만 필요.
 *
 * 핵심 원칙:
 * - graceful 에러 처리 (throw 대신 FetchResult.error 반환)
 */

// ─── 수집 결과 타입 ────────────────────────────────

/** 배치 수집의 개별 결과 (성공 또는 실패) */
export type FetchResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

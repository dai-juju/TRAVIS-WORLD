/**
 * 거래소 REST API 수집 어댑터 계약.
 *
 * 이 파일의 현재 역할 (M1.3 Step 3 기준):
 *   Step 3의 실제 구현은 BinanceSpotAdapter / BinanceUsdmAdapter /
 *   BinanceCoinmAdapter 각각이 "자기 마켓에 맞는 구체 메서드"를 노출하는
 *   방식이다. 이 인터페이스는 **FetchResult 공용 타입**과 "모든 어댑터가
 *   공통으로 가져야 할 메타 필드"만 느슨한 계약으로 유지한다.
 *
 *   더 엄격한 공통 메서드 계약은 Step 4(폴러 루프)에서 재설계 예정 —
 *   폴러가 어댑터들을 heterogeneous list로 다루기 시작할 때 명확해진다.
 *
 * 핵심 원칙:
 * - 배치 API 우선 (per-symbol 호출은 Binance가 그 엔드포인트만 per-symbol을 강제할 때만 예외)
 * - 마켓 타입 무관하게 동일 시그니처
 * - graceful 에러 처리 (throw 대신 FetchResult.error 반환)
 */

import type { MarketType } from "@travis/shared";

// ─── 수집 결과 타입 ────────────────────────────────

/** 배치 수집의 개별 결과 (성공 또는 실패) */
export type FetchResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** 원시 ticker 데이터 — adapter 내부에서만 사용, 외부엔 Insert 타입으로 노출. */
export interface RawTicker {
  symbol: string;
  [key: string]: unknown;
}

/** 원시 kline 데이터 — Step 4에서 폴링 도입 시 구체화. */
export interface RawKline {
  symbol: string;
  [key: string]: unknown;
}

// ─── 어댑터 인터페이스 (느슨한 계약) ───────────────

export interface IExchangeAdapter {
  /** 어댑터가 담당하는 거래소 ID (레지스트리 id와 동일) */
  readonly exchangeId: string;

  /**
   * 어댑터가 지원하는 마켓 타입.
   * 주의: Binance는 마켓별로 별도 클래스로 분리되어 이 필드가 단일값 느낌이지만,
   * "한 클래스가 여러 마켓"을 지원할 수 있어야 하므로 배열 유지.
   */
  readonly marketTypes: readonly MarketType[];
}

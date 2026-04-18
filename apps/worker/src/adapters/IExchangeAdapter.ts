/**
 * 거래소 REST API 수집 어댑터 계약.
 *
 * M1.3에서 BinanceAdapter가 이 인터페이스를 구현한다.
 * 확장 루프에서 OKX, Bybit, Bitget 어댑�� 추가 시에도
 * 이 계약을 그대로 따른다.
 *
 * 핵심 원칙:
 * - 배치 API 필수 (per-symbol 루프 금지)
 * - 마켓 타입 무관하게 동일 시그니처
 * - graceful 에러 ��리 (throw 대신 에러 결과 반환)
 */

import type { MarketType } from "@travis/shared";

// ─── 수집 결과 타입 ────────────────────────────────

/** 배치 수집의 개별 결과 (성공 또는 실패) */
export type FetchResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** 원시 ticker 데이터 — 구체 필드는 M1.3에서 확정 */
export interface RawTicker {
  symbol: string;
  [key: string]: unknown;
}

/** 원시 kline 데이터 — 구체 필드는 M1.3에서 확정 */
export interface RawKline {
  symbol: string;
  [key: string]: unknown;
}

// ─── 어댑�� 인터페이스 ─────────────────────────────

export interface IExchangeAdapter {
  /** 어댑터가 담당하는 거래소 ID (레지스트리 id와 동일) */
  readonly exchangeId: string;

  /** 어댑터가 지원하는 마켓 타입 */
  readonly marketTypes: readonly MarketType[];

  /**
   * 전체 심볼의 ticker를 배치로 가져온다.
   * per-symbol 호출 금지 — 반드시 1회 API 호출로 전체 반환.
   */
  fetchTickers(marketType: MarketType): Promise<FetchResult<RawTicker[]>>;

  /**
   * 특정 심볼의 kline(봉 데이터)을 가져온다.
   * 심볼 수가 제한적일 때만 호출 (대량 kline은 별도 배치 전략).
   */
  fetchKlines(
    symbol: string,
    marketType: MarketType,
    interval: string,
    limit: number,
  ): Promise<FetchResult<RawKline[]>>;

  /**
   * 거래소의 심볼 메타데이터를 가져온다 (상장/폐지 상태 포함).
   * M1.3에서 exchange_symbols 테이블에 저장.
   */
  fetchSymbolMetadata(
    marketType: MarketType,
  ): Promise<FetchResult<unknown[]>>;
}

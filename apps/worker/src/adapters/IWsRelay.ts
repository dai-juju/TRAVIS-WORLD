/**
 * WebSocket ��레이 서버 계약.
 *
 * 거래소의 실시간 WS 데이터를 받아서
 * 정규화된 포맷으로 프론트엔드에 릴레이한다 (경로 A).
 *
 * M1.3에서 Binance WS 릴레이를 구현할 때 이 계약을 따른다.
 * 각 ���래소별 WS 연결 수 = 마켓타입별 1개 (spot + futures = 2개).
 */

import type { MarketType } from "@travis/shared";

// ─── 정규��된 tick 메��지 ──────────────────────────

/** 프론트엔드로 전달되는 정규화된 실시간 메시지 */
export interface NormalizedTick {
  /** 거래소 ID */
  exchange: string;

  /** 마켓 타입 */
  marketType: MarketType;

  /** 심볼 (예: "BTCUSDT") */
  symbol: string;

  /** 마지막 체결가 */
  price: number;

  /** 체결량 */
  quantity: number;

  /** 거래소 서버 타임스탬프 (ms) */
  timestamp: number;
}

// ─── 연결 상태 ──────────────────────────────────────

export type WsConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

// ─── 릴레이 인터페이스 ──────────────────────────────

export interface IWsRelay {
  /** 릴레이가 담당하는 거래소 ID */
  readonly exchangeId: string;

  /** 현재 연결 상태 */
  readonly state: WsConnectionState;

  /**
   * 거래소 WS에 연결하고 릴레이를 시작한다.
   * 연결 실패 시 자동 재연결 로직 포함.
   */
  connect(marketType: MarketType): Promise<void>;

  /**
   * 연결을 종료한다.
   * graceful shutdown — 진행 중인 메시지 처리 후 종료.
   */
  disconnect(): Promise<void>;

  /**
   * 새 tick 메시지를 수신할 콜백 등록.
   * 여러 콜백 등록 가능 (프론트 릴레이 + 로깅 등).
   */
  onTick(callback: (tick: NormalizedTick) => void): void;

  /**
   * 연결 상태 변경 시 콜백.
   * 재연결 실패 알림 등에 사용.
   */
  onStateChange(callback: (state: WsConnectionState) => void): void;
}

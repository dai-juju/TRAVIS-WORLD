/**
 * 주기적 폴링 스케줄러 계약.
 *
 * tier 기반으로 폴링 주기를 관리한다:
 * - high: 변동성 높은 데이터 (구체 초 수는 M1.3에서 결정)
 * - mid: 중간 빈도 데이터
 * - low: 느린 갱신 데이터
 *
 * 핵심 원칙:
 * - per-symbol 폴링 금지 — 배치 API로 전체 심볼 한 번에 수집
 * - tier별로 다른 주기 적용
 * - graceful 시작/종료
 */

import type { RefreshTier } from "@travis/shared";

// ─── 폴링 작업 정의 ────────────────────────────────

/** 폴링 작업 1건의 정의 */
export interface PollTask {
  /** 작업 고유 ID (예: "binance-ticker-spot") */
  id: string;

  /**
   * 폴링 주기 티어 (의미론적 분류 — 로깅/모니터링/registry 매칭용).
   * 실제 주기는 intervalMs가 결정.
   */
  tier: RefreshTier;

  /**
   * 실제 폴링 주기(ms).
   * 같은 tier 안에서도 task별로 다른 값을 가질 수 있다
   * (예: ticker는 3000ms, premium은 30000ms 모두 tier="high" 가능).
   */
  intervalMs: number;

  /** 실행할 수집 함수 — 배치 API 호출 + DB 저장. throw 금지 (Poller가 내부에서 catch하지만 불필요한 에러는 피할 것). */
  execute: () => Promise<void>;
}

// ─── 폴링 상태 ──────────────────────────────────────

export interface PollStatus {
  /** 작업 ID */
  taskId: string;

  /** 작업의 tier (registry/모니터링용). */
  tier: RefreshTier;

  /** 작업의 폴링 주기(ms). */
  intervalMs: number;

  /** 마지막 실행 시작 시각 (ISO 8601) */
  lastRunAt: string | null;

  /** 마지막 실행 성공 여부 */
  lastSuccess: boolean;

  /** 마지막 실패 시 에러 메시지 (디버깅용, graceful fallback). */
  lastError: string | null;

  /** 연속 실패 횟수 */
  consecutiveFailures: number;

  /** 다음 실행 예정 시각 (ISO 8601, null이면 미예약/중지 상태). */
  nextRunAt: string | null;
}

// ─── 폴러 인터페이스 ────────────────────────────────

export interface IPoller {
  /**
   * 폴링 작업을 등록한다.
   * 같은 id의 작업을 재등록하면 기존 작업을 교체.
   */
  register(task: PollTask): void;

  /**
   * 등록된 모든 작업의 폴링을 시작한다.
   * 각 작업은 자신의 tier에 맞는 주기로 실행.
   */
  start(): void;

  /**
   * 모든 폴링을 중지한다.
   * 진행 중인 작업이 끝날 때까지 대기 후 종료.
   */
  stop(): Promise<void>;

  /**
   * 등록된 모든 작업의 현재 상태를 반환한다.
   * 모니터링/로깅용.
   */
  getStatus(): PollStatus[];
}

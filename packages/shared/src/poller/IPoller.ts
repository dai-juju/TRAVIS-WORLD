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
 *
 * M1.9 Step 1 (2026-06-02): apps/worker → @travis/shared 로 이동.
 *   사유: forward-fill 별도 worker(apps/collector-history) 와 production worker
 *   가 동일 폴링 인프라를 공유해야 함 (배포 단위 2개 공통 의존). PollTask/IPoller 는
 *   거래소 무관 범용 계약이라 shared 에 위치하는 것이 자연스러움.
 */

import type { RefreshTier } from "../registries/index";

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

  /**
   * 최초 1회 실행 전 지연(ms, 옵션, 기본 0 = 기존 동작).
   *
   * ★ M1.9 Step 3 즉효 fix (2026-06-04): start() 시 모든 task 가 0ms 동시 발화하면
   *   부팅 catch-up 첫 윈도우에 외부 API 요청 피크가 합산돼 Binance IP/weight 한도를
   *   순간 초과(-1003)할 수 있다. task 별로 0/30/60s... 분산을 주면 첫 5분 동시성 피크가
   *   사라진다. 두 번째 tick 부터는 intervalMs(execute 완료 후 휴식)로만 결정되므로
   *   이 지연은 **최초 1회에만** 적용된다.
   *   ⚠️ 이건 피크 분산일 뿐 — 프로세스 전역 shared rate limiter(근본 fix)는 `[8-31]`.
   *   미지정 시 0 → 기존 worker task 동작 불변(회귀 0).
   */
  initialDelayMs?: number;
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

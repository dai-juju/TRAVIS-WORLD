/**
 * autoSaveController — 활성 뷰 자동 저장의 "엔진" (M2 테마 C Saved Views v2 Sub-step 3).
 *
 * ★ 프레임워크 비의존(순수): React/fetch/Zustand 를 모른다. 의존성은 전부 주입받아
 *   `vi.useFakeTimers()` 만으로 단위 테스트 가능 (serialize.ts 가 순수 분리된 것과 동일 패턴).
 *   React 배선은 useAutoSaveActiveView.ts 가, 저장 상태 보고는 activeViewStore 가 담당.
 *
 * 핵심 책임:
 *   1) debounce — 변경이 멈춘 뒤 debounceMs 후 1회만 저장 (드래그 N프레임 → PATCH 1).
 *   2) 해시 멱등 — 마지막 저장 스냅샷과 동일하면 PATCH 자체를 건너뜀 (무변화 = PATCH 0).
 *   3) seeding — 뷰 진입 직후 현재 캔버스 해시를 "저장됨"으로 심어, 로드가 일으킨
 *      첫 변경 발화를 멱등 처리 (무한 저장 루프/중복 저장 차단).
 *   4) 조용한 재시도 — 네트워크 실패 시 maxRetries 회 조용히 재시도, 소진 시 error 상태.
 *      ★ 불변식(crypto-trader): 저장이 실제로 실패하는 동안엔 절대 'saved' 상태를 내지 않는다.
 *   5) flush — 탭 전환/페이지 종료/언마운트 시 대기 중 변경을 즉시 저장(안전망).
 *
 * 무한 루프 가드:
 *   저장 성공 보고(onSaveState 'saved')는 activeViewStore 만 건드리고 캔버스는 손대지 않는다
 *   → canvasStore 구독 재발화 없음. + 해시 멱등이 이중 방어.
 */
import type { SavedViewSnapshot } from "@/lib/savedView/schema";
import type { SaveState } from "@/lib/stores/activeViewStore";

/** 자동 저장 debounce 기본값 — 사용자 결정 1.5s (crypto-trader: flush 안전망 전제에서 안전). */
export const AUTO_SAVE_DEBOUNCE_MS = 1500;
/** 네트워크 실패 시 조용한 재시도 횟수 (총 시도 = 1 + maxRetries). */
const DEFAULT_MAX_RETRIES = 2;
/** 재시도 간 대기(ms). */
const DEFAULT_RETRY_DELAY_MS = 800;

/** flush 의 발화 원인 — 디버깅/메트릭. */
export type FlushReason = "debounce" | "visibility" | "pagehide" | "unmount";

export interface AutoSaveControllerDeps {
  /** 현재 활성 뷰 id (null=scratch, 자동 저장 안 함). 매 호출 시 최신값 조회. */
  getActiveViewId: () => string | null;
  /** 현재 캔버스 스냅샷 (저장 페이로드 + 해시 계산 대상). */
  getSnapshot: () => SavedViewSnapshot;
  /**
   * 저장 수행. 성공 시 서버 updated_at(epoch ms, 없으면 null) 반환, 실패 시 throw.
   * @param opts.keepalive 페이지 종료 중 전송 보장이 필요한 flush 경로에서만 true.
   *   (keepalive 본문은 브라우저 64KB 상한 — 평상시 debounce 저장엔 끄고 큰 스냅샷 보호.)
   */
  patch: (
    id: string,
    snapshot: SavedViewSnapshot,
    opts: { keepalive: boolean },
  ) => Promise<number | null>;
  /** 캔버스 변경 감지 즉시 — 미저장 표시(dirty). */
  onDirty: () => void;
  /** 저장 생명주기 상태 보고. 'saved' 일 때만 serverTs 동반. */
  onSaveState: (state: SaveState, serverTs?: number) => void;
  /** debounce(ms). 기본 AUTO_SAVE_DEBOUNCE_MS. */
  debounceMs?: number;
  /** 재시도 횟수/대기 (테스트 주입). */
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * 스냅샷 → 안정 해시. JSON.stringify 로 충분(serializeCanvas 가 고정 순서로 객체를 조립하고,
 *   한 세션 내 같은 노드 참조는 같은 직렬화를 낸다). 키 정렬까지 하는 stable-stringify 는
 *   현 시점 over-engineering — 세션 간 키 순서 차이는 로드 후 첫 변경에서 자연 수렴(무해).
 */
export function snapshotHash(snapshot: SavedViewSnapshot): string {
  return JSON.stringify(snapshot);
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class AutoSaveController {
  private readonly deps: AutoSaveControllerDeps;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 마지막으로 성공 저장(또는 seed)된 스냅샷 해시. null = 아직 기준 없음. */
  private lastSavedHash: string | null = null;
  /**
   * 현재 dirty-기간에 onDirty 를 이미 보고했는가 — 드래그 매 프레임 store write 방지
   *   (nextjs-frontend 🔴#1). 저장 성공/seed 시 false 로 리셋, 다음 변경에 1회만 보고.
   */
  private dirtyNotified = false;
  /** PATCH 진행 중 여부 — 중첩 저장 방지. */
  private inFlight = false;
  /** in-flight 중 새 변경이 들어와 flush 가 막혔는가 — 완료 후 재무장. */
  private pendingAfterFlight = false;
  private disposed = false;

  constructor(deps: AutoSaveControllerDeps) {
    this.deps = deps;
  }

  /** 캔버스 변경 발생 시 호출 — 활성 뷰가 있을 때만 미저장 표시 + debounce 재무장. */
  notifyChange(): void {
    if (this.disposed) return;
    if (this.deps.getActiveViewId() === null) return; // scratch — 자동 저장 안 함.
    // dirty 보고는 dirty-기간당 1회만 — 드래그 매 프레임 중복 store write 방지(저사양).
    if (!this.dirtyNotified) {
      this.deps.onDirty();
      this.dirtyNotified = true;
    }
    this.arm();
  }

  /**
   * 활성 뷰 전환(로드/저장 직후) — 현재 캔버스를 "저장된 기준"으로 심는다.
   *   로드가 일으킨 캔버스 변경의 첫 flush 를 멱등 처리(중복 저장/루프 차단).
   */
  seed(): void {
    if (this.disposed) return;
    this.clearTimer();
    this.dirtyNotified = false; // 새 뷰 진입 = 동기화 기준 재설정.
    if (this.deps.getActiveViewId() === null) {
      this.lastSavedHash = null;
      return;
    }
    // ★ seed 는 setActive 와 짝 호출 전제 — saveState(idle) 리셋은 setActive 가 담당
    //   (activeViewStore.setActive). 단독 seed 경로가 생기면 error 상태가 샐 수 있어
    //   Sub-step 4 복원 배선 시 재확인 (code-reviewer W3).
    this.lastSavedHash = snapshotHash(this.deps.getSnapshot());
  }

  /** 즉시 저장 시도 — debounce 만료 또는 flush 안전망이 호출. reason 은 실패 로그 맥락용. */
  async flush(reason: FlushReason = "debounce"): Promise<void> {
    this.clearTimer();
    if (this.disposed) return;
    const id = this.deps.getActiveViewId();
    if (id === null) return; // scratch.

    // 진행 중이면 완료 후 재무장하도록 표시만 하고 빠진다(중첩 PATCH 방지).
    if (this.inFlight) {
      this.pendingAfterFlight = true;
      return;
    }

    const snapshot = this.deps.getSnapshot();
    const hash = snapshotHash(snapshot);
    if (hash === this.lastSavedHash) {
      // 무변화(또는 변경→되돌림) — PATCH 0. 이미 동기화 상태.
      this.dirtyNotified = false;
      this.deps.onSaveState("idle");
      return;
    }

    // debounce 저장은 keepalive 끔(64KB 상한 회피) — 종료 flush 만 keepalive 보장.
    const keepalive = reason !== "debounce";

    this.inFlight = true;
    this.deps.onSaveState("saving");

    const maxRetries = this.deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = this.deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    let attempt = 0;
    for (;;) {
      try {
        const serverTs = await this.deps.patch(id, snapshot, { keepalive });
        this.lastSavedHash = hash;
        this.dirtyNotified = false;
        // dispose 후엔 store 쓰기 금지 — 네트워크 PATCH 는 이미 보냈으니 데이터는 보존,
        //   죽은/교체된 컨트롤러가 공유 store 를 오염시키는 것만 차단(nextjs 🔴#2).
        if (!this.disposed) this.deps.onSaveState("saved", serverTs ?? undefined);
        break;
      } catch (err) {
        attempt += 1;
        if (attempt > maxRetries) {
          // ★ 재시도 소진 — error 잔류(절대 saved 아님). 다음 변경/flush 가 다시 시도.
          if (!this.disposed) this.deps.onSaveState("error");
          console.error(`[autoSave] 저장 실패(재시도 소진, reason=${reason}):`, err);
          break;
        }
        await delay(retryDelayMs); // 조용한 재시도.
        if (this.disposed) break; // dispose 중이면 중단.
      }
    }

    this.inFlight = false;
    // in-flight 중 새 변경이 막혀 있었다면 다시 debounce 무장(최신 상태 저장).
    if (this.pendingAfterFlight) {
      this.pendingAfterFlight = false;
      if (!this.disposed && this.deps.getActiveViewId() !== null) this.arm();
    }
  }

  /** 정리 — listener/컨트롤러 폐기 시. 대기 타이머 제거. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private arm(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush("debounce");
    }, this.deps.debounceMs ?? AUTO_SAVE_DEBOUNCE_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

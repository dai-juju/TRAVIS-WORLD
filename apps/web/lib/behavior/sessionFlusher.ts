// apps/web/lib/behavior/sessionFlusher.ts
//
// 카드 행동 집계 + 4중 flush 가드 (M1.6 Step 3 Substep 3d, 2026-04-26).
//
// ─── 비전공자용 설명 ──────────────────────────────
// 트레이더가 카드 1장을 30분 동안 10번 드래그 + 5번 리사이즈 했다고 하자.
// 1 event = 1 row 정책이면 15 row INSERT (베타 10명 누적 시 월 337,000 row 폭증).
// sessionFlusher 는 이 15 events 를 클라이언트 메모리 Counter 1개로 누적했다가
// 4가지 trigger 시점 (5분 idle / 탭 전환 / 브라우저 종료 / 카드 unmount) 중 하나
// 가 오면 1 row 로 압축 INSERT — 15배 비용 절감.
//
// ─── 사용자 결정 (2026-04-26 옵션 B-improved) ──────
// "주로 보는 카드는 안 지운다 (옵션 C 의 unmount 의존 단점)" + "PRD §156 My Views
// 도입 후 카드 unmount 거의 없음" 두 가지 도메인 사실 → 4중 flush 가드 + idle skip.
//
// ─── 4중 flush 가드 ───────────────────────────────
// 1) **5분 idle timer** — 마지막 drag/resize 이벤트 후 5분 경과 시 flush.
//    활성 세션이면 5분마다 1 flush 보장.
// 2) **visibilitychange (hidden)** — 탭 전환 / 모바일 백그라운드 / 화면 off 시 즉시.
//    데스크톱 + 모바일 표준 (MDN 2026-04-26 조회).
// 3) **pagehide + navigator.sendBeacon** — 브라우저 종료 직전 비동기 보장.
//    sendBeacon API 가 페이지 언로드 중에도 데이터 전송 큐 보장 (MDN 2026-04-26).
// 4) **카드 unmount** — useEffect cleanup. PRD §156 My Views 도입 후 발화 빈도 낮음
//    (보너스 trigger).
//
// ─── idle skip ────────────────────────────────────
// flush 시 dragCount + resizeCount === 0 인 카드는 INSERT 건너뜀.
// "보기만 하고 안 만지는 카드" 는 row 0 — 사용자 우려의 정공법 답.
//
// ─── 비용 시뮬레이션 ──────────────────────────────
// 베타 10명 × 30일 × 활성 카드 5장 × 1세션 평균 6 flush ≈ 22,500 row/월 (~22 MB).
// debounce 만 (337,500 row) 대비 15 배 절감.
//
// ─── 공식 문서 근거 ───────────────────────────────
// - https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon (2026-04-26 조회)
//   · Blob `application/json` 권장
//   · 64 KiB 상한 (우리 50 events × ~1KB << 한도)
//   · 동일 origin POST 는 preflight 없음
// - https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API (2026-04-26 조회)
//   · visibilitychange 는 탭 전환 / 최소화 / 모바일 백그라운드 모두 발화
// - sendBeacon + visibilitychange 조합이 산업 표준 (Google Analytics / Mixpanel / PostHog)

"use client";

/** flush 의 발화 원인 — 디버깅 / 메트릭. */
export type FlushReason = "idle" | "visibility" | "pagehide" | "unmount";

/** 카드별 클라이언트 메모리 카운터. */
interface CardCounter {
  cardId: string;
  componentId: string;
  datasource: string;
  /** 마지막 drag 종료 좌표. flush 시 final_x/final_y 로 INSERT. */
  finalX: number | null;
  finalY: number | null;
  /** 마지막 resize 종료 크기. */
  finalW: number | null;
  finalH: number | null;
  dragCount: number;
  resizeCount: number;
  sessionStartedAt: number; // ms
  lastActiveAt: number; // ms
}

/** sendBeacon endpoint — middleware 보호 대상 (Substep 3d 확장). */
const ENDPOINT = "/api/log-behavior";

/** idle flush 임계값 — 마지막 활동 후 N ms 경과 시 flush. */
const IDLE_FLUSH_MS = 5 * 60 * 1000;

/** idle 검사 주기 (모든 카드 일괄 검사). */
const IDLE_TICK_MS = 30 * 1000;

/** 한 batch 의 최대 events (route.ts Zod max 와 동기). */
const MAX_EVENTS_PER_BATCH = 50;

/**
 * 카드 행동 집계 + flush 매니저. 모듈 단위 singleton.
 *
 * lifecycle:
 *   - 모듈 로드 시 글로벌 listener (visibilitychange / pagehide) 자동 등록 (브라우저 환경)
 *   - 카드별 등록/해제는 useCardSessionTracker hook 또는 직접 호출
 *   - flush 시 sendBeacon 우선, 실패 시 fetch keepalive fallback
 */
class SessionFlusher {
  private counters = new Map<string, CardCounter>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private listenersInstalled = false;

  // code-reviewer W1 + security-auditor W-2 fix (2026-04-26):
  //   addEventListener 익명 함수 → named field 로 보관해 removeEventListener 가능.
  //   테스트 격리 시 listener 누적 방지 + Next.js HMR fast refresh 안전.
  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.flushAll("visibility");
    }
  };
  private readonly handlePageHide = (): void => {
    this.flushAll("pagehide");
  };

  /**
   * 카드 mount 시 호출. 같은 cardId 재호출 시 기존 카운터 유지 (Strict Mode 안전).
   */
  trackCardMount(meta: {
    cardId: string;
    componentId: string;
    datasource: string;
  }): void {
    if (typeof window === "undefined") return;
    this.ensureListeners();
    const existing = this.counters.get(meta.cardId);
    if (existing) return; // Strict Mode double-invoke / re-mount 방어.
    const now = Date.now();
    this.counters.set(meta.cardId, {
      cardId: meta.cardId,
      componentId: meta.componentId,
      datasource: meta.datasource,
      finalX: null,
      finalY: null,
      finalW: null,
      finalH: null,
      dragCount: 0,
      resizeCount: 0,
      sessionStartedAt: now,
      lastActiveAt: now,
    });
  }

  /** 드래그 종료 (onNodeDragStop) 시 호출. */
  recordDrag(cardId: string, finalX: number, finalY: number): void {
    const c = this.counters.get(cardId);
    if (!c) return;
    c.dragCount += 1;
    c.finalX = finalX;
    c.finalY = finalY;
    c.lastActiveAt = Date.now();
  }

  /** 리사이즈 종료 (NodeChange dimensions) 시 호출. */
  recordResize(cardId: string, finalW: number, finalH: number): void {
    const c = this.counters.get(cardId);
    if (!c) return;
    c.resizeCount += 1;
    c.finalW = finalW;
    c.finalH = finalH;
    c.lastActiveAt = Date.now();
  }

  /**
   * 카드 unmount 시 호출. 1 카드만 즉시 flush (idle skip 적용) + 카운터 제거.
   * PRD §156 My Views 도입 전엔 흔치 않은 경로 (보너스 trigger).
   */
  trackCardUnmount(cardId: string): void {
    const c = this.counters.get(cardId);
    if (!c) return;
    if (c.dragCount > 0 || c.resizeCount > 0) {
      void this.sendEvents([buildLayoutEvent(c, "unmount")]);
    }
    this.counters.delete(cardId);
  }

  /**
   * 모든 카드 일괄 flush (idle skip 적용).
   * visibilitychange / pagehide / idle timer 가 호출.
   * 카운터는 flush 후 리셋 (다음 windows 부터 새 세션).
   */
  flushAll(reason: FlushReason): void {
    const events: ReturnType<typeof buildLayoutEvent>[] = [];
    for (const c of this.counters.values()) {
      if (c.dragCount === 0 && c.resizeCount === 0) continue; // idle skip
      events.push(buildLayoutEvent(c, reason));
      // 카운터 리셋 (카드 자체는 살아있음 — 다음 flush windows 시작).
      const now = Date.now();
      c.dragCount = 0;
      c.resizeCount = 0;
      c.sessionStartedAt = now;
      c.lastActiveAt = now;
    }
    if (events.length === 0) return;
    void this.sendEvents(events, reason === "pagehide");
  }

  /**
   * 이벤트 batch 전송. pagehide 시점에는 sendBeacon 우선 (페이지 종료 보장).
   * 그 외는 fetch keepalive (sendBeacon 미지원 환경 fallback 도 동일 경로).
   */
  private async sendEvents(
    events: ReturnType<typeof buildLayoutEvent>[],
    preferBeacon = false,
  ): Promise<void> {
    // route.ts max 50 — 분할 전송.
    const batches: typeof events[] = [];
    for (let i = 0; i < events.length; i += MAX_EVENTS_PER_BATCH) {
      batches.push(events.slice(i, i + MAX_EVENTS_PER_BATCH));
    }
    for (const batch of batches) {
      const body = JSON.stringify({ events: batch });
      // sendBeacon 시도 — 페이지 종료 직전에도 비동기 보장 (MDN 2026-04-26).
      if (preferBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const ok = navigator.sendBeacon(ENDPOINT, blob);
        if (ok) continue;
        // false 반환 시 fetch keepalive fallback (MDN 권장 패턴).
      }
      try {
        await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true, // 페이지 unload 중에도 전송 보장 (sendBeacon 대체).
          credentials: "include", // cookie 전송 → middleware 인증.
        });
      } catch (err) {
        // 절대 throw 금지 — 행동 로그 실패가 사용자 UX 깨면 안 됨.
        console.error("[sessionFlusher] sendEvents 실패:", err);
      }
    }
  }

  /**
   * 4중 flush trigger 중 (1) idle timer + (2) visibilitychange + (3) pagehide
   * 글로벌 listener 등록. 모듈 로드 시점이 아닌 첫 trackCardMount 호출 시 lazy 설치.
   * (4) unmount 는 useCardSessionTracker hook 의 cleanup 에서 trackCardUnmount.
   */
  private ensureListeners(): void {
    if (this.listenersInstalled) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    this.listenersInstalled = true;

    // (1) 5분 idle timer — 30 초마다 검사, 마지막 활동 후 5분 경과 카드 flush.
    this.idleTimer = setInterval(() => {
      const cutoff = Date.now() - IDLE_FLUSH_MS;
      const events: ReturnType<typeof buildLayoutEvent>[] = [];
      for (const c of this.counters.values()) {
        if (c.dragCount === 0 && c.resizeCount === 0) continue;
        if (c.lastActiveAt > cutoff) continue;
        events.push(buildLayoutEvent(c, "idle"));
        const now = Date.now();
        c.dragCount = 0;
        c.resizeCount = 0;
        c.sessionStartedAt = now;
        c.lastActiveAt = now;
      }
      if (events.length > 0) void this.sendEvents(events);
    }, IDLE_TICK_MS);

    // (2) visibilitychange — 탭 전환 / 백그라운드.
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // (3) pagehide — 브라우저 종료 직전. sendBeacon 사용.
    window.addEventListener("pagehide", this.handlePageHide);
  }

  /**
   * 테스트 격리용 — production 호출 금지.
   * code-reviewer W1 fix (2026-04-26): named field listener 를 명시적으로 detach.
   */
  __resetForTesting(): void {
    this.counters.clear();
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.listenersInstalled) {
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          this.handleVisibilityChange,
        );
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", this.handlePageHide);
      }
    }
    this.listenersInstalled = false;
  }

  /** 디버깅 — 현재 트래킹 중인 카드 수. */
  __debugCardCount(): number {
    return this.counters.size;
  }
}

/**
 * 카드 1개의 카운터를 1 batch event 객체로 직렬화.
 * `card_layout_summary` event_type 은 Step 3d 신설 4종 중 하나.
 */
function buildLayoutEvent(c: CardCounter, reason: FlushReason) {
  return {
    event_type: "card_layout_summary",
    payload: {
      card_id: c.cardId,
      component_id: c.componentId,
      datasource: c.datasource,
      drag_count: c.dragCount,
      resize_count: c.resizeCount,
      final_x: c.finalX,
      final_y: c.finalY,
      final_w: c.finalW,
      final_h: c.finalH,
      session_started_at: c.sessionStartedAt,
      session_ms: Date.now() - c.sessionStartedAt,
      flush_reason: reason,
    },
  };
}

/** 모듈 단위 singleton — 앱 전체 1 인스턴스. */
export const sessionFlusher = new SessionFlusher();

/**
 * 즉시 전송 helper — chat_submit / card_added / card_deleted 등 희귀 + 고가치 이벤트.
 *
 * sessionFlusher 의 카드별 카운터 누적 경로와 분리:
 *   - card_layout_summary 는 빈번 → 4중 가드 + idle skip 로 압축
 *   - 본 helper 는 즉시 1 row INSERT (debounce 없음, idle skip 없음)
 *
 * 절대 throw 하지 않음. 네트워크 실패 / 미인증 401 모두 console.error 만 기록.
 * fire-and-forget 호출 가능 (await 생략 시 UX 레이턴시에서 INSERT 왕복 제외).
 *
 * @example
 * sendBehaviorEvent("chat_submit", { query_length: 42 });
 * sendBehaviorEvent("card_added", { card_id, component_id, datasource });
 */
export async function sendBehaviorEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  const body = JSON.stringify({
    events: [{ event_type: eventType, payload }],
  });
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include", // cookie 자동 전송 → middleware 인증 통과.
      keepalive: true, // 페이지 unload 중에도 가능.
    });
  } catch (err) {
    console.error(`[sendBehaviorEvent:${eventType}] 실패:`, err);
  }
}

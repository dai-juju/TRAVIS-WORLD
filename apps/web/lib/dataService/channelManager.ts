// apps/web/lib/dataService/channelManager.ts
//
// Supabase Realtime channel manager (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// ─── 역할 ─────────────────────────────────────────
// datasource 별 단일 Supabase channel 을 운영하고, 카드 수(N) 에 무관하게
// .on('postgres_changes', ...) 호출을 평생 1회만 발생시킨다.
// 카드 listener 는 manager 의 dispatch table 에 등록 / 해제만 하며,
// payload 도착 시 manager 가 fan-out 한다 (try/catch 격리).
//
// ─── 해결한 문제 (M1.4 잠복 [3-33]) ────────────────
// 기존 useRealtimeRow / useRealtimeTable 은 카드마다 supabase.channel(name) 호출 →
// 동일 datasource 카드 2개 mount 시 동일 channel name 충돌:
// "cannot add 'postgres_changes' callbacks for realtime:table:now_spot_ticker after 'subscribe()'."
//
// ─── 옵션 Z 채택 근거 (backend-infra-specialist 자문 2026-04-26) ─
// teardown + rebuild 방식 (옵션 X / Y) 은
//   (a) 재 subscribe ack 왕복 ms 지연 동안 payload drop
//   (b) Strict Mode double-invoke / 카드 swap 시 race window 확장
//   (c) Supabase Realtime channel join quota 카운트 낭비
// 옵션 Z 는 channel 자체를 손대지 않고 manager 자체 dispatch table 만 갱신 →
// 위 3가지 모두 회피. .on() 은 평생 1회만 호출.
//
// ─── 1초 grace period ─────────────────────────────
// React 18 Strict Mode 의 mount→unmount→mount double-invoke + React Flow node
// 재마운트 + 카드 swap 시 즉시 teardown 하면 다음 mount 가 새 channel 을 만들어
// 원치 않는 channel join/leave quota 소모. 마지막 listener 제거 시 1초 대기 후 cleanup.
//
// ─── client-side filter ──────────────────────────
// row hook (useDataServiceRow) 의 match 함수는 hooks.ts 가 dispatch 시 적용.
// server-side filter (예: symbol=eq.BTCUSDT) 는 사용 안 함 — datasource 별 channel
// 1개로 통합 (channel 수 폭증 방지). now_* 테이블은 어차피 1,400+ symbol 전체
// 스트림이라 server-side filter 효익 미미 (BW 절감 거의 없음, channel 수만 폭증).
//
// ─── 공식 문서 근거 ───────────────────────────────
// - https://supabase.com/docs/guides/realtime/postgres-changes (2026-04-26 조회)
//   · 동일 channel 인스턴스에 .on() multiple callback 등록 OK
//   · channel.subscribe() 호출 후 .on() 추가 불가 → manager 가 .on() 1회만 호출
// - https://supabase.com/docs/reference/javascript/removechannel (2026-04-26 조회)
//   · client.removeChannel() 권장 cleanup API (channels 배열에서도 제거)
//
// ─── 데이터 경로 #B 준수 (PRD §2) ─────────────────
// Worker → Supabase → Realtime → Frontend 의 마지막 hop 의 클라이언트 측 인프라.
// 카드가 거래소 REST 직접 호출 안 함 / AI 가 channel 직접 구독 안 함 / 추상화 경계 유지.

"use client";

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from "@supabase/supabase-js";

import { resolveDatasourceTable } from "@travis/shared";

import { getDataSourceClient } from "./supabaseAdapter";

/** 마지막 listener 제거 후 channel 실제 cleanup 까지의 grace period (ms). */
const GRACE_PERIOD_MS = 1000;

/** Supabase channel 라이프사이클을 단순화한 4 enum. */
export type ChannelStatus =
  | "subscribing"
  | "subscribed"
  | "errored"
  | "closed";

/**
 * 카드 → manager 에 등록되는 listener.
 * onChange 는 필수, onStatus 는 선택 (status 미사용 listener 도 흔함).
 */
export interface ChannelListener<T extends Record<string, unknown>> {
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
  onStatus?: (status: ChannelStatus) => void;
}

interface Entry {
  channel: RealtimeChannel;
  status: ChannelStatus;
  /** listenerId → listener. listeners.size 가 곧 refCount (별도 카운터 두지 않음 — drift 방지). */
  listeners: Map<string, ChannelListener<Record<string, unknown>>>;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

class ChannelManager {
  private entries = new Map<string, Entry>();
  private listenerSeq = 0;
  /**
   * client 팩토리 — production 은 getDataSourceClient(), 테스트는 mock 주입.
   * __resetForTesting(injectClient) 로 교체 가능.
   */
  private clientFactory: () => SupabaseClient = () => getDataSourceClient();

  /**
   * datasource 구독. 동기 반환 cleanup 함수 (useEffect 친화).
   *
   * 첫 listener: channel 생성 + .on() + .subscribe() 1회.
   * 후속 listener: dispatch table 에만 추가 (channel 손대지 않음).
   *
   * 빚 [8-27] #1 (테마 A Step 1): datasource 논리 id 를 물리 테이블명으로 resolve 한 뒤
   *   **테이블 기준** 으로 channel 을 운영한다. 같은 물리 테이블(now_futures_indicator)을
   *   가리키는 논리 datasource(open_interest / long_short_ratio 등)는 channel 을 공유 →
   *   불필요한 중복 채널 방지 (Supabase channel quota 절약, [3-33] 정신 연장).
   *
   * @param datasource dataService 의 datasource 논리 id (예: open_interest)
   * @param listener payload + status 콜백
   * @returns 동기 cleanup 함수
   */
  subscribe<T extends Record<string, unknown>>(
    datasource: string,
    listener: ChannelListener<T>,
  ): () => void {
    const table = resolveDatasourceTable(datasource);
    const id = `l${++this.listenerSeq}`;
    let entry = this.entries.get(table);

    if (!entry) {
      entry = this.createEntry(table);
      this.entries.set(table, entry);
    }

    // 진행 중이던 cleanup timer 가 있으면 취소 (grace period 효과 발휘 시점).
    if (entry.teardownTimer) {
      clearTimeout(entry.teardownTimer);
      entry.teardownTimer = null;
    }

    entry.listeners.set(
      id,
      listener as ChannelListener<Record<string, unknown>>,
    );

    // 새 listener 에게 현재 status 즉시 통지 — 이미 subscribed 인 channel 에
    // 합류하는 경우 onStatus 가 한 번도 안 불릴 위험 방어.
    if (listener.onStatus) {
      try {
        listener.onStatus(entry.status);
      } catch (err) {
        console.error(
          `[channelManager] onStatus 초기 통지 실패 (${table})`,
          err,
        );
      }
    }

    return () => this.unsubscribe(table, id);
  }

  /**
   * 마지막 listener 제거 시 grace period 후 channel cleanup.
   * grace 안에 새 listener 가 도착하면 subscribe() 가 timer cancel.
   */
  private unsubscribe(table: string, id: string): void {
    const entry = this.entries.get(table);
    if (!entry) return;

    entry.listeners.delete(id);
    if (entry.listeners.size > 0) return;

    entry.teardownTimer = setTimeout(() => {
      const current = this.entries.get(table);
      if (!current || current.listeners.size > 0) return;
      try {
        // removeChannel 이 unsubscribe + client.channels 배열에서 제거 모두 수행.
        // (supabase-js 소스 RealtimeChannel.ts 기준 — 메모리 leak 방지)
        void this.clientFactory().removeChannel(current.channel);
      } catch (err) {
        console.warn(
          `[channelManager] removeChannel 실패 (${table})`,
          err,
        );
      }
      this.entries.delete(table);
    }, GRACE_PERIOD_MS);
  }

  /**
   * 새 channel + .on() 1회 + .subscribe() 호출. 옵션 Z 의 핵심 진입점.
   * 이후 listener 추가/제거는 channel 손대지 않음.
   */
  private createEntry(table: string): Entry {
    let client: SupabaseClient;
    try {
      client = this.clientFactory();
    } catch (err) {
      // env 누락 / SSR 호출 등 — 절대 throw 하지 않고 dummy entry 반환.
      // 이 경우 channel.subscribe 가 일어나지 않아 listener 들은 영원히
      // "subscribing" 상태로 남음. 카드는 status='loading' 으로 표시.
      console.error(
        `[channelManager] Supabase client 생성 실패 (${table}) — 구독 비활성`,
        err,
      );
      return {
        channel: null as unknown as RealtimeChannel,
        status: "errored",
        listeners: new Map(),
        teardownTimer: null,
      };
    }

    const channel = client.channel(`dataService:${table}`);
    const entry: Entry = {
      channel,
      status: "subscribing",
      listeners: new Map(),
      teardownTimer: null,
    };

    channel
      .on(
        // supabase-js 타입 한계 — string literal union 첫 인자.
        "postgres_changes" as unknown as never,
        { event: "*", schema: "public", table } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) =>
          this.dispatch(table, payload),
      )
      .subscribe((subStatus) => {
        const next = mapSubscribeStatus(subStatus);
        entry.status = next;
        // 모든 listener 에게 상태 변경 통지 (try/catch 격리).
        for (const lst of entry.listeners.values()) {
          if (!lst.onStatus) continue;
          try {
            lst.onStatus(next);
          } catch (err) {
            console.error(
              `[channelManager] onStatus dispatch 예외 (${table})`,
              err,
            );
          }
        }
      });

    return entry;
  }

  /**
   * payload 도착 시 listener 들에게 fan-out.
   * 한 listener 의 throw 가 다른 listener 를 막으면 안 됨 (try/catch 격리).
   * client-side row 매칭 (match) 은 hooks 측에서 책임 — manager 는 단순 dispatch.
   *
   * code-reviewer W2 fix (2026-04-26): channel === null (env 누락 dummy entry) 가드.
   * 정상 경로에선 dispatch 가 .on() 콜백에서 호출되므로 channel 이 null 이면 도달
   * 불가하지만, 향후 다른 경로 추가 시 NPE 방어선.
   */
  private dispatch(
    table: string,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): void {
    const entry = this.entries.get(table);
    if (!entry || !entry.channel) return;
    for (const lst of entry.listeners.values()) {
      try {
        lst.onChange(payload);
      } catch (err) {
        console.error(`[channelManager] onChange 예외 (${table})`, err);
      }
    }
  }

  /**
   * 디버깅 / 테스트용 — 현재 활성 channel 수.
   * Supabase Free Tier 200 concurrent connection 한계 모니터링 hook.
   */
  __debugChannelCount(): number {
    return this.entries.size;
  }

  /**
   * 테스트 격리 전용 — 모든 channel 즉시 cleanup + counter 초기화.
   * production 호출 금지. (vitest beforeEach 에서 호출)
   */
  __resetForTesting(injectClient?: () => SupabaseClient): void {
    for (const entry of this.entries.values()) {
      if (entry.teardownTimer) clearTimeout(entry.teardownTimer);
      try {
        if (entry.channel) {
          void this.clientFactory().removeChannel(entry.channel);
        }
      } catch {
        // 테스트 환경 cleanup 실패는 무시.
      }
    }
    this.entries.clear();
    this.listenerSeq = 0;
    if (injectClient) {
      this.clientFactory = injectClient;
    }
  }
}

/**
 * Supabase subscribe callback status 문자열을 ChannelStatus enum 으로 정규화.
 * SUBSCRIBED / TIMED_OUT / CHANNEL_ERROR / CLOSED 4가지를 4 enum 으로 매핑.
 * 알 수 없는 값은 "subscribing" 으로 보수적 처리.
 */
function mapSubscribeStatus(raw: string): ChannelStatus {
  switch (raw) {
    case "SUBSCRIBED":
      return "subscribed";
    case "CHANNEL_ERROR":
    case "TIMED_OUT":
      return "errored";
    case "CLOSED":
      return "closed";
    default:
      return "subscribing";
  }
}

/**
 * 모듈 단위 singleton — 앱 전체에서 1 인스턴스 공유.
 * hooks.ts 가 직접 import. index.ts 는 export 안 함 (외부 차단).
 */
export const channelManager = new ChannelManager();

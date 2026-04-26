/**
 * logBehavior — 사용자 행동 로그 기록 래퍼 (M1.6 Step 3 Substep 3c, 2026-04-26).
 *
 * 호출 시점 (Step 3d 인스트루멘트 hook 에서 본격 채움):
 *   - `chat_submit` — ChatInputBar 제출 직후
 *   - `card_added` — actionDispatcher 가 spawn payload 처리 시
 *   - `card_deleted` — Undo toast 의 X 클릭 시 (또는 expire 후 delete 확정)
 *   - `card_layout_summary` — sessionFlusher 가 4중 가드 (idle/visibility/pagehide/unmount)
 *     로 카드별 drag/resize 카운터 + 마지막 좌표 batch 1 row INSERT
 *
 * 옵션 B-improved 채택 (사용자 결정 2026-04-26):
 *   1 event = 1 row 정책은 비용 폭증 (337K row/월). 옵션 B-improved 는 drag/resize 를
 *   카드별 메모리 카운터로 누적 → 4중 flush 가드 + idle skip → ~22K row/월 (15배 절감).
 *
 * payload 5KB 상한 (사용자 결정 2026-04-26):
 *   ROADMAP §M1.6 Step 3 핵심 의사결정 #2. 본 wrapper 가 toRow 안에서 ensurePayloadSize
 *   로 강제. 초과 시 truncation marker 객체로 대체 + console.warn.
 *
 * RLS:
 *   `log_behavior` 의 INSERT policy 0개 → service_role 전용. Step 3d 의 sendBeacon
 *   endpoint (`/api/log-behavior`) 도 server-side 에서 service_role 클라이언트로 INSERT.
 *
 * 호출 경로:
 *   - 직접 호출 (서버측, 예: route.ts 의 chat_submit) — 본 모듈 직접 사용
 *   - 클라이언트 측 sessionFlusher → /api/log-behavior endpoint → endpoint 가 본 모듈 호출
 *   클라이언트가 본 모듈을 직접 import 하면 service_role 키 노출 → server-only 방어선.
 */

import type { BehaviorLogInsert } from "@travis/data-service";

import { createLogger, ensurePayloadSize } from "@/lib/logging/createLogger";

/**
 * event_type 시작 4종 (ROADMAP §M1.6 Step 3 핵심 의사결정 #5, 2026-04-26 사용자 결정).
 * 자유 문자열 정책 유지 — DB CHECK 제약 안 걸음. Step 3 마지막에 enum 추가 검토.
 */
export type BehaviorEventType =
  | "chat_submit"
  | "card_added"
  | "card_deleted"
  | "card_layout_summary";

/** payload JSONB 5KB 상한 (사용자 결정 2026-04-26). */
const PAYLOAD_MAX_BYTES = 5 * 1024;

export interface LogBehaviorInput {
  /**
   * 호출 주체 user.id. NULL 허용 (시스템 호출 / 미인증 fallback).
   * route.ts / api/log-behavior 가 auth 통과 user.id 주입.
   */
  userId: string | null;

  /** 행동 종류. BehaviorEventType union 외 자유 문자열도 허용 (Step 3 enum 박지 않음). */
  eventType: BehaviorEventType | string;

  /**
   * 이벤트별 임의 컨텍스트.
   * 5KB 초과 시 application 가드가 truncation marker 객체로 대체.
   * 예시:
   *   - chat_submit:        { query_length: 42, has_filters_hint: false }
   *   - card_added:         { card_id, component_id, datasource, exchange, symbol }
   *   - card_deleted:       { card_id, component_id, undone: false }
   *   - card_layout_summary: { card_id, drag_count, resize_count, final_x, final_y, final_w, final_h, session_ms }
   */
  payload: Record<string, unknown>;
}

/**
 * 행동 로그를 DB 에 기록한다.
 *
 * **절대 throw 하지 않는다** — createLogger factory 의 try/catch 가 보장.
 * fire-and-forget 호출 가능 (await 생략 시 UX 레이턴시 제외).
 *
 * @returns 기록 성공 시 true, 실패 시 false
 */
export const logBehavior = createLogger<LogBehaviorInput, BehaviorLogInsert>({
  name: "logBehavior",
  toRow: (input): BehaviorLogInsert => {
    // payload 5KB 가드 — 초과 시 truncation marker 로 대체 + console.warn.
    const safePayload = ensurePayloadSize(
      input.payload,
      PAYLOAD_MAX_BYTES,
      `log_behavior.payload (${input.eventType})`,
    );

    return {
      user_id: input.userId,
      event_type: input.eventType,
      payload: safePayload as BehaviorLogInsert["payload"],
    };
  },
  insert: (service, row) => service.insertBehaviorLog(row),
});

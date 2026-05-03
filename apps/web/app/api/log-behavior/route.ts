/**
 * /api/log-behavior — sendBeacon 행동 로그 수집 endpoint
 * (M1.6 Step 3 Substep 3d, 2026-04-26).
 *
 * ─── 호출 시점 ─────────────────────────────────────
 * sessionFlusher 가 4중 flush 가드 (5min idle timer / visibilitychange / pagehide /
 * unmount) 시 batch payload 전송. 클라이언트 메모리 Counter 를 압축한 N 개 events
 * 를 1 request 로 INSERT.
 *
 * ─── 두 겹 auth (Step 1 패턴 일관성) ──────────────
 * 1. proxy.ts → matcher 에 `/api/log-behavior/:path*` 추가 (Substep 3d).
 *    비로그인 = 401 자동 차단.
 *    (M1.6 Step 6a 에서 middleware.ts → proxy.ts rename, [3-16] 회수.)
 * 2. 본 핸들러 → getSupabaseServerClient().auth.getUser() 직접 검증.
 *    proxy 우회 가능성 (Next.js bug / config 누락) 방어선.
 *
 * ─── service_role INSERT ──────────────────────────
 * `log_behavior` 의 INSERT policy 0개 → service_role 만 INSERT 가능. logBehavior()
 * wrapper 가 service_role 클라이언트로 INSERT (factory 내부).
 *
 * ─── sendBeacon 호환성 ────────────────────────────
 * - sendBeacon Blob `application/json` 권장 (MDN 2026-04-26 조회)
 * - 동일 origin POST 라 preflight 없음
 * - cookie 자동 전송 → proxy 인증 통과
 * - body 64 KiB 상한 (우리 application 가드 50 events × ~1KB ≈ 50KB 안전 마진)
 *
 * ─── 입력 검증 ────────────────────────────────────
 * Zod 로 events 배열 검증 — N <= 50 (한 flush 가 카드 50장 이상이면 분할 권장).
 * event_type 자유 문자열 (CHECK 제약 없음 — Step 3 후반 enum 검토).
 *
 * ─── 공식 문서 근거 ───────────────────────────────
 * - Next.js Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
 *   (조회일 2026-04-26)
 * - navigator.sendBeacon: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon
 *   (조회일 2026-04-26 — Blob `application/json` + 64 KiB 상한 + 동일 origin preflight 회피)
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { logBehavior } from "@/lib/ai/logBehavior";
import { getSupabaseServerClient } from "@/lib/supabase/serverClient";

/** Request body Zod 스키마. 한 batch 의 events 상한 50. */
const RequestSchema = z.object({
  events: z
    .array(
      z.object({
        event_type: z.string().min(1).max(64),
        payload: z.record(z.unknown()),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  // 0) 두 겹 auth — proxy 통과 후에도 user 직접 검증.
  let userId: string;
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "You must be signed in." },
        { status: 401 },
      );
    }
    userId = user.id;
  } catch (err) {
    console.error("[api/log-behavior] auth 실패:", err);
    return NextResponse.json(
      { error: "auth_unavailable" },
      { status: 503 },
    );
  }

  // 1) Body 파싱 + Zod 검증.
  // sendBeacon 은 Blob `application/json` 으로 보낼 수 있으나 Next.js 의 request.json()
  // 이 양쪽 (Blob + 일반 JSON POST) 모두 동일 처리. 안전.
  let parsed: z.infer<typeof RequestSchema>;
  try {
    const body = await request.json();
    const result = RequestSchema.safeParse(body);
    if (!result.success) {
      // 클라이언트 sessionFlusher 가 보낸 형태가 잘못된 경우만 도달.
      // 정상 운영 중에는 발생하지 않으므로 디버그용 로그.
      console.error(
        "[api/log-behavior] body 검증 실패:",
        result.error.issues.slice(0, 3),
      );
      return NextResponse.json(
        { error: "invalid_body" },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch (err) {
    console.error("[api/log-behavior] body parse 실패:", err);
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400 },
    );
  }

  // 2) 각 event 를 logBehavior wrapper 로 INSERT (service_role).
  // 절대 throw 안 함 (factory 보장). 일부 INSERT 실패 시 계속 진행.
  // batch INSERT 가 효율적이긴 하나 events.length <= 50 + fire-and-forget 이라
  // 단순 loop 로 충분. 추후 N>>50 시 SupabaseDataService 에 batch 메서드 추가.
  let okCount = 0;
  for (const event of parsed.events) {
    const ok = await logBehavior({
      userId,
      eventType: event.event_type,
      payload: event.payload,
    });
    if (ok) okCount++;
  }

  // sendBeacon 은 응답 body 사용 안 함 (브라우저가 무시) — 그러나 일반 fetch fallback
  // 도 같은 endpoint 사용 가능하므로 JSON 응답 유지.
  return NextResponse.json(
    { ok: true, accepted: okCount, total: parsed.events.length },
    { status: 200 },
  );
}

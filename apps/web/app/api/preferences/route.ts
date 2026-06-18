/**
 * /api/preferences — 사용자 자유텍스트 Custom Instructions 조회(GET) + 저장(PUT)
 *   (M2 테마 C Step 4 Sub-step 3, 2026-06-18).
 *
 * ─── 왜 인증 서버 클라이언트(service_role 아님)인가 ──────────────────
 * user_preferences 는 **유저 본인 RLS 3정책(SELECT/INSERT/UPDATE)이 보안 모델의
 * 핵심**이다(테마 C Step 1). service_role 을 쓰면 그 RLS 를 통째로 우회하므로,
 * getSupabaseServerClient()(쿠키 세션·anon key·RLS 적용)로 읽고 쓴다.
 * INSERT/UPDATE 정책 모두 WITH CHECK ((select auth.uid()) = user_id) 라
 * upsert(= INSERT or UPDATE)가 양쪽 경로 모두에서 user_id=auth.uid() 를 강제한다.
 * (pg_policies 재확인 2026-06-18 — 위생 #7.)
 *
 * ─── 두 겹 auth ───────────────────────────────────────────────────
 * 1. proxy.ts matcher (/api/preferences) — 비로그인 401 자동.
 * 2. 본 핸들러 getUser() 직접 검증 (proxy 우회 방어선).
 *
 * 라우트:
 *   GET /api/preferences → { customInstructions: string }  (없으면 "")
 *   PUT /api/preferences → body { customInstructions } 저장 → { ok, customInstructions }
 *
 * 왜 PUT 인가(POST 아님):
 *   user_preferences 는 유저당 1행(user_id PK)이라, "이 사용자의 프리퍼런스를 이
 *   값으로 설정" = 멱등(idempotent) 전체 교체 의미가 명확한 PUT 이 REST 정합.
 *   POST(생성 시맨틱)보다 upsert 동작과 일치.
 */

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/serverClient";
import { loadCustomInstructions } from "@/lib/ai/loadCustomInstructions";
import { PreferencesPutSchema } from "@/lib/preferences/schema";

export async function GET() {
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

    // 읽기 경로 재사용 — loadCustomInstructions 는 row/테이블 부재·조회 에러를
    // 모두 graceful 흡수하고 undefined 를 반환한다. UI 폼은 빈 문자열을 기대하므로
    // undefined → "" 로 정규화(미설정과 빈 값을 동일하게 "비어있음" 으로 표현).
    const customInstructions =
      (await loadCustomInstructions(supabase, user.id)) ?? "";

    return NextResponse.json({ customInstructions }, { status: 200 });
  } catch (err) {
    console.error("[api/preferences] GET 처리 실패:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    // 0) auth — proxy 통과 후에도 user 직접 검증.
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

    // 1) Body 파싱 + Zod 검증 (request.json() 은 비정상 body 에 throw → null 흡수).
    //    .strict() 가 customInstructions 외 추가 키(user_id 끼워넣기 등)를 거부.
    //    빈 문자열은 "프리퍼런스 지우기" 로 정상 허용.
    const body = await request.json().catch(() => null);
    const result = PreferencesPutSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: result.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }
    const { customInstructions } = result.data;

    // 2) Upsert — user_id 는 **body 가 아니라 인증 user.id 로만** 설정(위장/바꿔치기
    //    차단). RLS INSERT+UPDATE WITH CHECK 가 user_id=auth.uid() 를 강제하므로
    //    DB 레벨에서도 이중 차단된다. updated_at 은 트리거가 자동 갱신.
    //
    //    ★ preferences JSONB 전체 교체 방식의 한계 (현재 키가 customInstructions
    //      1개뿐이라 OK):
    //      미래에 다른 preference 키(quoteScope 등)가 추가되면, 이 전체 교체가
    //      그 키를 통째로 날린다. 그때는 "기존 preferences 를 읽어 머지(spread)
    //      후 upsert" 로 전환해야 한다. 지금 머지 구현은 YAGNI(키 1개) → scope 밖.
    //      deferred 등재 후보(보고 참조).
    const { error } = await supabase.from("user_preferences").upsert({
      user_id: user.id,
      preferences: { customInstructions },
    });

    if (error) {
      console.error("[api/preferences] upsert 실패:", error.message);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    // 저장된 값을 에코 — UI 가 응답으로 폼 상태를 확정(round-trip 일치 확인)할 수 있게.
    return NextResponse.json({ ok: true, customInstructions }, { status: 200 });
  } catch (err) {
    console.error("[api/preferences] PUT 처리 실패:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

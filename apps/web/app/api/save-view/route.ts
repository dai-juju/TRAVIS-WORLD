/**
 * /api/save-view — 저장 뷰 생성 (POST) (M2 테마 C Step 2 Sub-step 2).
 *
 * ─── 왜 service_role 이 아니라 인증 서버 클라이언트인가 ───────────────
 * 로그 테이블(log_*)은 유저 쓰기 정책이 0개라 service_role(RLS bypass)로 INSERT
 * 했지만, saved_views 는 **유저 본인 RLS 4정책이 보안 모델의 핵심**이다. 여기서
 * service_role 을 쓰면 그 RLS 를 통째로 우회한다. getSupabaseServerClient()(쿠키
 * 세션, anon key, RLS 적용)로 쓰면 INSERT WITH CHECK 가 user_id=auth.uid() 를
 * 강제 — 위장 저장이 DB 레벨에서 차단된다. (user_preferences "프론트 인증
 * 클라이언트 쓰기" 설계와 정합.)
 *
 * ─── 두 겹 auth ───────────────────────────────────────────────────
 * 1. proxy.ts matcher (로그인 안 하면 401 자동).
 * 2. 본 핸들러 getUser() 직접 검증 (proxy 우회 방어선).
 *
 * ─── 입력 검증 ────────────────────────────────────────────────────
 * - name: SavedViewNameSchema (1~200자).
 * - snapshot: SavedViewSnapshotSchema (카드 수 상한 + 각 config registry 검증).
 * - 페이로드 바이트 cap (DoS 방지, security-auditor Sub-step 2 후속).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Json } from "@travis/data-service";

import { getSupabaseServerClient } from "@/lib/supabase/serverClient";
import {
  SavedViewNameSchema,
  SavedViewSnapshotSchema,
  SAVED_VIEW_MAX_BYTES,
} from "@/lib/savedView/schema";

const RequestSchema = z
  .object({
    name: SavedViewNameSchema,
    snapshot: SavedViewSnapshotSchema,
  })
  .strict();

export async function POST(request: Request) {
  // views/route.ts 와 동일한 평탄 구조 (getUser 는 throw 안 하고 user=null 반환 →
  //   별도 try 불필요. 예외 경로는 바깥 try 하나로 graceful 처리).
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

    // 1) Body 파싱 + Zod 검증. (request.json() 은 비정상 body 에 throw → null 로 흡수)
    const body = await request.json().catch(() => null);
    const result = RequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: result.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }
    const parsed = result.data;

    // 2) 페이로드 바이트 cap — 용량 폭탄(DoS) 차단.
    //    Buffer.byteLength(utf8) = 실제 저장 바이트. .length(UTF-16 코드유닛)는
    //    한글/이모지에서 과소측정되므로 사용하지 않는다 (auditor W-1 / reviewer W2).
    const snapshotBytes = Buffer.byteLength(
      JSON.stringify(parsed.snapshot),
      "utf8",
    );
    if (snapshotBytes > SAVED_VIEW_MAX_BYTES) {
      return NextResponse.json(
        { error: "payload_too_large", maxBytes: SAVED_VIEW_MAX_BYTES },
        { status: 413 },
      );
    }

    // 3) INSERT — RLS WITH CHECK 가 user_id=auth.uid() 강제(위장 저장 차단).
    //    cards_config = 카드 배열, canvas_state = 뷰포트 (2 컬럼 분리 저장).
    const { data, error } = await supabase
      .from("saved_views")
      .insert({
        user_id: user.id,
        name: parsed.name,
        cards_config: parsed.snapshot.cards as unknown as Json,
        canvas_state: parsed.snapshot.viewport as unknown as Json,
      })
      .select("id, name, created_at")
      .single();

    if (error) {
      console.error("[api/save-view] insert 실패:", error.message);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, view: data }, { status: 201 });
  } catch (err) {
    console.error("[api/save-view] 처리 실패:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

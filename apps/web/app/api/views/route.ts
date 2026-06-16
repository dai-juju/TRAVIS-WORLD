/**
 * /api/views — 저장 뷰 목록/단건 조회(GET) + 삭제(DELETE) (M2 테마 C Step 2).
 *
 * 인증 서버 클라이언트(RLS 적용) 사용 — save-view 와 동일 근거(RLS 가 보안 모델).
 *   SELECT/DELETE 정책이 본인 행만 노출/삭제하므로, user_id 필터를 코드에서 빠뜨려도
 *   RLS 가 방어. 그래도 명시 필터를 둬 의도를 드러낸다(defense-in-depth).
 *
 * 라우트:
 *   GET  /api/views          → 본인 뷰 목록 (메타데이터만 — 가벼운 리스트)
 *   GET  /api/views?id=<uuid> → 단건 전체 (cards_config + canvas_state, 로드용)
 *   DELETE /api/views?id=<uuid> → 본인 뷰 삭제
 *
 * 두 겹 auth (proxy matcher + getUser 직접 검증).
 */

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/serverClient";

export async function GET(request: Request) {
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

    const id = new URL(request.url).searchParams.get("id");

    // 단건 — 로드용 전체 페이로드.
    if (id) {
      const { data, error } = await supabase
        .from("saved_views")
        .select("id, name, cards_config, canvas_state, created_at, updated_at")
        .eq("user_id", user.id)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("[api/views] 단건 조회 실패:", error.message);
        return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ view: data }, { status: 200 });
    }

    // 목록 — 메타데이터만 (cards_config 제외, 가벼움). 최신순.
    const { data, error } = await supabase
      .from("saved_views")
      .select("id, name, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[api/views] 목록 조회 실패:", error.message);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({ views: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error("[api/views] GET 처리 실패:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    // RLS DELETE USING 이 본인 행만 삭제 대상으로 허용. user_id 명시 필터 동반.
    const { error } = await supabase
      .from("saved_views")
      .delete()
      .eq("user_id", user.id)
      .eq("id", id);

    if (error) {
      console.error("[api/views] 삭제 실패:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[api/views] DELETE 처리 실패:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

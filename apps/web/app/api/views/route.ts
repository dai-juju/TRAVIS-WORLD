/**
 * /api/views — 저장 뷰 목록/단건 조회(GET) + 수정(PATCH) + 삭제(DELETE)
 *   (M2 테마 C Step 2 / PATCH 는 Saved Views v2 Sub-step 1).
 *
 * 인증 서버 클라이언트(RLS 적용) 사용 — save-view 와 동일 근거(RLS 가 보안 모델).
 *   SELECT/UPDATE/DELETE 정책이 본인 행만 노출/수정/삭제하므로, user_id 필터를 코드에서
 *   빠뜨려도 RLS 가 방어. 그래도 명시 필터를 둬 의도를 드러낸다(defense-in-depth).
 *
 * 라우트:
 *   GET  /api/views          → 본인 뷰 목록 (메타데이터만 — 가벼운 리스트)
 *   GET  /api/views?id=<uuid> → 단건 전체 (cards_config + canvas_state, 로드용)
 *   PATCH /api/views?id=<uuid> → 본인 뷰 수정 (rename: {name} / overwrite: {snapshot})
 *   DELETE /api/views?id=<uuid> → 본인 뷰 삭제
 *
 * 두 겹 auth (proxy matcher + getUser 직접 검증).
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

/**
 * PATCH body — rename(name) / overwrite(snapshot) 둘 다 optional, 최소 하나 필수.
 *   자동 저장(Sub-step 3)은 snapshot 만, 이름 변경(Sub-step 4)은 name 만 보낸다.
 *   둘 동시 전송도 허용(미래 확장). snapshot 은 POST 와 동일하게 strict 검증해
 *   drift 된 카드가 자동 저장으로 DB 에 쓰이는 것을 차단.
 */
const PatchSchema = z
  .object({
    name: SavedViewNameSchema.optional(),
    snapshot: SavedViewSnapshotSchema.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.snapshot !== undefined, {
    message: "Provide at least one of: name, snapshot.",
  });

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

export async function PATCH(request: Request) {
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

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }

    // 1) Body 파싱 + Zod 검증 (request.json() 은 비정상 body 에 throw → null 흡수).
    const body = await request.json().catch(() => null);
    const result = PatchSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: result.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }
    const parsed = result.data;

    // 2) UPDATE 페이로드 조립 — 전달된 필드만 갱신(부분 수정).
    //    updated_at 은 set_updated_at_now() 트리거가 자동 갱신(saved_views).
    const patch: { name?: string; cards_config?: Json; canvas_state?: Json } = {};
    if (parsed.name !== undefined) {
      patch.name = parsed.name;
    }
    if (parsed.snapshot !== undefined) {
      // overwrite — POST 와 동일하게 바이트 cap(DoS 차단). Buffer.byteLength(utf8) =
      //   실제 저장 바이트(.length 는 한글/이모지 과소측정).
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
      patch.cards_config = parsed.snapshot.cards as unknown as Json;
      patch.canvas_state = parsed.snapshot.viewport as unknown as Json;
    }

    // 3) UPDATE — RLS UPDATE USING+WITH CHECK 가 본인 행만 허용(위장/바꿔치기 차단).
    //    남의 id 면 WHERE 가 0행 → select 가 null → 404 (IDOR 가 구조적으로 404 로).
    const { data, error } = await supabase
      .from("saved_views")
      .update(patch)
      .eq("user_id", user.id)
      .eq("id", id)
      .select("id, name, updated_at")
      .maybeSingle();

    if (error) {
      console.error("[api/views] 수정 실패:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, view: data }, { status: 200 });
  } catch (err) {
    console.error("[api/views] PATCH 처리 실패:", err);
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

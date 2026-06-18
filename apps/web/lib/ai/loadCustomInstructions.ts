/**
 * loadCustomInstructions — user_preferences JSONB 에서 자유텍스트 Custom
 * Instructions 를 꺼내는 서버 전용 로더.
 *
 * M2 테마 C Step 4 Sub-step 2 (2026-06-18):
 *   /api/orchestrate 가 AI 호출 전에 사용자별 프리퍼런스를 로드해
 *   buildSystemPrompt({ customInstructions }) 로 주입(<user_preferences> 블록).
 *
 * ★ 설계 원칙
 *   - graceful (CLAUDE.md "절대 crash 금지"): 테이블/row 부재·조회 에러·비정형
 *     JSONB — 무엇이 잘못돼도 throw 하지 않고 undefined(주입 생략)를 반환한다.
 *     프리퍼런스는 "있으면 좋은" 보조 입력이라, 조회 실패가 쿼리 전체를 막으면 안 됨.
 *   - RLS: 인증 서버 클라이언트(getSupabaseServerClient)로 조회 → 정책상 본인
 *     row 만 보인다(테마 C Step 1 user_preferences RLS SELECT 정책). service_role
 *     우회 아님. 폭발 반경 = 본인 세션뿐(인젝션 방어 ⑤).
 *   - sanitize/길이상한은 buildSystemPrompt 내부 sanitizeCustomInstructions 가
 *     수행하므로, 이 로더는 raw 자유텍스트를 그대로 반환한다(정화는 주입 직전 1회).
 */

import { getSupabaseServerClient } from "@/lib/supabase/serverClient";

// route.ts 가 auth 단계에서 만든 인증 서버 클라이언트를 그대로 재사용한다.
type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

/**
 * @param supabase 인증 서버 클라이언트(RLS 적용). 호출 측이 auth 단계에서 생성한 인스턴스 재사용.
 * @param userId   인증된 사용자 id (RLS 와 별개로 명시 eq 필터 = 이중 안전).
 * @returns 자유텍스트 customInstructions. 없거나 비정상이면 undefined(섹션 주입 생략).
 */
export async function loadCustomInstructions(
  supabase: ServerClient,
  userId: string,
): Promise<string | undefined> {
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();

    // row 없음(아직 프리퍼런스 미설정)도 정상 — error 거나 data 없으면 조용히 생략.
    if (error || !data) return undefined;

    // preferences 는 schemaless JSONB. customInstructions(string)만 꺼낸다.
    const prefs = data.preferences;
    if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
      // ★ 이 캐스팅(as Record)은 바로 위 런타임 가드(object·non-array)와 한 세트다.
      //   타입 캐스팅 자체는 방어선이 아니므로(zod-string-not-defense 결), 가드 없이
      //   캐스팅만 복붙하지 말 것. ci 의 string 여부도 아래에서 런타임 재확인한다.
      const ci = (prefs as Record<string, unknown>).customInstructions;
      if (typeof ci === "string" && ci.trim().length > 0) return ci;
    }
    return undefined;
  } catch (err) {
    // 조회 자체가 던지는 예외(네트워크/타입)도 graceful 흡수 — 쿼리는 계속 진행.
    console.warn(
      `[orchestrate] loadCustomInstructions 실패 (graceful skip, userId=${userId}):`,
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}

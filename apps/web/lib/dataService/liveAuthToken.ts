// apps/web/lib/dataService/liveAuthToken.ts
//
// 경로 A(WS 직결) 세션 토큰 공급자 (M2 경로 A Step 4, 2026-06-23).
//
// liveConnection 이 핸드셰이크 직전 호출 → 현재 Supabase 세션의 access_token 을
// subprotocol `[WS_SUBPROTOCOL, token]` 로 실어 보낸다(쿼리스트링 로그 노출 회피).
//
// 모든 실패(미로그인 / env 누락 / SSR 오용)는 **graceful null** — 워커가 401 로
// 거부하고 liveConnection 이 재연결로 흡수하므로 절대 crash 하지 않는다.

"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient";

/** 현재 세션 access_token (없거나 실패 시 null). */
export async function getLiveAccessToken(): Promise<string | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    // `|| null` — 빈 문자열 토큰도 null 화(미래 다른 토큰 소스 추가 시 견고성, S1).
    //   liveConnection 의 `if (!token)` 가드와 같은 falsy 의미로 일치.
    return data.session?.access_token || null;
  } catch (err) {
    console.error("[liveAuthToken] 세션 토큰 조회 실패 (graceful null)", err);
    return null;
  }
}

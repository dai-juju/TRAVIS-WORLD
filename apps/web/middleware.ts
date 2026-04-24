/**
 * Next.js 16 App Router middleware — /api/orchestrate 보호 + Supabase 세션 갱신
 * (M1.6 Step 1c).
 *
 * 이중 역할:
 *   1. **Auth 방어** — 비로그인 요청이 /api/orchestrate 에 닿으면 401 JSON 으로 차단.
 *      /api/orchestrate 는 Anthropic Haiku 를 호출해 비용을 발생시키므로, 인증되지
 *      않은 트래픽이 공짜 방문자 비용을 초래하지 않도록 현관문 역할.
 *   2. **Session refresh** — `supabase.auth.getUser()` 호출이 내부적으로 만료된
 *      access token 을 refresh token 으로 자동 갱신. 갱신된 쿠키를 response 에 실어
 *      브라우저로 돌려보내 Server Component/Route Handler 가 다음 요청에서 동일한
 *      세션을 읽도록.
 *
 * matcher 범위 (현재 M1.6 최소):
 *   - `/api/orchestrate/:path*` — Anthropic 비용 유발 경로만 방어.
 *   - 홈 페이지 `/` 와 `(auth)/*` 는 matcher 밖 → middleware 미호출 → 누구나 접근 가능.
 *     (M1.6 Step 6 @security-auditor 종합 감사 시 UI 하드게이트 필요성 재검토.)
 *   - `_next` 정적 자산도 matcher 밖.
 *
 * 왜 response 를 먼저 만드는가:
 *   - Session refresh 시 Supabase SDK 가 setAll 콜백을 호출해 새 쿠키를 실어야 함.
 *   - `NextResponse.next()` 를 먼저 생성하고 cookie setter 에 그 response 를 참조.
 *   - 401 반환 경로는 세션 자체가 없어 setAll 이 호출되지 않으므로 쿠키 유실 없음.
 *
 * 공식 문서 근거:
 *   - Next.js middleware: https://nextjs.org/docs/app/building-your-application/routing/middleware
 *   - @supabase/ssr middleware guide: https://supabase.com/docs/guides/auth/server-side/nextjs
 *   - 조회일: 2026-04-24
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // response 를 먼저 만들어 session refresh 시 쿠키를 실을 공간 확보.
  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // env 누락 = 시스템 설정 미완료 → API 를 공짜로 열어주지 않고 명시적으로 차단.
  // dev 초기 부팅 UX 는 apps/web/.env.local 에 두 키를 채우는 것으로 해결.
  if (!url || !anonKey) {
    console.error(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — blocking /api/orchestrate",
    );
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    );
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() 는 access token 만료 시 refresh token 으로 자동 갱신.
  // 네트워크 실패 시 supabase-js 가 throw 하지 않고 user=null 을 반환하므로
  // 아래 분기 하나로 "인증 실패" 와 "Supabase 일시 장애" 를 동일하게 401 처리.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // M1.6 Step 1 W1 fix (2026-04-24): session refresh 로 response 에 실린 쿠키가
    // 있다면 401 응답에도 이월. 현 Supabase SDK 경로에선 user=null 인 경우 refresh
    // 쿠키가 거의 없지만, 익명 session / SDK 변경 엣지 케이스 방어. @supabase/ssr
    // 공식 가이드 "always return the response object" 원칙과 일치.
    const unauthorizedResponse = NextResponse.json(
      {
        error: "unauthorized",
        message: "You must be signed in to use this API.",
      },
      { status: 401 },
    );
    for (const cookie of response.cookies.getAll()) {
      unauthorizedResponse.cookies.set(cookie);
    }
    return unauthorizedResponse;
  }

  return response;
}

/**
 * matcher — Next.js 가 middleware 를 실행할 경로 필터.
 *
 * 현재는 /api/orchestrate 하위만. /api/* 전체로 확장하려면 향후 별도 결정
 * (특히 public read-only endpoint 가 생기면 제외 패턴 추가 필요).
 */
export const config = {
  matcher: ["/api/orchestrate/:path*"],
};

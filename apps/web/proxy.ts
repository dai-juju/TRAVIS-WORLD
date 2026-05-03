/**
 * Next.js 16 App Router proxy — /api/orchestrate 보호 + Supabase 세션 갱신
 * (M1.6 Step 1c, M1.6 Step 6a 에서 middleware.ts → proxy.ts rename).
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
 * matcher 범위 (M1.6 Step 3 Substep 3d 확장, 2026-04-26):
 *   - `/api/orchestrate/:path*` — Anthropic 비용 유발 경로 방어
 *   - `/api/log-behavior/:path*` — sessionFlusher 가 sendBeacon 으로 호출하는 행동 로그
 *     수집 endpoint. 인증된 유저의 행동만 수집해야 RLS 의도와 정합 + 미인증 트래픽이
 *     log_behavior 를 오염시키지 않도록 차단. roadmap-milestone-manager 사전 자문에서
 *     발견한 보안 이슈 (2026-04-26).
 *   - 홈 페이지 `/` 와 `(auth)/*` 는 matcher 밖 → proxy 미호출 → 누구나 접근 가능.
 *     (M1.6 Step 6c @security-auditor 종합 감사 결과 0 Critical / 2 Warning. UI 하드게이트는
 *     M1.7 Step 1 의 `[3.5-1]` allowlist 게이팅 + Step 2~3 admin 영역에서 처리 예정.)
 *   - `_next` 정적 자산도 matcher 밖.
 *
 * 왜 response 를 먼저 만드는가:
 *   - Session refresh 시 Supabase SDK 가 setAll 콜백을 호출해 새 쿠키를 실어야 함.
 *   - `NextResponse.next()` 를 먼저 생성하고 cookie setter 에 그 response 를 참조.
 *   - 401 반환 경로는 세션 자체가 없어 setAll 이 호출되지 않으므로 쿠키 유실 없음.
 *
 * M1.6 Step 6a rename ([3-16], 2026-05-03, security-auditor 자문):
 *   - Next.js 16.2 부터 `middleware.ts` convention 이 deprecated → `proxy.ts` 로 표준 변경.
 *   - 가장 큰 함정 회피: 파일명만 바꾸고 함수명을 `middleware` 로 유지하면 Next.js 가
 *     export 를 못 찾고 silent 무력화 = 모든 라우트 무방어. 함수명도 `proxy()` 로 함께 변경.
 *   - cookie API / NextRequest / NextResponse / @supabase/ssr 동작 변화 0
 *     (Next.js 공식 docs + context7 확인, 2026-05-03).
 *   - A/B 검증 7개 통과 후 `[3-16]` deferred 제거.
 *
 * 공식 문서 근거:
 *   - Next.js proxy migration: https://nextjs.org/docs/messages/middleware-to-proxy
 *   - @supabase/ssr guide: https://supabase.com/docs/guides/auth/server-side/nextjs
 *   - 조회일: 2026-05-03
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  // response 를 먼저 만들어 session refresh 시 쿠키를 실을 공간 확보.
  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // env 누락 = 시스템 설정 미완료 → API 를 공짜로 열어주지 않고 명시적으로 차단.
  // dev 초기 부팅 UX 는 apps/web/.env.local 에 두 키를 채우는 것으로 해결.
  //
  // M1.6 Step 6a 회수 ([3-14], 2026-05-03, security-auditor 자문):
  //   - 500 → 503 으로 변경 — env 누락은 server error 가 아니라 service unavailability.
  //   - 본문 최소화 — `server_misconfigured` 같은 구체 사유는 공격자에게 "Supabase 설정
  //     미완료" 정보를 누설하므로 generic `service_unavailable` 로 단축.
  //   - `Retry-After: 30` 헤더 추가 — HTTP 표준 retry 신호 (브라우저/AJAX 자동 재시도
  //     가이드). 30초는 운영자가 .env 채우는 데 걸리는 짧은 추정치.
  //   - 자세한 사유는 서버 console.error 에만 남김 (공격 표면 최소화).
  if (!url || !anonKey) {
    console.error(
      "[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — blocking /api/orchestrate",
    );
    return NextResponse.json(
      { error: "service_unavailable" },
      { status: 503, headers: { "Retry-After": "30" } },
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
 * matcher — Next.js 가 proxy 를 실행할 경로 필터.
 *
 * 현재 보호 대상:
 *   - /api/orchestrate/* — Haiku 비용 유발
 *   - /api/log-behavior/* — sendBeacon 행동 로그 수집 (M1.6 Step 3 Substep 3d, 2026-04-26)
 * /api/* 전체로 확장하려면 향후 별도 결정 (특히 public read-only endpoint 가 생기면
 * 제외 패턴 추가 필요).
 */
export const config = {
  matcher: ["/api/orchestrate/:path*", "/api/log-behavior/:path*"],
};

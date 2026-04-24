/**
 * Server-side Supabase client for Route Handlers / Server Components (M1.6 Step 1a).
 *
 * 용도:
 *   - `/api/orchestrate/route.ts` 에서 `supabase.auth.getUser()` 로 두 겹 auth 방어
 *   - 추후 Server Component 에서 user 세션 기반 초기 데이터 fetch (M1.6 Step 3 이후)
 *
 * 왜 `createServerClient` + `cookies()` 인가:
 *   - Next.js 16 App Router 는 Server Component / Route Handler 에서 `cookies()` from
 *     `next/headers` 를 통해 요청별 쿠키에 접근. `@supabase/ssr` 의 `createServerClient`
 *     는 cookie getter/setter 를 주입받아 브라우저와 동일한 세션을 서버에서 복원한다.
 *   - browser client 와 같은 `anon key` 를 쓰지만 쿠키 경유라서 RLS 는 해당 user 로
 *     적용됨. service_role 처럼 RLS 우회 ❌.
 *
 * 주의 — Server Component 에서 setAll 호출 시 동작:
 *   - Server Component 는 응답 쿠키를 쓸 수 없는 읽기 전용 컨텍스트. `cookieStore.set()`
 *     이 내부적으로 throw 한다. 하지만 `getUser()` 호출 도중 session refresh 로 쿠키
 *     갱신이 필요해지는 정상 경로에서도 발생하므로, **try/catch 로 감싸 무시** 하고
 *     middleware 가 다음 요청에서 refresh 해주는 것에 의존한다.
 *   - Route Handler / Server Action 에서는 정상 동작.
 *
 * 3중 server-only 방어선:
 *   1. `next/headers` 의 `cookies()` 는 server 전용 API (브라우저에서 import 불가)
 *   2. 이 모듈이 client 코드에서 import 되면 Next.js build 가 에러 표시
 *   3. `typeof window` 런타임 가드로 이중 안전장치
 *
 * 공식 문서 근거:
 *   - @supabase/ssr createServerClient: https://supabase.com/docs/guides/auth/server-side/nextjs
 *   - Next.js cookies(): https://nextjs.org/docs/app/api-reference/functions/cookies
 *   - 조회일: 2026-04-24
 */

// ─── Server-only module 가드 ────────────────────────
if (typeof window !== "undefined") {
  throw new Error(
    "serverClient must not be imported from client code. Use it only from Route Handlers / Server Components.",
  );
}

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@travis/data-service";

// ─── 에러 클래스 ────────────────────────────────────

/** NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 누락 시 throw. */
export class MissingSupabasePublicEnvError extends Error {
  override readonly name = "MissingSupabasePublicEnvError";
  constructor(detail: string) {
    super(`Supabase 공개 env 누락: ${detail}`);
  }
}

// ─── 메인 팩토리 ────────────────────────────────────

/**
 * 요청 컨텍스트별 server client 를 새로 만든다.
 *
 * 왜 singleton 이 아닌가:
 *   - Next.js 요청마다 cookies() snapshot 이 달라지므로, 요청별 인스턴스 필수.
 *   - caching 하면 "A 유저의 쿠키를 B 유저 요청에서 재사용" 하는 치명적 버그.
 *
 * @throws {MissingSupabasePublicEnvError} env 누락
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.length === 0) {
    throw new MissingSupabasePublicEnvError(
      "NEXT_PUBLIC_SUPABASE_URL 환경변수 미설정 — apps/web/.env.local 을 확인하세요.",
    );
  }
  if (!anonKey || anonKey.length === 0) {
    throw new MissingSupabasePublicEnvError(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수 미설정 — Supabase Dashboard → API → anon/public key 를 복사하세요.",
    );
  }

  // Next.js 15+: cookies() 는 async. App Router Route Handler/Server Component 에서 await.
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        // Server Component 에선 set 이 throw. 정상 경로(Route Handler/Server Action)
        // 에선 동작하므로 try/catch 로 양쪽 모두 허용.
        // 참고: Server Component 에서 refresh 필요한 경우 middleware 가 갱신.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component read-only context — 의도적 무시.
        }
      },
    },
  });
}

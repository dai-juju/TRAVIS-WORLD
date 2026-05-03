/**
 * Browser-side Supabase client (M1.6 Step 1a).
 *
 * 용도:
 *   - Client Component 에서 `supabase.auth.signInWithPassword / signUp / signOut`
 *   - Client Component 에서 RLS 가 건 `log_chat`, `log_behavior` SELECT (M1.6 Step 2 이후)
 *   - Client Component 에서 `now_*` 읽기 (기존 TickerCard/CoinListCard 경로)
 *
 * 왜 `createBrowserClient` 인가:
 *   - `document.cookie` 를 자동 read/write 해 Supabase access/refresh token 을
 *     브라우저 쿠키에 동기화한다. proxy.ts 가 쿠키를 읽어 서버 측에서 동일
 *     세션을 복원하므로, 클라이언트/서버가 한 세션을 공유하게 된다.
 *     (M1.6 Step 6a 에서 middleware.ts → proxy.ts rename, [3-16] 회수.)
 *   - `@supabase/supabase-js` 의 `createClient` 와 달리 localStorage 대신 쿠키를
 *     기본 저장소로 쓰는 것이 핵심 차이 — SSR 호환성 전제.
 *
 * 3중 browser-only 방어선 (serviceRoleClient 의 server-only 와 대칭):
 *   1. `NEXT_PUBLIC_` 접두사가 붙은 키만 참조 — Next.js 가 브라우저 번들에 포함
 *   2. 이 모듈은 "use client" 컴포넌트에서만 import (호출 그래프 규율)
 *   3. 런타임 `typeof window === "undefined"` 가드 — SSR 경로에서 오용 시 즉시
 *      throw 해 잘못된 호출 그래프를 빠르게 드러냄. serviceRoleClient/serverClient
 *      의 server-only 가드와 정확히 대칭. (M1.6 Step 1 W2 fix, 2026-04-24)
 *   4. Lazy singleton 로 재-호출 시 동일 인스턴스 반환 → auth 이벤트 listener
 *      중복 등록 방지.
 *
 * 공식 문서 근거:
 *   - @supabase/ssr createBrowserClient: https://supabase.com/docs/guides/auth/server-side/nextjs
 *   - @supabase/ssr design doc: https://github.com/supabase/ssr/blob/main/docs/design.md
 *   - 조회일: 2026-04-24
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@travis/data-service";

// ─── 에러 클래스 ────────────────────────────────────

/** NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 누락 시 throw. */
export class MissingSupabasePublicEnvError extends Error {
  override readonly name = "MissingSupabasePublicEnvError";
  constructor(detail: string) {
    super(`Supabase 공개 env 누락: ${detail}`);
  }
}

// ─── Lazy singleton ────────────────────────────────

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * 브라우저용 Supabase client 를 최초 호출 시 1회 생성.
 *
 * 재사용: 여러 Client Component 에서 호출해도 동일 인스턴스 반환 → `onAuthStateChange`
 * listener 가 중복 등록되지 않음 (중복 시 로그아웃 이벤트가 N번 발생하는 미묘한 버그).
 *
 * @throws {MissingSupabasePublicEnvError} env 누락
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  // SSR 환경 오용 즉시 throw — serverClient/serviceRoleClient 와 대칭 방어선.
  if (typeof window === "undefined") {
    throw new Error(
      "browserClient must not be called from server code. Use getSupabaseServerClient() in Route Handlers / Server Components.",
    );
  }

  if (cachedClient) return cachedClient;

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

  cachedClient = createBrowserClient<Database>(url, anonKey);
  return cachedClient;
}

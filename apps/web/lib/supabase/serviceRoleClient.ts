/**
 * Service-role Supabase client (server-only).
 *
 * M1.5 Step 2c (2026-04-22): `log_validation_failure` 테이블은 RLS policy 0개로
 * deny-all 상태이므로 service_role key 를 쓰는 전용 client 가 필요하다.
 *
 * 3중 server-only 방어선 (haikuClient.ts 와 동일 패턴):
 *   1. `process.env.SUPABASE_SERVICE_ROLE_KEY` 에 `NEXT_PUBLIC_` 접두사 없음
 *      → Next.js 가 자동으로 클라이언트 번들에서 제거
 *   2. 이 모듈은 `app/api/**` 서버 전용 라우트에서만 import 되도록 호출 그래프 유지
 *   3. `typeof window` 런타임 가드 — 실수로 클라이언트 컴포넌트에서 import 시 throw
 *
 * 설계:
 *   - Lazy singleton — 모듈 로드 시점이 아닌 최초 호출 시 env 검증 + client 생성
 *   - `persistSession: false, autoRefreshToken: false` — service_role 은 고정 key,
 *     세션 갱신 불필요 + 메모리 효율
 *   - Database 타입 제네릭 — `@travis/data-service` 의 generated types 로 자동 완성
 *
 * 공식 문서 근거:
 *   - Supabase JS client: https://supabase.com/docs/reference/javascript/initializing
 *   - Service role security: https://supabase.com/docs/guides/api/api-keys
 *   - 조회일: 2026-04-22
 */

// ─── Server-only module 가드 ────────────────────────
if (typeof window !== "undefined") {
  throw new Error(
    "serviceRoleClient must not be imported from client code. Use it only from server routes (app/api/**).",
  );
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@travis/data-service";

// ─── 에러 클래스 ────────────────────────────────────

/** SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락 시 throw. */
export class MissingSupabaseServiceRoleError extends Error {
  override readonly name = "MissingSupabaseServiceRoleError";
  constructor(detail: string) {
    super(`Supabase service role 설정 누락: ${detail}`);
  }
}

// ─── Lazy singleton ────────────────────────────────

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * service_role 기반 Supabase client 를 최초 호출 시 1회 생성.
 *
 * 재사용: `SupabaseDataService(getSupabaseServiceRoleClient())` 또는
 * 필요 시 raw client 메서드 직접 호출.
 *
 * @throws {MissingSupabaseServiceRoleError} env 누락
 */
export function getSupabaseServiceRoleClient(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || url.length === 0) {
    throw new MissingSupabaseServiceRoleError(
      "SUPABASE_URL 환경변수 미설정 — apps/web/.env.local 을 확인하세요.",
    );
  }
  if (!key || key.length === 0) {
    throw new MissingSupabaseServiceRoleError(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수 미설정 — Supabase dashboard → API → service_role 에서 복사.",
    );
  }

  cachedClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

// collector-history 용 Supabase 클라이언트 싱글톤 (apps/worker/src/supabase.ts 복제).
//
// 역할 분리:
//   - @travis/data-service (SupabaseDataService): runtime-agnostic 추상.
//   - 이 파일: Node.js 환경에서 service_role env 를 읽어 RLS-우회 클라이언트 생산.
//     env 부재 시 throw 대신 null.
//
// service_role key 는 모든 RLS 정책을 우회하므로 절대 브라우저로 새어나가면 안 됨.
// 따라서 NEXT_PUBLIC_* prefix 를 사용하지 않는다.
//
// production worker 와 동일한 SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 를 사용하되,
// 이 수집기는 **별도 Hetzner 서버(별도 IP)** 에서 돌아 Binance /futures/data IP quota
// 를 production worker 와 공유하지 않는다 (-1003 ban 회피, M1.9 설계 근거).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@travis/data-service";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// service_role 서버 환경 필수 옵션: 세션 저장·자동 갱신·URL 감지 모두 끔.
export const supabase: SupabaseClient<Database> | null =
  url && serviceRoleKey
    ? createClient<Database>(url, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

if (!supabase) {
  console.warn(
    "[supabase] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 누락 — .env 또는 /etc/travis/collector.env 를 확인하세요",
  );
}

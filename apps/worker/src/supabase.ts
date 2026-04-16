// 워커용 Supabase 클라이언트 싱글톤 공급자.
//
// 역할 분리 (apps/web/lib/supabase.ts와 대칭):
//   - @travis/data-service (SupabaseDataService): runtime-agnostic 추상.
//   - apps/worker/src/supabase.ts (이 파일): Node.js 환경에서 service_role
//     env를 읽어 RLS-우회 클라이언트 생산. env 부재 시 throw 대신 null.
//
// service_role key는 모든 RLS 정책을 우회하므로 절대 브라우저로 새어나가면 안 됨.
// 따라서 NEXT_PUBLIC_* prefix를 사용하지 않는다 (= Vercel/Next.js 노출 차단).
//
// M1.1 Step 4 현재: 이 파일은 export만 존재, index.ts에서 import 안 함.
// M1.1 Step 5에서 index.ts가 import하여 ping 1회 호출 예정.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase: SupabaseClient | null =
  url && serviceRoleKey ? createClient(url, serviceRoleKey) : null;

// env가 비어 있어도 throw하지 않고 stderr에 1회 경고.
// 워커가 stdin 없이 헤드리스로 돌기 때문에 stderr 표면화가 디버깅 신호.
if (!supabase) {
  console.warn(
    "[supabase] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 누락 — M1.1 Step 5에서 주입 예정",
  );
}

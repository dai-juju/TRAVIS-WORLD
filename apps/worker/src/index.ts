// TRAVIS Hetzner 워커 진입점.
//
// M1.1 Step 5: "hello" + Supabase 연결 검증 후 정상 종료.
// M1.3: 장기 실행 + 어댑터 부팅 + WS 릴레이로 진화.
//
// 절대 crash 금지(CLAUDE.md): 모든 에러는 graceful 처리.
import { supabase } from "./supabase.js";

async function main(): Promise<void> {
  console.log("hello from travis-worker");

  // Supabase 연결 검증: admin.listUsers()는 service_role 전용 관리자 API.
  // 테이블·세션 없이도 동작. { data: { users: [] }, error: null } = 연결 성공.
  if (supabase) {
    const { error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) {
      console.error("[supabase] ping failed:", error.message);
    } else {
      console.log("[supabase] worker connected to", process.env.SUPABASE_URL);
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});

// apps/web/lib/dataService/supabaseAdapter.ts
//
// dataService 의 데이터 소스 어댑터 (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// 책임:
//   - browserClient.ts 의 lazy singleton 을 위임 호출해 SupabaseClient 인스턴스 반환
//   - dataService 의 channelManager / hooks 가 Supabase API 에 직접 의존하지 않도록
//     단일 경계 제공. M2+ GraphQL / WS 직접 / TimescaleDB 등으로 데이터 소스 다변화 시
//     본 어댑터만 교체하면 dataService 외부 면 (hooks API) 유지됨.
//
// 설계 노트:
//   - 본 모듈은 SupabaseClient 캐시하지 않음 — browserClient 의 lazy singleton 위임.
//   - 클라이언트 측 호출만 가정 (브라우저 환경). SSR 호출 시 browserClient 가 throw.
//   - env 누락 시 호출자 (channelManager / hooks) 가 try/catch 로 격리.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@travis/data-service";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient";

/**
 * dataService 가 사용하는 Supabase 클라이언트 (브라우저 측).
 * env 누락 시 throw — channelManager / hooks 가 try/catch 로 격리.
 */
export function getDataSourceClient(): SupabaseClient<Database> {
  return getSupabaseBrowserClient();
}

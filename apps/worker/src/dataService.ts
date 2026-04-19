// Hetzner 워커의 dataService 싱글톤 공급자 (M1.3 Step 2, 2026-04-19).
//
// apps/web/lib/data.ts와 대칭 구조.
// 차이점:
//   - web: @supabase/ssr + anon key (브라우저), RLS 적용
//   - worker: service_role (서버), RLS 우회 → 폴링 배치 insert 가능
//
// Step 3~5의 모든 워커 코드는 이 파일의 `dataService`만 사용하고,
// supabase.ts의 raw client를 직접 호출하지 않는다.
// 그래야 "apps/worker 내부 .from() 호출 0건" grep 규칙이 성립.

import { SupabaseDataService, type IDataService } from "@travis/data-service";
import { supabase } from "./supabase.js";

/**
 * 앱 전역 dataService 싱글톤.
 * env 누락 시 null — 워커 시작부에서 "not configured" 경고 후 종료 or
 * polling 건너뛰기 분기.
 */
export const dataService: IDataService | null = supabase
  ? new SupabaseDataService(supabase)
  : null;

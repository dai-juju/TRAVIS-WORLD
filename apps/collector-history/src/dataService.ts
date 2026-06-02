// collector-history 의 dataService 싱글톤 공급자 (apps/worker/src/dataService.ts 복제).
//
// 차이점:
//   - service_role (서버), RLS 우회 → forward-fill upsert 가능.
//
// 모든 수집 코드는 이 파일의 `dataService` 만 사용하고, supabase.ts 의 raw client 를
// 직접 호출하지 않는다 (".from() 직접호출 0건" 규칙 유지).

import { SupabaseDataService, type IDataService } from "@travis/data-service";
import { supabase } from "./supabase.js";

/**
 * 앱 전역 dataService 싱글톤.
 * env 누락 시 null — index.ts 부팅부에서 "not configured" 경고 후 종료.
 */
export const dataService: IDataService | null = supabase
  ? new SupabaseDataService(supabase)
  : null;

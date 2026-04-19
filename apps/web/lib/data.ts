// apps/web 전용 dataService 인스턴스 공급자 (M1.3 Step 2, 2026-04-19).
//
// 이 파일이 존재하는 이유:
//   - 애플리케이션은 @travis/data-service를 직접 import하지 않고 여기를 거친다.
//   - 향후 구현체 교체(Timescale/ClickHouse 등) 시 이 재-export만 바꾸면 된다.
//   - dataService 인스턴스를 싱글톤으로 제공해 컴포넌트마다 재생성 방지.
//
// env 부재 대응(CLAUDE.md "절대 crash 금지"):
//   supabase 클라이언트가 null(URL/anon key 누락)이면 dataService도 null.
//   호출부는 `if (!dataService) return` 패턴으로 graceful 분기.
//
// M1.3 Step 2 범위: 읽기 위주 consumer 없음(M1.4 카드에서 시작). 이 파일은
// 배선 완결성과 "apps/web이 .from()을 직접 부르지 않는다"는 grep 규칙을
// 위해 지금 도입한다.

import { SupabaseDataService, type IDataService } from "@travis/data-service";
import { supabase } from "./supabase";

export type { IDataService };
export { SupabaseDataService };

/**
 * 앱 전역 dataService 싱글톤.
 * env 누락 시 null — 이 경우 UI는 "데이터 연결 안 됨" 배너 등으로 fallback.
 */
export const dataService: IDataService | null = supabase
  ? new SupabaseDataService(supabase)
  : null;

// @travis/data-service 패키지의 애플리케이션 consumer 진입점.
//
// Step 3c의 핵심 목적:
//   workspace 패키지 링크가 "타입 차원"(IDataService 인터페이스)과
//   "값 차원"(SupabaseDataService 클래스) 양쪽에서 모두 resolve되는지
//   실제로 검증하는 것. 타입만 import하면 SWC가 컴파일 시 지워 런타임
//   링크를 실증하지 못하므로, 값 import를 반드시 포함해 번들 경로까지
//   뚫어둔다.
//
// verbatimModuleSyntax 강제:
//   - type-only 심볼은 `type` 키워드 필수 (`type IDataService`)
//   - 값 심볼은 키워드 없이 (`SupabaseDataService`)
//   혼용하면 TS1484가 apps/web 빌드에서 터진다.
//
// M1.3 로드맵:
//   IDataService에 첫 조회 메서드가 추가되는 시점에 아래 dataService
//   placeholder를 실제 `new SupabaseDataService(url, anonKey)` 인스턴스로
//   교체. 이때 env 읽기는 이 파일이 아닌 `lib/supabase.ts`와 동일한 패턴으로
//   별도 bootstrap에서 처리한다.
import { SupabaseDataService, type IDataService } from "@travis/data-service";

// 애플리케이션은 @travis/data-service를 직접 import하지 않고 이 파일을 거친다.
// 향후 구현체 교체(Timescale/ClickHouse 등) 시 이 재-export만 바꾸면 된다.
export type { IDataService };
export { SupabaseDataService };

/**
 * 앱 전역 dataService 인스턴스 placeholder.
 * M1.3 첫 메서드가 IDataService에 들어가는 시점에 실제 인스턴스 주입.
 * 지금은 null — 소비자 측이 아직 존재하지 않음.
 */
export const dataService: IDataService | null = null;

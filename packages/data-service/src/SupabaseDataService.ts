// import 스타일: 값(runtime)과 타입을 선언 단위로 분리해 verbatimModuleSyntax에
// 일관성을 유지. M1.3에서 User/PostgrestError 등 타입을 추가할 때 같은 패턴 사용.
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IDataService } from "./IDataService";

/**
 * SupabaseDataService — IDataService의 Supabase 구현체.
 *
 * M1.1에서는 생성자만 존재하고 공개 메서드는 없다.
 * 메서드는 IDataService가 확장되는 M1.3 시점에 함께 추가된다.
 *
 * 생성자 파라미터:
 *   - url: Supabase 프로젝트 URL (예: https://xxx.supabase.co)
 *   - key: anon 또는 service_role 키 (호출 문맥에 따라 결정)
 *
 * 주의: 이 클래스는 쿠키 기반 SSR 세션을 다루지 않는다. Next.js
 * SSR 쿠키 컨텍스트가 필요하면 apps/web/lib/supabase.ts에서
 * @supabase/ssr의 createBrowserClient/createServerClient를 사용하라.
 */
export class SupabaseDataService implements IDataService {
  private readonly client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
    // TS6133 회피용 no-op 읽기 — M1.1 스켈레톤 단계 한시적 코드.
    // M1.3에서 첫 공개 메서드가 this.client.from(...) 등으로 호출하는 순간
    // 이 라인은 **반드시 제거**해야 한다 (이중 참조로 남겨두면 혼란).
    void this.client;
  }
}

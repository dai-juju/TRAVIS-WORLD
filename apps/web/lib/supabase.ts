// 브라우저용 Supabase 클라이언트 싱글톤 공급자.
//
// 역할 분리:
//   - @travis/data-service (SupabaseDataService): runtime-agnostic 순수 추상.
//     워커·웹·테스트 어디서든 재사용 가능. env 읽기를 하지 않는다.
//   - apps/web/lib/supabase.ts (이 파일): 브라우저 환경의 NEXT_PUBLIC_* env를
//     읽어 실제 클라이언트 인스턴스만 생산. env가 없어도 crash하지 않는다
//     (CLAUDE.md "절대 crash 금지"). M1.6에서 @supabase/ssr + cookies 기반
//     세션 관리로 교체 예정.
//
// 사용 측은 `supabase?.from(...)` 형태로 null-safe하게 접근한다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

// env가 비어 있어도 throw하지 않고, 브라우저 콘솔에만 1회 경고.
// 서버 컴포넌트(SSR)에서는 조용히 null을 반환해 빌드·초기 렌더가 깨지지 않는다.
if (!supabase && typeof window !== "undefined") {
  console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 누락 — M1.1 Step 5에서 주입 예정");
}

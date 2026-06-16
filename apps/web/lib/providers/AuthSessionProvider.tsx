"use client";
/**
 * AuthSessionProvider — 로그인 세션 상태 단일 출처 (M2 테마 C Step 2 / Sub-step 0).
 *
 * 왜 신설했나:
 *   계정 위젯이 두 곳에 나타난다 — 좌측 패널 상단(UserMenu) + rail 하단 점
 *   (RailAccount). 각 컴포넌트가 따로 getUser() 를 호출하면 마운트당 인증 왕복이
 *   2번 발생한다. 인증 상태를 이 Provider 한 곳에서 단 한 번 구독하고 Context 로
 *   양쪽에 내려준다 (단일 구독).
 *
 * 구독 로직 출처:
 *   기존 UserMenu.tsx 의 getUser + onAuthStateChange + [3-12] flicker fix +
 *   unsubscribe + signOut(router.replace("/login")) 를 그대로 이전. UserMenu 는
 *   이제 이 Context 를 소비하는 표현 전용 컴포넌트가 된다.
 *
 * 마운트 위치 (스코프):
 *   layout.tsx(전역) 가 아니라 CanvasWorkspace 안에만 둔다 — /login·/signup
 *   페이지에선 세션 구독이 불필요하므로 캔버스 스코프로 좁힌다.
 *
 * 에러 graceful:
 *   getUser()/signOut() 실패는 UX 를 깨지 않고 console.warn 만 (CLAUDE.md
 *   "에러 나면 절대 crash 금지").
 *
 * 왜 throw 인가 (useAuthSession):
 *   Provider 없이 호출되면 명백한 프로그래머 에러 — 다른 store Provider 들과
 *   동일 규약으로 개발 중 즉시 발견되게 한다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient";

export type AuthSession = {
  /** 로그인 이메일. 비로그인이면 null. */
  email: string | null;
  /** 초기 getUser() 왕복 중 여부. true 동안 계정 UI 는 렌더 보류(FOUC 최소화). */
  loading: boolean;
  /** Log out 진행 중 여부 (버튼 비활성화/레이블용). */
  signingOut: boolean;
  /** 로그아웃 — Supabase signOut + /login 으로 이동. */
  signOut: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSession | undefined>(undefined);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // mounted 가드 (feedback_mounted_guard_consistency): signOut 성공 시
  //   router.replace("/login") 가 CanvasWorkspace(→ 본 Provider)를 언마운트하므로,
  //   그 직후 finally 의 setSigningOut(false) 가 언마운트 후 호출될 수 있다. useEffect
  //   의 지역 mounted 와 별개로 useCallback(signOut)에서도 참조 가능하게 ref 로 통일.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch (err) {
      console.warn(
        "[AuthSession] Supabase client init failed:",
        err instanceof Error ? err.message : String(err),
      );
      setLoading(false);
      return;
    }

    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        setEmail(data.user?.email ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.warn(
          "[AuthSession] getUser failed:",
          err instanceof Error ? err.message : String(err),
        );
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
      // [3-12] flicker fix (M1.6 Step 5): Supabase 가 listener 등록 직후
      // INITIAL_SESSION 을 동기 emit 하면 getUser().then() 보다 빨리 도착할 수
      // 있다. 같은 callback 안에서 setLoading(false) 도 호출해 sync emit 경로에서
      // 즉시 loading 해제 (React 자동 batching 으로 1 render 병합).
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      // 쿠키 소거 완료 후 서버/클라이언트 동기화.
      router.replace("/login");
      router.refresh();
    } catch (err) {
      console.warn(
        "[AuthSession] signOut failed:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      if (mountedRef.current) setSigningOut(false);
    }
  }, [router]);

  return (
    <AuthSessionContext.Provider value={{ email, loading, signingOut, signOut }}>
      {children}
    </AuthSessionContext.Provider>
  );
}

/**
 * 로그인 세션 구독 훅 — AuthSessionProvider 하위에서만 호출 가능.
 *
 * @example
 *   const { email, loading, signingOut, signOut } = useAuthSession();
 */
export function useAuthSession(): AuthSession {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return ctx;
}

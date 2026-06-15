"use client";

/**
 * UserMenu — 캔버스 우상단 세션 표시 + Log out (M1.6 Step 1e).
 *   M2 테마 C Step 0 에서 fixed→absolute (캔버스 <main relative> 기준 우상단,
 *   패널 Push 시 캔버스 영역 추종).
 *
 * 3가지 상태:
 *   1. `loading` — 초기 마운트 직후 getUser() 왕복 중. 아무것도 렌더하지 않아
 *      "로그인 → 홈" 전환 순간의 깜빡임(FOUC) 최소화.
 *   2. `!email` — 비로그인 상태. "Sign in" 링크만 표시. Canvas 자체는 비로그인
 *      접근 허용(Plan §1c) 이므로 홈에 들어와도 강제 이동 없음.
 *   3. email 있음 — 이메일 + Log out 버튼.
 *
 * onAuthStateChange 구독 이유:
 *   - 탭 A 에서 로그아웃 → 탭 B 도 즉시 반응하도록 (BroadcastChannel 경유).
 *   - 다른 탭에서 sign_in 도 반영.
 *
 * 에러 graceful:
 *   - getUser() / signOut() 실패는 UX 를 깨지 않고 console.warn 만.
 *   - CLAUDE.md "에러 나면 절대 crash 금지" 원칙.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browserClient";

export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch (err) {
      console.warn(
        "[UserMenu] Supabase client init failed:",
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
          "[UserMenu] getUser failed:",
          err instanceof Error ? err.message : String(err),
        );
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
      // M1.6 Step 5 ([3-12] 회수, 2026-05-03): Supabase 가 listener 등록 직후
      // INITIAL_SESSION 이벤트를 동기 emit 하는 경우, getUser().then() 보다 빨리
      // 도착하면 email 만 set 되고 loading=true 인 상태로 잠깐 빈 화면이 깜빡임.
      // 같은 callback 안에서 setLoading(false) 도 호출해 sync emit 경로에서 즉시
      // loading 해제 — React 18+ 자동 batching 으로 두 setState 1 render 병합.
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      // 쿠키 소거 완료 후 서버/클라이언트 동기화.
      router.replace("/login");
      router.refresh();
    } catch (err) {
      console.warn(
        "[UserMenu] signOut failed:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  if (loading) {
    return null;
  }

  if (!email) {
    return (
      <div className="absolute top-4 right-4 z-40">
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-4 right-4 z-40 flex items-center gap-2 rounded-md border bg-background/80 px-3 py-1.5 backdrop-blur"
      data-testid="user-menu"
    >
      <span
        className="max-w-[180px] truncate text-sm text-muted-foreground"
        title={email}
      >
        {email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? "Signing out..." : "Log out"}
      </Button>
    </div>
  );
}

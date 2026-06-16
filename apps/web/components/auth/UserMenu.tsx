"use client";

/**
 * UserMenu — 좌측 패널 상단 계정 위젯 (M2 테마 C Step 2 / Sub-step 0).
 *
 * 이력:
 *   - M1.6 Step 1e: 캔버스 우상단 fixed 세션 표시로 신설.
 *   - M2 테마 C Step 0: fixed→absolute (캔버스 <main> 기준 우상단).
 *   - M2 테마 C Step 2 (2026-06-16): 사용자 결정으로 좌측 패널 **상단**으로 이전.
 *     우상단 absolute 래퍼 제거 → 패널 내부 인라인 레이아웃. 구독 로직은
 *     AuthSessionProvider 로 추출(단일 구독), 본 컴포넌트는 표현 전용.
 *
 * 3가지 상태:
 *   1. loading — 초기 getUser() 왕복 중. null 렌더(FOUC 최소화).
 *   2. !email  — 비로그인. "Sign in" 링크만 (/login 페이지로 이동 — 폼은 그대로).
 *   3. email   — 이메일 + Log out.
 *
 * 닫힘 시 접근성:
 *   패널이 닫혀 있을 땐 rail 하단의 RailAccount(작은 계정 점)가 접근점.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/providers/AuthSessionProvider";

export function UserMenu() {
  const { email, loading, signingOut, signOut } = useAuthSession();

  // 초기 세션 확인 중 — 깜빡임 방지로 아무것도 렌더하지 않음.
  if (loading) {
    return null;
  }

  // ─── 비로그인 ───────────────────────────────────────
  if (!email) {
    return (
      <div className="flex flex-col gap-2 border-b border-foreground/15 p-4">
        <div className="flex items-center gap-2">
          {/* 흐린 점 = "계정 없음" 표식 (rail RailAccount 의 사람 아이콘과 의미 통일) */}
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-full border border-foreground/20 bg-transparent"
          />
          <span className="font-sans text-[13px] text-foreground/50">
            Not signed in
          </span>
        </div>
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ─── 로그인 ─────────────────────────────────────────
  const initial = email.charAt(0).toUpperCase();

  return (
    <div
      className="flex flex-col gap-2 border-b border-foreground/15 p-4"
      data-testid="user-menu"
    >
      <div className="flex items-center gap-2">
        {/* 아바타 — 이메일 첫 글자 (RailAccount 의 이니셜과 동일 출처) */}
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[11px] uppercase text-foreground/80"
        >
          {initial}
        </span>
        <span
          className="min-w-0 flex-1 truncate font-sans text-[13px] text-foreground/80"
          title={email}
        >
          {email}
        </span>
      </div>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          disabled={signingOut}
        >
          {signingOut ? "Signing out..." : "Log out"}
        </Button>
      </div>
    </div>
  );
}

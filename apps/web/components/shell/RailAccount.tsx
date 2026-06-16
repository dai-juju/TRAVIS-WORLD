"use client";
/**
 * RailAccount — rail 하단 계정 점 (M2 테마 C Step 2 / Sub-step 0).
 *
 * 왜 필요한가:
 *   좌측 패널은 기본 "닫힘" 상태라, 계정 위젯(UserMenu)을 패널 안에만 두면
 *   패널을 열기 전엔 로그인 상태/입구가 안 보인다. 항상 노출되는 rail 하단에
 *   작은 계정 표식을 둬, 닫힘 상태에서도 로그인 상태를 노출하고 접근점을 준다.
 *
 * 표시:
 *   - 로그인  → 이메일 첫 글자 이니셜 (UserMenu 아바타와 동일 출처)
 *   - 비로그인 → 사람 아이콘 (흐리게)
 *   - loading → 빈 점 (깜빡임 방지)
 *
 * 동작 (사용자 확정 2026-06-16):
 *   클릭 → 패널 열기(setLeft(true)). "rail=손잡이, 패널=내용" 단일 멘탈 모델 —
 *   열린 패널 상단의 UserMenu 에서 Log out / Sign in 에 도달한다.
 *
 * a11y — 중첩 인터랙티브 금지:
 *   PanelRail 의 토글 버튼과 형제(sibling)로 배치된다 (PanelRail 의 footer 슬롯).
 *   버튼 안의 버튼이 되지 않도록 PanelRail 루트를 div 컨테이너로 변경했다.
 */
import { User } from "lucide-react";

import { useAuthSession } from "@/lib/providers/AuthSessionProvider";
import { useUiShellStore } from "@/lib/providers/UiShellStoreProvider";

export function RailAccount() {
  const { email, loading } = useAuthSession();
  const setLeft = useUiShellStore((s) => s.setLeft);

  const initial = email ? email.charAt(0).toUpperCase() : null;
  // loading 중엔 email 이 아직 null 이라 "Sign in" 으로 굳으면 로그인 유저를 잠깐
  //   오인한다 → 중립 "Account" 로. 확정 후에만 Open/Sign in 으로 분기 (W4).
  const label = loading ? "Account" : email ? "Open account panel" : "Sign in";

  return (
    <button
      type="button"
      onClick={() => setLeft(true)}
      aria-label={label}
      aria-busy={loading}
      title={loading ? "Account" : (email ?? "Sign in")}
      className="flex size-6 items-center justify-center rounded-full border border-foreground/20 text-foreground/70 transition-colors hover:border-foreground/40 hover:bg-secondary hover:text-foreground"
    >
      {loading ? null : initial ? (
        <span className="font-mono text-[10px] uppercase leading-none">
          {initial}
        </span>
      ) : (
        <User className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

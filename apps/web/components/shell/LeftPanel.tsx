"use client";
/**
 * LeftPanel — 좌측 패널 내용 (M2 테마 C).
 *
 * 2단 레이아웃 (사용자 확정 2026-06-16):
 *   ┌ 상단: 계정 영역 (UserMenu — 이메일+Log out / Sign in)
 *   └ 하단: "My Views" 저장 뷰 목록
 *
 * 진행 상태:
 *   - Sub-step 0 (2026-06-16): 상단 계정 영역 이전.
 *   - Sub-step 3 (2026-06-16): 하단 My Views = 저장/목록/복원/삭제 (MyViews).
 */
import { UserMenu } from "@/components/auth/UserMenu";
import { MyViews } from "@/components/shell/MyViews";

export function LeftPanel() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* 상단: 계정 영역 (loading 중엔 null 렌더 → 잠깐 빈 칸) */}
      <UserMenu />

      {/* 하단: My Views — 저장 뷰 CRUD */}
      <MyViews />
    </div>
  );
}

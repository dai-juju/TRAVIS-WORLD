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
 *   - Step 4 Sub-step 4 (2026-06-18): My Views 아래 Custom Instructions 섹션 추가.
 *     My Views 가 flex-1 스크롤 영역을 차지하고, Custom Instructions 는 자연
 *     높이로 패널 하단에 고정된다(shrink-0).
 */
import { UserMenu } from "@/components/auth/UserMenu";
import { MyViews } from "@/components/shell/MyViews";
import { CustomInstructions } from "@/components/shell/CustomInstructions";

export function LeftPanel() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* 상단: 계정 영역 (loading 중엔 null 렌더 → 잠깐 빈 칸) */}
      <UserMenu />

      {/* 중단: My Views — 저장 뷰 CRUD (flex-1 스크롤 영역) */}
      <MyViews />

      {/* 하단: Custom Instructions — 자유텍스트 AI 프리퍼런스 (하단 고정) */}
      <div className="shrink-0">
        <CustomInstructions />
      </div>
    </div>
  );
}

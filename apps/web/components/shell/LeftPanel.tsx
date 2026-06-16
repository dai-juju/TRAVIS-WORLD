"use client";
/**
 * LeftPanel — 좌측 패널 내용 (M2 테마 C).
 *
 * 2단 레이아웃 (사용자 확정 2026-06-16):
 *   ┌ 상단: 계정 영역 (UserMenu — 이메일+Log out / Sign in)
 *   └ 하단: "My Views" 저장 뷰 목록
 *
 * 진행 상태:
 *   - Sub-step 0 (2026-06-16): 상단 계정 영역 이전 완료. 하단 My Views 는 아직
 *     placeholder — Sub-step 3 (saved_views UI)에서 저장 버튼/목록/복원으로 채운다.
 */
import { UserMenu } from "@/components/auth/UserMenu";

export function LeftPanel() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* 상단: 계정 영역 (loading 중엔 null 렌더 → 잠깐 빈 칸) */}
      <UserMenu />

      {/* 하단: My Views (Sub-step 3 에서 저장 뷰 CRUD 로 채움) */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
          My Views
        </h2>
        <p className="font-sans text-[12px] leading-relaxed text-foreground/40">
          Saved views will appear here — reconnect a past view with live data in
          one click. Coming in a later step.
        </p>
      </div>
    </div>
  );
}

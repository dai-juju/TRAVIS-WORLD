/**
 * (auth) Route Group Layout — 로그인/회원가입 전용 centered 컨테이너 (M1.6 Step 1b).
 *
 * Next.js App Router 의 Route Group 기능 (괄호 `(...)`) 을 사용해 `/login`, `/signup`
 * URL 에는 영향을 주지 않으면서 이 두 페이지만 별도 레이아웃을 갖도록 격리.
 *
 * 기본 RootLayout(Provider 스택)은 상속되므로 ThemeProvider/ToastStoreProvider/
 * CanvasStoreProvider/ChatStoreProvider 가 그대로 감싸지지만, Canvas 는 렌더되지
 * 않는다(이 layout 에서 children 만 그림).
 *
 * 서버 컴포넌트 유지 — "use client" 없음. metadata 필요 시 각 page.tsx 에서 export.
 */

import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

/**
 * TRAVIS 루트 페이지 placeholder.
 * Step 3b — Tailwind 유틸리티 + shadcn zinc 토큰이 적용된 최소 랜딩.
 * M1.4에서 React Flow 캔버스 + 채팅 입력 바 레이아웃으로 교체 예정.
 *
 * 서버 컴포넌트 유지 ("use client" 금지) — Zustand store·Supabase 클라이언트는
 * 이 파일에서 직접 import하지 않는다 (roadmap-milestone-manager 필수 검증 ⑤).
 */
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">TRAVIS — Shape your market</h1>
    </main>
  );
}

"use client";
/**
 * LeftPanel — "My Views" 저장 뷰 목록 패널 (M2 테마 C Step 0: 빈 placeholder).
 *
 * Step 0 은 골격만. 저장 뷰 목록 / 저장 버튼 / 클릭 로드는 Step 2(saved_views
 * 영속화)에서 채운다. 지금은 무엇이 들어올 자리인지 알리는 안내만.
 */
export function LeftPanel() {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
        My Views
      </h2>
      <p className="font-sans text-[12px] leading-relaxed text-foreground/40">
        Saved views will appear here — reconnect a past view with live data in
        one click. Coming in a later step.
      </p>
    </div>
  );
}

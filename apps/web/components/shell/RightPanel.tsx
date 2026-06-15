"use client";
/**
 * RightPanel — "Session Log" 세션 채팅/AI 로그 패널 (M2 테마 C Step 0: placeholder).
 *
 * Step 0 은 골격만. chatStore.history 구독 + 가상 스크롤 렌더는 Step 3 에서 채운다.
 * (crypto-trader 자문: 순수 읽기 전용이면 효용이 낮음 → Step 3 에서 "재실행"
 *  결합 여부를 사용자와 결정. 지금은 자리만.)
 */
export function RightPanel() {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
        Session Log
      </h2>
      <p className="font-sans text-[12px] leading-relaxed text-foreground/40">
        Your queries and AI responses from this session will appear here.
        Clears on refresh. Coming in a later step.
      </p>
    </div>
  );
}

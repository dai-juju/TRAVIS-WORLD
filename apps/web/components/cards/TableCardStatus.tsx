"use client";
/**
 * 카드 상태 표시 부품 — [10-76] 분할 (2026-07-05, TableCard.tsx 에서 추출).
 *
 * 데이터 종류와 무관한 "상태 한 줄" 표시 — form 컴포넌트들이 공유한다
 * (TableCard 사용 중, Feed form 등 후속 form 도 재사용 대상). English-only.
 */

/** 상태 한 줄 (coming soon / error / no matches 등). */
export function StatusLine({
  tone,
  children,
}: {
  tone: "neutral" | "down";
  children: string;
}) {
  const color = tone === "down" ? "var(--down)" : "var(--ink-4)";
  return (
    <div
      className="p-3 font-mono text-[10px] uppercase tracking-[0.15em]"
      style={{ color }}
    >
      {children}
    </div>
  );
}

/** 로딩 vs 8초+ 정체 stale 분기 (두 옛 카드와 동일 패턴). */
export function LoadingOrStale({ stale }: { stale: boolean }) {
  if (stale) {
    return (
      <div className="space-y-1 p-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <div className="text-[color:var(--ink-4)]">··· loading (8s+)</div>
        <div className="text-[color:var(--down)] normal-case tracking-normal">
          connection issue — check Supabase/worker status
        </div>
      </div>
    );
  }
  return <StatusLine tone="neutral">··· loading</StatusLine>;
}

// apps/web/lib/format/relativeTime.ts
//
// updated_at 같은 timestamp 를 "3m ago" 류 상대시간 문자열로 변환 (M2 테마 A Step 2).
//
// 용도: IndicatorCard 의 freshness 라인. OI/LSR/taker 는 ~5분 폴링이라 숫자가 거의
//   안 변해 "멈춘 것처럼" 보일 수 있다 (crypto-trader Q5 자문). 마지막 갱신 시각을
//   상대시간으로 노출해 "살아있음" 신호를 준다.
//
// 순수 함수 — now(ms)를 인자로 받아 테스트 결정성 확보 (Date.now() 직접 호출 X).

/**
 * ISO timestamp → 상대시간 문자열.
 *
 * @example
 *   formatRelativeTime("2026-06-09T08:00:00Z", t+3000)    → "just now"
 *   formatRelativeTime("2026-06-09T08:00:00Z", t+42000)   → "42s ago"
 *   formatRelativeTime("2026-06-09T08:00:00Z", t+180000)  → "3m ago"
 *   formatRelativeTime(null, ...)                          → "—"
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  nowMs: number,
): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

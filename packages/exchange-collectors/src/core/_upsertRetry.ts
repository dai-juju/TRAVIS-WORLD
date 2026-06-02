// ============================================================
// Upsert 재시도 래퍼 (M1.3 Step 4 사후 보강 — 2026-04-20).
//
// 배경:
//   1시간 smoke 결과 Supabase upsert가 간헐적으로 실패하는 패턴 2종 발견.
//     [A] Postgres deadlock (에러 메시지 "deadlock detected", SQLSTATE 40P01)
//         원인: 동일 테이블에 동시 upsert가 lock 획득 순서 비결정으로 circular wait.
//     [B] 네트워크 일시 단절 ("fetch failed" 혹은 Cloudflare 502/503/504)
//         원인: Supabase 상위 인프라 또는 로컬 네트워크 flap.
//
//   둘 다 **재시도 시 자연 해소**되는 transient 성격. 현재 코드는 한 번 실패하면
//   해당 폴링 주기의 데이터가 통째로 버려져 "몇 초간 갱신 구멍" 발생.
//
// 동작:
//   - op() 실행 → Result<T> 반환.
//   - success === false 이고 error 문자열이 **재시도 대상 패턴**이면
//     baseDelayMs * (3^(attempt-1)) 대기 후 재시도 (100ms → 300ms).
//   - maxAttempts 초과 시 **마지막 실패 Result를 그대로 반환** (crash 금지).
//   - 재시도 시도마다 console.warn으로 label + attempt + error 로그.
//
// 재시도하지 않는 에러:
//   - 스키마 위반 (컬럼 없음, 타입 불일치) — 재시도해도 같은 에러
//   - RLS 정책 위반 — 영구적 권한 문제
//   - 인증 만료 — 재시도 전에 토큰 갱신 필요
//   → 이런 에러는 **1회 실패 → 즉시 반환** (호출부 기존 로그 그대로 흘러감).
//
// M1.9 Step 1 (2026-06-02): apps/worker → packages/exchange-collectors 이동 (로직 변경 0).
//   worker 의 task 가 import 하던 경로를 @travis/exchange-collectors 로 재배선.
// ============================================================

import type { Result } from "@travis/data-service";

export interface RetryOpts {
  /** 로그 prefix용 — 예: "tickerFuturesTask usdm" */
  label: string;
  /** 최초 시도 포함 총 시도 횟수. 기본 3 (최초 + 재시도 2회). */
  maxAttempts?: number;
  /** 첫 재시도 전 대기 ms. 이후 3배씩 증가. 기본 100 (100 → 300). */
  baseDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * transient 실패(deadlock/network)에 한해 재시도하는 래퍼.
 *
 * @param op 재시도 가능한 작업. 반드시 `Result<T>`를 반환(throw 금지 규약 준수).
 * @param opts 라벨/시도 횟수/지연.
 * @returns 최종 Result<T> — 성공이든 실패든 호출부는 기존과 동일하게 처리.
 */
export async function retryOnTransient<T>(
  op: () => Promise<Result<T>>,
  opts: RetryOpts,
): Promise<Result<T>> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let last: Result<T> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await op();
    if (res.success) return res;

    last = res;

    // 마지막 시도면 재시도 없이 바로 실패 반환.
    if (attempt >= maxAttempts) break;

    // 재시도 대상 여부 판정. 아닐 경우 즉시 반환(무의미한 backoff 방지).
    if (!isTransientError(res.error)) return res;

    const delayMs = baseDelayMs * 3 ** (attempt - 1);
    console.warn(
      `[retryOnTransient] ${opts.label} attempt ${attempt}/${maxAttempts} 실패 — ${delayMs}ms 후 재시도: ${truncate(res.error)}`,
    );
    await sleep(delayMs);
  }

  return last!;
}

// ─── 내부 유틸 ───────────────────────────────────

/**
 * transient(재시도 가능) 에러 문자열 판정.
 *
 * 로그 실측 샘플 ("deadlock detected", "TypeError: fetch failed",
 * "<html>...502 Bad Gateway...</html>") 을 기반으로 패턴 리스트를 구성.
 * 단순 대소문자 무시 `includes` 매칭으로 충분 — 정규식은 오버엔지니어링.
 */
export function isTransientError(errMsg: string): boolean {
  const s = errMsg.toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => s.includes(p));
}

const TRANSIENT_PATTERNS: readonly string[] = [
  // Postgres deadlock — SQLSTATE 40P01
  "deadlock detected",
  // Node/undici fetch 일반 실패 ("TypeError: fetch failed")
  "fetch failed",
  // Cloudflare / upstream 일시 장애
  "502",
  "503",
  "504",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  // TCP 단절 계열
  "econnreset",
  "etimedout",
  "econnrefused",
  // Supabase 자체 throttle (드물지만 관찰됨)
  "too many requests",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 재시도 로그를 간결하게 — 502 Bad Gateway HTML 전문이 흘러 들어와도 80자 cut. */
function truncate(s: string, max = 80): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

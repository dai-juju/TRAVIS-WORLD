// ============================================================
// 어댑터 공통 유틸 (M1.3 Step 3 code-reviewer C-3/W-3 반영).
//
// 어댑터(Binance Spot/USDM/COINM)가 공유하는 헬퍼를 한 곳에.
// OKX/Bybit/Bitget 어댑터가 추가될 때도 이 파일만 import하면 되도록
// "거래소 무관" 유틸만 둔다. 거래소 고유 로직은 절대 넣지 말 것.
// ============================================================

/** per-symbol 요청 간 sleep (rate-limit 보호용). */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * batchPerSymbol의 부분 실패 로그를 통일된 포맷으로.
 * label은 "USDM openInterest" 같이 어떤 엔드포인트 배치인지 식별.
 */
export function logPartialFailures(
  label: string,
  failed: Array<{ symbol: string; error: string }>,
): void {
  if (failed.length === 0) return;
  const preview = failed.slice(0, 3).map((f) => `${f.symbol}: ${f.error}`);
  console.warn(
    `[${label}] ${failed.length}개 심볼 실패 (일부 예시: ${preview.join(", ")})`,
  );
}

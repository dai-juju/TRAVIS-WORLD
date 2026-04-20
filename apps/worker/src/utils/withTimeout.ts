// ============================================================
// withTimeout — Promise 타임아웃 가드 (M1.3 Step 5 hot-patch).
//
// 용도:
//   Supabase 간헐 장애 / 네트워크 hang 으로 부팅 시퀀스가 무한 대기에
//   빠지는 것을 방지. 타임아웃 시 reject → 호출측이 graceful 처리
//   (빈 결과 반환 / degraded mode 진입) 담당.
//
// 설계 원칙 (CLAUDE.md):
//   - crash 금지: 본 헬퍼는 reject 만 담당. 호출측이 catch 해서 처리.
//   - 확장성: 특정 서비스에 종속되지 않는 generic 유틸.
//
// 사용 예:
//   const rows = await withTimeout(dataService.getSymbols({...}), 60_000, "getSymbols(spot)");
// ============================================================

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[withTimeout] ${label} timeout (${ms}ms 초과)`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

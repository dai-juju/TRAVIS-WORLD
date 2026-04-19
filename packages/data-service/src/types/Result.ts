// Result<T> — dataService 전용 에러 처리 래퍼.
//
// CLAUDE.md "절대 crash 금지" 원칙과 IExchangeAdapter의 FetchResult 패턴에
// 맞춰 success/error 판별 유니온으로 감싼다. 호출자는 throw를 catch할 필요 없이
// `if (res.success)`로 분기만 하면 된다.
//
// 쓰기 메서드가 반환값이 필요 없을 때는 `Result<void>`로 명시한다.
// Supabase insert/upsert는 기본적으로 삽입된 행을 반환하지 않는 RETURNING
// 생략 형태로 호출하므로 void가 충분 (필요 시 .select() 추가).

export type Result<T> = { success: true; data: T } | { success: false; error: string };

/** 성공 헬퍼 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/** 실패 헬퍼 — Supabase PostgrestError의 message/code를 문자열로 납작화 */
export function err(message: string): Result<never> {
  return { success: false, error: message };
}

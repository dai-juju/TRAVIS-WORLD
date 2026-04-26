// apps/web/lib/dataService/payload.ts
//
// Realtime payload 추출 유틸 (M1.6 Step 3 Substep 3a, 2026-04-26).
//
// 옛 apps/web/lib/hooks/_realtimeInternal.ts 의 extractNewRow / extractOldRow 함수를
// dataService 안으로 이동. 시그니처/동작 동일. 테스트도 그대로 이전.
//
// 분리 이유:
//   - channelManager / hooks 둘 다 import (코드 재사용)
//   - 순수 함수 — 테스트 모킹 쉬움

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * INSERT / UPDATE 페이로드에서 new row 안전 추출.
 * new 가 비어있거나 빈 객체면 null.
 */
export function extractNewRow<T extends Record<string, unknown>>(
  payload: RealtimePostgresChangesPayload<T>,
): T | null {
  const next = (payload as { new?: T | Record<string, never> }).new;
  if (!next || Object.keys(next).length === 0) return null;
  return next as T;
}

/**
 * DELETE 페이로드에서 old row 추출.
 * REPLICA IDENTITY 정책에 따라 부분 row 가능 → 호출자가 PK 컬럼만 안전하게 사용해야 함.
 */
export function extractOldRow<T extends Record<string, unknown>>(
  payload: RealtimePostgresChangesPayload<T>,
): Partial<T> | null {
  const prev = (payload as { old?: Partial<T> }).old;
  if (!prev || Object.keys(prev).length === 0) return null;
  return prev;
}

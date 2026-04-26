// apps/web/lib/logging/createLogger.ts
//
// 로그 INSERT wrapper 공통 factory (M1.6 Step 3 Substep 3c, 2026-04-26).
//
// ─── 회수 항목 ─────────────────────────────────────
// [3-27] logChat / logValidationFailure / logBehavior 가 ~90% 동일 boilerplate.
// 3 파일 동일 골격 → factory 로 추출. 라인 절감 + "로깅 정책 변경 1 곳 전파" 효과.
//
// ─── 공통 골격 ────────────────────────────────────
// 1) lazy SupabaseDataService singleton (cold-start 시점만 env 검증 + client 생성)
// 2) try/catch 격리 (절대 throw 금지 — 사용자 응답 / 분석 데이터 둘 다 보호)
// 3) MissingSupabaseServiceRoleError 분기 분리 (env 누락 진단 메시지)
// 4) console.error 표준 포맷 (`[loggerName] ...`)
//
// ─── 호출자 책임 ──────────────────────────────────
// - name: console 로그 prefix (예: "logChat")
// - toRow: TInput → TInsert 매핑 (JSON 직렬화 / 길이 가드 / payload size 가드 등)
// - insert: SupabaseDataService 의 적절한 insert 메서드 호출
//
// ─── 설계 노트 ────────────────────────────────────
// - factory 가 instance 별로 독립 cache 보유 — 테스트 격리에 유리.
//   logChat 과 logValidationFailure 가 같은 service 인스턴스를 공유해도 무방하지만,
//   테스트 mocking 시 dependency 가 모듈 경계로 명확히 분리됨.
// - payload size 가드는 호출자의 toRow 안에서 처리 (logger 별 가드 의미가 다름 —
//   logChat 의 query_text slice(500) 과 logBehavior 의 payload 5KB 는 다른 정책).

import { SupabaseDataService } from "@travis/data-service";
import type { Result } from "@travis/data-service";

import {
  getSupabaseServiceRoleClient,
  MissingSupabaseServiceRoleError,
} from "@/lib/supabase/serviceRoleClient";

/**
 * createLogger 호출 시 주입하는 설정.
 *
 * @template TInput  외부 호출자가 전달하는 입력 타입 (예: LogChatInput)
 * @template TInsert SupabaseDataService 가 받는 row 타입 (예: ChatLogInsert)
 */
export interface LoggerConfig<TInput, TInsert> {
  /** console 로그 prefix (예: "logChat" / "logValidationFailure" / "logBehavior") */
  name: string;
  /**
   * Input → Insert row 매핑. JSON 직렬화 / 길이 가드 / payload size 가드 등
   * 호출자 정책을 여기서 적용.
   * 절대 throw 하지 않도록 호출자가 try/catch 또는 안전 직렬화 패턴 적용.
   */
  toRow: (input: TInput) => TInsert;
  /**
   * SupabaseDataService 의 적절한 insert 메서드 호출.
   * 예: (svc, row) => svc.insertChatLog(row)
   */
  insert: (
    service: SupabaseDataService,
    row: TInsert,
  ) => Promise<Result<void>>;
}

/**
 * 로그 INSERT wrapper 생성. 반환된 함수는 절대 throw 하지 않음.
 *
 * @example
 * export const logChat = createLogger<LogChatInput, ChatLogInsert>({
 *   name: "logChat",
 *   toRow: (input) => ({ user_id: input.userId, ... }),
 *   insert: (svc, row) => svc.insertChatLog(row),
 * });
 *
 * @returns 호출 시 Promise<boolean> (성공 true / 실패 false). 실패 시 console.error 만 기록.
 */
export function createLogger<TInput, TInsert>(
  config: LoggerConfig<TInput, TInsert>,
): (input: TInput) => Promise<boolean> {
  // factory 인스턴스별 lazy SupabaseDataService 캐시.
  // 모듈 단위 singleton 이라 호출 측에서 추가 cache 불필요.
  let cachedService: SupabaseDataService | null = null;

  function getService(): SupabaseDataService {
    if (cachedService) return cachedService;
    cachedService = new SupabaseDataService(getSupabaseServiceRoleClient());
    return cachedService;
  }

  return async function loggerFn(input: TInput): Promise<boolean> {
    try {
      const service = getService();
      const row = config.toRow(input);
      const result = await config.insert(service, row);
      if (!result.success) {
        console.error(`[${config.name}] INSERT 실패: ${result.error}`);
        return false;
      }
      return true;
    } catch (err) {
      // env 누락 / 직렬화 실패 / 네트워크 예외 — 절대 throw 하지 않음.
      // 호출자(route.ts)는 fallback 또는 success 응답을 이미 반환 중이므로
      // 이 함수 실패가 사용자에게 노출되어선 안 됨.
      if (err instanceof MissingSupabaseServiceRoleError) {
        console.error(`[${config.name}] ${err.message}`);
      } else {
        console.error(
          `[${config.name}] 예외: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return false;
    }
  };
}

/**
 * payload 객체를 JSON 으로 직렬화하되 maxBytes 초과 시 truncation.
 * Substep 3d 의 sessionFlusher 가 log_behavior.payload 5KB 제약 강제 시 사용.
 *
 * @param payload 직렬화 대상 (보통 Record<string, unknown>)
 * @param maxBytes JSON 문자열 길이 상한 (UTF-16 char 단위 ≈ ASCII 기준 byte)
 * @param fieldName console.warn 메시지에 표시될 필드 이름
 * @returns 안전하게 직렬화된 객체. 초과 시 { __truncated: true, originalSize, fieldName }
 */
export function ensurePayloadSize<T>(
  payload: T,
  maxBytes: number,
  fieldName: string,
): T | { __truncated: true; originalSize: number; fieldName: string } {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { __truncated: true, originalSize: 0, fieldName };
  }
  if (serialized.length <= maxBytes) return payload;
  console.warn(
    `[ensurePayloadSize] ${fieldName} payload ${serialized.length}B exceeds ${maxBytes}B — truncating`,
  );
  return { __truncated: true, originalSize: serialized.length, fieldName };
}

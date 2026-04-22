/**
 * formatZodError — ZodError 를 AI self-correction 프롬프트용 영문 bullet 으로 변환.
 *
 * M1.5 Step 2b (2026-04-22): AI 가 emit 한 JSON 이 Zod safeParse 에 실패했을 때,
 * 다음 재시도에서 AI 에게 "어디가 어떻게 틀렸는지" 알려주는 feedback 생성기.
 *
 * 설계 (zod-schema-architect 자문 2026-04-22 반영):
 *   - English bullet (`.describe()` 가 영문이라 일관성 유지)
 *   - `path` + `message` + `code` 3요소 (코드는 모델이 invalid_enum_value 등 타입 인식에 도움)
 *   - 최대 10개 issue 만 노출 (Zod 가 N중첩 필드에서 issue 폭발 방지)
 *   - invalid_union / invalid_enum_value 는 `unionErrors` / `options` 덧붙여 교정 정확도 ↑
 *
 * 출력 예시:
 *   - cards.0.updateMode: Invalid enum value. Expected 'value' | 'content', received 'valu' (invalid_enum_value)
 *   - cards.1.data: Unrecognized key(s) in object: 'market_type' (unrecognized_keys)
 *   - cards.0.size: Invalid enum value. Expected 'xs' | 'sm' | 'md' | 'lg' | 'xl', received 'small' (invalid_enum_value)
 *
 * 사용:
 *   const feedback = `Your previous response failed validation:\n${formatZodError(err)}\n` +
 *                    `Re-emit the orchestration payload with corrections.`;
 */

import type { z } from "zod";

export interface FormatZodErrorOptions {
  /** 최대 노출할 issue 수 (기본 10). 초과 시 "... and N more" 로 요약. */
  maxIssues?: number;
}

/**
 * ZodError.issues 를 영문 bullet 문자열로 포맷한다.
 * AI self-correction 재시도 프롬프트에 그대로 삽입 가능한 형태.
 */
export function formatZodError(
  error: z.ZodError,
  options: FormatZodErrorOptions = {},
): string {
  const { maxIssues = 10 } = options;
  const { issues } = error;

  const bullets = issues.slice(0, maxIssues).map((issue) => {
    const path = issue.path.join(".") || "<root>";
    return `- ${path}: ${issue.message} (${issue.code})`;
  });

  const extra =
    issues.length > maxIssues
      ? `\n- ... and ${issues.length - maxIssues} more issue(s)`
      : "";

  return bullets.join("\n") + extra;
}

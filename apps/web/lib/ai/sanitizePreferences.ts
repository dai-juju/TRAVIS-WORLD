/**
 * sanitizePreferences — 사용자 자유텍스트 Custom Instructions 정화기.
 *
 * M2 테마 C Step 4 Sub-step 1 (2026-06-18):
 *   사용자가 입력한 자유텍스트(트레이딩 선호도)를 시스템 프롬프트의
 *   <user_preferences> 블록에 주입하기 전에 거치는 방어선.
 *
 *   프롬프트 인젝션 5겹 방어 중 이 파일이 담당하는 것은 **③ 구분자 탈출 차단**:
 *   - (b) 길이 상한 (토큰/비용 폭주 + "장문 명령 주입" 동시 차단)
 *   - (c) XML 구분자 이스케이프 (우리 시스템 마커 `<user_preferences>` /
 *         `</guardrails>` 위조 불가능하게)
 *   - (d) 명백한 역할 위조 라인만 보수적 제거 (보조 방어)
 *
 *   ①프레이밍 + ②우선순위 고정은 buildSystemPrompt 의 <user_preferences>
 *   블록 문구가 담당. ④출력단 백스톱·⑤RLS 폭발반경은 기존 구조.
 *
 * 설계 원칙 (CLAUDE.md "절대 crash 금지"):
 *   순수 함수, throw 없음. 무엇이 들어와도 안전한 문자열을 반환한다.
 *   ★과도한 필터링 금지 — 정상 트레이더 문구("ignore low-volume coins" 같은
 *   정상 표현)를 훼손하지 않는다. 핵심 방어선은 (b)길이 + (c)이스케이프 +
 *   프롬프트 framing 이고, (d)마커 제거는 어디까지나 보조다.
 *
 * 공식 문서 근거 (Anthropic "data not instructions" 권장):
 * - https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
 * - 조회일: 2026-06-18
 */

/**
 * Custom Instructions 자유텍스트 최대 길이(문자 수).
 *
 * 800자는 (a) 일반적인 선호도 서술에 충분하고 (b) 시스템 프롬프트 토큰 예산을
 * 크게 늘리지 않으며 (c) "장문 인젝션 페이로드" 의 표현 공간을 제한한다.
 * UI 입력 단(Sub-step 3~4)에서도 동일 상수를 공유해 저장 전 1차 컷을 권장.
 */
export const MAX_CUSTOM_INSTRUCTIONS_CHARS = 800;

/**
 * 보조 방어 (d): 명백한 "역할/대화 턴 위조" 또는 "지시 무력화" 시도로만 보이는
 * 라인을 보수적으로 무력화하기 위한 패턴.
 *
 * ★최소·안전 원칙:
 *   - "ignore previous instructions" / "disregard the above" 처럼 우리 규칙을
 *     무시하라는 **명령형 라인** 만 좁게 잡는다.
 *   - "system:" / "assistant:" / "human:" 처럼 **대화 턴 헤더를 위조** 하는
 *     라인 접두만 잡는다.
 *   - 정상 트레이더 표현("ignore low-volume coins" 등)을 훼손하지 않도록,
 *     매치 부위만 좁게 **제거**(빈 문자열 치환)한다. 위조-only 입력이면
 *     제거 후 빈 문자열이 되어 <user_preferences> 섹션 자체가 생략된다.
 *
 * 주의: (c) 이스케이프가 이미 XML 구분자 위조를 사실상 무력화하므로, 여기서는
 * "역할/턴 위조" 와 "규칙 무시 명령" 두 부류만 보수적으로 본다.
 */
const ROLE_SPOOF_PATTERNS: ReadonlyArray<RegExp> = [
  // 대화 턴 헤더 위조: 줄 맨 앞의 system: / assistant: / human: / user:
  // (정상 문장 중간의 "the system: ..." 은 건드리지 않도록 줄머리(^)에 한정)
  /^\s*(system|assistant|human|user)\s*:/gim,
  // 우리 규칙을 무시/무력화하라는 전형적 명령형 라인
  /\b(ignore|disregard|forget|override)\b[^\n]{0,40}\b(previous|prior|above|earlier|all)\b[^\n]{0,20}\b(instructions?|prompts?|rules?|guardrails?)\b/gi,
  // 프롬프트/시스템 메시지 공개 요구
  /\b(reveal|print|show|output|repeat|disclose)\b[^\n]{0,30}\b(system\s*prompt|your\s*instructions?|the\s*prompt)\b/gi,
];

/**
 * 자유텍스트 Custom Instructions 를 시스템 프롬프트 주입용으로 정화한다.
 *
 * 처리 순서:
 *   (a) null / undefined / 공백만  → "" (섹션 자체 생략 신호)
 *   (b) trim 후 800자 초과 → graceful truncate (throw 금지)
 *   (c) `<` → `&lt;`, `>` → `&gt;` (우리 XML 구분자 위조 차단)
 *   (d) 역할/턴 위조·규칙 무시 명령형 부위만 보수적으로 제거
 *
 * @param raw 사용자 입력 자유텍스트 (preferences.customInstructions)
 * @returns 안전한 주입용 문자열. 빈 입력이면 "".
 */
export function sanitizeCustomInstructions(
  raw: string | undefined | null,
): string {
  // (a) 빈 입력 — 섹션을 통째로 생략하라는 신호로 "" 반환
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  // (b) 길이 상한 — graceful truncate. 비용/토큰 + 장문 인젝션 동시 차단.
  const bounded =
    trimmed.length > MAX_CUSTOM_INSTRUCTIONS_CHARS
      ? trimmed.slice(0, MAX_CUSTOM_INSTRUCTIONS_CHARS)
      : trimmed;

  // (c) XML 구분자 이스케이프 — 우리 시스템 마커(<user_preferences> 등) 위조 차단.
  //     `&` 자체는 굳이 건드리지 않는다(정상 텍스트 "BTC & ETH" 보존 우선).
  //     핵심은 `<`/`>` 로 새 태그를 못 열게 하는 것.
  const escaped = bounded.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // (d) 보조: 명백한 역할/턴 위조·규칙 무시 명령형 부위만 좁게 제거.
  let redacted = escaped;
  for (const pattern of ROLE_SPOOF_PATTERNS) {
    redacted = redacted.replace(pattern, "");
  }

  // 제거 후 다중 공백/개행 정리 (자연스러운 잔여 텍스트 유지).
  // 전체가 위조 시도였다면 여기서 빈 문자열이 되어 섹션이 생략된다.
  const finalText = redacted.replace(/[ \t]{2,}/g, " ").trim();
  return finalText.length === 0 ? "" : finalText;
}

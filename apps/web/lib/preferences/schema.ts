/**
 * preferences/schema — /api/preferences PUT body 검증 스키마
 *   (M2 테마 C Step 4 Sub-step 3, 2026-06-18).
 *
 * 자유텍스트 Custom Instructions 저장 요청의 입력 검증 단일 출처.
 *   - route.ts 와 단위 테스트가 동일 스키마를 공유(검증 로직 drift 차단).
 *   - 길이 상한은 sanitizePreferences 의 MAX_CUSTOM_INSTRUCTIONS_CHARS 재사용
 *     (UI 입력단 1차 컷 / 정화기 / API 저장 컷이 모두 같은 상수).
 *
 * ★ 빈 문자열 허용: customInstructions: "" 는 "프리퍼런스 지우기" 의 정상 신호다.
 *   (z.string().min(1) 을 쓰면 지우기가 막힌다.)
 *
 * ★ .strict(): customInstructions 외의 추가 키를 거부 — 클라이언트가 user_id 등을
 *   body 에 끼워 넣어도 스키마 단에서 잘려나간다(위장/바꿔치기 차단의 1차선).
 */

import { z } from "zod";

import { MAX_CUSTOM_INSTRUCTIONS_CHARS } from "@/lib/ai/sanitizePreferences";

export const PreferencesPutSchema = z
  .object({
    customInstructions: z.string().max(MAX_CUSTOM_INSTRUCTIONS_CHARS),
  })
  .strict();

export type PreferencesPutBody = z.infer<typeof PreferencesPutSchema>;

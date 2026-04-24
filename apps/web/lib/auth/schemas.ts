/**
 * Auth form Zod schemas (M1.6 Step 1b).
 *
 * 왜 공통 파일인가:
 *   - LoginForm / SignupForm 이 동일한 email/password 규칙을 쓰므로, 규칙 변경이
 *     한 곳에서 이루어지도록 DRY. 예: 비밀번호 최소 길이가 바뀌면 한 줄만 수정.
 *   - 테스트에서도 동일 schema import 가능 (M1.6 Step 1f 에서 RTL 재사용).
 *
 * 사용자 결정 (2026-04-24):
 *   - 비밀번호 최소 길이 = 8자
 *   - 이메일 형식 검증 = Zod 표준 email()
 *   - UI 메시지 = 영어 (English-only 정책)
 */

import { z } from "zod";

/** 이메일 + 비밀번호 공통 schema — Login/Signup 에서 재사용. */
export const emailPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** RHF 에서 쓰는 TS 타입. */
export type EmailPasswordValues = z.infer<typeof emailPasswordSchema>;

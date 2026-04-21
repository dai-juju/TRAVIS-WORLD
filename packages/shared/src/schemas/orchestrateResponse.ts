/**
 * OrchestrateResponse — M1.5 에서 `/api/orchestrate/route.ts` 가 반환할 JSON 형식.
 *
 * M1.4 Step 4-3 에서는 이 스키마를 "미래 contract" 로 먼저 심어두고, 프론트엔드
 * 의 ChatInputBar + actionDispatcher 가 **dummy handler 로 같은 shape 을 생성**
 * 하도록 한다. M1.5 에서 Claude Haiku 응답을 이 스키마로 Zod 검증한 뒤 동일
 * actionDispatcher 로 흘려보내면 프론트 코드 수정량이 최소가 된다.
 *
 * 설계 원칙:
 *   1. `cards` 는 최대 10 개 — 단일 프롬프트로 한 번에 생성되는 카드 수 제한 (UX 보호).
 *   2. `actions` 는 "카드 생성 이후 실행할 추가 인터랙션" 목록 — M1 에서는 보통
 *      비어 있고, M2 drill-down 확장 시 활용 예정. optional 로 두어 생략 허용.
 *   3. `notes` — AI 가 사용자에게 보여줄 짧은 설명(마크다운 아님, plain text).
 *      graceful fallback 시에도 "이유"를 전달할 채널로 활용.
 *   4. `.strict()` — 알 수 없는 필드가 오면 검증 실패 → AI 환각 조기 감지.
 */

import { z } from "zod";
import { AiCardConfigSchema, CardActionSchema } from "./aiCardConfig";

export const OrchestrateResponseSchema = z
  .object({
    cards: z
      .array(AiCardConfigSchema)
      .min(0)
      .max(10)
      .describe("생성할 카드 목록 (0~10장)"),
    actions: z
      .array(CardActionSchema)
      .optional()
      .describe("카드 생성 직후 실행할 인터랙션 (예: spawn chain) — 현재 M1 범위 밖"),
    notes: z
      .string()
      .max(200)
      .optional()
      .describe("사용자에게 보여줄 짧은 메모 (plain text, 200자 이내)"),
  })
  .strict();

export type OrchestrateResponse = z.infer<typeof OrchestrateResponseSchema>;

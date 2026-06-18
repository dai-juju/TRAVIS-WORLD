/**
 * @vitest-environment node
 *
 * PreferencesPutSchema 단위 테스트 (M2 테마 C Step 4 Sub-step 3).
 *
 * 핵심 불변식:
 *   (1) 800자 초과 → 거부 (max cap)
 *   (2) 800자 정확히 → 허용 (경계값)
 *   (3) 빈 문자열 → 허용 (= 프리퍼런스 지우기)
 *   (4) .strict() — customInstructions 외 추가 키(user_id 끼워넣기 등) 거부
 *   (5) 타입 불일치 / 누락 → 거부
 *
 * ★ user_id 바꿔치기 불가는 두 겹으로 보장된다:
 *   - 스키마 .strict() 가 body 의 user_id 추가 키 자체를 거부(이 테스트 #4).
 *   - route.ts 는 upsert 시 user_id 를 인증 user.id 로만 설정(body 무시) + RLS
 *     WITH CHECK 가 user_id=auth.uid() 강제. → 설계 레벨 차단(런타임 통합 테스트
 *     없이도 코드/RLS 로 구조적 보장).
 */

import { describe, expect, it } from "vitest";

import { MAX_CUSTOM_INSTRUCTIONS_CHARS } from "@/lib/ai/sanitizePreferences";
import { PreferencesPutSchema } from "../schema";

describe("PreferencesPutSchema — 길이 상한", () => {
  it("800자 초과 → 거부", () => {
    const tooLong = "a".repeat(MAX_CUSTOM_INSTRUCTIONS_CHARS + 1);
    const result = PreferencesPutSchema.safeParse({
      customInstructions: tooLong,
    });
    expect(result.success).toBe(false);
  });

  it("정확히 800자 → 허용 (경계값)", () => {
    const exact = "a".repeat(MAX_CUSTOM_INSTRUCTIONS_CHARS);
    const result = PreferencesPutSchema.safeParse({
      customInstructions: exact,
    });
    expect(result.success).toBe(true);
  });
});

describe("PreferencesPutSchema — 빈 문자열(지우기) 허용", () => {
  it('빈 문자열 "" → 허용', () => {
    const result = PreferencesPutSchema.safeParse({ customInstructions: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customInstructions).toBe("");
    }
  });
});

describe("PreferencesPutSchema — .strict() 추가 키 거부", () => {
  it("user_id 끼워넣기 → 거부 (위장 차단 1차선)", () => {
    const result = PreferencesPutSchema.safeParse({
      customInstructions: "ignore low-volume coins",
      user_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.success).toBe(false);
  });

  it("임의의 추가 키 → 거부", () => {
    const result = PreferencesPutSchema.safeParse({
      customInstructions: "focus on BTC",
      preferences: { evil: true },
    });
    expect(result.success).toBe(false);
  });
});

describe("PreferencesPutSchema — 타입/누락 거부", () => {
  it("customInstructions 누락 → 거부", () => {
    const result = PreferencesPutSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("customInstructions 가 string 이 아님 → 거부", () => {
    const result = PreferencesPutSchema.safeParse({ customInstructions: 123 });
    expect(result.success).toBe(false);
  });

  it("body 가 null → 거부", () => {
    const result = PreferencesPutSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("정상 트레이더 문구 → 허용 (회귀 가드)", () => {
    const result = PreferencesPutSchema.safeParse({
      customInstructions: "I trade Binance futures. Ignore low-volume coins.",
    });
    expect(result.success).toBe(true);
  });
});

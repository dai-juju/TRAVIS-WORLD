/**
 * @vitest-environment node
 *
 * loadCustomInstructions 단위 테스트 — graceful 로드 경로 회귀 가드.
 *
 * M2 테마 C Step 4 Sub-step 2 (2026-06-18):
 *   user_preferences JSONB → customInstructions 추출. 핵심 불변식:
 *     - 정상: preferences.customInstructions(string) → 그대로 반환
 *     - row 없음 / error / 비정형 JSONB / 공백 → undefined (주입 생략)
 *     - 조회가 throw 해도 graceful 흡수 → undefined (쿼리 막지 않음)
 *
 * supabase 인스턴스는 인자로 주입되므로 from().select().eq().maybeSingle()
 * 체인만 흉내내는 경량 mock 으로 격리 테스트.
 */

import { describe, expect, it, vi } from "vitest";
import { loadCustomInstructions } from "../loadCustomInstructions";

type MaybeSingleResult = {
  data: { preferences: unknown } | null;
  error: unknown;
};

/** from().select().eq().maybeSingle() 체인을 흉내내는 경량 supabase mock. */
function mockClient(
  result: MaybeSingleResult | (() => Promise<MaybeSingleResult>),
) {
  const maybeSingle = vi.fn(() =>
    typeof result === "function" ? result() : Promise.resolve(result),
  );
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as Parameters<typeof loadCustomInstructions>[0];
}

const USER_ID = "user-123";

describe("loadCustomInstructions — 정상 추출", () => {
  it("preferences.customInstructions(string) → 그대로 반환", async () => {
    const client = mockClient({
      data: { preferences: { customInstructions: "Default to perpetual." } },
      error: null,
    });
    await expect(loadCustomInstructions(client, USER_ID)).resolves.toBe(
      "Default to perpetual.",
    );
  });
});

describe("loadCustomInstructions — graceful undefined", () => {
  it("row 없음(data=null) → undefined", async () => {
    const client = mockClient({ data: null, error: null });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("error 있으면 → undefined", async () => {
    const client = mockClient({ data: null, error: { message: "rls denied" } });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("preferences=null → undefined", async () => {
    const client = mockClient({ data: { preferences: null }, error: null });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("preferences 가 비객체(string) → undefined", async () => {
    const client = mockClient({ data: { preferences: "oops" }, error: null });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("preferences 가 배열 → undefined (object 이지만 배열 제외)", async () => {
    const client = mockClient({ data: { preferences: [] }, error: null });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("customInstructions 누락 → undefined", async () => {
    const client = mockClient({
      data: { preferences: { quoteScope: "USDT" } },
      error: null,
    });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("customInstructions 가 공백뿐 → undefined (trim length 0)", async () => {
    const client = mockClient({
      data: { preferences: { customInstructions: "   \n  " } },
      error: null,
    });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("customInstructions 가 string 아님(number) → undefined", async () => {
    const client = mockClient({
      data: { preferences: { customInstructions: 42 } },
      error: null,
    });
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });
});

describe("loadCustomInstructions — throw 도 graceful 흡수", () => {
  it("maybeSingle 이 reject 해도 → undefined (쿼리 막지 않음)", async () => {
    const client = mockClient(() => Promise.reject(new Error("network boom")));
    await expect(
      loadCustomInstructions(client, USER_ID),
    ).resolves.toBeUndefined();
  });
});

// auth.ts 단위 테스트 (M2 경로 A Step 2, 2026-06-22).
//
// HS256 토큰 검증의 보안 동작 — RLS 우회 방어선이므로 분기별 명시 검증.
// jose 로 테스트 토큰 서명(실 Supabase 불필요).

import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { createTokenVerifier } from "../auth.js";

const SECRET = "test-secret-0123456789-abcdefghij";
const OTHER_SECRET = "different-secret-9876543210-zyxwvu";

function key(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Supabase 스타일 토큰 서명 헬퍼. */
async function sign(opts: {
  secret?: string;
  sub?: string | null;
  aud?: string;
  expSecFromNow?: number;
}): Promise<string> {
  const builder = new SignJWT({}).setProtectedHeader({ alg: "HS256" });
  if (opts.sub !== null) builder.setSubject(opts.sub ?? "user-123");
  if (opts.aud !== undefined) builder.setAudience(opts.aud);
  else builder.setAudience("authenticated");
  const exp = Math.floor(Date.now() / 1000) + (opts.expSecFromNow ?? 3600);
  builder.setExpirationTime(exp);
  return builder.sign(key(opts.secret ?? SECRET));
}

describe("createTokenVerifier", () => {
  it("fail-closed — 빈 secret 이면 생성 자체가 throw", () => {
    expect(() => createTokenVerifier("")).toThrow();
  });

  it("유효 토큰 → ok + userId/expiresAt 추출", async () => {
    const verify = createTokenVerifier(SECRET);
    const token = await sign({ sub: "user-abc" });
    const result = await verify(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.client.userId).toBe("user-abc");
      expect(result.client.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it("토큰 없음(undefined/빈문자열) → missing", async () => {
    const verify = createTokenVerifier(SECRET);
    expect(await verify(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(await verify("")).toEqual({ ok: false, reason: "missing" });
  });

  it("만료 토큰 → expired", async () => {
    const verify = createTokenVerifier(SECRET);
    const token = await sign({ expSecFromNow: -10 }); // 10초 전 만료
    expect(await verify(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("잘못된 서명(다른 secret) → invalid_signature", async () => {
    const verify = createTokenVerifier(SECRET);
    const token = await sign({ secret: OTHER_SECRET });
    expect(await verify(token)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("audience 불일치 → wrong_aud", async () => {
    const verify = createTokenVerifier(SECRET);
    const token = await sign({ aud: "anon" });
    expect(await verify(token)).toEqual({ ok: false, reason: "wrong_aud" });
  });

  it("형식 깨진 토큰 → malformed", async () => {
    const verify = createTokenVerifier(SECRET);
    expect((await verify("not.a.jwt")).ok).toBe(false);
    expect((await verify("garbage")).ok).toBe(false);
  });

  it("sub 클레임 없음 → malformed (서명은 유효해도 거부)", async () => {
    const verify = createTokenVerifier(SECRET);
    const token = await sign({ sub: null });
    expect(await verify(token)).toEqual({ ok: false, reason: "malformed" });
  });

  it("alg confusion 방어 — HS256 외 알고리즘 토큰 거부", async () => {
    const verify = createTokenVerifier(SECRET);
    // alg=none 위조 시도: header.payload. (서명 없음)
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "evil",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const forged = `${header}.${payload}.`;
    expect((await verify(forged)).ok).toBe(false);
  });
});

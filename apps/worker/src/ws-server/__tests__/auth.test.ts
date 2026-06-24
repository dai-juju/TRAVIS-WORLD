// auth.ts 단위 테스트 (M2 경로 A Step 2 → Step 4 Phase B ES256 전환, 2026-06-24).
//
// ES256(비대칭) 토큰 검증의 보안 동작 — RLS 우회 방어선이므로 분기별 명시 검증.
// 로컬 ES256 키페어로 테스트 토큰 서명/검증(실 Supabase·네트워크 불필요): createTokenVerifier
// 가 키 리졸버를 주입받는 순수 코어라 로컬 공개키를 그대로 넣어 검증 가능.

import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT, generateKeyPair, type CryptoKey } from "jose";
import { createTokenVerifier, createSupabaseTokenVerifier } from "../auth.js";

// 정상 서명용 키페어 + 위조 비교용 다른 키페어.
let publicKey: CryptoKey;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey; // 다른 발급자(서명 불일치 시나리오)

beforeAll(async () => {
  ({ publicKey, privateKey } = await generateKeyPair("ES256"));
  ({ privateKey: otherPrivateKey } = await generateKeyPair("ES256"));
});

/** Supabase 스타일 ES256 토큰 서명 헬퍼. */
async function sign(opts: {
  signer?: CryptoKey;
  sub?: string | null;
  aud?: string;
  expSecFromNow?: number;
}): Promise<string> {
  const builder = new SignJWT({}).setProtectedHeader({ alg: "ES256" });
  if (opts.sub !== null) builder.setSubject(opts.sub ?? "user-123");
  if (opts.aud !== undefined) builder.setAudience(opts.aud);
  else builder.setAudience("authenticated");
  const exp = Math.floor(Date.now() / 1000) + (opts.expSecFromNow ?? 3600);
  builder.setExpirationTime(exp);
  return builder.sign(opts.signer ?? privateKey);
}

describe("createTokenVerifier (ES256)", () => {
  // 로컬 공개키를 getKey 함수로 감싼다(프로덕션 createRemoteJWKSet 와 같은 형태).
  const keyFn = () => publicKey;

  it("fail-closed — 키 미주입(falsy)이면 생성 자체가 throw", () => {
    // @ts-expect-error 의도적 falsy 주입 — fail-closed 검증.
    expect(() => createTokenVerifier(undefined)).toThrow();
  });

  it("유효 토큰 → ok + userId/expiresAt 추출", async () => {
    const verify = createTokenVerifier(keyFn);
    const token = await sign({ sub: "user-abc" });
    const result = await verify(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.client.userId).toBe("user-abc");
      expect(result.client.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it("토큰 없음(undefined/빈문자열) → missing", async () => {
    const verify = createTokenVerifier(keyFn);
    expect(await verify(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(await verify("")).toEqual({ ok: false, reason: "missing" });
  });

  it("만료 토큰 → expired", async () => {
    const verify = createTokenVerifier(keyFn);
    const token = await sign({ expSecFromNow: -10 }); // 10초 전 만료
    expect(await verify(token)).toEqual({ ok: false, reason: "expired" });
  });

  it("잘못된 서명(다른 키로 서명) → invalid_signature", async () => {
    const verify = createTokenVerifier(keyFn);
    const token = await sign({ signer: otherPrivateKey });
    expect(await verify(token)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("audience 불일치 → wrong_aud", async () => {
    const verify = createTokenVerifier(keyFn);
    const token = await sign({ aud: "anon" });
    expect(await verify(token)).toEqual({ ok: false, reason: "wrong_aud" });
  });

  it("형식 깨진 토큰 → malformed", async () => {
    const verify = createTokenVerifier(keyFn);
    expect((await verify("not.a.jwt")).ok).toBe(false);
    expect((await verify("garbage")).ok).toBe(false);
  });

  it("sub 클레임 없음 → malformed (서명은 유효해도 거부)", async () => {
    const verify = createTokenVerifier(keyFn);
    const token = await sign({ sub: null });
    expect(await verify(token)).toEqual({ ok: false, reason: "malformed" });
  });

  it("alg confusion 방어 — ES256 외 알고리즘(HS256) 토큰 거부", async () => {
    const verify = createTokenVerifier(keyFn);
    // HS256 대칭키로 서명한 토큰 → ES256 공개키 검증기는 JOSEAlgNotAllowed → malformed.
    //   (Step 2 HS256 검증기를 ES256 토큰이 거부당하던 라이브 사고의 거울상 — alg 고정 방어.)
    const hsSecret = new TextEncoder().encode("symmetric-secret-0123456789-abcd");
    const hsToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("evil")
      .setAudience("authenticated")
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(hsSecret);
    expect((await verify(hsToken)).ok).toBe(false);

    // alg=none 위조(서명 없음)도 거부.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "evil",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    expect((await verify(`${header}.${payload}.`)).ok).toBe(false);
  });
});

describe("createSupabaseTokenVerifier (JWKS 진입점)", () => {
  it("fail-closed — 빈 SUPABASE_URL 이면 throw (JWKS fetch 없이 즉시)", () => {
    expect(() => createSupabaseTokenVerifier("")).toThrow();
  });

  it("URL 주어지면 검증기 생성 성공 (네트워크는 첫 검증 시 lazy)", () => {
    // createRemoteJWKSet 은 핸들만 만들고 fetch 는 첫 jwtVerify 때 — 생성 자체는 네트워크 무관.
    expect(typeof createSupabaseTokenVerifier("https://example.supabase.co")).toBe("function");
  });
});

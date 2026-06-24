// ============================================================
// ws-server/auth.ts — 경로 A WS 핸드셰이크 JWT 검증 (M2 경로 A Step 2, 2026-06-22).
//
// 책임:
//   - 프론트가 핸드셰이크에 실어 보낸 Supabase access token(JWT)을 워커에서 검증.
//   - 검증 성공 → 신원(userId/exp), 실패 → 사유(거부용).
//
// ★ 보안 설계 (M2 경로 A Step 4 Phase B 라이브 정정, 2026-06-24):
//   - **ES256 비대칭 검증 (JWKS)** 채택. Step 2 는 HS256 대칭키를 택했으나, 라이브
//     B-3 에서 이 Supabase 프로젝트가 **이미 비대칭(ECC P-256/ES256)으로 마이그레이션**
//     돼 있음이 드러났다(대시보드 JWT Keys = CURRENT KEY ES256, Legacy HS256 은
//     verify-only·옛 토큰용). HS256 검증기는 ES256 토큰을 `JOSEAlgNotAllowed`(→malformed)
//     로 전량 거부 → 핸드셰이크 100% 실패. feedback_external_api_live_smoke 의 사례.
//   - **공개키만 보유** = 워커는 검증만 가능, 토큰 위조 불가 → HS256(대칭, 검증자가
//     서명도 가능)보다 blast radius 가 작다. Step 2 가 "과설계"로 본 비대칭이 정공법.
//   - **algorithms: ["ES256"] 고정** — alg confusion("none"/HS256 위조) 차단.
//   - **audience: "authenticated" 강제** — Supabase 로그인 사용자 토큰만 통과.
//   - **JWKS 원격 키셋(createRemoteJWKSet)** — kid 기준 공개키 자동 캐시·키 회전/standby
//     키 자동 반영. 부팅 시 키셋 핸들만 만들고, 실제 fetch 는 첫 검증 시 lazy.
//   - **fail-closed** — supabaseUrl(또는 키) 미설정이면 verifier 생성 자체가 throw →
//     인증 없는 WS 서버가 외부에 뜨는 사고를 부팅 단계에서 차단.
//
// 공식 문서 근거:
//   - Supabase JWT signing keys / JWKS(aud=authenticated, ES256): https://supabase.com/docs/guides/auth/signing-keys — 2026-06-24 조회
//   - JWKS endpoint: `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (라이브 확인 2026-06-24:
//     kty=EC, alg=ES256, crv=P-256, kid=177151be-… = 대시보드 CURRENT KEY 일치)
//   - jose jwtVerify / createRemoteJWKSet: https://github.com/panva/jose — 2026-06-24 조회
// ============================================================

import { jwtVerify, createRemoteJWKSet, errors, type JWTVerifyGetKey } from "jose";

/** 검증 성공 시 신원. */
export interface VerifiedClient {
  /** JWT 'sub' 클레임 = Supabase user id. */
  userId: string;
  /** JWT 'exp' 클레임 (epoch sec) — 연결 만료 타이머에 사용. */
  expiresAt: number;
}

/**
 * 인증 실패 사유. 의미가 다른 실패를 한 값으로 뭉치지 않음
 * (CLAUDE.md feedback_fallback_reason_enum_drift 정합). 클라이언트에는
 * 상세 사유를 노출하지 않고 close code 만 보냄(정보 누출 방지) — 로그 용도.
 */
export type AuthFailureReason =
  | "missing" // 토큰 자체가 없음
  | "malformed" // 토큰 형식/필수 클레임(sub·exp) 이상 / 허용 외 알고리즘 / 키 미발견
  | "expired" // exp 경과
  | "invalid_signature" // 서명 불일치(위조/키 불일치)
  | "wrong_aud"; // audience != "authenticated"

export type AuthResult =
  | { ok: true; client: VerifiedClient }
  | { ok: false; reason: AuthFailureReason };

/** 토큰 1건을 검증하는 함수. */
export type TokenVerifier = (token: string | undefined) => Promise<AuthResult>;

/**
 * 토큰 검증기 생성 (순수 코어). 부팅 시 1회 호출.
 *
 * @param getKey jwtVerify 키 리졸버(JWTVerifyGetKey). 프로덕션은 createRemoteJWKSet 가
 *   만든 JWKS getKey, 테스트는 로컬 공개키를 감싼 `() => publicKey`. getKey 함수 형태로
 *   통일해 jose 오버로드(key/getKey)의 유니온 인자 문제 없이 타입이 정확히 맞는다.
 * @throws getKey 가 falsy 면 throw (fail-closed — 인증 없는 외부 노출 차단).
 */
export function createTokenVerifier(getKey: JWTVerifyGetKey): TokenVerifier {
  if (!getKey) {
    throw new Error(
      "[ws-auth] JWT 검증 키 미설정 — 인증 없는 WS 서버 외부 노출 차단(fail-closed).",
    );
  }

  return async (token: string | undefined): Promise<AuthResult> => {
    if (!token || token.length === 0) {
      return { ok: false, reason: "missing" };
    }
    try {
      const { payload } = await jwtVerify(token, getKey, {
        algorithms: ["ES256"], // alg confusion(none/HS256 위조) 차단 + Supabase 현 서명 알고리즘
        audience: "authenticated", // Supabase 로그인 사용자만
      });
      const sub = typeof payload.sub === "string" ? payload.sub : "";
      const exp = typeof payload.exp === "number" ? payload.exp : 0;
      // 서명·aud·exp 는 jose 가 검증 완료. sub/exp 존재만 추가 확인.
      if (sub.length === 0 || exp === 0) {
        return { ok: false, reason: "malformed" };
      }
      return { ok: true, client: { userId: sub, expiresAt: exp } };
    } catch (e) {
      return { ok: false, reason: classifyJoseError(e) };
    }
  };
}

/**
 * Supabase JWKS 기반 토큰 검증기 생성 (프로덕션 진입점).
 *
 * `<supabaseUrl>/auth/v1/.well-known/jwks.json` 에서 공개키를 받아 ES256 검증.
 * createRemoteJWKSet 은 kid 기준으로 키를 캐시하고, 모르는 kid(키 회전/standby
 * 승격) 가 오면 자동 재-fetch 한다 → 키 회전에 코드 변경 불필요.
 *
 * @param supabaseUrl 예: https://<ref>.supabase.co (worker.env SUPABASE_URL).
 * @throws supabaseUrl 이 비어 있으면 throw (fail-closed).
 */
export function createSupabaseTokenVerifier(supabaseUrl: string): TokenVerifier {
  if (!supabaseUrl || supabaseUrl.length === 0) {
    throw new Error(
      "[ws-auth] SUPABASE_URL 미설정 — JWKS 검증 불가, WS 서버 외부 노출 차단(fail-closed).",
    );
  }
  // new URL(path, base) — supabaseUrl 끝 슬래시 유무와 무관하게 안전하게 절대경로 조립.
  const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", supabaseUrl);
  const jwks = createRemoteJWKSet(jwksUrl);
  return createTokenVerifier(jwks);
}

/**
 * jose 예외 → AuthFailureReason 매핑.
 * ★ JWTExpired 와 JWTClaimValidationFailed 는 JOSEError 의 **형제** 클래스(상하위 아님,
 *   jose v6 실측). expired 를 일반 claim 실패로 뭉치지 않도록 JWTExpired 를 명시적으로
 *   먼저 분기 — enum drift 방지(feedback_fallback_reason_enum_drift 정합).
 * ★ JOSEAlgNotAllowed(허용 외 알고리즘) / JWKSNoMatchingKey(kid 미발견) / 파싱 불가 등은
 *   malformed 로 일반화 — 클라엔 사유 미노출이라 세분 가치 낮음(로그로만 구분).
 */
function classifyJoseError(e: unknown): AuthFailureReason {
  if (e instanceof errors.JWTExpired) return "expired";
  if (e instanceof errors.JWTClaimValidationFailed) {
    // claim === "aud" 면 audience 불일치, 그 외 클레임 이상은 malformed 로 일반화.
    return e.claim === "aud" ? "wrong_aud" : "malformed";
  }
  if (e instanceof errors.JWSSignatureVerificationFailed) {
    return "invalid_signature";
  }
  // JWSInvalid / JWTInvalid / JOSEAlgNotAllowed / JWKSNoMatchingKey / 네트워크 등은 malformed.
  return "malformed";
}

// ============================================================
// ws-server/auth.ts — 경로 A WS 핸드셰이크 JWT 검증 (M2 경로 A Step 2, 2026-06-22).
//
// 책임:
//   - 프론트가 핸드셰이크에 실어 보낸 Supabase access token(JWT)을 워커에서 검증.
//   - 검증 성공 → 신원(userId/exp), 실패 → 사유(거부용).
//
// ★ 보안 설계 (security-auditor + backend-infra-specialist 자문, 2026-06-22):
//   - **HS256 로컬 검증** 채택. 비대칭 공개키가 아닌 이유: 프로덕션 워커는 이미
//     SUPABASE_SERVICE_ROLE_KEY(DB 전면 우회)를 보유 → 박스 탈취 시 공격자는 이미
//     모든 권한을 가짐. JWT secret 추가는 blast radius 를 키우지 않으므로(service_role
//     ≥ 토큰위조), 비대칭 키(Supabase 프로젝트 전체 마이그레이션)는 과설계.
//   - **algorithms: ["HS256"] 고정** — alg confusion 공격("none"/RS256 위조) 차단.
//   - **audience: "authenticated" 강제** — Supabase 로그인 사용자 토큰만 통과.
//   - **fail-closed** — secret 미설정이면 verifier 생성 자체가 throw → 인증 없는
//     WS 서버가 외부에 뜨는 사고를 부팅 단계에서 차단.
//   - jose 채택(직접 HMAC 금지): exp/aud/서명 검증을 손으로 짜면 안 되는 방어선.
//
// 공식 문서 근거:
//   - Supabase JWT(aud=authenticated, sub=user id, exp): https://supabase.com/docs/guides/auth/jwts — 2026-06-22 조회
//   - jose jwtVerify: https://github.com/panva/jose — 2026-06-22 조회
// ============================================================

import { jwtVerify, errors } from "jose";

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
  | "malformed" // 토큰 형식/필수 클레임(sub·exp) 이상
  | "expired" // exp 경과
  | "invalid_signature" // 서명 불일치(위조/secret 불일치)
  | "wrong_aud"; // audience != "authenticated"

export type AuthResult =
  | { ok: true; client: VerifiedClient }
  | { ok: false; reason: AuthFailureReason };

/** 토큰 1건을 검증하는 함수. */
export type TokenVerifier = (token: string | undefined) => Promise<AuthResult>;

/**
 * HS256 토큰 검증기 생성. 부팅 시 1회 호출.
 *
 * @param jwtSecret Supabase 대시보드 → Settings → API → JWT Secret.
 * @throws secret 이 비어 있으면 throw (fail-closed — 인증 없는 외부 노출 차단).
 */
export function createTokenVerifier(jwtSecret: string): TokenVerifier {
  if (!jwtSecret || jwtSecret.length === 0) {
    throw new Error(
      "[ws-auth] SUPABASE_JWT_SECRET 미설정 — 인증 없는 WS 서버 외부 노출 차단(fail-closed). worker.env 를 확인하세요.",
    );
  }
  // HS256 대칭키 — Uint8Array 로 1회 인코딩 후 재사용.
  const key = new TextEncoder().encode(jwtSecret);

  return async (token: string | undefined): Promise<AuthResult> => {
    if (!token || token.length === 0) {
      return { ok: false, reason: "missing" };
    }
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"], // alg confusion 차단
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
 * jose 예외 → AuthFailureReason 매핑.
 * ★ JWTExpired 와 JWTClaimValidationFailed 는 JOSEError 의 **형제** 클래스(상하위 아님,
 *   jose v6 실측). expired 를 일반 claim 실패로 뭉치지 않도록 JWTExpired 를 명시적으로
 *   먼저 분기 — enum drift 방지(feedback_fallback_reason_enum_drift 정합).
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
  // JWSInvalid / JWTInvalid / 파싱 불가 등 나머지는 malformed.
  return "malformed";
}

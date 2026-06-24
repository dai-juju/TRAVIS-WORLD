// 경로 A(WS 프론트 직결) 서버 배럴 (M2 경로 A Step 1 + Step 2, 2026-06-22).

export { LiveBus, type LiveSubscriber } from "./LiveBus.js";
export { LiveWsServer, WS_SUBPROTOCOL, type LiveWsServerOptions } from "./WsServer.js";
export type { LiveEnvelope } from "./envelope.js";
// Step 2 — 핸드셰이크 JWT 인증. (Step 4 Phase B: ES256/JWKS 비대칭 검증으로 전환.)
export {
  createTokenVerifier,
  createSupabaseTokenVerifier,
  type TokenVerifier,
  type AuthResult,
  type AuthFailureReason,
  type VerifiedClient,
} from "./auth.js";
export { TokenBucket, type TokenBucketOptions } from "./rateLimiter.js";

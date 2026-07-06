---
name: project_ws_patha_auth
description: 경로 A 프론트向 WS 서버(LiveWsServer)의 인증 모델 — ES256/JWKS, fail-closed, Caddy 뒤 127.0.0.1
metadata:
  type: project
---

경로 A(M2) 프론트向 WS 서버(`apps/worker/src/ws-server/`)의 인증/노출 모델.

- **검증 알고리즘**: ES256(비대칭, ECC P-256). `createSupabaseTokenVerifier(SUPABASE_URL)` 가
  `<url>/auth/v1/.well-known/jwks.json` 로 `createRemoteJWKSet` 생성. `jwtVerify(token, jwks, { algorithms: ["ES256"], audience: "authenticated" })`.
  Step 2 는 HS256 대칭이었으나 2026-06-24 Step 4 Phase B 라이브에서 이 Supabase 프로젝트가 이미 ES256 으로
  마이그레이션돼 있어 전환 (HS256 검증기가 ES256 토큰 전량 거부 → WS 100% 실패).
- **Why ES256 우월**: 워커는 공개키만 보유 = 검증만 가능, 토큰 위조 불가. HS256(대칭)은 검증자=서명자라 worker
  침해 시 토큰 위조 가능 → ES256 이 blast radius 작음.
- **fail-closed**: `SUPABASE_URL` 미설정이면 `createSupabaseTokenVerifier` throw → index.ts 가 WS 서버를
  graceful 생략(수집 경로 B 는 계속). 인증 없는 WS 서버는 절대 안 뜸.
- **노출**: host=127.0.0.1, Caddy(443)가 wss→내부 ws 프록시. 0.0.0.0 직접 노출 안 함.
- **토큰 전달**: Sec-WebSocket-Protocol subprotocol `[WS_SUBPROTOCOL, <accessToken>]` (쿼리스트링 로그 노출 회피).
  프론트 `apps/web/lib/dataService/liveConnection.ts` 가 핸드셰이크 직전 최신 세션 토큰 부착.

**How to apply**: 이 WS 경로를 다시 감사할 때 (a) algorithms 고정 유지 (b) audience="authenticated" 유지
(c) fail-closed 유지 (d) 거부 사유 클라 미노출(로그만) 4개가 회귀하지 않았는지 확인.
거부 사유 enum(`AuthFailureReason`)은 [[feedback_fallback_reason_enum_drift]] 정합.

**잔여(2026-06-24, 비차단)**: ① `worker.env.example` 의 dead `SUPABASE_JWT_SECRET` 정리 + 주석 HS256→ES256
② `iss` 클레임 미검증(현 단일 프로젝트라 aud+JWKS 로 충분, 멀티테넌트 시 재검토) ③ JWKS fetch 실패=malformed 거부(fail-closed 정상, 단 첫 부팅 시 Supabase auth 다운이면 전 연결 거부 — 가용성 트레이드오프).

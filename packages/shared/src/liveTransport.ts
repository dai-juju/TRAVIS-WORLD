// 경로 A(WS 프론트 직결) 운반 상수 — 워커(서버)·프론트(클라) 단일 진실.
//
// (M2 경로 A Step 4, 2026-06-23)
//
// subprotocol 핸드셰이크에서 클라가 보내는 `[WS_SUBPROTOCOL, <accessToken>]` 의
// 첫 원소를 서버 verifyClient/handleProtocols 가 정확히 같은 문자열로 매칭해야
// 인증이 성립한다. buildLiveTopic 과 같은 이유로 — 양쪽이 문자열을 따로 박으면
// drift 가 곧 인증 실패 — 한 곳에서 정의해 worker·web 양쪽이 import 한다.
//
// 값을 바꾸면 클라·서버 동시 배포 필요(프로토콜 협상 불일치 = 401). 사실상 불변.
export const WS_SUBPROTOCOL = "travis-live-v1";

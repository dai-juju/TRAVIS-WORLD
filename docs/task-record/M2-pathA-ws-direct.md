# M2 경로 A — WS 프론트 직결 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** — Step 1 (워커 WS 서버 셸) ✅ + Step 3a (레지스트리 계약) ✅ + Step 3b (프론트 라우터) ✅ + **Step 2 Phase 1 (서버 측 JWT 인증 코드) ✅** (2026-06-22). 도메인 `use-travis.com` 확보(Cloudflare) → 서브도메인 `ws.use-travis.com` + DNS-only + Caddy TLS 확정. **다음 = Step 2 Phase 2 (인프라 — DNS/Caddy/방화벽/워커 재배포, 사용자와 함께 라이브 세션) → 그 후 Step 4 (플립)**.
> **▶▶ `/clear` 후 세션 재개 가이드 (2026-06-22)**: 이 파일이 경로 A 단일 진실 — 가장 먼저 읽기.
> 1. **코드 현황**: Step 1(`8bc171e`) + Step 3a(`5b26143`) + Step 3b(`e367810`) + **Step 2 Phase 1(서버 인증, 커밋 대기/완료)** ✅. 프론트는 여전히 휴면(ticker=경로 B). 워커 Hetzner **미배포** — Step 2 Phase 2 인프라에서 인증 secret 주입 후 배포.
> 2. **Step 2 Phase 2 (인프라, 사용자 실행 + Claude 안내)** = §3 Step 2 절차. ① Hetzner Cloud 콘솔에서 프로덕션 워커(CPX22/Nuremberg) **Public IPv4 실측**(메모리 `178.105.38.94` stale 가능, collector `49.13.138.121` 와 혼동 금지) ② Cloudflare DNS A 레코드 `ws` → 그 IP, **프록시 OFF(DNS-only)** ③ Caddy 설치 + `ws.use-travis.com { reverse_proxy 127.0.0.1:8081 }` (자동 TLS, WS upgrade 기본 처리) ④ 방화벽 443/80 허용·8081 차단·SSH 키 인증(security-auditor W-1/W-2) ⑤ `worker.env` 에 `SUPABASE_JWT_SECRET`(Supabase→Settings→API→JWT Secret) 추가 + git pull + 재배포(fail-closed 확인) ⑥ Vercel `NEXT_PUBLIC_WS_URL=wss://ws.use-travis.com`. **종료 게이트 = 인증된 wss 연결 1회 성공 + 무토큰/위조 거부 확인 + security-auditor 노출-직후 재감사**.
> 3. **Step 2 후 → Step 4 (플립 + 라이브 박동소멸 검증)** (§3 Step 4): 워커 인라인 토픽→`buildLiveTopic` + ticker `liveTopicSpec` 등록 + ticker `transport:"ws_direct"` + TickerCard `selector` + **프론트 토큰 첨부(subprotocol `[WS_SUBPROTOCOL, token]`, Step 2 에서 Step 4 로 이동 — 휴면 connect 비동기화가 284 웹 테스트 흔드는 것 회피)** + `[10-53]` 선결 + 라이브 검증(박동 소멸 + site=DB). ★ W2: "토픽 리터럴 조립 grep".
> 4. **도메인/인프라 대기 시**: 다른 작업(테마 D 차트 / 세션 컨텍스트 / `[8-27]` 빚 — `M2-step2-usage-feedback.md §E·§H`).
>
> **확장 루프 4회전** (테마 A ✅ / 테마 B ✅ / `[10-33]` ✅ / 테마 C ✅ 다음).
> **분해 (roadmap-milestone-manager, 2026-06-22)**: 5 step — 1(워커 WS 서버+방송 sink) → 2(wss TLS+JWT 인증) → 3(프론트 transport-agnostic 훅+레지스트리 transport 칸) → 4(단일 ticker→TickerCard MVP+저사양 throttle) → 5(라이브 G2 박동 소멸 실측). 분해 메모리 = `agent-memory/roadmap-milestone-manager/project_m2_themeA_pathA_breakdown.md`.
> **아키텍처 설계 (backend-infra-specialist, 2026-06-22)**: `agent-memory/backend-infra-specialist/` 참조.

---

## 0. 한 줄 요약 (비전공자용)

> **"가격이 화면에 뜨는 길을 하나 더 깐다. 지금은 거래소→워커→Supabase DB→0.5초마다 화면(경로 B, '박동'의 원인). 경로 A는 워커가 받은 즉시 DB를 안 거치고 프론트로 직접 방송. Step 1은 그중 워커 쪽 절반 — 프론트가 붙을 '방송국'(WS 서버)과, 기존 DB 저장은 그대로 둔 채 '저장 직전에 방송도 쏴라' 한 줄을 추가."**

---

## 1. 왜 경로 A 인가

- **PRD 3대 데이터 경로 중 유일 미구현** — 경로 A(WS→프론트 직결)는 설계엔 있으나 코드 0%. 기능이 아니라 **빠진 토대**.
- **사용자가 실측한 "박동"** (`[10-1]`(a)) — 테마 A 완결 때 "flash 가 Binance/CoinGlass 처럼 흐르지 않고 바뀌다 말다 박동" 체감. 경로 B(WS→Supabase→Realtime→500ms throttle)의 구조적 하한. liveness 의 나머지 절반.
- **확장성 (사용자 양보불가 요구)** — 추후 뉴스/온체인/타 거래소를 **같은 파이프에 토픽만 추가**해 꽂는다. 따라서 경로 A 를 "바이낸스 ticker 전용"이 아니라 **불투명 토픽 + 자유 페이로드 범용 파이프**로 설계.

### ★ 핵심 설계 결정 (사용자, 2026-06-22)

- **불투명 토픽** — 운반층(LiveBus/WsServer)은 topic 문자열을 파싱/해석 안 함(범용 파이프). `{출처}.{시장}.{지표}.{코인}` 같은 고정 규격 **기각**(하드코딩). 토픽 의미는 각 데이터 소스(레지스트리, Step 3)가 소유.
- **자유 페이로드** — `payload: unknown`. 소비자(프론트 카드)가 자기 datasource 의 Zod 로 엣지 검증(경로 C = AI 출력과 동일 패턴, `feedback_raw_store_sanitize_at_exits` 정합).
- **두 경로 병행** — 경로 A 는 라이브 표시 전송경로, 경로 B(upsert)는 persistence(history/AI/list). ticker upsert 는 그대로 — 리스트/AI/차트가 DB 를 읽으므로.
- **WS 서버 = Hetzner 프로덕션 워커 별도 포트** (PRD 정합). wss 는 Caddy 리버스 프록시(Step 2). Vercel route 는 장수 WS 부적합이라 비채택.

---

## 2. Step 1 — 워커 WS 서버 셸 + 방송 sink (✅ 완료 2026-06-22)

> 워커 측만. 인증/TLS(Step 2)·프론트(Step 3) 범위 밖. 목표 = "워커가 정규화한 tick 을 Supabase 안 거치고 토픽으로 방송하는 파이프"가 로컬에서 도는 것 증명.

### 2.1 산출 (신규 5 + 수정 3 + 테스트 2)

**신규** `apps/worker/src/ws-server/`:
- `envelope.ts` — `LiveEnvelope { topic, ts, seq, payload }`. topic=불투명 라우팅 키, payload=unknown(운반층 미파싱).
- `LiveBus.ts` — 프로세스 내 토픽 pub/sub. `publish(topic, payload)` / `subscribe(topic, fn)→unsubscribe` / `subscriberCount()`. **구독자 0 → publish 무비용 no-op**. 구독자 throw 격리(try/catch). ★ "프로세스 내부 방송"의 단일 경계 — 추후 별도 서버 분리 시 이 파일만 Redis 등으로 교체(WsServer/sink 무변경).
- `WsServer.ts` — `ws` WebSocketServer 래퍼. 클라 `subscribe`/`unsubscribe`(불투명 topic) 처리 + 구독 topic 만 fan-out. **인증/TLS 없음(Step 2)**, 기본 host=127.0.0.1(로컬 전용 — 외부 노출 차단). 잘못된 JSON/소켓 에러 graceful 격리.
- `index.ts` — 배럴.
- `__tests__/LiveBus.test.ts` — 6 tests(전달/무비용/unsubscribe 멱등/fan-out/topic 격리/구독자 throw 격리).

**수정**:
- `ws-relay/streams/tickerWsHandler.ts` — `TickerWsHandlerDeps.publish?` optional 추가 + spot/futures 양 분기에서 **enriched(필터+사전계산 완료) 직후, upsert 전** `deps.publish?.(marketType, enriched)` 호출. ★ DB 왕복 안 기다리고 즉시 방송(저지연) + optional(미주입=기존 100% 보존) + 위생 #2(필터 통과분만).
- `index.ts`(worker) — `LiveBus` + `LiveWsServer` 부트스트랩 + ticker 핸들러에 publish 콜백 배선(토픽 관례 `binance:${marketType}:ticker:${symbol}` 를 **여기가 소유**, 핸들러 무지) + `liveWsServer.start()` + graceful shutdown 에 `liveWsServer.stop()`. 설정 `WS_SERVER_PORT`(기본 8081)/`WS_SERVER_HOST`(기본 127.0.0.1).
- `ws-relay/__tests__/tickerWsHandler.test.ts` — publish 배선 4 tests(미주입 회귀 0 / 주입 시 enriched 방송+upsert 병행 / 위생 #2 mixed batch / 전량 필터아웃 시 미호출).

**스크립트**:
- `scripts/smokeWsServer.ts` + `package.json` `smoke:ws-server` — Binance/Supabase 불필요 격리 transport smoke.

### 2.2 검증 게이트 (전부 PASS)

| 게이트 | 결과 |
|---|---|
| `type-check` / `lint` | ✅ clean |
| `test` | ✅ **181 PASS** (171→+10, 회귀 0) |
| `smoke:ws-server` | ✅ **PASS** — 구독 전 무비용 / 접속 / 방송 2건 **62ms 도착**(경로 B 500ms throttle 대비 8배) / topic 격리 / unsubscribe 중단 / graceful stop |
| `@code-reviewer` | ✅ **0 Critical** — 5 불변식(경로 B 무중단/격리/위생 #2/불투명 토픽/graceful) 코드 레벨 대조 충족. W1·W3(주석 정확성) 즉시 반영. W2(구독 cap)→`[10-52]` Step 2 이월. mixed-batch·precompute 순서 회귀 0 확인 |

### 2.3 배포 정책

- Step 1 = **로컬 smoke + commit 까지만, Hetzner 프로덕션 배포 없음**. 프로덕션 배포는 인증(Step 2) 생긴 뒤 — 인증 없는 WS 서버 외부 노출 0초 (사용자 합의).

### 2.4 이월 (deferred)

- **`[10-52]`** 🟡 — Step 2: 클라이언트당 max 구독 수 cap + 메시지 rate limit (code-reviewer W2). 외부 노출(Step 2 wss) 전 필수. `@security-auditor` 위임 권장.

---

## 2.5 Step 3 — 프론트 직결 배관 (🔄 진행 중, 로컬 ws://)

> 도메인 미보유로 Step 2(wss/TLS)보다 **먼저** 진행 (사용자 결정 2026-06-22) — 로컬 `ws://` 로 전부 개발/검증. **Step 3 = 화면 변화 0**: 기계만 깔고, ticker 를 경로 A 로 넘기는 직통 스위치는 Step 4. 3 sub-step(3a 레지스트리 계약 / 3b 워커 배선 / 3c 프론트 라우터). 설계 = zod-schema-architect(계약) + nextjs-frontend-specialist(훅) 자문.

### Sub-step 3a — 레지스트리 계약 ✅ 완료 (2026-06-22)

- **산출 (수정 3 + 테스트)**:
  - `packages/shared/src/registries/datasourceRegistry.ts` — `TransportSchema`(`"realtime"|"ws_direct"`) + `LiveTopicSpecSchema`(`{prefix, selectorKeys, separator=":"}`, **함수 아닌 데이터** = 직렬화 안전) + `DatasourceEntrySchema` 에 `transport`(default `"realtime"`=하위호환)/`liveTopicSpec`(optional) + `.superRefine`(ws_direct↔spec 필수) + `registerDatasource` 파라미터 `DatasourceEntryInput`(`z.input`, default 생략 리터럴 수용) + **`buildLiveTopic(datasourceId, selector)→string|null`**(워커·프론트 단일 진실 토픽 조립).
  - 배럴 2개(`registries/index.ts` + `index.ts`) 신규 export.
  - `registries.test.ts` +6 테스트(default 하위호환 / ws_direct+spec / superRefine 거부 / buildLiveTopic 조립 / null graceful / AI 비노출).
- **★ 설계 결정**: zod 설계의 `label` 필드 제거 — **prefix 가 네임스페이스 통째로**(예 `"binance:ticker"`) → metric 충돌이 prefix 단계에서 없어 label 불필요(CLAUDE.md "작게·깔끔"). `.superRefine`→ZodEffects 안전(`.shape` 사용처 grep 0 + web/worker type-check green). promptInjection 이 transport/liveTopicSpec 자동 제외(table 패턴 = AI 비노출).
- **검증**: shared type-check + **44 test**(+6, 회귀 0) + worker·web type-check green(하위호환 실증). `@code-reviewer` **0 Critical**(불변식 5/5: 하위호환·불투명 토픽·AI 비노출·graceful·단일 진실). W1(realtime+spec silent 경고)·S1(selectorKeys 중복 가드)·S3(불투명 역파싱 금지 주석) 즉시 반영.
- **W2 이월 (Step 4 검증 체크리스트)**: buildLiveTopic 단일 진실은 현재 "관례". Step 4 워커·프론트 양쪽 배선 시 **"토픽 문자열 리터럴 조립 grep"** 으로 drift 재발 차단 의무화.

### Sub-step 3b — 프론트 라우터 ✅ 완료 (2026-06-22)

> ★ 경계 조정 (사용자 동의 2026-06-22): 원래 3b=워커배선/3c=프론트였으나, **워커 배선은 토픽이 프론트와 일치해야 하는 "플립"과 한 몸** → 워커 변경을 Step 4 로 합침. Step 3 = 레지스트리 계약(3a) + 프론트 기계(3b)만 = **워커 무접촉, 화면 변화 0**. (구 3c 가 3b 로 승격, 구 3b 워커배선 → Step 4.)

- **산출 (신규 3 + 수정 2 + 테스트 2)**:
  - ➕ `apps/web/lib/dataService/transport.ts` — `resolveTransport(datasource)` (`getDatasource().transport ?? "realtime"`).
  - ➕ `liveConnection.ts` — 단일 WS 연결 생명주기(지수 backoff 재연결 0.5s~15s / `wsFactory` 주입 / envelope **프론트 로컬 타입**=워커 무접촉 / parseEnvelope graceful).
  - ➕ `liveTopicManager.ts` — 토픽 dispatch table(**channelManager 정확한 쌍둥이**: 단일연결/grace 1초/resubscribeAll/listener throw 격리). 휴면(production 미호출, Step 4 활성화).
  - ✏️ `hooks.ts` — `useDataServiceRow` 에 ws_direct 분기(`applyRow`/`applyStatus` 공용 추출=경로 B 중복 제거) + `selector` deps. **경로 B 로직 불변**.
  - ✏️ `types.ts` — `DataServiceRowOptions.selector?` 추가(ws_direct 토픽용, realtime 무시).
  - ➕ `__tests__/transport.test.ts`(4) + `__tests__/liveTopicManager.test.ts`(6, mock WS + fake timers).
- **★ 설계 결정**: envelope 프론트 로컬 정의(apps/web→worker import 불가 + 워커 무접촉) / liveConnection+liveTopicManager **2파일 분리**(channelManager 316줄 비대화 회피) / rAF 코얼레서 미포함(워커 StreamCoalescer 가 ticker 1초 합산=저빈도, 고빈도 스트림 Step 4+ 시 도입) / 테이블 hook 경로 A 미포함(MVP=row hook).
- **검증**: web type-check + lint green + **284 test**(+10, 회귀 0). `@code-reviewer` **0 Critical**(불변식 5/5: 회귀 0·channelManager 정합·graceful·dataService 경계·단일 진실 토픽). W1(status 라벨 경로중립)·S3(mapStatus exhaustiveness) 즉시 반영. W2(재연결 error 깜빡임)/W3(seq 순서) → **`[10-53]` Step 4 플립 선결** 이월.
- **dormant 실증**: `transport.test.ts` 가 `now_futures_ticker → "realtime"` 못박음 → ws_direct 분기 production 미진입(화면 변화 0).

### Sub-step 3c — (구 계획, 3b 로 흡수 완료)

다음 = **Step 4 (플립)** — 아래 §3 참조.

---

## 2.6 Step 2 — wss TLS + JWT 인증 (Phase 1 서버 코드 ✅ / Phase 2 인프라 대기, 2026-06-22)

> 도메인 `use-travis.com`(Cloudflare) 확보로 착수. **Phase 1(서버 측 인증 코드)=Claude 작성·로컬 검증·커밋. Phase 2(인프라: DNS/Caddy/방화벽/재배포)=사용자 실행 + Claude 한 줄씩 안내(SSH 미접근).** "박동 소멸" 실측은 Step 4.

### 2.6.1 확정 결정 (사용자 + 자문)

- **도메인/TLS**: `ws.use-travis.com` + **DNS-only(회색 구름) + Hetzner Caddy 가 Let's Encrypt 직접 발급**. (CF 프록시 미사용 — 무료 플랜 WS 100초 idle timeout 회피, security-auditor 도 타당성 인정.) 사용자 보안 우려 → security-auditor **조건부 수용**(W-1~W-5 충족 시).
- **JWT 검증 = HS256 로컬 (`jose`)**. 비대칭 공개키 기각 근거: 프로덕션 워커는 이미 `SUPABASE_SERVICE_ROLE_KEY`(DB 전면 우회) 보유 → 박스 탈취 시 blast radius 동일(service_role ≥ 토큰위조) → 비대칭(프로젝트 전체 JWT 마이그레이션)은 과설계. CTO 확정.
- **토큰 전달 = `Sec-WebSocket-Protocol` subprotocol** `[WS_SUBPROTOCOL("travis-live-v1"), <accessToken>]`. 쿼리스트링과 달리 로그 비노출(브라우저는 커스텀 헤더 불가). **검증 시점 = 핸드셰이크(verifyClient)** — 실패 시 upgrade 거부(WS 미수립=리소스 0).
- **fail-closed + graceful-degrade**: `SUPABASE_JWT_SECRET` 없으면 verifier 생성이 throw → 워커는 **WS 서버만 비활성(미노출)**, 수집(경로 B)은 계속. "인증 없는 WS 노출 0초"를 지키면서 핵심 파이프 보존. (security-auditor "교과서적" 평가.)
- **`WS_PUBLIC_HOST` env 철회**: Caddy 가 도메인↔내부포트 매핑 소유 → 워커는 도메인 몰라도 됨. 도메인은 프론트 `NEXT_PUBLIC_WS_URL` 1곳 + Caddyfile 1줄에만. `WS_SERVER_HOST` 는 `127.0.0.1` 유지(0.0.0.0 불필요 = 이중 안전, W-1).
- **프론트 토큰 첨부 → Step 4 로 이동**: 휴면 `liveConnection` 에 토큰을 붙이면 `connect()` 가 비동기가 돼 284 웹 테스트(동기 WS 생성 가정)를 흔듦. Step 2 보안 게이트는 100% 서버 측이고 프론트는 Step 4 플립 때 실제 연결되므로, 토큰 첨부도 그때 함께 라이브 검증(범위 조정 = 위험 감소, 능력 삭제 아님).

### 2.6.2 산출 (신규 4 + 수정 5)

**신규** `apps/worker/src/ws-server/`:
- `auth.ts` — `createTokenVerifier(secret)→TokenVerifier`. jose `jwtVerify` (algorithms:["HS256"] alg-confusion 차단 / audience:"authenticated" / exp·sub 검증). 실패 사유 enum(`missing/malformed/expired/invalid_signature/wrong_aud`, drift 방지). 빈 secret throw(fail-closed).
- `rateLimiter.ts` — `TokenBucket`(capacity/refillPerSec, now 주입 테스트 가능).
- `__tests__/auth.test.ts`(9) + `rateLimiter.test.ts`(4) + `WsServer.test.ts`(6, 실 ws 통합).

**수정**:
- `WsServer.ts` — `verifyClient` 핸드셰이크 인증(실패 cb(false,401)) + `extractToken`(subprotocol) + `handleProtocols`(WS_SUBPROTOCOL 만 echo=토큰 비노출) + 구독 cap(기본 100, 초과 graceful 무시) + rate limit(close 4429) + ping/pong 좀비 정리(30s) + 토큰 만료 close(4401, 32-bit 타이머 클램프) + maxPayload 4KB + 토픽 길이 256 + `limits` override. `WS_SUBPROTOCOL` export(단일 진실).
- `index.ts`(worker) — `SUPABASE_JWT_SECRET` 로드 + verifier 주입(secret 없으면 WS 만 graceful 비활성). host 127.0.0.1 유지 주석.
- `ws-server/index.ts`(배럴) — auth/rateLimiter/WS_SUBPROTOCOL export.
- `deploy/worker.env.example` — `SUPABASE_JWT_SECRET` + WS_SERVER_* 주석 추가.
- `scripts/smokeWsServer.ts` — 인증 적용(테스트 토큰 서명 + 무토큰 거부 + 유효 토큰 통과). `package.json` — `jose` 의존성.

### 2.6.3 검증 게이트 (Phase 1, 전부 PASS)

| 게이트 | 결과 |
|---|---|
| `type-check`(worker + `-r` 6 프로젝트) / `lint` | ✅ clean |
| `test` | ✅ **200 PASS** (181→+19 auth9/rate4/WsServer6, 회귀 0) |
| `smoke:ws-server` | ✅ **PASS** — 무토큰 거부 + 유효 토큰 통과 + 방송 **62ms** 도착 + 격리/unsubscribe/graceful stop |
| `@security-auditor` (사전 + 코드 재감사 2회) | ✅ **0 Critical** — 사전: DNS-only 조건부 수용 + W-1~W-5. 코드: W-3 핸드셰이크 인증·HS256·cap/rate/idle·fail-closed 전부 충족, 외부 노출 **조건부 가능**(코드 합격, W-1/W-2 인프라 단계). 즉시 반영: 주석 정정·미세누수·타이머 클램프 |
| `@code-reviewer` | ✅ **0 Critical** — fail-closed·enum drift 방지 호평. W1~W5/S1~S3 즉시 반영(주석·타이머 클램프·토픽 길이·만료 테스트) |

### 2.6.4 회수 / 신규 deferred

- ✅ **`[10-52]` 회수** (구독 cap + rate limit 구현 완료).
- 신규 **`[10-54]`** 🔵 수집-WS 프로세스 분리(베타 전, LiveBus→Redis 경계 기설계) · **`[10-55]`** 🔵 CF Spectrum/엣지 rate-limit 재평가 · **`[10-56]`** 🔵 IP/유저당 동시 연결 cap.

---

## 3. 남은 Step (골격 — 착수 시 UIUX/아키텍처 협업)

- **Step 3** ✅ 완료 — 레지스트리 계약(3a) + 프론트 라우터(3b). 위 §2.5 참조.
- **Step 2 Phase 1 (서버 인증 코드)** ✅ 완료 — 위 §2.6 참조. `auth.ts`/`rateLimiter.ts`/`WsServer.ts` JWT 인증 + cap/rate/idle. `[10-52]` 회수.
- **Step 2 Phase 2 (인프라 — 도메인 확보됨, 사용자 실행 + Claude 안내)** = wss(TLS) 배포. 구체 절차:
  - (a) **Hetzner Cloud 콘솔에서 프로덕션 워커 Public IPv4 실측** (CPX22/Nuremberg, apps/worker — 메모리 `178.105.38.94` stale 가능, collector `49.13.138.121` 와 혼동 금지).
  - (b) **Cloudflare DNS A 레코드** — `ws` → 그 IP, **프록시 OFF(DNS-only/회색 구름)** (Caddy 가 LE 직접 발급하려면 필수).
  - (c) **Caddy 설치 + Caddyfile** — `ws.use-travis.com { reverse_proxy 127.0.0.1:8081 }` (자동 TLS + WS upgrade 기본 처리). `sudo systemctl reload caddy`.
  - (d) **방화벽** — 443/80 인바운드 허용, **8081 외부 차단 유지**, SSH 키 인증(security-auditor W-1/W-2). Hetzner Cloud Firewall 권장.
  - (e) **워커 env + 재배포** — `worker.env` 에 `SUPABASE_JWT_SECRET`(Supabase→Settings→API→JWT Secret) 추가 → git pull → build → restart. `WS_SERVER_HOST` 는 127.0.0.1 유지(0.0.0.0 금지). fail-closed 확인(secret 없으면 WS 미기동 로그).
  - (f) **Vercel** — `NEXT_PUBLIC_WS_URL=wss://ws.use-travis.com` 추가 + 재배포.
  - **종료 게이트** = 인증된 wss 연결 1회 성공(실 토큰 smoke) + 무토큰/위조 거부 + `@security-auditor` 노출-직후 재감사.
  - 자문 `@backend-infra-specialist`(서버/Caddy/배포) + `@security-auditor`(노출-직후 재감사).
- **Step 4 (플립 — Step 2 후)** = 워커 배선 + ticker 전환 + 프론트 토큰 첨부 + 검증을 한 몸으로:
  - (a) 워커 `index.ts` Step 1 인라인 토픽 → `buildLiveTopic` 교체 + ticker datasource(`now_futures_ticker`/`now_spot_ticker`)에 `liveTopicSpec` 등록 (`defaults.ts`). **★ W2 토픽 리터럴 grep** 으로 양쪽 단일 진실 강제.
  - (b) ticker datasource `transport: "ws_direct"` 로 전환 + TickerCard 가 `selector={market_type,symbol}` 전달(useMemo).
  - (b2) **프론트 토큰 첨부** — `liveConnection` 에 Supabase 세션 토큰 provider 주입 + `wsFactory(url, [WS_SUBPROTOCOL, token])`. `connect()` 비동기화에 따라 휴면 프론트 테스트 6종 재작성 동반(Step 2 에서 이월).
  - (c) `[10-53]` 선결 — 재연결 error 깜빡임 매핑(crypto-trader 자문) + (고빈도 아니면 seq 보류).
  - (d) **라이브 검증** — 워커 로컬 기동(또는 배포) + 프론트 `ws://localhost:8081` 연결 → "박동 소멸" 실측(Playwright tick 간격) + **site=DB**(워커 payload 필드 = 카드 필드, S2). `@nextjs-frontend`(TickerCard·throttle) + `@crypto-trader`(에러 UX) + `@backend-infra`(워커 배선).
- **Step 5** 라이브 G2 종합 — "박동 소멸" + site=DB + 경로 B fallback + docs. `[10-1]`(a) 묘비.

**fast-follow (본 테마 scope 밖, 별도 테마)**: ②청산 피드 카드 ③trade+bookTicker(스캘퍼) ④OKX/뉴스/온체인 — 전부 같은 토대(불투명 토픽+자유 페이로드)에 얹힘.

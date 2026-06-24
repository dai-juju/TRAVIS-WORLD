# M2 경로 A — WS 프론트 직결 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** — Step 1 ✅ + Step 3a ✅ + Step 3b ✅ + Step 2 Phase 1/2 ✅ + **Step 4 Phase A (휴면 코드) ✅** (2026-06-23). **다음 = Step 4 Phase B (워커 재배포 → 플립 1줄 → 라이브 박동소멸 검증, 사용자 협업)**.
> **▶▶ `/clear` 후 세션 재개 가이드 (2026-06-23, Step 4 Phase A 완료 갱신)**: 이 파일이 경로 A 단일 진실 — 가장 먼저 읽기.
> 1. **코드 현황**: Step 1(`8bc171e`) + 3a(`5b26143`) + 3b(`e367810`) + Step 2 Phase 1(`7824148`)/Phase 2(라이브) ✅ + **Step 4 Phase A ✅** (§3 Step 4 Phase A). `wss://ws.use-travis.com` 라이브, 워커 Hetzner(`178.105.38.94`) 가동. **단 프론트·워커 모두 ticker 는 여전히 경로 B(휴면)** — Phase A 는 능력만 깔고 transport 는 realtime 유지. 실제 플립은 Phase B.
> 2. **▶ 다음 = Step 4 Phase B (플립 + 라이브 검증, 사용자 협업)** (§3 Step 4 Phase B). ★**배포 순서 안전 불변식**: "프론트 새 토픽 구독"이 "워커 새 토픽 방송"을 앞서면 안 됨 → ① 워커 재배포(Phase A 커밋 pull = buildLiveTopic+liveTopicSpec) **먼저** → ② 그 다음 `transport:"ws_direct"` 플립 1줄 + TickerCard 옵션 C UI 커밋 push(Vercel) → ③ 라이브 박동소멸 + site=DB 검증. (Phase A 를 main 에 먼저 push 해도 휴면이라 안전.)
> 3. **인프라 후속(차단 아님)**: `[10-58]`(토큰 TLS 종단, 인프라 변경 시) · `[10-54]`/`[10-55]`/`[10-56]` 🔵 베타 전.
> 4. **Phase B 대기 시**: 다른 작업(테마 D 차트 / 세션 컨텍스트 / `[8-27]` 빚 — `M2-step2-usage-feedback.md §E·§H`).
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

- **`[10-52]`** ✅ **회수 (Step 2 Phase 1, 2026-06-22)** — 구독 cap(100) + 토큰버킷 rate limit(close 4429) 구현. 상세 §2.6.

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

### 2.6.5 Phase 2 — wss 인프라 라이브 배포 ✅ (2026-06-22, 사용자 실행 + Claude 안내)

사용자와 함께한 라이브 SSH/콘솔 세션으로 `wss://ws.use-travis.com` 외부 노출 완료. **코드 변경 0**(순수 인프라). 워커 = `178.105.38.94`(CPX22/Nuremberg, Ubuntu 24.04, `travis-worker.service`, `tsx` 직접 실행 = 빌드 없음).

**실행 순서 (전부 PASS)**:
1. **워커 코드 배포** — `git pull` `454b8ab`→`e99ae44` (★ 6-12 가동본에 ws-server 코드 없어 git pull **필수**였음 — runbook "restart만"은 가동본이 코드보다 stale 한 점 누락, 실배포 전 서버 HEAD 대조로 적발) + `pnpm install --frozen-lockfile`(jose@6.2.3 신규, pnpm 모노레포 호이스팅 = 루트 `node_modules/.pnpm`). travis 유저 실행(소유권 일관성).
2. **JWT secret + 재시작** — `/etc/travis/worker.env`(root:travis 0640)에 `SUPABASE_JWT_SECRET`(86자, Supabase Project Settings→API→JWT Secret) 추가 → `systemctl restart travis-worker` → `[liveWsServer] listening ws://127.0.0.1:8081 (Step 2: JWT 인증 활성)` 로그 + `ss` `LISTEN 127.0.0.1:8081`(0.0.0.0 아님). **fail-closed→활성 전환 라이브 실증**.
3. **방화벽 (ufw active)** — `ufw allow 80/tcp` + `443/tcp`. 22/80/443 ALLOW IN, **8081 규칙 없음**. 외부 `curl :8081`→`Connection timed out (28)` 실증.
4. **DNS** — Cloudflare A `ws`→`178.105.38.94`, **DNS-only(회색 구름)**. `nslookup ... 1.1.1.1` 전파 확인.
5. **Caddy** — 2.6.2(Ubuntu universe; cloudsmith repo 등록은 멀티라인 복붙 깨짐으로 실패했으나 **universe 패키지로 설치 성공** — 우리 단순 Caddyfile 엔 2.6.2 충분). Caddyfile = `ws.use-travis.com { reverse_proxy 127.0.0.1:8081 }`(printf 한 줄 작성). LE **tls-alpn-01** 발급 성공(`certificate obtained successfully`) + HTTP→HTTPS 자동 리다이렉트.
6. **연결 검증** — 무토큰 `wscat -c wss://ws.use-travis.com`→**401**(핸드셰이크 거부) + 8081/2019 외부 timeout. ★ 위조/유효 토큰 라이브는 **wscat 이 subprotocol 배열 2개를 못 보내(콤마 단일 subprotocol 거부) Step 4(브라우저 WebSocket)로 이동** — 위조 거부는 무토큰과 동일 verifyClient 경로(auth.test 9 unit + 5-A 라이브 401 입증).

**종료 게이트 (PASS)**: 인증서 발급 + 무토큰 거부(401) + 8081/2019 직통 차단 + **`@security-auditor` 노출-직후 재감사 0 Critical / 4 Warn / 9 Pass** (W-1~W-5 전부 충족, audit log append). W-1(Caddy admin 2019)=`127.0.0.1:2019` loopback + 외부 timeout 실측 **해소**. 잔여 W → deferred: `[10-56]`(IP당 동시 연결, W-2) / `[10-55]`(+ fail2ban·`ufw limit 22`, W-3). **`[10-57]`(커널 재부팅, W-4) ✅ 회수 (2026-06-23)** — 같은 세션 재부팅 완료(커널 `6.8.0-107`→`124`) + 자동 복구 4종 PASS(travis-worker/caddy `active` · 8081 `127.0.0.1` · 외부 wss 401) + USDM ticker freshness 1~2초(BTC/ETH/SOL site=DB, 위생 #9 — "WS usdm disconnected" 는 @arr 폐지 후 CHK relay 운반 정상 구조 확정).

**★ 라이브 세션 교훈** (다음 인프라 세션 재사용):
- **PowerShell→SSH 멀티라인 복붙이 `&&` 체인·따옴표·콤마에서 반복 깨짐** → 한 줄 명령 · `printf`로 파일 쓰기 · grep 패턴 등 따옴표 제거 · 짧게 분할로 회피.
- **runbook "재배포=restart만"은 가동본 코드가 stale 할 때 git pull+install 누락** → 실배포 전 `git log --oneline -1` + 대상 디렉토리 존재 확인 필수.
- **wscat 한계**: subprotocol 2개(`[id, token]`) 전송 불가 → 토큰 통과 검증은 브라우저 WebSocket(Step 4) 필수.

---

## 3. 남은 Step (골격 — 착수 시 UIUX/아키텍처 협업)

- **Step 3** ✅ 완료 — 레지스트리 계약(3a) + 프론트 라우터(3b). 위 §2.5 참조.
- **Step 2 Phase 1 (서버 인증 코드)** ✅ 완료 — 위 §2.6 참조. `auth.ts`/`rateLimiter.ts`/`WsServer.ts` JWT 인증 + cap/rate/idle. `[10-52]` 회수.
- **Step 2 Phase 2 (인프라 — 사용자 실행 + Claude 안내)** = wss(TLS) 배포. ✅ **완료 (2026-06-22 — 결과 §2.6.5)**: `wss://ws.use-travis.com` 노출 + LE 인증서 + 무토큰 거부(401) + security-auditor 재감사 0C. 아래 절차는 실행 이력 보존:
  - (a) **Hetzner Cloud 콘솔에서 프로덕션 워커 Public IPv4 실측** (CPX22/Nuremberg, apps/worker — 메모리 `178.105.38.94` stale 가능, collector `49.13.138.121` 와 혼동 금지).
  - (b) **Cloudflare DNS A 레코드** — `ws` → 그 IP, **프록시 OFF(DNS-only/회색 구름)** (Caddy 가 LE 직접 발급하려면 필수).
  - (c) **Caddy 설치 + Caddyfile** — `ws.use-travis.com { reverse_proxy 127.0.0.1:8081 }` (자동 TLS + WS upgrade 기본 처리). `sudo systemctl reload caddy`.
  - (d) **방화벽** — 443/80 인바운드 허용, **8081 외부 차단 유지**, SSH 키 인증(security-auditor W-1/W-2). Hetzner Cloud Firewall 권장.
  - (e) **워커 env + 재배포** — `worker.env` 에 `SUPABASE_JWT_SECRET`(Supabase→Settings→API→JWT Secret) 추가 → git pull → build → restart. `WS_SERVER_HOST` 는 127.0.0.1 유지(0.0.0.0 금지). fail-closed 확인(secret 없으면 WS 미기동 로그).
  - (f) **Vercel** — `NEXT_PUBLIC_WS_URL=wss://ws.use-travis.com` 추가 + 재배포.
  - **종료 게이트** = 인증된 wss 연결 1회 성공(실 토큰 smoke) + 무토큰/위조 거부 + `@security-auditor` 노출-직후 재감사.
  - 자문 `@backend-infra-specialist`(서버/Caddy/배포) + `@security-auditor`(노출-직후 재감사).
- **Step 4 (플립)** — `roadmap-milestone-manager` 분해(4a~4f) + Step 2 선례대로 **Phase A(코드·휴면) / Phase B(인프라+라이브)** 로 분리. crypto-trader `[10-53]`(a) 자문 = **옵션 C**(값 흐림 + "updated Ns ago" + 5초 유예 후 중립어 승격, 사용자 결정 2026-06-23).

### Step 4 Phase A — 휴면 코드 ✅ 완료 (2026-06-23)

> ★ **핵심 불변식 = 프로덕션 화면 변화 0**. ticker transport 는 realtime 유지 → ws_direct 분기 미진입. main push 안전(Step 3b 와 동일 패턴). code-reviewer + security-auditor **0 Critical**.

- **산출 (수정 8 + 신규 2)**:
  - `defaults.ts` — now_spot/futures_ticker 에 `liveTopicSpec`(prefix `"binance:ticker"`, selectorKeys `["market_type","symbol"]`). **transport 는 default realtime 유지(휴면)** — registerDatasource W1 경고는 의도된 과도기 마커.
  - 워커 `index.ts` — 인라인 토픽 리터럴 → `buildLiveTopic` 단일 진실 교체 + `TICKER_DATASOURCE_BY_MARKET` 맵. **W2 grep: 프로덕션 토픽 리터럴 0건.**
  - `packages/shared/src/liveTransport.ts`(신규) — `WS_SUBPROTOCOL` 을 worker·web 단일 진실로 승격. WsServer 는 import+re-export 로 전환.
  - `liveConnection.ts` — connect() 비동기화: 핸드셰이크 전 `tokenProvider` await → `wsFactory(url, [WS_SUBPROTOCOL, token])`. ensureOpen 가드 status 기반+reconnectTimer + closedByUs await-후 재확인(중복 소켓 차단). 토큰 null/throw graceful 재연결.
  - `liveAuthToken.ts`(신규) — `getLiveAccessToken()` = Supabase 세션 access_token, 실패 graceful null.
  - `liveTopicManager.ts` — tokenProvider 배선 + **mapStatus 재연결-인지**(활성 토픽 동안 errored/closed → subscribing = `[10-53]`(a) 빨간 깜빡임 차단).
  - `TickerCard.tsx` — `selector={{market_type,symbol}}`(useMemo). realtime 무시 = 휴면(4d-prep).
  - 테스트: `liveTopicManager.test.ts` async 재작성 + 2 신규(토큰 subprotocol 첨부 / 재연결 subscribing 매핑) · `transport.test.ts` spot/futures 휴면 단언 2.
- **검증 게이트 (전부 PASS)**: type-check shared/worker/web green · test shared 44 / worker 200 / web 287 (회귀 0) · **W2 grep 0건** · code-reviewer 0C(3W/3S, 휴면 불변식 코드+테스트 보증) · security-auditor 0C(1W/8P, 토큰 로그·URL·에러 비노출 전수 확인).
- **반영된 리뷰**: code-reviewer W1(connect 토큰실패 status 주석)·W2(spot 휴면 테스트)·S1(`|| null`) 즉시 / W3(과도기 경고 소멸 확인) → Phase B 체크리스트(B-3) / S2(mapStatus grace-window teardown entry 도 active 로 셈 — 실害 거의 0, Phase B 라이브 체감 시 `teardownTimer===null` 만 카운트로 조정)·S3(selector 는 반드시 `useMemo` — 새 카드 추가 시 규약, realtime 경로 불필요 재구독 방지) = 관측/규약 노트로 보류. security W-1 → `[10-58]`.

### Step 4 Phase B — 인프라 + 라이브 (사용자 협업, ▶ 다음)

> ★ **배포 순서 안전 불변식**: "프론트 새 토픽 구독"이 "워커 새 토픽 방송"을 절대 앞서면 안 됨. 따라서 워커 재배포(Phase A 코드 pull) **먼저**, 그 다음에 transport 플립 push(Vercel).

#### Phase B 코드 준비 ✅ (2026-06-24, push 보류 — 라이브 세션에서 순서대로 commit)

사용자 결정 "코드 먼저 준비 후 라이브". 모든 B-2 코드 작성 + 검증 + 자문 완료, **push 는 B-1(워커 재배포) 확인 후**.

- **산출 (커밋 2개로 분리 예정 — 배포 순서 불변식 준수)**:
  - **커밋 ①(워커 전용, B-1 전에 push)** = `tickerWsHandler.ts` + 테스트. 경로 A 방송 payload 에 `updated_at` 주입(`withBroadcastTimestamp`, 워커 수신 시각 ISO). **upsert(경로 B) 입력 무변경** → DB trigger/DEFAULT NOW() 그대로. 이 파일은 워커 전용이라 push 해도 프론트 거동 0(defaults.ts 미플립 → 여전히 경로 B).
  - **커밋 ②(플립, B-1 확인 후 push → Vercel)** = `defaults.ts`(ticker 2종 `transport:"ws_direct"`) + `transport.test.ts`(휴면 단언 → ws_direct 뒤집기) + `TickerCard.tsx`(옵션 C UI).
- **★ code-reviewer C1 (Critical) 발견·수정**: 경로 A 방송 row 는 DB 우회라 `updated_at`(DEFAULT NOW() 컬럼) 부재 → freshness "updated —" 깨짐. 워커 측 broadcast-only 주입으로 해결(위 커밋 ①). 287 test 가 못 잡은 = mock 사각(`feedback_mock_test_invariant_blind_spot` 운반층 버전) → **B-3 라이브에서 freshness 실제 흐름 확인 게이트화**.
- **옵션 C UI (TickerCard)**: 재연결(`status==="loading" && data`, W2 가드 `hasConnectedRef` 로 초기로딩 제외) 시 값 흐림(opacity-40) + "updated Ns ago"(흐림 래퍼 바깥, 항상 선명) + 5초 유예 후 "reconnecting…"(빨간 error 금지). freshness 항상 노출 = brownout([10-11]) 방어(B-3 crypto-trader 재판단, `[10-63]`).
- **검증 게이트 (전부 PASS)**: type-check shared/worker/web green · test worker 201(+1 C1 가드) / web 287(회귀 0) · prettier green. (lint = `[10-59]` 환경 이슈 미실행.)
- **자문**: `@code-reviewer` C1(updated_at)+W1(주석 stale)+W2(초기로딩 오판) → **전부 즉시 반영**, S1/S2/S3 → deferred `[10-60]`~`[10-63]`. `@nextjs-frontend` 0 Critical(opacity 래퍼 분리·ref 방식 "정확히 옳음"), Q4(freshness 노이즈) → `[10-63]`.
- **잔여 (라이브 세션)**: B-1 워커 재배포(커밋 ① pull) → B-2 플립 push(커밋 ②) → B-3 라이브 G2.

- **B-1. 워커 재배포** — Hetzner(`178.105.38.94`)에서 Phase A 커밋 `git pull` + restart. → 워커가 `buildLiveTopic` 으로 새 토픽 방송 준비(구독자 0 = 무비용 no-op). `@backend-infra-specialist` 안내.
- **B-2. 플립 커밋** (워커 재배포 확인 후에만 push):
  - `defaults.ts` ticker 2종 `transport: "ws_direct"` (← 실제 스위치 1줄 × 2). `transport.test.ts` 휴면 단언 → ws_direct 로 뒤집기.
  - `TickerCard.tsx` **옵션 C UI** — `status==="loading" && data` = 재연결 → 값 흐림(opacity) + `formatRelativeTime(updated_at, useNow)` "updated Ns ago" + 5초 유예 후 중립어("disconnected/reconnecting", 빨간 error 금지). IndicatorCard freshness 메커니즘 재사용. `@nextjs-frontend` 자문.
  - push → Vercel 자동 배포. `NEXT_PUBLIC_WS_URL=wss://ws.use-travis.com` 확인.
- **B-3. 라이브 검증(G2)** — 브라우저 로그인 후 ticker 카드 → ① **토큰 통과 실증**(wscat 못 했던 subprotocol 배열 2개) ② **"박동 소멸"** Playwright tick 간격 실측 ③ **site=DB**(워커 payload 필드 = 카드 필드, `@crypto-domain-expert` 위생 #9) ④ 재연결 옵션 C 거동 ⑤ **W3 확인**: 플립 후 registerDatasource 과도기 경고 소멸. `@crypto-trader`(에러 UX) + `@backend-infra`(워커).
- **Step 5** 종합 — "박동 소멸" + site=DB + 경로 B fallback + docs. `[10-1]`(a) 묘비.

**fast-follow (본 테마 scope 밖, 별도 테마)**: ②청산 피드 카드 ③trade+bookTicker(스캘퍼) ④OKX/뉴스/온체인 — 전부 같은 토대(불투명 토픽+자유 페이로드)에 얹힘.

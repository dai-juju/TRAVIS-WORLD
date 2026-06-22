# M2 경로 A — WS 프론트 직결 (task-record, 단일 진실)

> **상태**: 🔄 **진행 중** — Step 1 (워커 WS 서버 셸) ✅ + **Step 3a (레지스트리 계약) ✅** (2026-06-22). Step 2(도메인 대기) 보류 후순위, Step 3b/3c → 4 → 5 진행 예정. (Step 3 을 Step 2 보다 먼저 — 도메인 미보유, 로컬 ws:// 로 진행 가능, 사용자 결정.)
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

### Sub-step 3b/3c (대기)
- **3b 워커 배선** — Step 1 인라인 토픽 → `buildLiveTopic` 교체 + ticker datasource 에 `liveTopicSpec` 등록(transport 는 realtime 유지 = 안 넘김). backend-infra.
- **3c 프론트 라우터** — `liveTopicManager`(channelManager 쌍둥이) + `liveConnection`(재연결) + `liveCoalescer`(저사양 rAF) + 훅 transport 분기 + `selector` 입력. nextjs-frontend. env `NEXT_PUBLIC_WS_URL`(로컬 `ws://localhost:8081`).

---

## 3. 남은 Step (골격 — 착수 시 UIUX/아키텍처 협업)

- **Step 2** wss(TLS, Caddy 리버스 프록시) + JWT 인증(Supabase 토큰 재사용). ⚠️ **선행 블로커 = 서브도메인 1개**(raw IP 공인인증서 불가). 사용자 도메인 미보유 — 추후 확보(TRAVIS 리네임 가능성으로 `WS_PUBLIC_HOST` env 화). `@security-auditor` 감사 필수.
- **Step 3** 프론트 transport-agnostic 훅(`useDataServiceRow` 동형) + 레지스트리 `transport` 칸(ws_direct/realtime/on-demand) + dataService 경로 자동 선택. `[8-27]`#1 부분 회수. `@zod-schema-architect` 공동 확정.
- **Step 4** 단일 ticker → TickerCard 경로 A 적용(MVP) + 저사양 UHD620 throttle(rAF). `@nextjs-frontend-specialist`.
- **Step 5** 라이브 G2 — Playwright tick 간격 분포 비교("박동 소멸") + site=DB + 경로 B fallback + docs. `[10-1]`(a) 묘비.

**fast-follow (본 테마 scope 밖, 별도 테마)**: ②청산 피드 카드 ③trade+bookTicker(스캘퍼) ④OKX/뉴스/온체인 — 전부 같은 토대(불투명 토픽+자유 페이로드)에 얹힘.

# TRAVIS — Deferred 회수 완료 아카이브 (deferred-archive.md)

> **성격**: `docs/deferred-task.md` 에서 **회수 완료(묘비)** 된 항목의 전문 보존소. `[10-100]` 대청소(2026-07-13)로 신설 — 이후 회수되는 항목은 deferred-task.md 에서 제거하고 여기로 전문 이관한다.
> **규칙**: 원 섹션별 그룹 유지 / 회수 커밋·task-record 링크는 본 파일에서 계속 유효 / 본 파일은 이력 보존용이라 **열린 작업을 여기 등재하지 않는다**.
> **이관 이력**: 2026-07-13 최초 이관 86건 (+ §1/§2 인트로 묘비 + 구 집계표/🚦 이력 부록).


---

## 원 섹션: §1 (구) 1. 🔴 M1.6 착수 전 필수 작업 (블록킹)

## 1. 🔴 M1.6 착수 전 필수 작업 (블록킹)

> **[1-2] ChatInputBar fetch 교체 + dummyChatParser 삭제** — ✅ **2026-04-22 M1.5 Step 3 로 회수 완료**.
>
> **[1-1] Haiku 응답 `refusal` 블록 처리** — ✅ **2026-04-23 M1.5 Step 3d 로 회수 완료**.
>
> **[1-3] datasource id ↔ Supabase 테이블명 불일치 긴급 수정** — ✅ **2026-04-24 M1.6 Step 0.1 로 선행 회수 완료** (대안 A 임시 적용: `ticker_spot` / `ticker_futures` → `now_spot_ticker` / `now_futures_ticker`, 2개 id 한정). 사용자 테스트 세션에서 발견한 3증상(realtime error / 목록 실시간 갱신 안됨 / "BTC vs Tether" 제목) 근본 해결. 근본 구조 결정(대안 B 승격 여부 + Zod enum 방어선 + 나머지 6개 datasource)은 [3-7] M1.6 Step 4 에서 `@zod-schema-architect` 자문 경유 확정 예정. 세부: `docs/task-record/M1.6-step0.1-urgent-fixes.md`.

**현재 🔴 블록킹 항목 없음** — **M1.5 완료 선언 (2026-04-23) + M1.6 Step 0.1 완료 (2026-04-24)**. M1.6 (인증/RLS) Step 1 즉시 착수 가능.

---


---

## 원 섹션: §2 (구) 2. 🟠 M1.5 완료 기준 — ✅ **2026-04-23 M1.5 Step 4 로 전부 회수 완료**

## 2. 🟠 M1.5 완료 기준 — ✅ **2026-04-23 M1.5 Step 4 로 전부 회수 완료**

> **[2-1] Zod 고의 실패 fallback E2E** — ✅ 회수 (FORCE_INVALID_RESPONSE 경로, Playwright B PASS).
>
> **[2-2] `log_validation_failure` ≥1건 축적** — ✅ 회수 (`smoke:query-log` 으로 4 rows 확인).
>
> **[2-3] grep 2종** — ✅ 회수 (외부 API URL 0건 / orchestrate 경로 내 직접 HTTP 0건).
>
> **[2-4] 동일 쿼리 2회 카드 타입 안정성** — ✅ 회수 (`resolveUniqueId` 구조적 해결 + Playwright E PASS).
>
> **[2-5] updateMode value/content 출력** — ✅ 회수 (`data-update-mode` attribute 검증).
>
> **[2-7] ChatInputBar RTL 3 시나리오** — ✅ 회수 (55/55 tests PASS).
>
> 상세: `docs/task-record/M1.5-complete.md`.


---

## 원 섹션: 2. 🟠 M1.5 완료 기준 — ✅ **2026-04-23 M1.5 Step 4 로 전부 회수 완료**

### [2-6] ~~ChatInputBar `useCallback` stale closure~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3e 로 회수 완료**

> `submittingRef = useRef(false)` 동기 race guard 추가. ref mutation 은 동기라 1초 안 Enter 이중 시 즉시 차단. 기존 `isLoading` 검사 (1차 방어선) + ref (2차) 두 겹 가드. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [2-8] ~~`handleSubmit` 57줄 multi-responsibility~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3e 로 회수 완료**

> `apps/web/lib/chat/submitOrchestrate.ts` 순수 함수 추출 — fetch + HTTP 에러 분기 + JSON parse + dispatcher 위임 책임. `SubmitResult` enum (5종) 반환. ChatInputBar 는 input 검증 + state 갱신 + UX 만 유지. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

---


---

## 원 섹션: 3. 🟡 M1.6 (인증/RLS) 도입 시 일괄 처리

### [3-4] ~~CI 빌드에 RLS 검증 스크립트 추가~~ — ✅ **2026-05-03 M1.6 Step 5 로 회수 완료**

> `pnpm rls-check` npm script + `scripts/rls-check.ts` (pg 직접 connection + redact) + `scripts/rls-check.sql` (security-auditor 보강 — schemaname='public' / pg_class.relrowsecurity / RLS_OFF vs RLS_ON_NO_POLICY 분리 / `user_*` `log_*` `now_*` `history_*` `symbols` 5 prefix). exit 0=OK / 1=violation / 2=error. baseline (Supabase MCP execute_sql, 2026-05-03) **13 테이블 모두 OK**. M1.7 Step 5 security audit 시점에 GitHub Actions 자동 승격 가능 (자세한 보안 권고는 `scripts/README.md`). 세부: `docs/task-record/M1.6-step5-test-infra.md`.

### [3-6] ~~비로그인 상태 `/api/orchestrate` 401 거부~~ — ✅ **2026-04-24 M1.6 Step 1 로 회수 완료**

> `middleware.ts` matcher `/api/orchestrate/:path*` + `@supabase/ssr` `createServerClient` 의 `auth.getUser()` 로 401 JSON. route.ts POST 핸들러 맨 앞에 두 겹 방어(defense-in-depth) 추가. ChatInputBar 가 401 body 의 `message` 를 유저 토스트로 그대로 노출해 "Please sign in to use AI features." 안내가 도달. 세부: `docs/task-record/M1.6-step1-auth-middleware.md`.

### [3-7] ~~`datasource` / `componentId` 자유문자열 → registry enum 승격~~ — ✅ **2026-04-28 M1.6 Step 4 로 회수 완료**

> `packages/shared/src/schemas/registryRefinements.ts` 신설 (`RegisteredComponentIdSchema` / `RegisteredDatasourceIdSchema` / `RegisteredInteractionIdSchema` 3종 — `superRefine` + 빈 registry 가드 + 등록 목록 dump 메시지). `AiCardConfigSchema.componentId` / `data.datasource` / `CardActionSchema.targetComponentId` 3 필드 적용. zod-schema-architect 자문 채택 (옵션 c — `superRefine` + dump). 감사 범위 4 AI-facing literal 모두 등록된 id 와 정합 — 추가 변경 없음. `ensureRegistries()` test helper 신설로 격리 보장. 세부: `docs/task-record/M1.6-step4-registry-enum.md`.

### [3-8] ~~fallbackReason enum 세분화 — `parse_error` / `schema_drift` 분리~~ — ✅ **2026-04-28 M1.6 Step 4 로 회수 완료**

> `OrchestrateFallbackReasonSchema` 의 `validation_exhausted` 를 `parse_error` (JSON.parse 실패 / tool_use 블록 누락 / Anthropic SDK invalid response) + `schema_drift` (Zod 검증 실패 — registry refinement 포함) 2분할. `route.ts` 매핑 4곳 갱신 + `messageForReason` switch 에 영어 메시지 2 case 신규 (English-only 정책). 테스트 픽스처 (`actionDispatcher.test.ts` + `m1.5-orchestrate.spec.ts`) 일괄 갱신. `[3-29]` deferred 의 CHECK SQL 도 enum drift 방지 위해 동시 갱신. 세부: `docs/task-record/M1.6-step4-registry-enum.md`.

### [3-9] ~~`orchestrateOnce` 단위 테스트 (Anthropic SDK mock)~~ — ✅ **2026-05-03 M1.6 Step 5 로 회수 완료**

> `apps/web/lib/ai/__tests__/orchestrateOnce.test.ts` 신설 (8 시나리오: refusal / parse_error[extract] / schema_drift / transient_error / upstream_error[MissingKey] / parse_error[InvalidResponse] / correction 3턴 / success). `vi.mock("@/lib/ai", importOriginal)` 패턴 — callHaiku 만 stub, 에러 클래스/buildSystemPrompt/HAIKU_MODEL_ID 보존. `orchestrateOnce` + `ORCH_TOOL_NAME` route.ts export (test seam). `apps/web/lib/ai/__tests__/__fixtures__/fakeMessage.ts` (Anthropic SDK 0.90 Message 모든 필드 안전 초기화 builder + 시나리오별 CallHaikuResult factory 3종). ai-orchestrator-specialist 자문 (2026-05-03) 채택. 세부: `docs/task-record/M1.6-step5-test-infra.md`.

### [3-10] ~~프론트 카드 `supabase.from(` 직접 호출 → dataService 레이어 도입~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3a/3b 로 회수 완료 (부분)**

> `apps/web/lib/dataService/` 7 파일 신설 (channelManager 옵션 Z + useSyncExternalStore hooks). `TickerCard` / `CoinListCard` 의 Realtime 구독 = `useDataServiceRow` / `useDataServiceTable` 경유로 마이그레이션. **잔여**: `initialFetch` 안에서 카드가 `getSupabaseBrowserClient()` 직접 호출 — `[3-34]` 신규 deferred (Step 5 또는 M2+ 어댑터 면 확장). 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [3-12] ~~UserMenu 초기 mount loading → email FOUC 엣지 미세 조정~~ — ✅ **2026-05-03 M1.6 Step 5 (5c 흡수) 로 회수 완료**

> `UserMenu.tsx` 의 `onAuthStateChange` callback 안에 `setLoading(false)` 1줄 추가. Supabase 가 listener 등록 직후 INITIAL_SESSION 을 동기 emit 시 즉시 loading 해제 → 우상단 깜빡임 0. UserMenu RTL 테스트 (iii) 시나리오 (`getUser` 영원히 pending + sync emit) 로 회귀 가드. roadmap-mm 권고 채택 (5c 흡수, ~10m). 세부: `docs/task-record/M1.6-step5-test-infra.md`.

### [3-13] ~~auth 폼 RTL 테스트 (LoginForm / SignupForm / UserMenu)~~ — ✅ **2026-05-03 M1.6 Step 5 로 회수 완료**

> `apps/web/components/auth/__tests__/{LoginForm,SignupForm,UserMenu}.test.tsx` 3 파일 신설 — 14 시나리오 (Login 5 / Signup 5 / UserMenu 4). `vi.mock("@/lib/supabase/browserClient")` facade 가로챔 + 모듈 스코프 spy + `userEvent.setup({ delay: null })`. nextjs-frontend-specialist 자문 (2026-05-03) 채택. **잠복 버그 [3-61] 발견** — LoginForm/SignupForm 의 `submitting` state-based 가드가 진짜 race (Promise.all) 에서 stale closure → signIn 2회 호출. 본 PR 은 disabled-attribute 1차 방어선만 검증, production 변경 ([3-61]) 은 별도 commit. 세부: `docs/task-record/M1.6-step5-test-infra.md`.

### [3-14] ~~middleware env 누락 시 500 → 503 + 응답 본문 최소화~~ — ✅ **2026-05-04 M1.6 Step 6a 로 회수 완료**

> `apps/web/proxy.ts` env 누락 분기를 `{ error: "service_unavailable" }` + status 503 + 헤더 `Retry-After: 30` 으로 변경. 공격자 정보 누설 (server_misconfigured) 차단 + HTTP 표준 retry 신호 추가. 자세한 사유는 서버 console.error 에만 남김. security-auditor 자문 옵션 (C) 채택. 세부: `docs/task-record/M1-complete.md` §6a.

### [3-15] ~~`apps/web/lib/supabase.ts:27` console.warn 한국어~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3b 로 회수 완료**

> `apps/web/lib/supabase.ts` 레거시 파일 통째 삭제 (`getSupabaseBrowserClient` 로 통합). 한국어 console.warn 자연 소멸. 추가로 `actionDispatcher.ts` 한국어 토스트 3건 + `route.ts` Zod 메시지 2건도 영어 회수 (code-reviewer C1). 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [3-16] ~~Next.js 16.2.x `middleware.ts` → `proxy.ts` deprecation 대응~~ — ✅ **2026-05-04 M1.6 Step 6a 로 회수 완료**

> `git mv apps/web/middleware.ts apps/web/proxy.ts` + 함수명 `middleware()` → `proxy()` (silent 무력화 함정 회피) + `tsconfig.json` include 경로 + log-behavior route / browserClient / serverClient / sessionFlusher / LoginForm 의 잔류 middleware 코멘트 10곳 정리. A/B 검증 7개 중 5개 즉시 통과 (deprecation 경고 사라짐 + 401 + matcher 외 비차단 + `:path*` 와일드카드). 6b 에서 가입→로그인 흐름 자연 검증. 세부: `docs/task-record/M1-complete.md` §6a.

### [3-17] ~~Multiple GoTrueClient instances 경고~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3b 로 회수 완료**

> `apps/web/lib/supabase.ts` (옛 `createClient`) 삭제로 cookie storage key 중복 GoTrueClient 인스턴스 자연 소멸. `getSupabaseBrowserClient()` lazy singleton 만 잔존. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [3-11] ~~RTL dispatcher mock shape assertion 추가~~ — ✅ **2026-05-03 M1.6 Step 5 로 회수 완료**

> `ChatInputBar.test.tsx` 에 (d-1) success body / (d-2) fallback body 2 시나리오 신규 — `dispatcherMock` 캡처 후 `OrchestrateApiResponseSchema.safeParse(arg)` 단언. nextjs-frontend-specialist Q6 옵션 B 채택 (호출 인자 캡처 후 별도 expect 블록, 실패 시 `error.format()` 출력으로 디버그 친화). M1.6 Step 4 의 registry-derived schema refinement 회귀 가드. 세부: `docs/task-record/M1.6-step5-test-infra.md`.

### [3-27] ~~log* logger 공통 factory 추출~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3c 로 회수 완료**

> `apps/web/lib/logging/createLogger.ts` factory 신설 — `createLogger<TInput, TInsert>({ name, toRow, insert })` 패턴. logChat / logValidationFailure / logBehavior 3 파일 모두 같은 골격. boilerplate 90% 감소. `ensurePayloadSize` helper 도 같은 위치 (5KB 가드). 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [3-32] ~~AI hallucinated filter field (`base_asset`) — datasource queryableFields 명시화~~ — ✅ **2026-04-28 M1.6 Step 4 로 회수 완료**

> `AiCardConfigSchema` 최상위 `superRefine` 으로 cross-field 검증 — `filters[].field` / `sort.field` 가 해당 datasource 의 머지된 queryableFields 안에 등록된 이름인지 확인. crypto-domain-expert 자문으로 9 datasource queryableFields **18 필드 추가** (특히 `now_spot_ticker` 4→19, `open_interest` 1→5 — 워커는 이미 `oi_chg_5m/15m/1h/4h` 계산 중이었으나 registry 미등록이던 결함). `COMMON_QUERYABLE_FIELDS` (exchange/market_type/symbol) 머지 로직 추가 — 새 datasource 추가 시 boilerplate 0. `buildSystemPrompt.ts` 에 "filters/sort field 는 등록된 이름만" 가이드 1줄 명시 (zodToJsonSchema 가 superRefine 무시 보완). 세부: `docs/task-record/M1.6-step4-registry-enum.md`.

### [3-33] ~~Realtime channel reuse error~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3a 로 회수 완료 (구조적 해결)**

> `apps/web/lib/dataService/channelManager.ts` 옵션 Z 채택 (backend-infra-specialist 자문) — `.on('postgres_changes', ...)` 평생 1회만 호출, listener 추가/제거는 manager 의 dispatch table 만 갱신. 1초 grace period (Strict Mode + 카드 swap 안전). `channelManager.test.ts:79` 에 회귀 방어 테스트 추가. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

---

### [3-39] ~~M1.3 Step 5b 잠복 버그 — `!miniTicker@arr` price_change_pct 영구 stale~~ — ✅ **2026-04-27 M1.6 Step 3.5 hotfix 로 회수 완료**

> M1.3 Step 5b 에서 ticker WS 를 `!miniTicker@arr` (mini, 6필드) 로 설정 → `priceChangePercent` (24h 변화율) 가 페이로드에 없어 DB `now_*_ticker.price_change_pct` 가 M1.3 Step 4 시점 값으로 영구 stale. 약 7일간 잠복. 사용자 발견 (BTCUSDT Binance 사이트 +0.80% / DB -0.282% 차이 1.08%). M1.6 Step 3.5 hotfix 로 `!ticker@arr` (full 17필드) 전환 — 매초 P/p/w/n/O/C 6필드 적재. **CLAUDE.md / PRD / Architecture 에 "사이트=DB 일치" 도메인 원칙 명문화** (위생 #9). 세부: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md`.

### [3-43] ~~`docs/canonical-metrics.md` 신설 — 거래소별 metric 정의 통일 docs~~ — ✅ **2026-05-26 M1.8 §8.5-c 로 회수 완료**

> docs/canonical-metrics.md 신설 (~500줄, 9 섹션) — 7 metric × 9 interval × 단위 × 정밀도 × 사이트 URL 매트릭스 + Binance USDM 본 마일스톤 cover + COINM `[8-3]` M1.9 + OKX/Bybit/Bitget M2+ 청사진. `@crypto-domain-expert` 가 owner (D5). commit `e4e8082`. 세부: `docs/task-record/M1.8-step5-market-units-canonical.md` §5.3.

### [3-43-원본] `docs/canonical-metrics.md` 신설 — 거래소별 metric 정의 통일 docs (M2-plan §Step 0 docs sweep 시 본문 통째 삭제 예정)
- **설명**: 거래소별 metric 정의 차이 (예: Funding Rate 8h 표시 vs 1h 환산 / OI 명목금액 vs 계약수 / Mark Price vs Last Price 기준 PnL 계산) 를 canonical 정의로 통일하는 reference docs. 사이트=DB 일치 원칙 (CLAUDE.md 위생 #9) 의 "현실 한계 (b)" 대응.
- **사유**: crypto-domain-expert 자문 (2026-04-27, Step 3.5). M2 거래소 다변화 (OKX/Bybit/Bitget) 시점 전 신설 필수.
- **출처**: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md` §crypto-domain-expert Q3
- **회수 예정**: **M2 시작 직전** — 4개 거래소 비교 + canonical 정의 + 거래소별 변환 함수 위치 명시
- **블록킹**: No

### [3-48] ~~funding_rate / open_interest 단위 변환 책임 명문화~~ — ✅ **2026-05-26 M1.8 §8.5-c 로 회수 완료**

> `docs/canonical-metrics.md §2.1` (funding predicted vs realized + raw decimal × 100 → percent) + `§2.2` (OI USDM=base asset / COINM=contracts) 명문화. `apps/web/lib/format/marketUnits.ts` 의 `formatFundingRate` + `formatOI` 헬퍼가 코드 차원 구현. commit `c11c335` + `e4e8082`.

### [3-48-원본] funding_rate / open_interest 단위 변환 책임 명문화 — **M1.7 Step 6 블록킹 승격** (2026-04-28)
- **설명**: 두 metric 의 **표시 단위 변환** 책임을 명문화. (a) `last_funding_rate` 는 DB 에 raw decimal 저장 (0.0001 = 0.01%) — 사이트는 % 로 표시. 카드 렌더 시 `*100` 후 % 부착 필요. (b) `open_interest` USDM 은 base-asset 수량, COINM 은 contract count — 비교 / 정렬 시 USD 환산 필요. M2 에 `open_interest_value` 신설 검토.
- **사유**: crypto-domain-expert 자문 (2026-04-28). registry 자체에는 raw 값 그대로 노출이 정공법 (DB 진실 일관) 이지만 카드 렌더 시 누락 시 트레이더 혼란 (예: 0.0001 을 그대로 표시하면 "펀딩 0.01%" 가 아닌 "0.0001 USDT" 로 오해). 사이트=DB 일치 원칙 (CLAUDE.md §위생 #9) 의 부수 케이스. **+ crypto-trader 후속 자문 (2026-04-28, M1.6 Step 4 §Q3)**: 100배 misread 시나리오 — 8h 펀딩 0.05% 를 0.0005% 로 오해 → 일수익 1% 트레이더의 15% 잠식. 베타 신규 유저에게 즉시 발현하는 도메인 결함으로 분류 → **M1.7 블록킹 승격**.
- **출처**: `crypto-domain-expert` 자문 (2026-04-28) §Q1 + `crypto-trader` 자문 (2026-04-28, M1.6 Step 4 §Q3 — 100배 misread 위험)
- **관련**: `[3.5-7]` (M1.7 §3.5 영역에 매핑 항목 등재 — Step 6 와 직접 연결)
- **회수 예정**: **M1.7 Step 6** (crypto-trader Q3 권고로 우선순위 승격, 2026-04-28)
- **블록킹**: 🔴 **클로즈드 베타 배포 블록킹** (사용자 신뢰 영향 — 트레이더 100배 misread 위험)
- **구현 힌트**: (1) `formatFundingRate(value: number): string` 헬퍼 — `(value * 100).toFixed(4) + "%"` (예: 0.0001 → `"0.0100%"`). (2) `formatOpenInterest(value, marketType, baseAsset): string` 헬퍼 — `marketType === "futures_coinm" ? \`${value} contracts\` : \`${value} ${baseAsset}\``. (3) TickerCard / CoinListCard 의 funding_rate / open_interest 표시 컴포넌트에 헬퍼 적용 + 카드 헤더에 단위 라벨. (4) datasource description 의 단위 변환 노트는 이미 [3-48] M1.6 Step 4 시점에 명시 완료 — 카드 렌더만 남음. (5) crypto-trader 3 persona 검증으로 마무리.

### [3-49] ~~새 datasource 추가 PR 체크리스트 — task-record 인라인 등재~~ — ✅ **2026-04-28 M1.6 Step 4 로 회수 완료**

> 11항목 체크리스트 (queryableFields 마이그레이션 컬럼 일치 / type 호환 / enumValues 명시 / siteParity URL / 단위 표기 / sortable / hallucination 음성 단서 / commonFields 자동 상속 / 워밍업 정책 / 공식 docs URL+조회일 / 사이트 비교 스크린샷) 를 `docs/task-record/M1.6-step4-registry-enum.md` 의 §확장 패턴 섹션에 인라인 등재 완료. crypto-domain-expert 산출물 그대로 보존.

### [3-50] ✅ **종결 (2026-06-12 묘비)** — `!ticker@arr` (full 17필드) WS 복귀

> **✅ 묘비 (2026-06-12)**: ① **spot** full 복귀 (M1.8 §8.4-e, 2026-05-28 — 현재는 Step 2.5 에서 chunked `@ticker` full 21필드로 재이전) ② **USDM** full 승격 (테마 A Step 2.5, 2026-06-10 — chunked `@ticker` 17필드) + 26.6h 안정성 관측 통과 (24h 컬럼 NULL 0/689). 본 항목의 "server-side ping 가설" 은 **오진으로 재규명** — 진짜 원인은 Binance 2026-04-23 USDM 레거시 WS URL 폐지 (`reference_binance_arr_stream_stall`, incident doc §10). ③ **COINM 은 의도적 mini 유지** (30심볼 @arr 무사고, 24h 변화율은 ticker24hrBatchTask REST 가 채움) — 후속 판단은 `[10-30]` 으로 이관.

> **🟡 2026-05-28 갱신 (M1.8 종단 게이트 G1 발견)**: 본 항목의 M2+ 이월 근거였던 *"mini + REST 1분 폴링으로 price_change_pct 도 갱신 → 사이트=DB §9 충족"* 전제가 **spot 에서 거짓**으로 판명. WS full-upsert(`upsertNowSpotTicker`, defaultToNull 기본 true)가 active 심볼의 price_change_pct 를 매초 null 로 덮어써 REST 보강을 무력화 → spot `price_change_pct` 48~54% NULL (BTCUSDT/ETHUSDT 메이저 포함). **spot 만** `!ticker@arr` full 복귀 (§8.4-e, ✅ **배포+재검증 완료 2026-05-28** — commit `c919190` + Hetzner restart → spot price_change_pct 48~54%→**0.0%**, 메이저 전부 실제 24h % 적재, 3초 신선, USDM 회귀 0, stall 없음). spot 은 `stream.binance.com` 으로 USDM `fstream` server-ping stall 과 다른 엔드포인트 → 동일 stall 근거 없음 (실증됨). **USDM/COINM 은 mini 유지** (server-side 가설 불변, M2+ 잔존) → ticker24hrBatchTask 존속. 단일 진실: `docs/task-record/M1.8-step4-spot-cleanup.md §9`. **code-reviewer FG-5 (2026-05-28) 확인**: spot `pollSpot` 은 full WS 복귀로 redundant (WS full-upsert + REST partial-upsert 가 동일 6컬럼·동일 24h 통계값 → backwards-overwrite 손상 위험 0, **Critical 아님**). spot null 0% 24h+ 안정 후 `pollSpot` 호출만 제거 가능 (`ticker24hrBatchTask` 자체는 USDM/COINM mini 보강 위해 존속).

- **설명**: M1.6 Step 4 hotfix B 로 `!miniTicker@arr` (6필드) 임시 롤백한 상태. **2026-05-03 Hetzner 83h 가동 24h+ 누적 6 dump 분석으로 server-side 가설 confidence 95%+ 도달**:
  - Windows + 사용자 ISP / Linux + Hetzner 데이터센터 IP / Nuremberg DE — 클라이언트 환경 변수 3중 + 시장 활동 6개 시간대 모두 동일 ~5분 주기 stale event 패턴 (변동폭 ±0.66%)
  - USDM stale event ~453회/6h = stream 당 47.7초 주기 = server ping 3분 + staleConnectionMs 120s 의 일관 패턴
  - → 클라이언트 변경 (mini ↔ full / TCP keepalive / staleConnectionMs 조정) 으로 stale event 빈도 감소 불가능
  - → full 17필드 복귀 시도 시 동일 server ping 5분 주기 발생 가능성 90%+ + payload 3배 증가 + 부수 효과 위험. **시도 자체의 정량적 가치 부재**.
- **사유 (M2+ 이월 결정 근거, 2026-05-03)**: 시나리오 [B] mini 유지 채택 — Hotfix B (mini 6필드 + REST 1분 폴링) 의 graceful 흡수가 100% 작동하여 사용자 카드 staleness 1~2초 유지. 사이트=DB 1초 일치 원칙 §9 충족 (price_change_pct 도 REST 1분 폴링으로 갱신). full 복귀 = (a) Phase B [3-59] (client-side ping listener) 도입으로 server ping 능동 감지 후 / (b) Binance 측 fstream server ping 주기 단축 정책 변경 / (c) 다거래소 환경에서 OKX/Bybit/Bitget 의 동일 metric cross-check 가능해진 후 — 이 중 하나 이상 충족 시 재시도.
- **출처**: `apps/worker/src/index.ts` §WS_SUBSCRIPTIONS / `apps/worker/src/ws-relay/streams/tickerWsHandler.ts` `canHandle` / `apps/worker/src/poller/tasks/ticker24hrBatchTask.ts` / **M1.7 Step 0 Substep 0.5 24h+ 검증 (2026-05-03)**
- **회수 예정**: **M2+** (Phase B [3-59] 도입 후 또는 Binance server-side 정책 변경 시)
- **블록킹**: 🟢 도메인 정확도 보너스 (현 mini + REST 1분 폴링으로 사용자 1~2초 stale 유지, 베타 운영 가능 수준)
- **구현 힌트**: WS_SUBSCRIPTIONS 3곳 + tickerWsHandler `canHandle` 1줄 + bootstrap 에서 `createTicker24hrBatchTask` 등록 제거 + index.ts 의 SpotAdapter 인스턴스 제거 (perSymbolTask 는 USDM/COINM 만 씀). normalize 함수는 17 필드 매핑 그대로 유지 (mini 든 full 이든 둘 다 처리 가능). 검증 SQL: `select market_type, max(now()::timestamp - to_timestamp(coalesce(close_time,0)/1000)) from now_futures_ticker group by market_type;` — close_time 1초 stale 이내면 full WS 정상.

### [3-51] ~~perMessageDeflate=false 영구화 — 3 환경 (개발/Hetzner staging/prod) 검증~~ — ✅ **2026-05-03 M1.7 Step 0 Substep 0.5 로 회수 완료**

> **회수 결과 (2026-05-03)**: Hetzner production (Ubuntu 24.04 / Nuremberg) 에서 `perMessageDeflate: false` + `maxPayload: 100MB` 옵션으로 **83h 무재부팅 가동 + 6 dump 일관 작동** 입증. 개발(Windows 11) + Hetzner production 양쪽 환경에서 stream 안정성 확인. 정책 명문화 위치: `docs/Architecture.md` §경로 A §Binance WS 표준 옵션 (M1.7 Step 0 확정, 2026-05-03). 추가 환경 (Hetzner staging 등) 도입 시 동일 옵션 유지 의무 명시. 출처: `apps/worker/src/ws-relay/BinanceWsRelay.ts` / `apps/worker/src/ws-relay/BinanceKlineRelay.ts`.

### [3-52] ~~BinanceWsRelay handleOpen → 첫 메시지 30s watchdog (진단 단순화)~~ — ✅ **2026-05-03 M1.7 Step 0 Substep 0.5 로 회수 완료 (Phase A)**

> **회수 결과 (2026-05-03)**: Phase A (firstMessageWatchdog) 가 BinanceWsRelay + BinanceKlineRelay 양쪽에 적용 (2026-04-30 backend-infra-specialist) → Hetzner 83h 가동 6 dump 모두 NRestarts 0 + 부팅 시 즉시 첫 메시지 수신 — **작동 자체 입증**. 정량 효과 측정은 baseline (Apr 29 12:42~18:42) 의 표본 사이즈 부족 (worker 가동 14분 48초 만 측정) artefact 로 invalid. Phase B ([3-59] client-side ping listener) 는 별도 deferred 유지 — 사용자 영향 이미 0 인 상태에서 추가 가치 한계, M1.7 Step 1+ 또는 M2 에서 Binance fstream server-side 재시도 시 함께 검토. 출처: `apps/worker/src/ws-relay/BinanceWsRelay.ts` / `apps/worker/src/ws-relay/BinanceKlineRelay.ts` `firstMessageWatchdogMs` 옵션.

### [3-53] ~~SPOT upsert deadlock 관찰 — `feedback_concurrent_upsert_deadlock` 재발 여부~~ — ✅ **2026-05-26 M1.8 §8.4 로 회수 완료**

> ticker24hrBatchTask TRADING allowlist 적용 (8.4-a) + 3 테이블 non-TRADING row DELETE (8.4-b) + markPriceWsHandler / premiumIndexTask 동일 함정 hotfix (8.4-d) 로 SPOT 60% NULL stale 근본 차단. 시스템 전체 REST+WS allowlist 정합 (CLAUDE.md §위생 #1+#2). 누적 commit 10건. 세부: `docs/task-record/M1.8-step4-spot-cleanup.md`.

### [3-53-원본] SPOT upsert deadlock 관찰 — `feedback_concurrent_upsert_deadlock` 재발 여부 (M2-plan §Step 0 docs sweep 시 본문 통째 삭제 예정)
- **설명**: M1.6 Step 4 hotfix B 적용 후 worker 로그에서 `[retryOnTransient] tickerWsHandler spot attempt 1/3 실패 — 100ms 후 재시도: deadlock detected` 발견. retryOnTransient 가드가 작동 중이라 graceful (graceful degradation 정상) 이지만 throughput 영향 가능성. 메모리 `feedback_concurrent_upsert_deadlock.md` ("동일 테이블에 Promise.all bulk upsert 금지. 순차 await") 와 동일 패턴.
- **사유**: 베타 시연 직전 즉시 위험 0 (retry 가 처리). 다만 Hetzner 이전 후 SPOT 1408 심볼 매초 upsert + ticker24hrBatchTask 1분 batch 가 같은 테이블에 동시 접근 가능성 — 빈도 측정 후 판단.
- **출처**: 사용자 worker 로그 캡처 (2026-04-28, M1.6 Step 4 hotfix B 적용 후)
- **회수 예정**: **M1.7 Step 0~1** (운영 1주 관찰 후 `log_validation_failure` 또는 신규 `log_db_retry` 테이블에 빈도 추적)
- **블록킹**: No (retryOnTransient 가드 작동 중)
- **구현 힌트**: (1) deadlock 발생 빈도 admin dashboard 노출 (M1.7 Tier 1 추가 후보). (2) 빈도 ≥ 5%/분 시 SPOT upsert 를 chunking (PK 정렬 후 1회당 100~200 row) 또는 `ticker24hrBatchTask` 와 WS upsert 의 partial 분리 (이미 partial 분리 완료 — 추가 진단 필요).

### [3-54] ~~24h Volume Leaders 도메인 결함 정공~~ — ✅ **2026-05-26 M1.8 §8.5-c 로 부분 회수**

> `docs/canonical-metrics.md §2.7` 의 24h Ticker 영역 + §4.3 비율 정밀도 표준 명문화. `quote_volume_usd` 별도 컬럼 신설은 M2+ 영역 (deferred new `[8-x]` 등재 가능 — 본 substep scope 외). 카드 표시 시점에 `formatOI` 헬퍼 + canonical-metrics.md 에 quote_volume 단위 다양성 트랩 명문화로 사용자 misread 차단 1차 layer 완성.

### [3-56] ~~symbols 마스터 reload 주기 단축 (상폐빔/신규 상장 빠른 반영)~~ — ✅ **부분 회수 + `[10-23]` 통합 (2026-06-12)**

> **✅ 통합 묘비 (2026-06-12, 중복 정리)**: 본 항목의 핵심(DB symbols 동기화 1h 단축)은 `[10-23]` **1단계로 달성** (syncSymbolsTask 24h→1h, 신규상장 11h 누락 실측 근거 — 본 항목의 2026-04-30 트레이더 인사이트가 예견한 그대로). **잔여 갭 2가지는 `[10-23]` ②③ 으로 통합 추적**: (a) worker in-memory allowlist refresh 는 여전히 24h (loadAllSymbols — REST 폴링 task 의 신규 심볼 합류 지연) (b) 신규 심볼 WS 구독은 워커 재시작까지 대기 (부팅 스냅샷). 상폐빔/신규상장 카드 type 은 `[3-57]` 별도 존속.

### [3-55] ~~카드 단위 badge — `quoteAssetBadge` / `baseAssetBadge` 표시~~ — ✅ **2026-05-26 M1.8 §8.5 로 회수 완료**

> `apps/web/lib/format/marketUnits.ts` 의 `formatOI(value, marketType, baseAsset)` 가 `"123.45 BTC"` / `"1,234 contracts"` 형식으로 단위 라벨 자동 부착. `formatFundingRate(raw, intervalHours)` 가 `"+0.0100% (4h)"` 라벨 부착. canonical-metrics.md §2 명문화. 별도 `quoteAssetBadge` 컴포넌트는 M2 의 카드 신설 시점에 본 헬퍼 활용으로 자연 해결.

### [3-55-원본] 카드 단위 badge — `quoteAssetBadge` / `baseAssetBadge` 표시
- **설명**: TickerCard / CoinListCard / 향후 OrderBookCard 의 `last_price` / `volume` / `quote_volume` / `OHLC` 표시 시 단위 명시 — 예: "BTCUSDT · USDT" / "BTCIDR · IDR" / "Volume 12.3 BTC" / "Quote Vol 491M USDT". 사용자가 BTCIDR 의 `1,347,137,652` 가격을 USDT 로 오해하지 않게.
- **사유**: crypto-domain-expert 자문 (2026-04-28) §Q4 사이트=DB 일치 전체 체크 — `last_price` / `kline OHLC` 가 quote_asset 따라 단위 다름. 카드 헤더 badge 명시 안 하면 사용자 혼동.
- **출처**: `crypto-domain-expert` 자문 (2026-04-28) §Q4 1순위
- **관련**: `[3-54]` (정공 시 함께 처리), `[3-48]` / `[3.5-7]` funding/OI 단위 변환 (같은 영역 — M1.7 Step 6 와 묶음 가능)
- **회수 예정**: **M1.7 Step 6** ([3.5-7] 단위 변환 hotfix 와 함께 카드 컴포넌트 일괄 단위 명시)
- **블록킹**: No (사용자 혼동 가능성 있으나 즉시 위험 X)
- **구현 힌트**: (1) `apps/web/components/cards/CardHeader.tsx` 또는 신규 `UnitBadge.tsx` — `<UnitBadge type="quote" value="USDT" />` 형태. (2) symbol 의 quote_asset / base_asset 추출은 `symbols` 마스터 lookup 또는 client-side 파싱 (`BTCUSDT` → base=BTC, quote=USDT). (3) Tailwind 작은 회색 라벨로 카드 헤더 우측 또는 가격 옆에 표시.

### [3-61] ~~LoginForm/SignupForm `submittingRef` 동기 race guard 미도입~~ — ✅ **2026-05-03 별도 소규모 commit 으로 회수 완료**

> ChatInputBar `[2-6]` 패턴 그대로 LoginForm.tsx / SignupForm.tsx 에 `submittingRef = useRef(false)` 추가 + `onSubmit` 첫 줄 `if (submittingRef.current || submitting) return; submittingRef.current = true;` (두 겹 가드) + `finally { submittingRef.current = false; if (mountedRef.current) setSubmitting(false); }`. RTL 테스트 (iv) 를 `Promise.all([user.click(btn), user.click(btn)])` 진짜 race 시뮬로 강화 — signIn/signUp 1회만 호출 + disabled 1차 방어선도 같이 작동 두 겹 검증. 14/14 RTL PASS + type-check 0 errors. M1.6 Step 5 task-record §잠복 버그에서 발견된 자연 발생 deferred 가 30분 fix 로 처리됨.

### [3-63] ~~`route.ts:519` `_userId` underscore prefix 정리~~ — ✅ **2026-05-04 M1.6 Step 6a 로 회수 완료**

> `let _userId` → `let userId` + `_userId = user.id` → `userId = user.id` + 5곳의 `userId: _userId` → object shorthand `userId,` 일괄 정리. line 545~546 의 "unused 가 아님" 주석 자연 제거. underscore prefix 의 가짜 unused 신호 차단. 세부: `docs/task-record/M1-complete.md` §6a.

### [3-68] ~~`transient_error` 의 과적재 — 401/402/429/5xx/timeout 을 한 enum 으로 묶음~~ — ✅ **2026-06-02 M1.9 Step 0 으로 회수 완료**

> `classifyTransportStatus(status?)` 순수 헬퍼로 401/403→`auth_error` / 402/429→`quota_error` / 그 외→`transient_error` 3분류. `AnthropicTransportError` 에 `status?` 필드 추가(haikuClient 가 `Anthropic.APIError` 에서 추출, route 는 숫자만 소비 = SDK 결합 격리). enum 2값 추가 + messageForReason 2 case(영문) + orchestrateOnce d1~d5 경계 테스트(14 tests). **DB 마이그레이션 불필요** (fallback_reason = CHECK 없는 VARCHAR(40)). code-reviewer 0 Critical(W1/W2/W4/S1/S2 즉시 반영) + crypto-trader quota 402 문구 정직화. 잔여 튜닝(auth 톤/분리 가시성 S3, W3 529 명시) → 실사용 피드백 이월. 단일 진실: `docs/task-record/M1.9-step0-transient-error-diagnostics.md`. 운영자 알림 UI 는 `[4-28]`/M2+ 운영도구 별도 트랙.

---


---

## 원 섹션: 3.5. 🟠 M1.7 (Closed Beta Ops) — 클로즈드 베타 운영 전제 조건 (2026-04-25 신설)

### [3.5-7] ~~funding_rate / open_interest 카드 단위 변환 — 트레이더 100배 misread 차단~~ — ✅ **2026-05-26 M1.8 §8.5 로 회수 완료**

> `apps/web/lib/format/marketUnits.ts` 의 `formatFundingRate(raw, intervalHours)` (raw decimal × 100 → percent 4자리 + `(4h)`/`(8h)` 라벨) + `formatOI(value, marketType, baseAsset)` (USDM=base / COINM=contracts 분기) 헬퍼 신설. TickerCard / CoinListCard 가 헬퍼 import 통합 + grep gate (카드 안 raw toFixed 0건). M2 새 카드 (FundingCard / OICard 등) 신설 시 헬퍼만 import = 100배 misread 구조적 차단. canonical-metrics.md §2.1+§2.2 영구 기록. commit `c11c335` + `e4e8082`.

### [3.5-7-원본] funding_rate / open_interest 카드 단위 변환 — 트레이더 100배 misread 차단
- **설명**: `last_funding_rate` raw decimal (0.0001) → `*100` 후 % 표시 / `open_interest` USDM (base-asset 수량) vs COINM (contract count) 단위 분기 명시. 카드 렌더 컴포넌트 (TickerCard / CoinListCard / 향후 FundingCard) 모두에 단위 변환 헬퍼 적용 + 단위 표기 (`%` / `BTC` / `contracts`) 명문화. M1.6 Step 4 시점에 datasource description 의 단위 변환 노트는 이미 명시됐으므로 카드 렌더 코드만 남음.
- **사유**: crypto-trader Q3 자문 (2026-04-28, M1.6 Step 4 검증). 100배 misread 시나리오 — 8h 펀딩 0.05% 를 0.0005% 로 오해 → 일수익 1% 트레이더의 15% 잠식. 베타 신규 유저에게 즉시 발현하는 도메인 결함 → §3.5 블록킹 영역 승격.
- **출처**: `crypto-trader` 자문 (2026-04-28, M1.6 Step 4 §Q3), `[3-48]` 의 M1.7 승격본
- **관련**: `[3-48]` (§3 본 항목 — 본문 보존, 헤더만 M1.7 승격 갱신)
- **회수 예정**: **M1.7 Step 6** (신규 Step — funding/OI 단위 변환 + crypto-trader 검증)
- **블록킹**: 🔴 **클로즈드 베타 배포 블록킹**
- **구현 힌트**: (1) `formatFundingRate(value: number): string` 헬퍼 신설 — `(value * 100).toFixed(4) + "%"` (예: 0.0001 → `"0.0100%"`). (2) `formatOpenInterest(value: number, marketType: MarketType, baseAsset: string): string` 헬퍼 — `marketType === "futures_coinm" ? \`${value} contracts\` : \`${value} ${baseAsset}\``. (3) TickerCard / CoinListCard 의 funding_rate / open_interest 표시 컴포넌트에 헬퍼 적용 + 카드 헤더에 단위 라벨 (`%` / `BTC` / `contracts`). (4) crypto-trader 3 persona 검증 — 단위 misread 우려 0 확인. (5) [3-48] 본 항목과 직접 연결 — 본 항목 회수 시 [3-48] 도 동시 ✅.

### [3.5-8] ~~Hetzner Linux 24/7 worker 이전 가속화 — Windows 환경 특수 사고 근본 차단~~ — ✅ **2026-05-03 M1.7 Step 0 으로 회수 완료**

> **회수 결과 (2026-05-03)**: Hetzner CPX22 (2 vCPU AMD / 4GB / 80GB / Nuremberg DE / Ubuntu 24.04 LTS / Backup ON / $11.99/월 + VAT) 가동 후 **83h 무재부팅 + 사용자 카드 staleness 1~2초 + NRestarts 0 + Memory 11.9% + CPU 5.3% + Backup 4개 누적 (7일 보관)** 검증 완료. 사용자 컴퓨터 종료 의존성 0 + 환경 사고 근본 차단 입증.
>
> **부수 발견 (Step 0 의 가장 큰 산출물)**: USDM stale 원인이 Windows 환경 특수 사고가 아닌 **Binance fstream server-side ping 주기 동기화 패턴** 임이 클라이언트 환경 변수 3중 비교 + 24h+ 6 dump 정량 분석으로 confidence 95%+ 도달. 잘못된 환경 가설을 80h 실측으로 폐기 + 정확한 원인을 잡음. `[3-50]` full 17필드 복귀는 client 측 변경으로 해결 불가능하므로 M2+ 이월 (Phase B [3-59] 도입 후 또는 Binance server-side 정책 변경 시 재시도).
>
> 세부: `docs/task-record/M1.7-step0-hetzner-migration.md` §24h 누적 6 dump 분석 결과. 모니터링 자동화 (systemd timer + monitor.sh 7-metric) 는 Step 0 산출물로 영구 운영 인프라 — 베타 100명+ 도달 시 Slack/Discord webhook 추가 ([3-58] 회수 예정).

### [3.5-10] ~~Hetzner worker Memory 평탄화 검증~~ — ✅ **2026-05-04 M1.6 Step 6c 로 회수 완료**

> 사용자 SSH 1회 (8 dump read, 2026-05-04) 결과: 가동시간 vs Memory 곡선 = 134 MB (워밍업 전) → 315 → 342 → 346 → 350 → 364 → 366 → **369 MB** (5월 3일 12시).
>
> **추세 둔화 명확 (선형 누수 아님)**:
> - 워밍업 직후 (315→342, 5.9h): +4.6 MB/h
> - 최근 30h 평균 (342→369): **+0.9 MB/h** (5배 둔화)
> - 최근 6h (366→369): **+0.5 MB/h** (10배 둔화)
>
> **1개월 외삽**: +0.9 MB/h × 24h × 30일 = +648 MB → 369+648 = 1017 MB → MemoryMax 3072 MB 의 33%. **OOM risk 0%**, 1개월 무재부팅 가동 가능.
>
> **판정**: cache buildup 정상 평탄화 (V8 GC heap + Linux page cache + 거래소 데이터 buffer 가 정상 운영 영역으로 수렴). 추가 deferred 불필요. 1개월+ 장기 가동 안정성 확보. 세부: `docs/task-record/M1-complete.md` §6c 운영 안정성 검증.

---


---

## 원 섹션: 3.8. 🟡 M1.8 (선물 데이터 카탈로그 완성) — 진행 중 (2026-05-24 신설)

### [8-2] ~~annualizedBasisRate PERPETUAL 정의 확정 + 카드 노출 결정~~ — ✅ **2026-05-26 M1.8 §8.2a-2 WebFetch spike 로 D16 옵션 B 확정**

> **확정 사실**: WebFetch (`/futures/data/basis?pair=BTCUSDT&contractType=PERPETUAL&period=1h&limit=2`, 2026-05-26) 결과 = `"annualizedBasisRate": ""` **빈 문자열** (Binance PERPETUAL 환경 의도적 비움). 잠정 가설 `basisRate × (365 × 24 / fundingIntervalHours)` 무의미 (Binance 가 비워두면서 의미 자체 없음 시그널).
>
> **결정**: D16 옵션 B 확정 — `normalizeUsdmBasis` 에서 `num("") → null` 자동 변환 (DB 저장 정상) + **카드 노출 X** (M1.8 §8.5 의 marketUnits.ts 헬퍼에 미포함). M2 단계에서 다른 거래소 (OKX/Bybit/Bitget) 의 동일 metric 정의 확보 시 canonical-metrics.md 에 재검토 — 그러나 본 마일스톤에선 종결.
>
> 회수 출처: `docs/task-record/M1.8-step0-pre-infra.md` §3 Q4 + `docs/task-record/M1.8-step2a-2-fetchers.md` §3 Sub-substep A2.

### [8-12] ~~D20 — history backfill 실 backfill 시점 결정~~ — ✅ **2026-05-27 사용자 결정 (C) 채택**

> 사용자 결정 (M1.8 §8.3b 완료 시점) = **(C) M1.8 종단 게이트 후 별도 사이클**. 본 마일스톤의 본질 (현재 시점 카탈로그 완성) 과 시계열 backfill 의 가치가 별개 — "M1.8.5 history backfill" 또는 M2 Step 0 영역으로 운영 분리. 본 marker 는 8.3c 진입 방식 (코드 신설 시점) 결정의 selo 가치 (다음 substep 진입 가이드) 만 남기고 묘비 처리. 단일 진실 원천: `docs/task-record/M1.8-step3-history-backfill.md §7.1`.

### [8-13] ~~D21 — history backfill Basis 포함 여부~~ — ✅ **2026-05-27 사용자 결정 (B) 채택**

> 사용자 결정 = **(B) 6 metric (Basis 포함)**. 사용자 요구 #3 의 "선물 지표 7+" 안에 Basis 포함 + 현재 시점 영역의 fetchBasisBatch 와 정합. 분량 +30% (27K→33K REST, 20.5M→25M row, 2.28h→2.97h, 1.91GB→2.5GB) 이지만 IP quota / Supabase 용량 안에 안전. `canonical-metrics.md §2` 의 Basis 정의 즉시 활용 가능. 8.3c 코드 신설 시점 fetcher 1 종 추가 (`fetchBasisHistory`). 단일 진실 원천: `docs/task-record/M1.8-step3-history-backfill.md §7.2`.

### [8-14] ~~D22 — history_futures_indicator schema interval 컬럼 결정~~ — ✅ **2026-05-27 사용자 결정 (A) 채택**

> 사용자 결정 = **(A) `interval VARCHAR(5)` 컬럼 ADD + PK 재구성**. 표준 OLAP fact table 패턴 + AI/SQL 쿼리 표준 형태. **실 schema migration 자체는 8.3c 코드 신설 시점에 진행** (한 substep 안에서 migration + fetcher + normalize + loop 묶음). SQL:
> ```sql
> ALTER TABLE history_futures_indicator ADD COLUMN interval VARCHAR(5) NOT NULL DEFAULT '1d';
> CREATE UNIQUE INDEX history_futures_indicator_natural_pk
>   ON history_futures_indicator (exchange, market_type, symbol, interval, recorded_at);
> ALTER TABLE history_futures_indicator ALTER COLUMN interval DROP DEFAULT;
> ```
> 단일 진실 원천: `docs/task-record/M1.8-step3-history-backfill.md §7.3`.

### [8-15] ~~M1.8.5 history backfill — 8.3c 전체 이월~~ — ✅ **2026-06-01 M1.8.5 완료로 회수**

> 6-step 전부 완료 (schema + fetcher 6종 + normalize + backfill loop + 실 backfill 13.6h + 종단 게이트 G1~G5). 최종 **4,098,247 distinct row / 1.5GB / 6 metric 97~98% dense**. 실측 분량 정정: ~33K→57~72K REST(페이지) / 25M=upsert·4M=distinct / 2.97h→13.6h(로컬 100req/min). 같은-IP ban 으로 로컬 one-shot(별도 IP) 경로 전환. 단일 진실: `docs/task-record/M1.8.5-complete.md`. 잔여 이월: `[8-26]`(forward-fill) / `[8-18]`(sliding window) / `[8-25]`(completion-marker).

### [8-20] ~~별도 backfill worker 분리~~ — ✅ **2026-06-02 M1.9 Step 1 로 회수 완료**

> `packages/exchange-collectors` 추출(client 싱글톤·history fetcher·`executeHistoryBackfill` 코어·`_upsertRetry`) + `@travis/shared` 로 `TierPoller`/`IPoller`/`PollTask` 승격 + 신규 `apps/collector-history` 골격(forwardFill **stub**, 별도 IP 두 번째 서버용) + deploy 자산(`travis-collector-history.service`). 순수 구조 추출 = 기능 0, worker 77 test 회귀 0 + collector dry-boot 로 동작 불변 실증. 별도 IP = same-IP `-1003` ban 의 절대 선결. code-reviewer 0 Critical. 실 forward-fill 구현은 Step 2, 배포·롤아웃은 Step 3. 단일 진실: `docs/task-record/M1.9-step1-collector-infra.md`.

### [8-21] ~~historyFetchers.ts `mapNormalized` 공통 헬퍼 추출 (code-reviewer W2)~~ — ✅ **2026-05-31 Step 4 hotfix 로 회수**

> Step 4 첫 배포 hotfix (200 rate-limit envelope crash 방어) 에서 `mapPage<TRaw>(res, normalize)` 공통 헬퍼 신설 — 6 fetcher 가 `return mapPage(res, (r) => normalizeX(r, period))` 1줄로 통일 + `Array.isArray` 가드 동시 확보. `docs/task-record/M1.8.5-step4-deploy.md §8.5`.

### [8-26] history forward-fill (증분 갱신) 메커니즘 — ✅ **방식 A 채택 (2026-06-01) → M1.9 Step 2 회수 예정**
- **설명**: 현재 `history_futures_indicator` 는 **1회성 backfill (과거 14일)** 로만 채워짐. backfill 완료 후 worker task 는 `dryRun:true`(또는 freshness skip done)로 **멈춤** → **시간이 지나며 생기는 새 봉(5분마다 새 5m봉, 1시간마다 새 1h봉 …)이 자동으로 안 채워짐**. history 가 "backfill 시점 기준 14일" 스냅샷으로 정지. 이를 계속 자라게 하는 forward-fill 메커니즘 설계 필요.
- **배경 (사용자 질문 2026-05-31)**: "어차피 N분 주기로 폴링하는데 그때 history 에도 같이 채우면 안 되나?" → 답: (1) **과거는 실시간 append 로 복구 불가** (폴링 시작 전 데이터는 DB 에 없음 → 거래소 history API backfill 만이 유일 경로), (2) history 는 9 interval 격자 정렬 + 봉 마감 집계가 필요해 ~18분 불규칙 폴링 스냅샷과 안 맞음. 단 **forward(미래) 방향은 실시간 append 가 후보로 유효**.
- **후보 방법** (M2 실사용 후 결정):
  - **(A) 주기적 증분 backfill** (정공/권장): 거래소 history API 에서 "최근 1~2봉만" 짧게 재조회 추가. 요청 적음(과거 전체 X). 단기봉 자주 / 장기봉 하루 1회. **단 same-IP ban → 별도 IP/worker 필요 = `[8-20]` 의존**.
  - **(B) 실시간 append** (사용자 아이디어): perSymbolTask 의 매-폴링 OI/LSR 값을 격자 정렬해 history 에도 write. 5m 는 가능하나 1h/4h/1d 는 1폴링으로 못 만듦(봉 마감 집계 로직 필요).
  - **(C) 혼합**: 단기봉 (B) + 장기봉 (A 증분).
- **출처**: 사용자 질문 + CTO 설명 (2026-05-31). 단일 진실: `docs/task-record/M1.8.5-step4-deploy.md §9` + `docs/M2-plan.md`.
- **카테고리**: 🟡 **다음 마일스톤 (M1.9 Step 2)** — **방식 A (별도 worker 주기적 증분 backfill) 채택 (2026-06-01)**. `[8-20]` 별도 Hetzner 서버(별도 IP)가 전제. COINM 도 함께 market_type 일반화 (`[8-3]`). 베타 진입 ~1달 전 가동 → 누적으로 COINM 과거 backfill 대체. 단기봉 자주 / 장기봉 하루 1회 증분. 단일 진실: `docs/ROADMAP.md §M1.9`.
- **블록킹**: No (M1.8.5 = 과거 14일 1회 backfill 까지가 scope. forward-fill 은 명시적 M2 이월)
- **관련**: `[8-20]` (별도 IP/worker — A 방법의 전제) / `[8-18]` (sliding window archive = 오래된 것 삭제, forward-fill 과 별개 청소)

### [8-18] ~~history 14일 sliding window archive 정책~~ — ✅ **회수 (2026-06-13, M2 retention S3)**
> pg_cron 일배치 DELETE(interval별 14/60/180일 차등) 구현 — `prune_history_futures_indicator()` PROCEDURE(ctid 배치+COMMIT 분리+advisory lock) + `cron.schedule` 매일 18:00 UTC. native range partition(D26 (B) 선호안)은 라이브 767만 행 무중단 전환 위험으로 **억 단위 성장 시 재평가**(혼합 방식 = 신규만 파티션). 단일 진실 `docs/task-record/M2-history-retention.md`. (이하 본문은 결정 이력 참조용 보존.)

#### (이력) history 14일 sliding window archive 정책 (D26=C 보류, M1.8.5 Step 5)
- **설명**: `history_futures_indicator` 가 무한 성장하지 않도록 14일(또는 합의된 보존기간) 초과 row 를 자동 정리(archive/삭제)하는 정책. 선택지: (A) Supabase pg_cron + DELETE 일배치 / (B) **PostgreSQL native PARTITION BY RANGE(recorded_at) + 오래된 파티션 drop (선호)** / (C) **현재 보류 (채택)**.
- **★ 2026-06-01 공식 문서 확인**: Supabase 는 대용량 시계열에 **native range partition by date 권장** (`pg_partman` 보다 native 우수). ⚠️ **TimescaleDB 는 Postgres 17 에서 deprecated** → 의존 금지. 따라서 향후 (B) native partition 이 정공 (파티션 단위 통째 drop = sliding window 가 깔끔). `supabase.com/docs/guides/database/partitions`.
- **D26 채택 (C) 근거** (2026-06-01, M1.8.5 Step 5): 운영 1주 데이터 없이 archive 주기·방식 결정 금지 (CLAUDE.md deferred-decision 원칙). 현재 용량 1.5GB (Supabase Pro 8GB 의 19%) → 즉시 위험 0. forward-fill(`[8-26]`)로 history 가 계속 자라기 시작하는 시점부터 의미 有.
- **출처**: M1.8.5 Step 5 D26 결정 (`docs/task-record/M1.8.5-step5-backfill-run.md §4`) + ROADMAP §M1.8.5 G4.
- **★ 2026-06-12 실측 (보류 해제 신호, `[10-34]`)**: forward-fill 가동 11일 만에 Disk 4.19GB/8GB — `history_futures_indicator` 2.95GB(DB 의 97.5%), 6/1 백필(1.5GB) 후 **+1.5GB ≈ ~136MB/일** → **약 4주 내 8GB 도달 = Supabase 자동 증설(비용 증가) 시작**. "수십 GB 도달 후 재결정" 전제가 빨라짐 — 다음 worker/DB 인프라 작업(`[10-15]` 인덱스 다이어트와 같은 묶음)에서 (B) native partition 또는 (A) pg_cron DELETE 채택 필요.
- **카테고리**: ~~🟡~~ → **🟠 현 마일스톤** (4주 시한, 2026-06-12 승격).
- **블록킹**: No (자동 증설이 장애는 막아줌 — 비용 신호)
- **관련**: `[8-26]` (forward-fill — sliding window 의 전제: 새것이 계속 쌓여야 청소가 의미) / `[3-18]` (log_chat 용량 모니터링, 동일 archive 결) / `[10-15]`/`[10-34]`.

### [8-33] 금속 선물(XAU/XAG/XPT/XPD...) basis `-4104` Invalid contract type — fetch 대상 제외 ✅ **회수 (2026-06-05, [8-31]ⓒ 동반)**
- **설명**: forward-fill 라이브 가동(2026-06-04) 로그에서 `XAUUSDT`/`XAGUSDT`/`XPTUSDT`/`XPDUSDT`(금/은/백금/팔라듐 선물)의 basis fetch 가 `Binance 400: {"code":-4104,"msg":"Invalid contract type."}` 반복. 이 심볼들은 USDM 선물이지만 `/futures/data/basis` (PERPETUAL contractType) 를 지원 안 함.
- **✅ 해소 (2026-06-05)**: **-4104 응답 학습 캐시(reactive)** 채택 (`packages/exchange-collectors/src/core/unsupportedMetricCache.ts` 신규). 한 번 -4104 난 (marketType, symbol, metric) 을 in-memory Set 에 학습 → 이후 cycle skip.
  - **★ 라이브 교차검증으로 자문 가정 정정** (`external_api_live_smoke` 규율): crypto-domain-expert 권고는 "`underlyingType !== COIN` 사전 제외" 였으나, fapi 라이브 실측(2026-06-05) 결과 (a) 진짜 -4104 기준은 `contractType=TRADIFI_PERPETUAL`(77종 중 **75종**: 금속=COMMODITY/주식=EQUITY·KR_EQUITY/프리마켓=PREMARKET) 이고 (b) INDEX 2종(BTCDOMUSDT·ALLUSDT)은 contractType=PERPETUAL 이라 basis **정상 지원** → underlyingType 제외 시 INDEX 2종 false positive, (c) `symbols` 테이블에 underlyingType 컬럼 부재 → DB 변경 필요(scope 밖). 따라서 reactive 캐시(대안 b)가 정공.
  - **안전 경계**: `isUnsupportedContractTypeError` 가 `-4104` 만 학습 (`-1003` rate limit 은 절대 학습 금지 — 정상 심볼 영구 skip 치명 버그 방지). 두 에러 경로(400 status + 2xx envelope) 모두 substring 매칭.
  - **검증**: worker 110 test(+5) 회귀 0 · type-check 6패키지 · code-reviewer 0 Critical(W1 주석 반영).
- **출처**: `docs/task-record/M1.9-step3-rollout.md` (라이브 실측 이슈 + ⓒ/[8-33] 회수 §).
- **카테고리**: ✅ 회수 완료 (묘비)
- **블록킹**: No

### [8-34] ~~COINM 저유동 심볼 LSR sanity guard false positive — market_type별 상한 분리~~ — ✅ **2026-06-07 COINM 24~48h 모니터링 후속으로 회수**

> COINM 24h 안정성 체크(NRestarts=0/22h, same-IP ban 0, DB 무구멍 누적)에서 `warnIfRatioOutOfRange` false positive 가 **27h 로그의 ~40%(10,472/26,054줄)** 로 실측됨. `warnIfRatioOutOfRange` 에 `maxRatio=10` 기본 파라미터 추가(USDM 무변경=회귀 0) + `coinmHistoryFutures.ts` 에 `COINM_MAX_LSR=20` 상수(관측 최대 ~12.5 + 헤드룸, dapi 입증 근거 주석) + COINM 3 호출부(account/position/global) 전달. worker 130→134 test(+4: global 무경고/이상치/하한 + account 호출부 W3 회귀 가드). code-reviewer 0 Critical. **★ W1 (code-reviewer): 본 수정은 false positive 임계값 조정이며, warn 의 행 단위 폭발(심볼·interval 집계/샘플링) 구조 해결은 `[8-22]` 에 여전히 미해결 — 두 항목 같은 함수(`warnIfRatioOutOfRange`) 대상. ★ W2: 상한 20 은 현 관측(~12.5) 기반 추정 — COINM 신규 저유동 상장으로 정상 LSR>20 재출현 시 재조정 필요(warn-only 라 데이터는 안전). 단일 진실: `docs/task-record/M1.9-coinm-stability.md`.

### M1.8 ✅ 완료 시 회수 예정 (마일스톤 진행으로 묘비 처리 예약)

본 마일스톤 §8.1~§8.5 진행 과정에서 다음 8건이 자연 회수 → 종단 게이트 통과 시 일괄 묘비 처리:

| ID | 제목 | 회수 Substep | 현재 위치 |
|---|---|---|---|
| `[3-43]` | `docs/canonical-metrics.md` 신설 | §8.5 | §3 |
| `[3-48]` | funding_rate / open_interest 단위 변환 책임 명문화 | §8.5 | §3 |
| `[3.5-7]` | funding_rate / open_interest 카드 단위 변환 | §8.5 | §3.5 |
| `[3-50]` | quote_volume USD 환산 (formatOI 헬퍼 흡수) | §8.5 | §3.5 |
| `[3-53]` | SPOT upsert deadlock 관찰 | §8.4 | §3.5 |
| `[3-54]` | 24h Volume Leaders 도메인 결함 (quote_volume_usd) | §8.5 | §3.5 |
| `[3-55]` | 카드 단위 badge (quoteAssetBadge / baseAssetBadge) | §8.5 | §3.5 |
| `[3-62]` | route.ts 750줄 분할 (RLS check 확장 시) | §8.1 | §3 |

> 회수 묘비 형식 (M1.8 종단 게이트 통과 시 일괄 적용): `### [X-Y] ~~title~~ — ✅ **2026-MM-DD M1.8 §8.X 로 회수 완료** + 1줄 blockquote 설명`.

---


---

## 원 섹션: 5. 🟠🟡 M1.5~M1.6 사이 UX/안정성 폴리싱

### [5-6] ~~XSS sanitize 재검증~~ — ✅ **2026-05-04 M1.6 Step 6c 로 회수 완료**

> `@security-auditor` M1 종합 감사 (Duty 4 — XSS sanitize) 통과: 정규식 자체는 12 추가 벡터 (img/svg/javascript:/iframe srcdoc/details ontoggle/style/broken closing/mixed case/entity-encoded/nested/HTML comment/double-bracket) 모두 안전 처리 입증. **실제 vulnerability 0~2%** 판정. `apps/web/lib/__tests__/sanitizeTitle.test.ts` 에 12 벡터 회귀 테스트 추가 (기존 8 → 20 시나리오, mustNotContain 원칙 = "raw HTML 태그 패턴만 검증, escape 된 텍스트 안의 attribute 단어는 visible text 라 위험 0"). DOMPurify 도입은 M2+ 본문 무제한 필드 추가 시 `[3-64]` 트리거. 세부: `docs/task-record/M1-complete.md` §6c.

---


---

## 원 섹션: 10. 🟢 실사용 피드백 — M2 테마 (2026-06-08 세션 #1 신설)

### [10-1] ~~gainers 리스트 "살아있는 느낌" 약함~~ — ✅ (b) 완결 (라이브 체감 통과 2026-06-11) / (a) 는 경로 A 후보로 승격 — **묘비**
- **✅ (b) 완결**: `useRowFlash` flash + `useListFlip` FLIP — 사용자 라이브 체감 "좋네요" (2026-06-11). 단일 진실 `M2-themeA-card-expressiveness.md §4.6`.
- **(a) 승격 → ✅ 회수 완결 (2026-06-24)**: 경로 A(WS 프론트 직결) Step 4 Phase B 라이브 G2 통과 — ticker transport ws_direct 플립, 가격 ~1초 매끄러운 갱신("박동" 소멸 사용자 실측), site=DB 일치. 경로 B 500ms throttle 하한을 DB 우회로 근본 해소. 단일 진실 `M2-pathA-ws-direct.md §3 Phase B 라이브 완결`. **묘비.**

### [10-2] ~~spot "USDT pair" 안 걸러짐 (TRY/BNB/USDC 섞임)~~ — ✅ **회수 (2026-06-12 테마 B 완결) — 묘비**

> **✅ 묘비 (2026-06-12, 사용자 완결 선언)**: quote_asset 컬럼(now 2테이블, NULL 0/2,160) + worker lookup + registry queryableField + 서버 pushdown 전부 배포·검증 완료. **라이브 G2 5종 통과** — ① spot USDT 쿼리 오염 0 (AI `quote_asset = USDT`, log_chat 실측) ② quote 미지정 의도 동작 ③ USDC futures 38페어 정확 ④ exclude fiat `!=` 4중 체인 정확 ⑤ funding USDC 중복 "안거슬림". Binance 공식 수치 3종 일치 + warnQuoteMiss 0. 단일 진실 `M2-themeB-quote-asset.md`.

### [10-3] ~~top OI / funding+LSR → "realtime error"~~ — ✅ 완결 (테마 A Step 0·2·3·5 + 라이브 G2 통과, 2026-06-11) — **묘비**
- **✅ 전 단계 회수 + G2 통과**: Step 0 안전망 → Step 1 table 분리 → Step 2 IndicatorCard → Step 3 IndicatorListCard(+dataShapes 결합 schema) → Step 5 registry 파생 가드. **G2 (2026-06-11 사용자)**: top OI/funding 카드 생성 정상 + funding 1위 ESPORTSUSDT Binance 일치. G2 가 발견한 심볼 누락은 별개 인프라 결함 `[10-22]` 로 분리·해소. 단일 진실 `M2-themeA-card-expressiveness.md §4.5`.

### [10-7] ~~채널 공유 fan-out cross-talk (indicator 카드 간 불필요 재렌더)~~ — ✅ 2026-06-09 (테마 A Step 2)
> `useDataServiceRow` opt-in `watchColumns` + hook 레벨 dirty check(`hasWatchedColumnChanged` 순수함수). 같은 물리 테이블(now_futures_indicator) 공유 channel 로 흘러든 payload 중 **관심 컬럼이 실제 바뀐 것만** 통과 → markPrice 1초 push 가 OI/LSR 카드 재렌더 안 시킴. 채널 공유는 유지(효율 그대로). 단일 진실 `docs/task-record/M2-themeA-card-expressiveness.md §4 (substep 2.0)`. watchColumns.test.ts 7 케이스.

### [10-9] ~~indicator 카드 표시 정밀 라벨 — funding interval + OI baseAsset~~ — ✅ 2026-06-10 (사용자 정밀도 요청과 동시 회수)
> `useSymbolMeta` 훅 신설 (`symbols_meta` datasource 1회 조회, Realtime 구독 없음, 실패 시 무라벨 graceful fallback) → IndicatorCard descriptor 에 meta 주입. funding interval 라벨(1h/4h/8h — DB `funding_interval_hours` 그대로, 하드코딩 0) + OI `base_asset` 라벨 + **보너스: mark/index price tickSize 정밀도 + basis quote_asset 정확 표기**. 동시에 `formatFundingRate` percent 4→**5자리** 상향 (사용자 실측 2026-06-10: 사이트 -0.00403% vs 기존 표시 -0.0040%). web 162 test. 단일 진실 `canonical-metrics.md §2.1` + `M2-themeA-card-expressiveness.md`.

### [10-11] ✅ **해소 (2026-06-12 묘비)** — production WS `@arr` 스트림 stall — USDM markPrice/funding frozen + 청산 43일 정지

> **✅ 묘비 (2026-06-12 운영 관측 세션)**: Step 2.5 배포(06-10 05:09) 후 **26.6h+ 무재시작 관측 통과** — NRestarts=0 / 공인 IP ban 0 (-1003 은 전부 Binance 내부 LB 10.119.x, backoff 흡수) / CHK 15연결 maxSilence=0~1s / USDM ticker 24h 컬럼 NULL 0/689 / fundingInfoTask 1h cycle 정상 / now_* freshness 0.0~0.3s. 근본 원인 = Binance 2026-04-23 USDM 레거시 WS URL 폐지 (`/market` 이전, incident doc §10). 잔여 감시는 `[10-14]` 로 이관.
- **근본**: 바이낸스 `@arr`(전 종목 배열) 스트림(`!markPrice@arr@1s` / `!miniTicker@arr` / `!ticker@arr` / `!forceOrder@arr`)이 production Hetzner 워커(178.105.38.94) 연결에서 open 직후 burst만 받고 **통째로 stall** (큰 단일 프레임 전송 정지, 2.5분 sawtooth). chunked per-symbol(kline relay) + COINM @arr(30종 소형)은 정상. 과거 `[3-50]/[3-52]` payload-size selective failure 의 production 연장선. **재시작으로 복구 불가**(라이브 검증). 연결단위 watchdog 사각지대(per-stream watchdog 도 해법 아님).
- **영향**: USDM mark/index/predicted_funding **frozen**(site=DB 위반 §9 — 카드 funding 부호반전) + USDM 청산(history_futures_liquidation) **43일 정지** + USDM/spot ticker @arr sawtooth stale 의심(확인 필요). COINM·kline·REST 폴링 정상.
- **발견**: 테마 A Step 2 IndicatorCard 라이브 site=DB 검증(2026-06-09~10). 카드가 잠복 결함 가시화 (카드 자체는 무결).
- **수정**: 옵션 A(@arr→chunked per-symbol 이전, kline relay 패턴 재사용) 중심 + 옵션 B(USDM markPrice를 batch premiumIndex REST 폴링) 즉효 병용 + per-stream watchdog 보조. **사용자 결정(2026-06-10): 테마 A Step 3 전 근본적으로 모두 한 번에 수정 + USDM ticker full 승격 + B 생략.** roadmap 분해 → backend 구현 → site=DB 검증.
- **진행 (2026-06-10)**: **코드 ✅ 완료** — `BinanceChunkedRelay`(kline 패턴 일반화) + `StreamCoalescer`(1초 재조립 → 기존 핸들러 무변경) + USDM ticker full 승격(`[3-50]` 코드 회수) + index.ts 배선(COINM 만 @arr 잔류). worker 161 test PASS + code-reviewer Critical 0. **잔여 = production 배포 + 서버측 smoke + site=DB 검증 + 24~48h 안정성** (plan Step 5~6).
- **단일 진실**: `docs/task-record/M2-themeA-incident-arr-stream-stall.md` + 메모리 `reference_binance_arr_stream_stall.md`.
- **블록킹**: ~~Yes~~ → **해소** (2026-06-12 안정성 관측 통과). **카테고리**: ✅ 묘비

### [10-13] ✅ **제거 (2026-06-12 관측 결과 무해 확정)** — spot 저유동성 chunk stale watchdog 오발동 가능성
- **결론**: 26.6h 관측에서 `CHK ... maxSilence` 분포 = **0s(258회)·1s(61회)뿐** — 180s 임계 근접 0건. spot 저유동성 chunk 도 `@ticker` 24h rolling 통계가 계속 push 되어 침묵이 구조적으로 발생하지 않음. 오발동 리스크 무해 확정 → 본 항목 종결 (원문: code-reviewer W3, Step 2.5 2026-06-10).

### [10-15] ~~🟠 `history_futures_indicator` 인덱스 다이어트 — Disk IO 절감 1순위~~ — ✅ **회수 (2026-06-13, M2 retention S1+S2)**
> 인덱스 다이어트 = idx_lookup 534MB(S1) + id PK 337MB(S2) DROP + natural_pk→PK 승격 → 인덱스 **1.87GB→1010MB(~870MB↓)**. write amplification ① lookback 2→1봉(S1)으로 1차 완화. **멱등 재쓰기 차단 ②(IS DISTINCT FROM)는 S4=`[10-36]` 으로 이관**(retention 후 dead tuple 추세 관측 판단). 단일 진실 `docs/task-record/M2-history-retention.md`. (이하 본문 = 진단 이력 참조용 보존.)
- **근본**: 2026-06-11 Supabase Disk IO 고갈 사고(incident doc `M2-themeA-incident-supabase-disk-io.md`) 진단 — 테이블 total 2,737MB 중 **인덱스 1,652MB > heap 1,085MB** (비정상). forward-fill upsert 1건마다 거대 인덱스 전체 갱신 = write amplification 이 Disk IO 소진의 최대 단일 요인. 부수: upsert 의 upd 가 ins 의 ~5배 (멱등 재쓰기 — 같은 값이어도 dead tuple 생성, dead/live 3.58) → autovacuum IO 추가 압박.
- **해결 힌트**: ① `pg_indexes` 로 인덱스 구성 조회 → PK 외 중복/저사용 인덱스 제거 검토 ② 멱등 재쓰기 차단 — upsert 시 `ON CONFLICT ... DO UPDATE ... WHERE history.value IS DISTINCT FROM excluded.value` 또는 worker 측 변경분만 push ③ (장기) native range partition by recorded_at (`reference_supabase_timescaledb_deprecated`).
- **★ 사용자 결정 (2026-06-11, 테마 B 계획 시)**: **06-12 운영 관측 세션에서 Disk IO % consumed 그래프 확인 후 판단** — 높으면(예: 70%+) 즉시 회수, 낮으면 다음 worker 인프라 작업 동반.
- **✅ 06-12 판독 (사용자 스크린샷)**: IOPS 13/3,000 (0.4%) · throughput 564KB/s/125MB/s (0.5%) · 연결 20/90 — **압도적 여유, 70% 근처도 아님** (Small 업그레이드 효과 확실) → 긴급 아님, **"다음 worker/history 인프라 작업 동반" 확정**. ⚠️ 단 Disk **용량** 신호는 별개로 `[10-34]`/`[8-18]` 등재 (4.19GB/8GB, ~136MB/일 성장).
- **회수 예정**: 다음 worker/history 인프라 작업 동반 (`[10-34]` retention 과 같은 묶음 후보). **블록킹**: No (Small 업그레이드로 당장 완화).
- **카테고리**: 🟠 현 마일스톤 (IO 재발 방지 — 업그레이드는 한도 상향일 뿐 비용 절감은 이것)
- **★ 부분 회수 (2026-06-13, M2 Disk Retention 묶음 S1)**: `idx_hist_futures_indicator_lookup` 534MB DROP(미사용 확정 — getMaxRecordedAt 은 freshness 가 서빙, 프론트 직접 조회 0) + forward-fill lookback 2→1봉(`FORWARD_FILL_SAFETY_BARS`, dead tuple 양산 1차 완화). 라이브 적용+검증 ✅(인덱스 4→3, EXPLAIN freshness 유지, 5m/1h 신선).
- **★ 추가 회수 (2026-06-13, S2)**: surrogate `id` PK + 컬럼 DROP + natural_pk → PRIMARY KEY 승격(USING INDEX, rebuild 없음). 인덱스 4→2 / idx_size 1340→**1004MB**(~336MB↓) / 누적 S1+S2 = 인덱스 1.87GB→1004MB(~870MB↓). 라이브 검증 ✅. **인덱스 다이어트 분 완료.** **잔여 → S4**(RPC 조건부 upsert = dead tuple 근본 차단 — S3 retention 후 dead tuple 추세 관측 후 판단, 사용자 결정 2026-06-13). 단일 진실 `docs/task-record/M2-history-retention.md`.

### [10-22] ~~symbols 마스터 2달 stale (4/19 이후 상장 심볼 전체 부재)~~ — ✅ 회수 (2026-06-11, `26a7ba5`) — **묘비**
- **근본**: 04-19 일회성 시드(smokeBinance.ts) 후 exchangeInfo→DB 동기화 태스크 부재 (설계 의도 ↔ 구현 drift — fundingInfoTask 주석은 "syncSymbolsTask" 가정). **위생 #3 위반 잠복**. funding 랭킹 G2 가 가시화 (SKHYNIXUSDT +0.31% 실랭킹 2위 누락 — `feedback_new_card_surfaces_latent_data_defect` 3번째 재현).
- **✅ 회수**: `syncSymbolsTask` 신설 (3마켓 24h + 부팅 1회 명시 실행 → loadAllSymbols, 마켓별 순차 upsert, initialDelayMs=24h 중복 방지) + registry contract_type 에 TRADIFI_PERPETUAL. 배포 실측: usdm +80 심볼·SKHYNIX 랭킹 2위 진입·spot 상장폐지 전이 반영. 단일 진실 `M2-themeA-card-expressiveness.md §4.8`.

### [10-26] ~~CoinListCard sort → initialFetch `order` pushdown 미소비~~ — ✅ **회수 (2026-06-14, [10-33] Step 2)**
> CoinListCard initialFetch 콜백에 `order` 전달(sort 우선, 미sort 시 price_change_pct desc 일치) — 서버가 "정렬 상위 N" 보장 → 매칭>500 시 정렬 상위 누락 차단. 라이브 G2 DOM 검증 통과(랭킹 DB 일치). 단일 진실 `docs/task-record/M2-[10-33]-all-coins.md`.

### [10-33] ~~🟡 "모든 코인 보기" 표현력 — AI limit 가이드 부재 + 상한 500 + 페이지네이션 부재~~ — ✅ **회수 (2026-06-14, 라이브 G2 PASS + 사용자 완결)**
> sort/limit 직교 분리(describe 영문화+max(500) 제거) + initialFetch fetchAll(.range() 페이지네이션, FETCH_HARD_CAP 3000) + @tanstack/react-virtual 임계값 분기 가상화(>100) + CoinListCard limit=20 default 제거. 라이브 G2 DOM 검증: "USDT pairs"→449 가상화·오염0 / "all spot"→1,447 / "top 10"→10 비가상화 / "top gainers"→AI 자율 10. `[10-26]` 동반 회수. 잔여 `[10-39]`(quote 'U')/`[10-38]`(describe 영문화). 단일 진실 `docs/task-record/M2-[10-33]-all-coins.md`. (이하 본문 = 진단 이력 보존.)
- **근본 (테마 B G2 가 가시화)**: "show me spot USDT pairs" 가 449개 중 50개만 표시 — 원인 3겹: ① **AI limit 재량** — limit 필드에 시스템 어디에도 가이드 없음 (`packages/shared/src/schemas/aiCardConfig.ts:84-90` describe 빈약 / `buildSystemPrompt.ts` 무언급) → AI 가 10/20/50 임의 선택 (log_chat 실측) ② **초기 조회 상한 500 하드코딩** (`apps/web/lib/dataService/initialFetch.ts:54` DEFAULT_INITIAL_LIMIT) — spot 전체 1,441 불가 ③ **카드 페이지네이션/가상 스크롤 부재** (`CoinListCard.tsx:77,155` 기본 20 + slice, 1,441행 렌더는 Intel UHD 620 부담).
- **★ 사용자 방향 (2026-06-12)**: "페어 명시 시 해당 페어 **전부**, 미명시 시 **모든 페어**" — 유저가 뭘 원하든 보여줘야. 단 CTO 보정: **랭킹 의도(top gainers 등)는 TOP N 이 정답** (사용자도 G2 ⑤ "안거슬림" 동의) → 원칙은 "리스트/탐색 의도 ↔ 랭킹 의도" 구분.
- **범위 (1+2단계 통합, 사용자 결정 — 통째로 다음 작업 정공)**: 1단계 = limit 필드 describe 유스케이스 선언 강화(리스트 의도→생략=전체 / 랭킹 의도→top N — ⚠️ "X 쿼리→limit Y" 매핑 금지 원칙 준수, describe 톤만) + 카드 limit 생략 시 전체 표시 정책. 2단계 = 상한 500 재설계 + 페이지네이션/가상 스크롤 (react-window 류, 저사양 GPU 기준). 연관: `[10-26]` (order pushdown 미소비 — 서버 정렬과 묶음), `[3-65]` (initialFetch 확장).
- **회수 예정**: **다음 세션 (roadmap-milestone-manager 분해부터)**. **블록킹**: No. **카테고리**: 🟡 다음 작업

### [10-34] ~~🟠 `history_futures_indicator` 용량 성장 ~136MB/일 — retention 회수 시한 ~4주~~ — ✅ **회수 (2026-06-13, M2 retention S3)**
> pg_cron 일배치 retention(interval별 14/60/180일) + 첫 청소 **342만 행 삭제**(770만→428만)로 **용량 성장 정지(평형)** → 4주 시한 해소. ⚠️ `table_total` 즉시 축소는 안 됨(DELETE 공간 OS 미반환·재사용) — 더 안 자람이 목적. 즉시 디스크 축소는 `[10-37]`. 단일 진실 `docs/task-record/M2-history-retention.md`.

### [10-35] collector USDM 단주기(5m/15m/1h) forward-fill lag 관측 — ✅ **회수 완결 (2026-07-12, 사이클 3 묘비)**
- **✅ 회수 완결 (2026-07-12, 단일 진실 = `docs/task-record/M2-[10-35]-forward-fill-lag.md` §4d/§4e)**: 레버 1(per-task 예산 분할 제거, `bf203ff`)만으로 정상상태 실측 — 5m **219→91분(최악 ~1.5h)** / 30m **404→13분** / 1h **554→73분** (baseline 최악 8.6h). 안전 게이트 = 비-basis -1003 전후 모두 0 / 429 baseline 질감 복귀. **Step 3 사용자 게이트 "충분"(2026-07-12) → 레버 2(GROUPS 재편)는 `[10-103]` deferred 강등, `[8-31]`ⓓ 는 별개 복원력 축으로 존치.**
- **★ (이력) 회수 진행 (2026-07-11)**: 원인 확정 = `perTaskReqPerMin = 150÷6=25/min` 정적 분할이 예산 ~83% stranded(token-bucket [8-31]ⓐ 도입 이전 잔재). 레버 1 구현·배포(reviewer 0C) — 중간 실측 5m 219→16분 / 1h 554→46분.
- **근본 (2026-06-12 관측)**: 06-12 07시경부터 Binance 내부 LB -1003 혼잡 + 신규상장 심볼 첫 backfill 부하 → usdm-short 그룹이 고정 폭 윈도우 순환으로 **천천히 전진 중** (13:10 에 15m 136,094 row 일괄 따라잡기 실측 — 메커니즘 정상). 단 5m lag 가 한때 5.7h — history 차트의 최근 구간이 비는 사용자-facing 영향. 프로세스 무재시작·success=true (task 자체는 건강).
- **★ 06-13 재확인 (M2 retention S1 라이브 검증 중 동반 관측)**: usdm freshness — 5m **2.1분** / 1h 17분 = **신선**(수집 정상). 단 15m **287분** / 30m 137분 / 2h·4h 677분 / 12h·1d 장주기 lag 잔존 = **따라잡기 지연 지속**(구멍 아님 — 5m/1h 신선이 입증). lookback 2→1 축소(S1)와 **무관**(anchor 기준 + now까지 전체 재수집이라 최신 봉은 N 무관 채워짐, EXPLAIN/5m 신선으로 확인). 미해소 → 본 항목 **유지**.
- **해결 힌트**: ① ~~06-13 age 재확인~~ ✅ 완료(위) — 자연 해소 안 됨(15m/30m lag 잔존) → 제거 보류 ② lag 상시화 확인됨 → usdm-short 윈도우 폭/cadence 또는 interval 우선순위(단주기 먼저) 재조정 검토 (다음 collector 작업 동반) ③ `[8-22]` warn 집계와 연관. **블록킹**: No. **카테고리**: 🟡 다음 (관측 후 판단 — cadence 재조정 후보)
- **★ 다음 사이클 확정 (2026-07-10, 사용자 결정)**: 사이클 2 완결 직후의 **다음 사이클 = 본 항목 해소** (Stage 4 보다 선행). 근거 = 차트 라이브 2회 실증(07-09 BTCUSDT 5m lag 8.6h "last 24h" 우측 끝 공백 / 07-10 G2 중 OI 차트 freshness "6H AGO") — 사용자가 매일 보는 신선도 결함으로 승격. 착수 시 plan mode + `@roadmap-milestone-manager` 분해 + `@backend-infra-specialist` 자문(순회 재설계 vs interval 우선순위 큐, /futures/data 1000req/5min IP quota 제약 내).
- **★ 사용자-facing 실증 (2026-07-09, 사이클 2 Step 5 라이브 G2)**: chart-card 라이브로 이 항목이 예견한 "history 차트 최근 구간 공백"이 실제가 됨 — BTCUSDT 실측 lag = 5m **8.6h** / 1h 7.2h / 4h 2.2h (worker 는 활발히 쓰는 중 = 순회 주기 특성, n_tup_ins 45초간 +331 실측). "last 24h" 차트의 오른쪽 끝이 수 시간 전 = site=DB 신선도 신뢰 이슈. **회수 우선순위 재평가 후보**(사이클 2 후속 — cadence/우선순위 재조정 + 카드 freshness 표시는 UIUX 논의에 포함, crypto-trader E 자문 2026-07-09).
- **★ 06-13 청소 후 재관측 (M2 retention S3)**: usdm 전 interval lag 확대 (5m 290분 / 30m 425분 / 1h 305분 / 4h ~16h) — **retention 청소와 무관**(청소는 14일+ 과거만 삭제, `remaining_short=0` = 최신 봉 안 건드림). collector-history forward-fill cadence 자체 문제. **실시간 카드(`now_futures_indicator`, production worker)는 영향 0** — history 차트 최근 구간만 빔. 청소 IO 여파 회복 관측 + cadence 조정 우선순위 ↑ (다음 collector 작업).

### [10-39] ~~now_spot_ticker `quote_asset='U'` 43건 — quote 파싱 결함 의심~~ — ✅ **종결 (2026-06-15, 결함 아님 판명)** — **묘비**
> 조사 결과 **데이터 결함 아님**. 'U' 는 Binance 가 실제 운영하는 **달러 스테이블코인 quote**(라이브 exchangeInfo `quoteAsset="U"` 실재 + 사용자 실거래소 확인 "없애면 안 됨" + 가격 정합 BTCU≈BTCUSDT/USD1U≈1.0). 파싱 버그 아님(`normalize.ts:90` raw.quoteAsset 권위 필드) · stale 아님(43건 age<30s). **코드 수정 0**, 'U' 유지. crypto-domain-expert 의 "분리 세그먼트→제외" 는 over-conservative 오판(글로벌 API+announcement 만 보고 미확정 단정) → 사용자 실거래소 확인이 정정. 부수: `@genagent` 로 3 에이전트에 "사이트=데이터 일치 + 답변 전 실사이트 직접 확인 + 미확정 시 제외 단정 금지" 원칙 강화. 단일 진실 `docs/task-record/M2-[10-39]-phantom-quote.md`. 잔여(선택): 'U' 정확한 스테이블 정체 미규명 / 글로벌 사용자 라벨 명확화(테마 C 후보).

### [10-40] ~~셸 패널 닫힘 시 포커스 트랩 — Step 2/3 콘텐츠 진입 전 `inert` 필요~~ — ✅ **회수 (2026-06-16, 테마 C Step 2 Sub-step 0)** — **묘비**
- **근본**: `ShellPanel` 닫힘 = `aria-hidden` + `w-0 overflow-hidden`. Step 0 은 placeholder 텍스트뿐이라 무해. 그러나 Step 2 Sub-step 0 에서 패널 안에 **첫 인터랙티브 요소**(계정 위젯 `Sign in` 링크 / `Log out` 버튼)가 들어와 "aria-hidden 인데 Tab 도달 가능" 모순이 활성화 → code-reviewer W1 이 "지금 회귀로 잡힘, Sub-step 0 으로 당겨 처리" 권고.
- **해결**: `ShellPanel.tsx` `<aside>` 에 `inert={!open}` 추가 (React 19 boolean prop, 모던 브라우저 2023+ 베이스라인) — 닫힘 시 시각·포커스·보조기술 일괄 비활성화. type-check/lint/190 test 회귀 0.
- **출처**: code-reviewer W2(Step 0, 2026-06-15) → W1(Step 2 Sub-step 0, 2026-06-16). 단일 진실 `M2-themeC-ui-shell.md §3`.

### [10-52] ~~경로 A WS 서버 — 클라이언트당 구독 수 cap + 메시지 rate limit~~ — ✅ 2026-06-22
> 경로 A Step 2 에서 회수. `WsServer.ts` 에 연결당 구독 cap(기본 100, 초과 graceful 무시) + 메시지 토큰버킷 rate limit(`rateLimiter.ts`, 버스트 20·2건/초, 초과 close 4429) + ping/pong 좀비 정리(30s) + maxPayload 4KB + 토픽 길이 상한(256) 구현. 토큰 검증 시점은 **핸드셰이크(verifyClient)** 로 확정(connection 전 거부 = 리소스 0). 통합 테스트 5종 + security-auditor 재감사 0 Critical. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §2.6`.

### [10-57] ~~프로덕션 워커(178.105.38.94) 커널 재부팅 — 보안 패치 적용~~ — ✅ 2026-06-23
> security-auditor 노출-직후 재감사 W-4 회수. 저트래픽 시간대 `reboot` 완료(커널 `6.8.0-107`→`124`). **재부팅 후 자동 복구 4종 PASS**: ① travis-worker/caddy `active`(systemd enabled 자동 기동) ② `ss` 8081 = `127.0.0.1`(0.0.0.0 회귀 0) ③ 외부 wss `wscat`→401(인증서/Caddy 자동 복구) ④ **USDM ticker freshness 1~2초**(BTC/ETH/SOL site=DB, 위생 #9). env/방화벽/인증서 디스크 영구저장 자동 복구 실증. 상세 `task-record/M2-pathA-ws-direct.md §2.6.5`.

### [10-62] ~~ws_direct 단일 row — marketType 누락 시 영구 frozen~~ — ✅ **회수 완료 (2026-06-26, fast-follow #1 Step 6 라이브)**
> **라이브 실현·해소**: premium_index 플립 직후 AI 가 marketType 을 안 넣어 토픽 조립 실패 → 카드 frozen(초기 seed). Step 1 부터 예측한 비대칭이 라이브로 발현. **2겹 hotfix `54d7b98`**: ① `hooks.ts` — ws_direct 토픽 조립 실패 시 구독 skip 대신 **경로 B 폴백**(frozen-stale 위험 제거, 미래 ws_direct 전체 구조 방어). ② `aiCardConfig.ts` superRefine — **ws_direct + market_type 토픽 + 단일 row(symbol) datasource 는 marketType 필수**(registry 파생, AI self-correction 으로 경로 A 보장). ★ symbol 게이트로 리스트 카드(테이블=경로 B) 제외. shared 50 test(+3 잠금). 라이브 재검증: 토픽 조립 실패 경고 소멸 + 박동 소멸 + site=DB PASS. 아래 본문은 원 분석 보존.

### [10-68] ~~경로 A publish 배선 헬퍼 추출~~ — ✅ **회수 완료 (2026-06-27)**

> `makeTopicPublisher(liveBus, datasourceIdFor)` 헬퍼로 ticker/markPrice 의 동형 publish 배선(전역 구독자 0 가드 + buildLiveTopic + liveBus.publish 루프) 단일화 — datasourceId 해석 한 줄만 주입(ticker=marketType별 lookup / markPrice=상수). ➕ `apps/worker/src/ws-server/makeTopicPublisher.ts`(비제네릭 `ReadonlyArray<PublishableRow>` 최소 계약) + 배럴 export + `index.ts` 두 inline 클로저 교체(미사용 `buildLiveTopic` import 제거). worker **220 test(+8: makeTopicPublisher 8)** + type-check/lint green + **code-reviewer 0C/0W**. fast-follow #2(청산)·#3(호가)가 datasourceIdFor 만 다르게 재사용 → 동형 복붙 증식 차단. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §4.1`.

### [10-72] ~~청산 notional(USD) enrich + COINM 심볼 allowlist 매칭~~ — ✅ **회수 (2026-07-05, ff#2 재개 Step 2)**
> crypto-domain 라이브 검증(dapi 1콜): COINM `o.s`=`BTCUSD_PERP` verbatim=마스터 일치(드롭 함정 없음) + contractSize 실측(BTC=100/ETH=10) + canonical 확정(USDM `z×ap`→`z×p`→`q×p` / COINM `zEff×contractSize` — q→z 정정). 워커 `computeNotional`(sanity $1B) + 인메모리 맵(부팅+24h) + **방송·DB 양쪽 동일값(drift 0)** + registry `notional` queryableField + sampled description. DB `20260705000001` 마이그레이션 **✅ 적용 + MCP 라이브 검증 완료(2026-07-05, double precision/nullable)** — B-0 게이트 해소. 라이브 수치 재확인 = Phase B G2-4. 정의 = `canonical-metrics.md §7.2`.

### [10-71] ~~web `pnpm lint` 부트스트랩 실패 — `eslint-plugin-import` 누락~~ — ✅ **회수 (2026-06-28, ff#2 Step 4 선결)**
> `pnpm add -D eslint-plugin-import --filter @travis/web`(+3 deps) → web lint 첫 부팅. ★ 부팅 직후 잠복 `react-hooks/refs` **22건**(IndicatorCard/TickerCard 옵션 C 재연결, ff#1 코드 — lint 미부팅이라 한 번도 안 잡힘)이 드러나 **함께 근본 수정**(렌더 중 ref.current 읽기 → render-phase setState 과거정보 보관 패턴 + 순수 렌더값 now 타임스탬프). 사용자 결정 "지금 같이 고침". 상세 = `M2-pathA-ff2-liquidation.md` 헤더 + Step 4 행.

### [10-73] ~~청산 피드 filter forward-application~~ — ✅ **YAGNI 종결 (2026-07-05, 사용자 확정)**
> 임계값 = AI 쿼리로만 조절(카드 내 라이브 컨트롤 없음, ff#2 Step 1 결정 ③ 유지) → 조건 변경 = 새 쿼리/새 카드 = 잔류 문제 원천 부재. filterKey opt-in 미도입. FeedCard 헤더 doc 에 특성 1줄 박제. 카드 내 라이브 임계값 컨트롤이 미래에 생기면 그때 재개봉.

### [10-82] ~~favicon.ico 404 — 파비콘 미배치~~ — ✅ **회수 (2026-07-07, 사이클 1 Step 1)**
> `apps/web/app/icon.svg`(UI-3 모노크롬 ink 사각 + paper "T") 커밋 `a62183c` — App Router 자동 `<link rel="icon">` 서빙. Vercel 자동 배포 반영 후 콘솔 404 소멸 육안 확인은 `[10-77]` G3 관측에 동반 (게이트 아님).

### [10-76] ~~`TableCard.tsx` 파일 분할 검토 — 병합으로 405줄~~ — ✅ **회수 (2026-07-05, Feed form 사이클 Step 0b)**
> 행 2종 → `TableCardRow.tsx` + 상태 2종 → `TableCardStatus.tsx` 형제 파일 추출(본체 408→~250줄, 의미 변화 0). `StatusLine`/`LoadingOrStale` 은 export 로 승격 — Feed form(FeedCard)이 재사용하는 공유 상태 부품이 됨(분할이 Feed 선행 작업을 겸함). web type-check/lint clean + 334 test 무회귀.

### [10-77] ~~now_futures_indicator Realtime 청구 — markPrice 1초 churn throttle~~ — ✅ **회수 (2026-07-09, G3 PASS 묘비)**
> `MarkPriceWriteCoalescer` 60초 라이브(`1320495`) + G1·G2(updated_at 60초 단일 클러스터 MCP 실측) + **G3 (2026-07-09 사용자 Dashboard 실측)**: Realtime 메시지 현 주기 **1,409,825/5M (28%, overage 0)**, 일별 피크 473K(6/26) → 배포 전후 ~55K~130K/일 하향 + 화면 체감 이슈 0(경로 A 1초 유지) + favicon 404 소멸 + 배포 후 deadlock 0. 잔여 신호는 `[10-86]`(ticker churn — 현 수치상 비긴급, Launch Readiness 유지). 단일 진실 = `M2-[10-77]-realtime-throttle.md`.

<details><summary>원문 (이력)</summary>

- **근본 (2026-06-30, Supabase Realtime 사용량 분석 + 사용자 결정)**: 지난 청구주기 Realtime "Message Count Exceeded"(grace 7/22까지). 주범은 경로 A 이전의 ticker firehose였고 **이미 해결**(경로 A 전환). 잔여 추정 드라이버 = `now_futures_indicator`(markPrice/OI/펀딩/LSR/taker 동거)에 markPrice ~1초 upsert → 이 테이블을 Realtime 구독하는 OI/LSR/펀딩 랭킹 카드가 markPrice 1초 churn 을 전부 메시지로 수신(600심볼×1초×구독자). premium_index 는 transport=ws_direct 지만 **테이블 단위 Realtime 구독**이라 markPrice 변경이 다른 지표 구독자에게도 broadcast. 현 주기 830K/5M(17%, overage 0)=안전, 추세 상승(6/26 473K/일).
- **해결 힌트** (option C): 화면행(경로 A WS)은 1초 유지, **DB(now_futures_indicator) markPrice 쓰기만 30~60초로 throttle**(write coalescing). markPrice 는 이미 WS 라이브 제공이라 DB 사본은 AI 쿼리·site=DB용(30~60초 충분). 30~60배 churn↓ → Realtime 메시지·DB 부하 동시 절감(`project_m2_incident_supabase_disk_io` 같은 뿌리). **선결 측정**(`backend-infra-specialist`): ① 워커 markPrice DB upsert 현재 빈도(StreamCoalescer 기존 합치기 여부) ② now_futures_indicator 다른 필드 중 빠른 DB 갱신 필수 여부 → markPrice 만 선별. **블록킹**: No(현 17% 안전, grace 7/22). **카테고리**: 🔵 Launch Readiness(배포/베타 직전 또는 5M 근접 시, 사용자 결정 — spend cap 끄기 회피). **출처**: 본 세션 Supabase 분석 + 스크린샷(830K/5M) + `Architecture.md §경로 A`.
- **▶ 착수 확정 (2026-07-07, 사용자)**: grace 7/22 가 2주 앞이라 GenericChart 보다 선행하는 "사이클 1"로 확정(`[10-82]` favicon 동반). 배포 후 게이트 = **Supabase MCP 검증**(`updated_at` 간격 실측·advisors·logs) + Dashboard usage 추세 후속 관측(사용자 협업). 단일 진실 = `M2-composable-expressiveness.md §11` + 사이클 1 task-record(착수 시 신설).
- **🔄 배포 완료 + G2 PASS (2026-07-07 라이브 세션)**: `MarkPriceWriteCoalescer`(60초, 커밋 `1320495`) Hetzner 배포 → `updated_at` 60초 단일 클러스터(695행) MCP 실측 + advisors 신규 0 + postgres 에러 0. **잔여 = G3 Dashboard usage 추세 관측(며칠) → 통과 시 묘비.** 상세 = `M2-[10-77]-realtime-throttle.md`.
</details>

### [10-75] ~~지표 리스트 가상화 컬럼 세로정렬 어긋남~~ — ✅ 회수 (2026-06-30, Step 5 all-view 수정 동반)
> `defaultLimit` 제거로 지표 "all X"가 706행 가상화(>100) 진입 가능해짐 → 지표 5종 컬럼에 `width` 부여(premium 6/6/5rem·basis 5.5×2·OI 9/5·LSR 4.5×3·taker 5/7rem) + `tableCardFormat.test` 갱신(실폭 단언 + 합성 fallback) + **"모든 컬럼 width 필수" 불변식 추가**(code-reviewer W2, 재발 가드). ★ 컬럼 폭 first-pass — 다음 라이브 "all OI"(706행) 실측 시 미세조정 여지(가상화 경로만 사용). 단일 진실 `M2-composable-expressiveness.md §10 Step 5`.

### [10-79] TableCard 가상화 경로 컬럼 헤더 부재 — ✅ **회수 완결 (2026-07-12, 사이클 4b 묘비)**
- **✅ 회수 (2026-07-12, `634c53f` — 단일 진실 `M2-cycle4b-cross-screener.md`)**: 가상화 경로 상단 sticky 헤더 div(행과 동일 `gridTemplateColumns` 공유 = 폭 정합, bg+z-10) — 등재된 해결 힌트 그대로. 라이브 G2-b 에서 수백 행 스크리너의 헤더 표시 실증. 부수: 가상화 scrollMargin 미세 오프셋은 overscan 8 이 흡수(reviewer S1, 무해 판정 기록).

### [10-78] 단일-심볼 카드 × 경로 B datasource 의 symbol 스키마 미강제 — ✅ **회수 완결 (2026-07-12, 사이클 4b 묘비)**
- **✅ 회수 (2026-07-12, `8510e6a` — [10-91] 과 한 묶음)**: superRefine 블록 (3) — "acceptsShapes 전부 ⊆ {record,series} && ds.table 존재 → symbol(+marketType) 필수" registry 파생 일반화. 예견대로 카드별 일회성 refine 이 아닌 shape 선언 파생으로 해소(Stage 1b 를 기다리지 않고 acceptsShapes 가 이미 그 축을 제공). IndicatorCard graceful 게이트는 2차 방어로 강등.

### [10-92] ~~chart-card UIUX 후속 폴리시 묶음 — subtitle stale / freshness 날짜 / 헤더 밀집 / y축 라벨 폭~~ — ✅ **회수 (2026-07-10, 사이클 2 마감 커밋 `ec4bb06`)**
> ① AI subtitle 무수정 "· showing {interval}" 뱃지(AI 텍스트 파싱 금지 원칙) ② freshness 24h+ 날짜 병기(`formatChartTime` 공유) ③ 헤더 flex-wrap(클리핑 대신 개행) ④ y축 `yAxisSize` 동적 산정(최장 라벨 실측 + AXIS_FONT 측정↔렌더 단일화). ④의 뿌리가 **음수 부호 소실**("-0.00500%"→"0.00500%" 오독)까지 겸했음이 G2 실측으로 판명. 동반: RF 줌≠1 uPlot 커서 좌표 보정(`cursor.move`). web 447 test / reviewer 0C. 상세 = `M2-cycle2-genericchart.md §4i`.

### [10-100] ~~deferred-task.md 대장 대청소 — 묘비 archive 이관~~ — ✅ **회수 (2026-07-13, 본 대청소 세션)**
- **✅ 회수 (2026-07-13)**: 묘비 86건 전문 → `docs/deferred-archive.md` 신설 이관 + 본 문서는 열린 항목만 유지 + 집계표/🚦 재작성. (이하 원문 보존)
- **근본 (2026-07-11, 사용자 확정)**: 본 문서가 312KB/~2,000줄 — "완료 시 즉시 제거" 자체 규칙과 달리 최근 회수 항목을 묘비(✅ 마킹)로 보존하는 관행이 누적. 문서 상단 카테고리 집계표도 2026-05-20 스냅샷(82건)으로 stale(실제 열림 ~206건). 매 세션 검색 비용 증가.
- **해결 힌트**: 묘비 항목 전체를 `docs/deferred-archive.md`(신설)로 이관(회수 이력 보존) + 본 문서는 열린 항목만 + 집계표 재계산. task-record 링크는 archive 에서 유지. **블록킹**: No. **카테고리**: 📋 상시 부채 (**별도 전용 세션** — 사용자 결정 2026-07-11, [10-35] 사이클과 분리). **출처**: 2026-07-11 세션 브리핑 논의.

### [10-101] 차트 seriesStyle 유저/AI 선택 자유도 — ✅ **회수 완결 (2026-07-12, 사이클 4a 묘비)**
- **✅ 회수 (2026-07-12, 단일 진실 = `M2-cycle4a-chart-style.md`)**: AI 계약 카드 레벨 `style:{series:"line"|"area"|"bars"}` 신설(`844c1e5`) + descriptor=default 강등 + ChartCard 파생 descriptor(tone/midline 가드레일 불변). 라이브 G2-a 전 게이트 PASS — "as a simple line chart" 가 실제 선 차트 렌더 + log_chat 정확 emit + 미지정 시 기본 유지(과다사용 0). 후속 스타일 축 = `[10-105]`.
- **근본 (2026-07-11, 사용자 원칙 지적)**: `seriesStyle`(line/area/bars/stepped)이 chartDescriptors(시맨틱 레이어) **고정**이고 AI 계약(aiCardConfig)에 style 필드 부재 → 유저가 "funding as a simple line chart" 를 요구해도 descriptor 기본(bars)으로만 렌더. 사용자 원칙: "말도 안 되는 조합이 아니면 유저가 자유롭게 요구할 수 있어야" = 모든 데이터 × 모든 형태 축의 스타일 하위축.
- **해결 힌트**: descriptor 는 **default**(도메인 관례)로 강등 + AI 계약에 optional style 추가(유저 명시 시만 override) + 도메인 가드레일은 불변 유지(예: OI 방향색 금지는 색 계약이지 선/면 선택과 직교 — crypto-domain 자문으로 "불변인 것"과 "취향인 것" 분리 선언). Stage 4(AI 계약 확장) 동반이 자연스러움. **블록킹**: No. **카테고리**: 🟢 M2+ (Stage 4 동반 후보). **출처**: 사용자 실사용 요구 2026-07-11 + `chartDescriptors.ts` seriesStyle/aiCardConfig 실측.
- **★ 사용자 재강조 (2026-07-12, 영구 방향)**: 선물 지표에 국한되지 않는다 — **모든 데이터 × 모든 컴포넌트 × 스타일** 자유가 원칙("너무 아닌 것"만 예외). `PRD §2 쿼리 자유도` + `CLAUDE.md §최상위 개발 축 4` 에 명문화 완료.

### [10-104] chart-card symbol+filters 이중 지정 오버레이 silent 붕괴 — ✅ **당일 회수 (2026-07-12, 사이클 4a G2-a 적발 묘비)**
- **✅ 회수 (2026-07-12, `6a86d53`)**: AI 가 `symbol` 과 `filters symbol in [...]` 이중 지정 시 `resolveChartSymbols` "symbol 우선 return" 이 오버레이를 단일 시리즈로 조용히 붕괴(타이틀 "BTC & ETH" ↔ 렌더 BTC 만 = 신뢰 결함, crypto-trader 판정) → **union 의미론**(중복 제거·symbol 첫 슬롯) + 회귀 2핀. 기존 잠복 경로를 새 스타일 쿼리가 가시화(latent-defect 계보 5호).
- **잔여 노트**: ~~스키마 레벨 이중 지정 정식화는 4b Step 5(`[10-91]`)와 한 묶음~~ → ✅ **당일 4b 에서 회수 완료** — "symbol+filters 동시 지정 통과 + form union 해석" 테스트 핀(`8510e6a`). **출처**: `M2-cycle4a-chart-style.md §3b` + `M2-cycle4b-cross-screener.md §4`.

### [10-91] chart-card symbol/marketType 스코프 스키마 미강제 — ✅ **회수 완결 (2026-07-12, 사이클 4b 묘비)**
- **✅ 회수 (2026-07-12, `8510e6a`, 단일 진실 `M2-cycle4b-cross-screener.md` §4)**: superRefine 블록 (3) 신설 — marketType+symbol(series 는 filters symbol =/in 대체 = 오버레이 보존) registry 파생 강제, (2.5) dedupe, kline=table 부재 자연 면제. false-positive 0(전 픽스처+few-shot 감사) + 라이브 G2-b 에서 AI 가 1차 시도부터 스코프 완비 emit 실증. 렌더 가드("missing scope")는 2차 방어로 강등. [10-104] 잔여(이중 지정 정식화)도 "동시 지정 통과 + form union 해석" 핀으로 함께 처리.
- (이력 보존 ↓)
- **근본 (2026-07-09, 사이클 2 Step 5 code-reviewer W1)**: superRefine (2.5) 는 `subscribesByTopic && transport==="ws_direct"` 에만 발화 → chart-card(주기 pull, 비-토픽)를 AI 가 **symbol 도 `symbol in [...]` 필터도 없이** emit 하면 스키마 통과. ChartCard 의 "missing symbol scope" graceful 분기가 2차가 아닌 **유일한 1차 방어선**(crash 아님, 죽은 카드만) — 단 스키마가 성공 판정이라 **self-correction 루프가 못 고침**. description "for one symbol" 이 프롬프트 유도는 함.
- **★ 라이브 실증 (2026-07-09 G2 첫 쿼리)**: AI 가 limit 288·interval 5m·symbol 은 완벽히 채우고 **marketType 만 누락** → PK(exchange,market_type,…) prefix 단절 → EXPLAIN 실측 **9.8초/디스크 73,508버퍼**(Disk IO 사고 벡터) → statement timeout 500 → "chart data error". **당일 2겹 hotfix**(ff#1 `54d7b98` 선례 미러): ① description "Always set marketType" ② ChartCard registry 파생 가드(market_type queryableField 존재 × marketType 누락 = fetch 차단 + "missing market scope" graceful). 스키마 파생 강제(본 항목)가 남은 근본 — marketType 도 symbol 과 함께 범위.
- **해결 힌트**: `[10-78]`(indicator-card 경로 B symbol 미강제)과 같은 본질 — "단일 대상 소비 카드(record/series)는 대상 식별자 필요" 를 Stage 1b/4 의 `acceptsShapes` 파생 강제로 일반화(카드별 일회성 refine 은 YAGNI, [10-78] 선례). 도입 시 `@zod-schema-architect` — "series 소비 카드의 symbol-or-filter 필수를 registry 파생으로". **블록킹**: No. **카테고리**: 🟢 M2+ (Stage 1b/4 동반, [10-78] 과 한 묶음). **출처**: `ChartCard.tsx` missing-scope 분기 주석 + `M2-cycle2-genericchart.md` Step 5.
- **★ 사이클 4b 편입 확정 (2026-07-12)**: 본 항목 = 4b Step 5 scope (사용자 승인 plan `serialized-wibbling-pebble.md`). 동반 처리: `[10-104]` 잔여 — symbol+filters `symbol` 절 **이중 지정** 의 스키마 레벨 정식화(현재 form 이 union 으로 graceful 해석, `6a86d53`).


---

## 원 섹션: 3. (인트로 묘비 `[3-1]`~`[3-3]`)

> **[3-1] `log_validation_failure` 테이블 컬럼 확장** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. user_id (UUID, ON DELETE SET NULL, NULL 허용) / attempt_number (SMALLINT DEFAULT 1) / model_id / system_prompt_version / user_query_hash 5 컬럼 추가. 기존 dev 디버깅 row 5건 DELETE. 세부: `docs/task-record/M1.6-step2-logs-rls.md`.
>
> **[3-2] `log_validation_failure` 에 RLS policy 추가** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. `CREATE POLICY ... FOR SELECT TO authenticated USING (auth.uid() = user_id)`. INSERT/UPDATE/DELETE policy 0개 → service_role 전용 (RLS bypass).
>
> **[3-3] `log_chat` / `log_behavior` 테이블 생성 + RLS** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. log_chat 13 컬럼 (id/user_id/query_text/ai_response/status CHECK/fallback_reason/model_id/input_tokens/output_tokens/latency_ms/attempt_number/system_prompt_version/user_query_hash/created_at) + log_behavior 5 컬럼 (id/user_id/event_type 자유 문자열/payload/created_at). 각 SELECT RLS 본인만 + (user_id, created_at DESC) 인덱스. 1 query = 1 row (옵션 B, 재시도 attempt 합산).

---

## 부록 — 구 집계표(2026-05-20 스냅샷) + 🚦 이력 원문 (2026-07-13 이관 시점)

## 📊 카테고리별 건수 요약 (2026-05-20 **M2-plan Step 0 docs 정리 직후**)

**Step 6 변동 (2026-05-04)**: 회수 5건 ([3-14]/[3-16]/[3-63]/[5-6]/[3.5-10]) − 신규 3건 ([3-64]/[3-65]/[3-66]) = **net -2건**. 직전 총계 83 → **81건**.

**2026-05-19 변동**: 사용자 결정으로 [4-28] Multi-provider AI fallback 1건 신규 (🟢 M2+). 81 → **82건**.

**2026-05-20 변동**: M2-plan Step 0 docs sweep — 신규 deferred 0건 (DB_SCHEMA / Architecture / PRD / ROADMAP / future cross-link 정합화 + 2 신규 발견 (`rls_auto_enable` 자동 RLS 안전망, Supabase migrations 테이블 빈 상태) 은 docs 본문에 기록, deferred 영역 영향 0). 총계 **82건 유지**.

| 카테고리 | 건수 | 블록킹 | 가장 빠른 회수 시점 |
|---|---|---|---|
| 🔴 M1.6 착수 전 필수 | **0** (전부 회수) | — | — |
| 🟠 M1.5 완료 기준 | **0** (전부 회수) | — | — |
| 🟡 M1.6 auth/RLS + Zod enum + 기타 | 16 (회수 -3 / 신규 +3 = net 0) | No | M1.7 또는 M2+ |
| 🟠🟡 M1.5~M1.6 폴리싱 | 5 (회수 -1) | No | 자연 마무리 |
| 🟠 M1.7 Closed Beta Ops | 8 (회수 [3.5-10] -1) | 🟡 외부 베타 진입 시 블록킹 6건 (현재 보류, 2026-05-18) | 외부 베타 진입 트리거 시 (`docs/M2-plan.md`) |
| 🟢 M2+ 확장 루프 | 26 (신규 +1, [4-28] Multi-provider fallback 2026-05-19) | No | M2 실측 후 |
| 🔵 Launch Readiness | 22 | No | Launch 직전 |
| ⚪ 무기한/장기 | 3 | No | 데이터 규모 임계 |
| 📋 상시 부채 (데이터 위생) | 1 | 확장 시 Yes | 매 신규 adapter |
| 💭 ROADMAP 미결정 + 사용자 피드백 | 10 | No | **M1 완료 후 ✅ 활성화** |
| **총계** | **82** | **6건** (M1.7 진입 시점) | — |

> ⚠️ **본 카테고리 표는 2026-05-20 스냅샷** — 실사용 피드백 `[10-1]`~`[10-11]` 은 본 표에 **미집계**. 회수 현황: `[10-1]`(F1 liveness 잔여 Step 4) / `[10-3]`(테마 A Step 0·2 부분 회수, 리스트 Step 3 잔여) / **`[10-7]` ✅ 회수(Step 2)** / 신규 `[10-9]`(indicator 표시 라벨) `[10-10]`(marketType enum/한국어 stub cleanup) / **🔴 `[10-11]`(@arr 스트림 stall — 블록킹, 테마 A Step 3 선결)**. 미착수: `[10-2]`/`[10-4]`/`[10-5]`/`[10-6]`(테마 B/C/D) / `[10-8]`(table 검증, M2+). **단일 진실 = 본 문서 §10 본문 + `task-record/M2-themeA-card-expressiveness.md` + `M2-themeA-incident-arr-stream-stall.md`**. 전체 카테고리 재집계는 테마 A 완료 시 일괄 정리.

---

## 🚦 현재 다음 행동

> **★★★ 2026-06-18 최종 — 테마 C Saved Views v2 (ChatGPT 식 살아있는 뷰) ✅ 완결 + 라이브 G2 7/7**: 확장 루프 3회전 = 테마 C 진행 중. 완료 = Step 0(셸 골격)·셸 트림(우측 패널 폐기)·Step 1(`user_preferences`)·Step 2(`saved_views` 영속화) + **Saved Views v2(Sub-step 1~5: PATCH API→activeViewStore→자동 저장 훅→MyViews 개편→라이브 G2)**. 라이브 G2(Vercel+Playwright+Supabase): create→자동저장(card_count 1→2 site=DB)→New view(★순서 불변식)→복원→rename→**새로고침 자동 복원**(신규 `ActiveViewRestorer`+localStorage 미러, 거짓 PATCH 0=seed 멱등). 보강 2건(사용자 결정): 새로고침 복원 + 상시 "Saved" 인디케이터. fix: tooltip en-US(English-only). commit `d3ea4d9`/`ef0a073`/`8b56c06`/`69c6d4e`. 217 test 회귀0, 콘솔 0. 신규/갱신 deferred: `[10-46]`~`[10-48]`(자동저장 LWW/keepalive/z-order) / `[10-49]`①✅회수(상시 Saved)·잔여 Q2 rename발견성/W1/W3 / `[10-50]` flush-on-switch. 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §4`.
> **▶ /clear 후 다음 작업 = 테마 C Step 4 (자유 텍스트 Custom Instructions, `M2-themeC-ui-shell.md §5`)** — `<user_preferences>` JSONB `customInstructions` 주입 + 프롬프트 인젝션 5겹 방어(enum 기각). 자문 필수: `@security-auditor`(인젝션) + `@ai-orchestrator-specialist`(주입 위치/하드코딩 경계) + `@code-reviewer`. ★ UIUX 사용자 협업(자율 금지). 차순위 후보: `[10-15]`+`[8-18]`+`[10-34]` worker/DB retention 인프라 / 테마 D 차트 / 경로 A WS 직결.
>
> **★★ 2026-06-12 최종 — 남은 게이트 3 전부 통과 + 테마 B ✅ 완결 선언 (사용자)**: **게이트 ① 운영 관측 PASS** (26.6h 무재시작 / ban 0 / maxSilence 0~1s / USDM 24h NULL 0/689 / syncSymbols 첫 cycle + 신규상장 자연 회수 실증) → **게이트 ② 워커 배포 ✅** (12:43 UTC `454b8ab`, 테마 B + `[10-23]` 1단계 동반, warnQuoteMiss 0) → **게이트 ③ 라이브 G2 PASS** (5 시나리오 의도 동작 + 오염 0 + Binance 수치 3종 일치, log_chat 실측). 묘비: `[10-11]`/`[3-50]`/`[10-13]`/`[10-2]`. 회수: `[10-23]` 1단계. 판정: `[10-29]` 사용자 "안거슬림" → 승격 불필요 / `[10-15]` Disk IO 0.4% 여유 → 다음 worker 작업 동반 / ticker24hrBatchTask 현행 유지(`[10-30]`). 신규: `[10-31]`(worker AbortSignal)/`[10-32]`(COINM delivering 노이즈)/**`[10-33]`("모든 코인 보기" 표현력 — 다음 작업 1순위, 사용자 결정)**/`[10-34]`+`[8-18]`🟠 승격(용량 ~136MB/일, retention 시한 ~4주). 단일 진실 `M2-themeB-quote-asset.md`.
> **▶ /clear 후 다음 작업 = `[10-33]` "모든 코인 보기" 표현력 (1+2단계 통합)** — `@roadmap-milestone-manager` 분해부터 (limit 가이드 + 생략=전체 정책 + 상한 500 재설계 + 페이지네이션/가상 스크롤). 차순위 후보: `[10-15]`+`[8-18]`+`[10-34]` worker/DB 인프라 묶음 (retention 시한 ~4주) / 테마 C·D / 경로 A.
> **★★ 2026-06-11 최종 — 테마 A ✅ 완결 선언 (사용자)**: 라이브 G2 통과 (funding 1위 ESPORTSUSDT 일치 + flash/FLIP 체감 "좋네요") + G2 가 가시화한 `[10-22]` symbols 2달 stale 까지 같은 세션 hotfix (`26a7ba5`, syncSymbolsTask — SKHYNIX 랭킹 2위 진입 실증). `[10-1]`/`[10-3]`/`[10-22]` 묘비. flash "박동" 체감 → **경로 A (WS 직결) M2 테마 후보 승격** (`M2-step2-usage-feedback.md §E`). 신규 `[10-23]`. incident 파일명 `M2-themeA-incident-supabase-disk-io.md` 로 정리.
> **▶ /clear 후 첫 작업 = 다음 테마 선택** (`M2-step2-usage-feedback.md §H` — 테마 B 데이터 정합(quote_asset) / C UI 셸+프리퍼런스 / D 차트 확장 / 신규 후보: 경로 A WS 직결) — `@roadmap-milestone-manager` 분해 후 착수.
> **(2026-06-12 이력 — ✅ 운영 관측 묶음 전부 완료)**: ① Step 2.5 안정성 관측 PASS (incident arr doc §10.4c) ② `[10-11]`/`[3-50]` 묘비 ✅ ③ ticker24hrBatchTask 현행 유지 판단 (`[10-30]`) ④ syncSymbolsTask 첫 cycle 정상 + `[10-13]` 무해 확정 묘비. (당시 단일 진실 메모리 `project_next_session_0612.md` 는 처리 완료로 삭제됨 — 본 줄 위 ★★ 2026-06-12 최종 줄이 결과 단일 진실.)
> **(2026-06-11 이력 — 테마 A Step 3+4+5 코드 + Disk IO 사고)**: 같은 세션에서 ① **Phase 0 — Supabase Disk IO 고갈 사고 진단·해소** (Nano 과부하 → 워커 중지 → Small 업그레이드(실질 +$5/월) → 재개 검증. 단일 진실 `M2-themeA-incident-supabase-disk-io.md`, 신규 `[10-15]`~`[10-17]`) ② **테마 A Step 3**(IndicatorListCard + dataShapes 결합 schema + initialFetch order, `e75a489`) ③ **Step 4**(useRowFlash flash + useListFlip FLIP, `4fcf43d`) ④ **Step 5**(allowlist→registry dataShapes 파생 가드, `5afa84b`). 자문 5회(zod/code-reviewer×2/frontend/crypto-trader) Critical 0 또는 즉시 수정. `[10-3]`/`[10-1]` 코드 묘비. 신규 `[10-18]`~`[10-21]`. **▶ 잔여 = 라이브 게이트** (사용자 G2: "top 10 open interest"/"highest funding rates"/"LSR ranking" 3종 + Binance 수치 대조 + flash/FLIP 모션 체감 — crypto-trader 시나리오 5 는 `card-expressiveness.md §4.7`) → **테마 A 완결 선언(사용자)**. 별도: **2026-06-12 안정성 관측 + `[10-11]`/`[3-50]` 묘비 + ticker24hrBatchTask 판단** (incident doc §10.4b).
> **(2026-06-10 이력 — `[10-11]` 배포 ✅ + 라이브 검증 통과 + ★근본 원인 재규명)**: 테마 A **Step 2.5** 배포 완료 (05:09 UTC, commit `a506ca0`). **진짜 원인 = Binance 2026-04-23 USDM WS 레거시 URL 폐지** (`/market` 이전 필수 — incident doc §10, "큰 프레임" 가설은 오진). 배포 실측: markPrice freshness 0.35s / **청산 43일 만에 재개** / USDM full 593심볼 NOT NULL / **funding site=DB 8자리 일치** / sawtooth 소멸 (CHK 14연결 maxSilence=0s). 후속: 사용자 G2 1차 통과 + `[10-9]` 회수 (funding 5자리 + interval 라벨 + tickSize/baseAsset, `useSymbolMeta`). 신규 deferred `[10-12]`(relay 3중복) / `[10-13]`(spot watchdog 관측) / `[10-14]`(dstream·spot 폐지 공지 감시). **후속 (2026-06-10): 테마 A Step 2 ✅ 마무리 선언** (사용자 — G2 통과 + `[10-9]` 회수 + **fundingInfoTask 24h→1h 단축** + docs 종합 정리 완료). **▶ /clear 후 첫 작업 = 테마 A Step 3 (IndicatorListCard, `M2-themeA-card-expressiveness.md` §1 참조)** → **2026-06-12 안정성 관측 + `[10-11]`/`[3-50]` 묘비 + ticker24hrBatchTask 판단** (incident doc §10.4b 체크리스트). 단일 진실 = `M2-themeA-incident-arr-stream-stall.md` §9~§10.
> **(2026-06-10 이력, 사고 발견)**: Step 2(IndicatorCard) 코드 ✅ push(`1f9f448`) — 라이브 site=DB 검증에서 `[10-11]` @arr stall 사고 발견 (USDM markPrice/funding frozen + 청산 43일 정지). 카드 무결, DB stale. 신규 deferred `[10-9]`(표시 라벨) / `[10-10]`(enum/한국어 cleanup) / `[10-11]`(🔴 블록킹). 잔여 `[10-8]`(table 검증, M2+).
> **(2026-06-09 이력)**: Step 0·1·2 코드 완료. Step 2 = IndicatorCard + `[10-7]` 회수 + premium_index drift 재정합 + basis datasource 신설.
> **(2026-06-08 이력)**: 세션 #1 6건(`[10-1]`~`[10-6]`) → 테마 A~D 1차 묶음 (사용자 A-1).

### 이력 (2026-05-20 ✅ M2-plan Step 0 진행 중 시점)

1. **🎉 M1 전체 완료** (2026-05-04, `docs/task-record/M1-complete.md`). 13 테이블 + 4 레지스트리 + 3 카드 + Hetzner 24/7 워커 + Supabase Auth + RLS + log 인프라 모두 작동.
2. **현재: M2-plan Step 0 docs 정리** (2026-05-20 ~ 진행). DB_SCHEMA.md 13 테이블 상세 보강 + Architecture/PRD/ROADMAP/future cross-link 정합화. 신규 발견 2건 (rls_auto_enable / migrations 빈 상태) 은 DB_SCHEMA.md 본문에 기록.
3. **다음 단계 = M2-plan Step 1**: [3.5-7]([3-48]) funding/OI 단위 변환 hotfix — 실사용 중 100배 misread 차단 목적. 작업량 ~30m~1h. canonical-metrics.md 신설 ([3-43] 회수) 동시 진행.
4. **그 다음 = M2-plan Step 2 (자유 페이스, 며칠~2주)**: 사용자(바이낸스 선물 3년차 트레이더) 가 본인 트레이딩 워크플로우에 TRAVIS 끼워 사용 → [9-9]/[9-10] 체크리스트 (카드 타이틀 톤 / Top N 필터 / empty UX / 로딩 피드백 등) 실사용 데이터 누적 → M2 우선순위 판단.
5. **M1.7 Step 1~6 보류** (외부 베타 진입 트리거 시 활성화): auth allowlist [3.5-1] / admin Tier 1+2 [3.5-2] / rate-limit [3.5-3]+[3.5-4] / Magic link [3.5-5] / security audit [3.5-6]. 현재는 사용자 단독 실사용 단계라 즉시 베타 게이트 불필요 (2026-05-18 결정).
6. **M2+ 확장 루프 후보**: [4-1]~[4-28] / [3-50] quote_volume USD 환산 / [3-43] canonical metrics / [3-62] route.ts 분할 / [3-64] DOMPurify / [3-65] initialFetch 확장 — 실측 피드백 기반 우선순위 분해 (M2-plan §Step 3).
7. **상시 부채 [📋 1]**: 신규 데이터 adapter 추가 시마다 9 데이터 위생 원칙 (CLAUDE.md §데이터 소스 위생) 체크리스트 통과 의무.

---

**문서 유지 규칙**: 항목 완료 시 즉시 제거 + 해당 Step task-record 에 회수 기록 링크. 신규 이월 발생 시 적절한 카테고리에 추가하고 출처 파일·회수 예정 시점·블록킹 여부를 반드시 명시.

---

## 부록 2 — 구 문서 머리 "최근 갱신" 이력 원문 (2026-07-13 이관)

> **최근 갱신**: 2026-07-10 (**사이클 2 ✅ 완결 — Step 6 라이브 G2 7종 전부 PASS + 마감 수정 3건**. site=DB = Binance 공식 API 3연속 8자리 일치(BTCUSDT 0.00009058 등) + 차트 툴팁 DB 10지점 일치 + AI 분기 log_chat 8/8(★Custom Instructions soft default 를 명시 COINM 쿼리가 이김 = 테마 C 검증 동반) + 증분 수집 첫 실전 PASS. **G2 적발 결함 3건 당일 수정**: ①N1 = indicator "last settled"가 `premiumIndex.lastFundingRate`(crypto-domain 판정: **predicted 스냅샷 네이밍 트랩, 3번째 재현** — realized 는 오직 `/fapi/v1/fundingRate`) 저장 = M1.8 잠복 위생 #9 위반 → worker 채움 제거+collector 반영(`c2515ae`, Option D, COINM `.map` index 잠복 버그 동시 제거) ②RF 줌≠1 uPlot 툴팁 오스냅+최신 31% 도달 불가 → cursor.move 보정 ③y축 고정폭 잘림 = 음수 부호 소실 오독 → yAxisSize 동적(`ec4bb06`). **회수**: `[10-92]` 묘비(4건 전부). **신규**: `[10-97]`(fundingInfoTask 죽은 getter) `[10-98]`(chartFormat 분할) `[10-99]`(타임존 정책 💭). **보강**: `[10-93]`(★주기 상이 펀딩 오버레이 = raw 겹침 오독, APR 정규화 권고 — crypto-domain) `[10-35]`(**다음 사이클 확정** — 사용자 결정 2026-07-10, Stage 4 선행). reviewer 2회+crypto-trader+crypto-domain 전부 0 Critical. web 447/worker 272/collector 8 clean. **배포까지 당일 완료**(worker→collector 재시작, 첫 사이클 USDM 702/COINM 20 심볼 반영 + DB 공식 값 정합 실측 — worker 도 ★sudo-free kill 확인, collector 서비스명=`travis-collector-history`). 단일 진실 `M2-cycle2-genericchart.md §4i`. ▶ 다음 세션 = `[10-35]` 사이클 착수). 이전: 2026-07-09 (**사이클 2 Step 5 ✅ 라이브 완주 + UIUX 확장 ✅** — chart-card 등록·라이브 G2 전 게이트 PASS(AI 자율 분기 5/5·site=DB 모양 일치·기존 카드 회귀 0) + 라이브 hotfix 4연쇄(marketType 500→가드 / 카드 축소→absolute 격리 / RO 소진→재-observe / ★uPlot.min.css 누락=DPR>1 잘림 근본) + UIUX 사용자 결정 4건 구현(플로팅 툴팁·interval 토글 9종 registry 파생·포인트수 유지·freshness "last point"). **회수**: `[10-77]` G3 PASS 묘비(Realtime 1.41M/5M 28%·일별 하향). **보강**: `[10-35]` lag 사용자-facing 실증(5m 8.6h)·`[10-91]` marketType 라이브 실증. **신규**: `[10-92]`(chart UIUX 폴리시 묶음: subtitle stale/freshness 날짜/헤더 밀집/y축 라벨) `[10-93]`(오버레이 %정규화 💭). 메모리 3건 신설. 단일 진실 `M2-cycle2-genericchart.md §4e~4g`. ▶ 다음 = Step 6 펀딩). 이전: 2026-06-28-b (**🎯 방향 전환 — ff#2 일시 정지 → 테마 "Composable Expressiveness" 승격**. 사용자 지적("컴포넌트가 데이터 종류로 하드코딩 = 내 방향 아님")으로 **Form↔Data 직교(모든 데이터 × 모든 형태)** 를 **모든 M2+ 개발의 중심축**으로 확정 → `CLAUDE.md §최상위 개발 축` 신설 + `PRD.md §2` + `Architecture.md §8 Form↔Data 직교`(shape taxonomy 5종 + 3-layer + Stage 1~4) + `future.md §2` 정식 활성화 + `M2-step2-usage-feedback.md §H` 테마 등재 + 메모리 `project_composable_expressiveness_axis` 신설. **ff#2 Step 5/6 보류** — `[10-72]`/`[10-73]` 는 테마 흡수(청산=Stage 3 events 첫 시민). ff#2 완료분(Step 1~4) 전부 재사용. 실 step 분해 = 다음 세션 `@roadmap-milestone-manager`. 코드 변경 0 = 순수 docs/메모리 반영). 이전: 2026-06-28-a (**M2 경로 A ff#2 Step 4 (`useDataServiceFeed` 훅) ✅ + `[10-71]` 회수 + `[10-73]` 신설** — append-only ring buffer 이벤트 스트림 훅(`content` updateMode 첫 실사용), 불변식 A~F(★(F) selector 값기준 메모이즈+filter ref 라이브=불안정 인라인 참조 무한루프 차단, 라이브 발견 크래시 해소). web type-check/lint clean + 310 test(+12) + code-reviewer 0C/3W(W1 forward filter·W2 limit 재구독·W3 테스트 전부 반영). **`[10-71]` 회수**: `eslint-plugin-import` 설치 → web lint **첫 부팅** → 잠복 `react-hooks/refs` 22건(IndicatorCard/TickerCard 옵션 C 재연결, ff#1 코드, lint 미부팅이라 한 번도 안 잡힘) 근본 수정(render-phase setState + 순수 렌더값 now 타임스탬프, ref-during-render↔effect-setState 양 규칙 회피). **`[10-73]` 신설**: filter forward-application(임계값 강화 시 옛 항목 잔류 = Step 5 카드 판단). 커밋 `2870e63`(push main). transport 휴면=화면 변화 0. **▶ /clear 후 다음 = ff#2 Step 5(`LiquidationFeedCard`)**. 단일 진실 `docs/task-record/M2-pathA-ff2-liquidation.md`, 메모리 `project_m2_pathA_ff2`). 이전: 2026-06-27 #2 (**M2 경로 A fast-follow #2 (청산 피드) 🔄 Phase A non-web 전부 ✅** — `[10-68]` makeTopicPublisher 헬퍼 추출 회수(묘비) + ff#2 Step 1(결정 4건)·3a(토픽 프리미티브 keystone `optionalSelectorKeys`+`buildLiveTopics`)·3b(liquidation 플립, ★기존 datasource 발견)·2(워커 forceOrder publish) 전부 ✅. 신규 `[10-71]`(web lint `eslint-plugin-import` 누락, Step 4 선결)·`[10-72]`(notional USD enrich + COINM 심볼 매칭 = crypto-domain 라이브 검증, Phase B 전). 전부 transport 휴면 = 화면 변화 0. **▶ /clear 후 다음 = Step 4(`useDataServiceFeed` 훅) 부터.** 단일 진실 `docs/task-record/M2-pathA-ff2-liquidation.md`, 메모리 `project_m2_pathA_ff2`). 이전: 2026-06-24 (**M2 경로 A Step 4 (플립 라이브) ✅ = 🎉 경로 A 완료 (PRD 3대 데이터 경로 전부 구현)** — 사용자와 라이브 세션(SSH 워커 재배포 + 브라우저 G2). ticker `transport:"ws_direct"` 플립 → 가격 ~1초 매끄러운 갱신("박동" 소멸 사용자 실측). 커밋 `f074ce1`(C1 워커 updated_at 방송 주입)·`d1a0dae`(플립+옵션C UI)·`ecdcaa4`(ES256 인증 정정)·`3c05a37`(English "근사"→"approx")·`3886334`(% flash+docs). **★ 라이브 사고 = ES256/JWKS**: 플립 직후 WS 전량 `malformed` 거부 → 이 Supabase 프로젝트가 이미 비대칭 ES256 서명으로 마이그레이션(HS256 검증 불가, Step 2 가정을 라이브가 정정 = `feedback_external_api_live_smoke`) → `createSupabaseTokenVerifier`(JWKS 공개키 ES256, 공개키만 보유=위조 불가) 수정, security-auditor 0C/3W/8P. **라이브 G2 PASS**: 박동 소멸 + site=DB(`@crypto-domain` 24H low/high 소수점 일치·last≠mark·24h rolling) + 토큰 통과(거부 0). 회수 `[10-1]`(a)·`[10-53]` 묘비. 신규 `[10-60]`~`[10-67]`(옵션C 타이밍/장기재연결/marketType폴백/freshness UX/JWKS알람/issuer/updated_at정밀화/crypto-trader advisory). **▶ 다음 = 경로 A fast-follow 3종(funding/마크→청산→trade+호가, 사용자 결정) 후 새 테마**. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §3 Phase B 라이브 완결`). 이전: 2026-06-23 (**M2 경로 A Step 2 Phase 2 (wss 인프라 라이브 배포) ✅** — 사용자와 라이브 SSH/콘솔 세션. `wss://ws.use-travis.com` 외부 노출(워커 `178.105.38.94` git pull `e99ae44` + jose@6.2.3 + `SUPABASE_JWT_SECRET` 86자 주입 + 재시작 → `127.0.0.1:8081` JWT 인증 활성, fail-closed→활성 라이브 실증) + Caddy 2.6.2 LE 인증서(tls-alpn-01) + ufw 8081/2019 외부 차단(curl timeout 실증) + 무토큰 `wscat`→401 + **`@security-auditor` 노출-직후 재감사 0 Critical/4W/9P**(W-1~W-5 전부 충족, W-1 Caddy admin 2019 loopback 실측 해소). 코드 변경 0(순수 인프라). 신규 `[10-57]`(커널 재부팅, W-4) + `[10-55]` 보강(fail2ban/`ufw limit 22`, W-3) + `[10-56]` 라이브 재확인(W-2). 위조/유효 토큰 라이브는 wscat subprotocol 한계로 Step 4(브라우저 WebSocket) 이동. **재부팅 `[10-57]` 즉시 회수**(커널 124, 자동 복구 4종 PASS + USDM freshness 1~2초) + 상위 docs 정합 sweep(Architecture §10 / PRD §6 / usage-feedback §E Phase 2 라이브 반영). **▶ 다음 = Step 4 플립(워커 buildLiveTopic + ticker ws_direct + 프론트 토큰 첨부 + 박동 소멸 검증)**. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md §2.6.5`). 이전: 2026-06-22 (**M2 확장 루프 4회전 = 경로 A (WS 프론트 직결) 🔄 진행 중 — 토대 완성**. Step 1(워커 WS 서버 셸 `8bc171e`) + Step 3a(레지스트리 transport 칸 + buildLiveTopic 단일 진실 `5b26143`) + Step 3b(프론트 라우터 휴면=화면 변화 0 `e367810`). 회귀 0(worker 181/shared 44/web 284) + code-reviewer 0 Critical ×3. ★워커 배선=플립과 한몸→Step 4 합침(워커 무접촉, 사용자 동의). 신규 `[10-52]`(WS 구독 cap, Step 2 외부노출 전)·`[10-53]`(플립 선결: 재연결 error 깜빡임 crypto-trader 자문 + seq 순서). **▶ 다음=도메인 확보→Step 2(wss Caddy/JWT)→Step 4(플립+라이브 박동소멸 검증)**. 단일 진실 `docs/task-record/M2-pathA-ws-direct.md`). 이전: 2026-06-18 (**M2 테마 C Step 4 (자유텍스트 Custom Instructions) ✅ 완결** — 라이브 G2 4/4(악성 메모 무력화 / XSS 콘솔 alert 0 / 정상 메모 ETH 4h 반영 / raw 저장 site=DB) + 신규 `[10-51]`(preferences JSONB 전체 교체→다중 키 추가 시 머지 전환). 테마 C 전 step 완료(완결 후보). 단일 진실 `docs/task-record/M2-themeC-ui-shell.md §5`). 이전: 2026-06-15 (**M2 `[10-39]` phantom 'U' 심볼 ✅ 종결 — 결함 아님 판명**. 'U'=Binance 실재 달러 스테이블 quote(라이브 exchangeInfo + 사용자 실거래소 확인 + 가격 정합), 파싱 버그/stale 아님 → **코드 수정 0**, 'U' 유지. crypto-domain over-conservative 오판을 사용자 실측이 정정. 부수: `@genagent` 3 에이전트에 "사이트=데이터 일치 + 답변 전 실사이트 직접 확인" 원칙 강화. `[10-39]` 묘비. 단일 진실 `docs/task-record/M2-[10-39]-phantom-quote.md`. **다음 = 테마 C (UI 셸+프리퍼런스), 다음 세션 Phase 1**. 계획 `~/.claude/plans/steady-petting-hellman.md`). 이전: 2026-06-14 (**M2 `[10-33]` "모든 코인 보기" ✅ 완료** — sort/limit 직교 분리 + fetchAll(.range()) + 가상 스크롤(@tanstack/react-virtual) + limit=20 제거. 라이브 G2 DOM 검증 PASS(449/1,447 가상화·top10 비가상화·오염0). `[10-33]`/`[10-26]` 묘비 + 신규 `[10-38]`(describe 영문화)/`[10-39]`(quote 'U' 파싱). 단일 진실 `docs/task-record/M2-[10-33]-all-coins.md`). 이전: 2026-06-13 (**M2 Disk Retention 묶음 S1~S3 ✅ 완료** — `[10-15]`/`[10-34]`/`[8-18]` 회수 묘비 + `[10-36]`(S4 보류)/`[10-37]`(디스크 즉시 축소) 신규 + `[10-35]` 청소후 재관측. 인덱스 1.87GB→1010MB(~870MB↓) + 행 770만→428만(342만 삭제) + pg_cron 매일 자동 retention. 단일 진실 `docs/task-record/M2-history-retention.md`). 이전: 2026-06-12 (**M2 테마 B 코드+DB ✅ — `[10-2]` 진행 갱신 + `[10-24]`~`[10-29]` 신설** (not_in/!= pushdown · operator enum 이중 진실(code-reviewer W2) · order pushdown 미소비 · enrichTickerRow key 비균일(W3) · NOT NULL 승격 · indicator quote_asset(crypto-trader Q2)). 단일 진실 `M2-themeB-quote-asset.md`). 이전: 2026-06-08 (**실사용 세션#1 — `[10-1]`~`[10-6]` 신설** + M2 확장 루프 진입 / 테마 A 착수 예정. 단일진실 `docs/task-record/M2-step2-usage-feedback.md §H`). 이전: 2026-06-07 (**`[8-34]` 회수** — COINM 24~48h 안정성 PASS 점검 후속. LSR sanity guard false positive(라이브 27h 로그의 ~40%)를 `warnIfRatioOutOfRange` maxRatio 파라미터화로 해소(USDM 10/COINM 20). `[8-22]` 와 같은 함수 — warn 행단위 폭발 집계는 미해결로 교차 참조 추가. 단일 진실 `docs/task-record/M1.9-coinm-stability.md`). 이전: 2026-06-06 (**M1.9 ✅ 완료** — `[8-26]`/`[8-3]`/`[8-20]`/`[8-31]`ⓐⓑⓒ/`[8-33]`/`[3-68]` 회수 묘비 + `[8-34]` 신규 등재). 이전: 2026-06-04-b (**M1.9 Step 3 🔄 라이브 가동** — 2번째 서버 USDM 배포 + freshness 인덱스(25초→5.9ms) + 즉효 fix 3종. `[8-31]` 라이브 실측 갱신(예산분배만으론 불충분 확정 → 즉효 fix 적용 / 근본 shared limiter+AbortSignal 남음, COINM 롤아웃 전 필수) + 신규 `[8-33]` 금속 basis -4104). 동일자 선행: 2026-06-04-a (**M1.9 Step 2 ✅ 코드 완성** — forward-fill USDM+COINM 구현, `[8-26]`/`[8-3]`/인계부채 S2/S3/S5 회수 + 신규 `[8-29]`/`[8-30]`/`[8-31]`/`[8-32]`). 이전: 2026-06-02-b (**M1.9 Step 1 ✅** — `[8-20]` 별도 collector worker 분리 회수 + 신규 `[8-28]` 유지보수 부채 3건). 동일자 선행: 2026-06-02-a (**M1.9 Step 0 ✅** — `[3-68]` transient/auth/quota 3분류 회수 + `[3-29]` CHECK 부재 실측 주석). 이전: 2026-06-01-b (**M1.9 계획 확정** — `[8-3]`/`[8-20]`/`[8-26]` M1.9 승격 + 별도 Hetzner worker 채택 + `[8-18]`/`[8-25]` M1.9 정합 + 신규 `[8-27]` 확장성 빚 6건 등재). 동일자 선행: 2026-06-01-a (**M1.8.5 ✅ 완료** — `[8-15]` 묘비 / `[8-21]` 회수). 이전: 2026-05-20 (**M2-plan Step 0 docs 정리**) / 2026-05-19 [4-28] Multi-provider AI fallback / 2026-05-04 M1 전체 완료 선언.

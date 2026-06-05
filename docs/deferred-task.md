# TRAVIS — 이월 및 향후 처리 작업 대장 (Deferred Tasks)

> **작성일**: 2026-04-22 (M1.5 Step 2 완료 직후)
> **최근 갱신**: 2026-06-04-b (**M1.9 Step 3 🔄 라이브 가동** — 2번째 서버 USDM 배포 + freshness 인덱스(25초→5.9ms) + 즉효 fix 3종. `[8-31]` 라이브 실측 갱신(예산분배만으론 불충분 확정 → 즉효 fix 적용 / 근본 shared limiter+AbortSignal 남음, COINM 롤아웃 전 필수) + 신규 `[8-33]` 금속 basis -4104). 동일자 선행: 2026-06-04-a (**M1.9 Step 2 ✅ 코드 완성** — forward-fill USDM+COINM 구현, `[8-26]`/`[8-3]`/인계부채 S2/S3/S5 회수 + 신규 `[8-29]`/`[8-30]`/`[8-31]`/`[8-32]`). 이전: 2026-06-02-b (**M1.9 Step 1 ✅** — `[8-20]` 별도 collector worker 분리 회수 + 신규 `[8-28]` 유지보수 부채 3건). 동일자 선행: 2026-06-02-a (**M1.9 Step 0 ✅** — `[3-68]` transient/auth/quota 3분류 회수 + `[3-29]` CHECK 부재 실측 주석). 이전: 2026-06-01-b (**M1.9 계획 확정** — `[8-3]`/`[8-20]`/`[8-26]` M1.9 승격 + 별도 Hetzner worker 채택 + `[8-18]`/`[8-25]` M1.9 정합 + 신규 `[8-27]` 확장성 빚 6건 등재). 동일자 선행: 2026-06-01-a (**M1.8.5 ✅ 완료** — `[8-15]` 묘비 / `[8-21]` 회수). 이전: 2026-05-20 (**M2-plan Step 0 docs 정리**) / 2026-05-19 [4-28] Multi-provider AI fallback / 2026-05-04 M1 전체 완료 선언.
> **집계 범위**: `docs/task-record/` 전 Step 27개 + `docs/ROADMAP.md` §Deferred Decisions + `docs/ROADMAP.md` §L Launch Readiness
> **업데이트 규칙**: 각 항목이 완료되면 **즉시 제거**하고 해당 Step task-record 에 회수 기록을 남긴다. "결정 확정 시 제거" 는 살아있는 문서의 핵심 규율.
> **✅ 묘비 보존 규칙**: 회수된 항목은 `### [X-Y] ~~title~~ — ✅ date` 헤더 + 1줄 blockquote 형태로 **인라인 묘비** 로 보존 (검색 친화). 본문 상세는 `docs/task-record/<Step>.md` 와 `docs/task-record/M1-complete.md` 가 단일 진실 원천.

---

## 0. 한 줄 요약 (비전공자용)

**집을 짓다가 "이건 아직 결정하지 말고 나중에 하자"고 노트에 적어둔 할 일 목록**입니다. TRAVIS 는 "deferred decision (지금 결정하지 않고 미루기)" 원칙을 따르므로, 각 Step 마다 의도적으로 연기한 작업이 쌓입니다. 이 문서는 그것들을 한 곳에 모아 **"언제 꺼내 써야 할지"** 를 시점별로 분류합니다.

- **🔴 지금 당장 블록킹**: 현 Step 착수 전 반드시 해결 (M1 완료 시점 0건 — `docs/task-record/M1-complete.md`)
- **🟠 현 마일스톤 완료 기준**: 마무리 Step 에서 함께 해결 (M1 완료 후 자연 회수 5건 잔여 — §5 폴리싱)
- **🟡 다음 마일스톤**: 다음 마일스톤 착수 시 일괄 처리 (현재 = M1.6 잔여 16건 / M1.7 8건 외부 베타 진입 시)
- **🟢 M2+ 확장 루프**: 실사용 데이터 관찰 후 도입 (`docs/M2-plan.md §Step 2~3`)
- **🔵 Launch Readiness (§L.1~L.4)**: 실서비스 배포 시 체크리스트
- **⚪ 무기한 / 장기**: ARCHITECTURE §10 스토리지 Phase 2~3 등
- **📋 상시 부채**: 새로운 adapter 추가 시 매번 체크 (데이터 위생 9원칙, CLAUDE.md §데이터 소스 위생)
- **💭 미결정 (ROADMAP §향후 결정 + 사용자 피드백)**: 실측/관찰 후 결정 (M1 완료 후 `[9-9]`/`[9-10]` 활성화)

---

## 1. 🔴 M1.6 착수 전 필수 작업 (블록킹)

> **[1-2] ChatInputBar fetch 교체 + dummyChatParser 삭제** — ✅ **2026-04-22 M1.5 Step 3 로 회수 완료**.
>
> **[1-1] Haiku 응답 `refusal` 블록 처리** — ✅ **2026-04-23 M1.5 Step 3d 로 회수 완료**.
>
> **[1-3] datasource id ↔ Supabase 테이블명 불일치 긴급 수정** — ✅ **2026-04-24 M1.6 Step 0.1 로 선행 회수 완료** (대안 A 임시 적용: `ticker_spot` / `ticker_futures` → `now_spot_ticker` / `now_futures_ticker`, 2개 id 한정). 사용자 테스트 세션에서 발견한 3증상(realtime error / 목록 실시간 갱신 안됨 / "BTC vs Tether" 제목) 근본 해결. 근본 구조 결정(대안 B 승격 여부 + Zod enum 방어선 + 나머지 6개 datasource)은 [3-7] M1.6 Step 4 에서 `@zod-schema-architect` 자문 경유 확정 예정. 세부: `docs/task-record/M1.6-step0.1-urgent-fixes.md`.

**현재 🔴 블록킹 항목 없음** — **M1.5 완료 선언 (2026-04-23) + M1.6 Step 0.1 완료 (2026-04-24)**. M1.6 (인증/RLS) Step 1 즉시 착수 가능.

---

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

### [2-6] ~~ChatInputBar `useCallback` stale closure~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3e 로 회수 완료**

> `submittingRef = useRef(false)` 동기 race guard 추가. ref mutation 은 동기라 1초 안 Enter 이중 시 즉시 차단. 기존 `isLoading` 검사 (1차 방어선) + ref (2차) 두 겹 가드. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [2-8] ~~`handleSubmit` 57줄 multi-responsibility~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3e 로 회수 완료**

> `apps/web/lib/chat/submitOrchestrate.ts` 순수 함수 추출 — fetch + HTTP 에러 분기 + JSON parse + dispatcher 위임 책임. `SubmitResult` enum (5종) 반환. ChatInputBar 는 input 검증 + state 갱신 + UX 만 유지. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

---

## 3. 🟡 M1.6 (인증/RLS) 도입 시 일괄 처리

> **[3-1] `log_validation_failure` 테이블 컬럼 확장** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. user_id (UUID, ON DELETE SET NULL, NULL 허용) / attempt_number (SMALLINT DEFAULT 1) / model_id / system_prompt_version / user_query_hash 5 컬럼 추가. 기존 dev 디버깅 row 5건 DELETE. 세부: `docs/task-record/M1.6-step2-logs-rls.md`.
>
> **[3-2] `log_validation_failure` 에 RLS policy 추가** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. `CREATE POLICY ... FOR SELECT TO authenticated USING (auth.uid() = user_id)`. INSERT/UPDATE/DELETE policy 0개 → service_role 전용 (RLS bypass).
>
> **[3-3] `log_chat` / `log_behavior` 테이블 생성 + RLS** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. log_chat 13 컬럼 (id/user_id/query_text/ai_response/status CHECK/fallback_reason/model_id/input_tokens/output_tokens/latency_ms/attempt_number/system_prompt_version/user_query_hash/created_at) + log_behavior 5 컬럼 (id/user_id/event_type 자유 문자열/payload/created_at). 각 SELECT RLS 본인만 + (user_id, created_at DESC) 인덱스. 1 query = 1 row (옵션 B, 재시도 attempt 합산).

### [3-4] ~~CI 빌드에 RLS 검증 스크립트 추가~~ — ✅ **2026-05-03 M1.6 Step 5 로 회수 완료**

> `pnpm rls-check` npm script + `scripts/rls-check.ts` (pg 직접 connection + redact) + `scripts/rls-check.sql` (security-auditor 보강 — schemaname='public' / pg_class.relrowsecurity / RLS_OFF vs RLS_ON_NO_POLICY 분리 / `user_*` `log_*` `now_*` `history_*` `symbols` 5 prefix). exit 0=OK / 1=violation / 2=error. baseline (Supabase MCP execute_sql, 2026-05-03) **13 테이블 모두 OK**. M1.7 Step 5 security audit 시점에 GitHub Actions 자동 승격 가능 (자세한 보안 권고는 `scripts/README.md`). 세부: `docs/task-record/M1.6-step5-test-infra.md`.

### [3-5] ~~이메일 로그인 UI~~ + 소셜 로그인 1개 (이메일 부분 ✅ 회수, 2026-04-24 M1.6 Step 1)
- **설명**: 최소 1개 소셜 로그인 (예: Google OAuth). 이메일/비밀번호 login/logout/signup UI 는 M1.6 Step 1 에서 완료.
- **진척 (2026-04-24, M1.6 Step 1)**: shadcn form + zodResolver + Supabase Auth `signInWithPassword`/`signUp` + UserMenu (이메일 + Log out, 우상단 fixed). 세부: `docs/task-record/M1.6-step1-auth-middleware.md`.
- **사유**: M1.6 이후부터는 누가 무엇을 했는지 `log_chat`/`log_behavior` 에 쌓임.
- **출처**: `docs/ROADMAP.md` §M1.6, §L.1
- **회수 예정**: **Launch §L.1** (소셜 1개)
- **블록킹**: No

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

### [3-18] log_chat.ai_response JSONB 사이즈 폭주 모니터링
- **설명**: 카드 10장 응답 = row 1개당 5~10KB. 일 1만 row × 7KB ≈ 70MB/일 → 1년 25GB. Supabase Pro 플랜 8GB 한도 초과 가능성. 베타 시점부터 monitoring 후 Phase 2 archive 분리 검토.
- **사유**: 시니어 개발자 우려 + CEO 위험 경고 (M1.6 Step 2 컬럼 셋 평가, 2026-04-25). Architecture.md §10 Phase 2 트리거 조건의 실측 근거.
- **출처**: M1.6 Step 2 컬럼 셋 평가 세션
- **회수 예정**: **M1.7** admin dashboard 의 "DB 사용량" progress bar 항목 + **M2 초입** 별도 archive 테이블 분리 검토
- **블록킹**: No

### [3-19] log_chat.query_text DB 레이어 LENGTH CHECK 제약
- **설명**: route.ts 가 500자 상한을 강제하지만 DB schema 에는 명시 안 됨. `CHECK (LENGTH(query_text) <= 500)` 추가로 application + DB 이중 강제.
- **사유**: 시니어 개발자 개선 제안 (M1.6 Step 2 컬럼 평가). application layer 만 신뢰하면 우회 경로 (직접 SQL INSERT 등) 에서 깨짐.
- **출처**: M1.6 Step 2 컬럼 셋 평가
- **회수 예정**: **M1.6 Step 5** (RTL/CI 증강 batch) 또는 **M1.7** admin migration 일괄
- **블록킹**: No

### [3-20] log_chat 에 session_id 컬럼 도입 검토
- **설명**: 한 유저의 연속 query 들을 "세션" 으로 묶는 식별자. 세션당 query depth, 카드 수, churn 분석에 핵심.
- **사유**: PM 우려 (M1.6 Step 2 컬럼 평가). M1 후 사용자 피드백 원칙 (ROADMAP §M1 완료 후 사용자 실사용 피드백 원칙) 적용 — 실 사용 데이터 관찰 후 도입.
- **출처**: M1.6 Step 2 컬럼 셋 평가
- **회수 예정**: **M2 초입** 사용자 행동 분석 단계
- **블록킹**: No

### [3-21] log_chat.success_card_count derived column
- **설명**: ai_response JSONB 의 cards.length 를 별도 INTEGER 컬럼으로 추출하면 admin dashboard "카드 수 분포" 쿼리가 100배 빠름.
- **사유**: PM 개선 제안 (M1.6 Step 2 컬럼 평가). YAGNI — admin dashboard 본격 구축 시점에 ALTER + backfill.
- **출처**: M1.6 Step 2 컬럼 셋 평가
- **회수 예정**: **M2** admin dashboard 본격화 시 (M1.7 의 단순 progress bar 단계는 미적용)
- **블록킹**: No

### [3-22] referral_source 추적 (auth.users.app_metadata.signup_source)
- **설명**: 유저가 어디서 왔는지 (Twitter / Telegram / 친구 추천 / Direct). marketing CAC 분석 필수 데이터.
- **사유**: CEO 우려 (M1.6 Step 2 컬럼 평가). log_chat scope 가 아닌 auth.users 메타데이터 영역.
- **출처**: M1.6 Step 2 컬럼 셋 평가
- **회수 예정**: **Launch §L.4** 소셜 로그인 (Google OAuth 등) 도입 시 — OAuth provider 정보가 자동 referral_source 가 됨
- **블록킹**: No

### [3-23] GDPR "잊혀질 권리" 명시 삭제 절차 (query_text 마스킹)
- **설명**: ON DELETE SET NULL 채택으로 user 삭제 시 row 자체는 보존 + user_id 만 NULL. 유저의 명시적 "내 데이터 다 지워줘" 요청 시 admin tool 에서 해당 user_id 의 row 들 query_text 를 `'[redacted]'` 로 UPDATE 하는 절차.
- **사유**: 사용자 결정 (2026-04-25) — CASCADE 대신 SET NULL + 명시 요청 시 마스킹 패턴 채택. 비즈니스 분석 보존과 GDPR 양립.
- **출처**: M1.6 Step 2 ON DELETE 동작 논의
- **회수 예정**: **M1.7** admin dashboard 의 user 상세 페이지에 "Erase user data (GDPR)" 버튼 추가
- **블록킹**: No

### [3-24] PII 마스킹 정책 — query_text 평문 저장 위험
- **설명**: 트레이더가 시드구문, 거래소 API 키, 지갑 주소 등을 query 에 실수 입력할 위험. RLS 가 admin 외 노출은 막지만 DB leak 시 노출. 입력 시점 패턴 검출 + 마스킹 또는 client-side 경고 검토.
- **사유**: CEO 우려 (M1.6 Step 2 컬럼 평가). closed beta 진입 전 보안 표면 정리 대상.
- **출처**: M1.6 Step 2 컬럼 셋 평가
- **관련**: `[3.5-6]` (@security-auditor M1.7 종합 감사)
- **회수 예정**: **M1.7 Step 5** `[3.5-6]` 와 함께 — patterns: BTC/ETH 주소 (Base58/Hex 정규식), 영문+숫자 64자 (private key candidate), 거래소 API key 형태
- **블록킹**: No

### [3-25] 로그 데이터 보관 기간 정책 명시화
- **설명**: GDPR "필요 이상 보관 금지" + 한국 회계법 5년 보존 의무 사이의 정책 결정. log_chat / log_behavior / log_validation_failure 각각의 보관 기간 (예: 1년 hot + 5년 cold archive + 영구 삭제).
- **사유**: CEO 우려 (M1.6 Step 2 컬럼 평가). Launch 전 법적 자문 + 정책 문서화 필수.
- **출처**: M1.6 Step 2 컬럼 셋 평가
- **회수 예정**: **Launch §L.4** (법적·정책 체크리스트) — 변호사 자문 + Privacy Policy 문서화
- **블록킹**: No

### [3-26] aggregateTokens(first.raw) 호출부 가독성 정리
- **설명**: `route.ts:583` `aggregateTokens(first.raw)` 호출 시 `first.raw` null 가능. `raws[]` 내부 null-safe 처리되지만 호출부에서 의도가 즉시 안 읽힘. `const tokens = first.raw ? aggregateTokens(first.raw) : { input: 0, output: 0 };` 명시화 검토.
- **사유**: code-reviewer W1 (2026-04-25, M1.6 Step 2). 동작 정확성 영향 0 — 가독성 / 6개월 후 디버깅 부담만.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §code-reviewer W1
- **회수 예정**: **M1.6 Step 5** (RTL/CI 증강 batch) 또는 별도 소규모 commit
- **블록킹**: No

### [3-27] ~~log* logger 공통 factory 추출~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3c 로 회수 완료**

> `apps/web/lib/logging/createLogger.ts` factory 신설 — `createLogger<TInput, TInsert>({ name, toRow, insert })` 패턴. logChat / logValidationFailure / logBehavior 3 파일 모두 같은 골격. boilerplate 90% 감소. `ensurePayloadSize` helper 도 같은 위치 (5KB 가드). 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

### [3-28] migration A-1 (DELETE) 멱등성 가드 — 운영 진입 후 재실행 위험
- **설명**: `migrations/20260425000001_m1_6_step2_logs.sql:34` `DELETE FROM log_validation_failure` 가 멱등성 없음. 로컬 reset / branch DB / 강제 재실행 시 운영 row 삭제 위험. 마이그레이션 파일 상단에 "A-1 은 dev 전용, M1.7 운영 진입 후 재실행 금지" 주석 + 옵션으로 `WHERE created_at < '2026-04-25'` 가드 추가.
- **사유**: code-reviewer W3 (2026-04-25, M1.6 Step 2). 운영 진입(M1.7) 전이라 지금은 안전.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §code-reviewer W3
- **회수 예정**: **M1.7 Step 0** (운영 진입 직전 마이그레이션 파일 상단 경고 주석 추가)
- **블록킹**: No

### [3-29] log_chat.fallback_reason DB CHECK 제약 추가
- **설명**: 현재 application enum (`OrchestrateFallbackReason`) 만 강제. 직접 INSERT / 디버깅 스크립트가 임의 문자열 적재 가능. enum 안정화 후 `CHECK (fallback_reason IN ('parse_error', 'schema_drift', 'transient_error', 'auth_error', 'quota_error', 'upstream_error', 'timeout', 'refusal'))` 추가 가능.
- **★ 2026-06-02 실측 (M1.9 Step 0)**: **현재 CHECK 제약은 존재하지 않음** — `fallback_reason` 은 순수 `VARCHAR(40)` (`20260425000001_m1_6_step2_logs.sql:90`). M1.9 Step 0 의 `auth_error`/`quota_error` 추가는 DB 변경 없이 INSERT 됨. 본 항목은 "CHECK 를 *추가할지 말지*" 미결정으로 잔존 — enum 추가가 마이그레이션을 강제하지 않도록 의도적으로 CHECK 부재 유지 중. 추가 시 위 8값 목록 사용. enum 단일 진실은 `packages/shared/src/schemas/orchestrateResponse.ts`.
- **사유**: security-auditor W2 (2026-04-25, M1.6 Step 2). service_role 전용 INSERT 가 사실상 게이트라 즉시 위험 낮음.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §security-auditor W2 + `docs/task-record/M1.9-step0-transient-error-diagnostics.md §4`
- **관련**: `[3-8]` (parse_error/schema_drift 분리, ✅) / `[3-68]` (auth/quota 분리, ✅ 2026-06-02)
- **회수 예정**: **외부 베타 진입 직전 보안 감사** 또는 admin migration 일괄 (CHECK 추가 결정 시)
- **블록킹**: No

### [3-30] admin UI XSS 가드 — log_chat.ai_response / log_behavior.payload 렌더링
- **설명**: JSONB 필드가 향후 admin UI (M1.7 `/admin`) 에서 raw JSON 표시 시 escape 누락 → XSS 위험. React 기본 escape 의존 + `dangerouslySetInnerHTML` 금지 명문화 필요. JSON.stringify + `<pre>{...}</pre>` 패턴 표준화.
- **사유**: security-auditor W5 (2026-04-25, M1.6 Step 2). 현재 admin UI 미구현이라 즉시 위험 0.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §security-auditor W5
- **관련**: `[3.5-2]` (Admin role + /admin 페이지)
- **회수 예정**: **M1.7 Step 2** admin UI 설계 + `@security-auditor` Duty 4 (XSS sanitize) 재호출
- **블록킹**: No

### [3-31] Anthropic SDK Message.content round-trip 손실 — SDK upgrade 시 재검토
- **설명**: `logChat.ts:123` / `logValidationFailure.ts:127` 의 `JSON.parse(JSON.stringify(input.aiResponse))` 가 undefined / Symbol / function 필드 silent drop. 현 SDK 0.90.0 기준 `ContentBlock` 에 그런 필드 없음. SDK upgrade 시 손실 가능.
- **사유**: security-auditor W3 (2026-04-25, M1.6 Step 2). M1.5 Step 2c 의 logValidationFailure 기존 우려와 동일.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §security-auditor W3
- **회수 예정**: SDK 1.0 / 0.91+ upgrade 시 ContentBlock 변경분 재검토. KNOWN_RISKS 에 등재 (M2+ 별도 docs).
- **블록킹**: No

### [3-32] ~~AI hallucinated filter field (`base_asset`) — datasource queryableFields 명시화~~ — ✅ **2026-04-28 M1.6 Step 4 로 회수 완료**

> `AiCardConfigSchema` 최상위 `superRefine` 으로 cross-field 검증 — `filters[].field` / `sort.field` 가 해당 datasource 의 머지된 queryableFields 안에 등록된 이름인지 확인. crypto-domain-expert 자문으로 9 datasource queryableFields **18 필드 추가** (특히 `now_spot_ticker` 4→19, `open_interest` 1→5 — 워커는 이미 `oi_chg_5m/15m/1h/4h` 계산 중이었으나 registry 미등록이던 결함). `COMMON_QUERYABLE_FIELDS` (exchange/market_type/symbol) 머지 로직 추가 — 새 datasource 추가 시 boilerplate 0. `buildSystemPrompt.ts` 에 "filters/sort field 는 등록된 이름만" 가이드 1줄 명시 (zodToJsonSchema 가 superRefine 무시 보완). 세부: `docs/task-record/M1.6-step4-registry-enum.md`.

### [3-33] ~~Realtime channel reuse error~~ — ✅ **2026-04-26 M1.6 Step 3 Substep 3a 로 회수 완료 (구조적 해결)**

> `apps/web/lib/dataService/channelManager.ts` 옵션 Z 채택 (backend-infra-specialist 자문) — `.on('postgres_changes', ...)` 평생 1회만 호출, listener 추가/제거는 manager 의 dispatch table 만 갱신. 1초 grace period (Strict Mode + 카드 swap 안전). `channelManager.test.ts:79` 에 회귀 방어 테스트 추가. 세부: `docs/task-record/M1.6-step3-data-service-frontend.md`.

---

### [3-34] dataService initialFetch 추상화 부분 우회 — 카드의 `getSupabaseBrowserClient()` 직접 호출
- **설명**: `TickerCard.tsx` / `CoinListCard.tsx` 의 `initialFetch` 안에서 `getSupabaseBrowserClient()` 직접 호출 → `supabase.from(...)` 으로 SELECT 쿼리 실행. dataService 의 Realtime 면 (hooks) 은 단일 진입점이지만 SELECT 면은 카드가 직접 호출. `[3-10]` 절반만 회수.
- **사유**: code-reviewer C2 + security-auditor W-5 (2026-04-26, Step 3f). dataService 가 초기 SELECT 쿼리 모양 (eq/limit/maybeSingle 등 카드별 다양) 을 모르는 설계 한계. 완전 회수하려면 dataService 외부 면에 `selectRow(datasource, filters)` / `selectTable(datasource, filters, limit)` helper 추가 + `supabaseAdapter` 안에서 select 실행.
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §code-reviewer C2 / §security-auditor W-5
- **회수 예정**: **M1.6 Step 5** (RTL/CI 증강 batch) 또는 **M2+** (dataService 어댑터 면 확장 — GraphQL/WS 다변화 시점)
- **블록킹**: No
- **구현 힌트**: `apps/web/lib/dataService/queries.ts` 신규 — `selectRow<T>(datasource, { eq, limit, maybeSingle })` callback-style fetch. 카드는 filter 객체만 전달, supabase 직접 import 0건.

### [3-35] sendBehaviorEvent batch 최적화 — actionDispatcher 카드 N장 추가 시 N 호출
- **설명**: `actionDispatcher.ts:174-180` 가 `response.cards.forEach((config) => { ... sendBehaviorEvent("card_added", ...) })` — 1 dispatch 당 카드 N장이면 N 회 fetch POST. fire-and-forget 이라 UX 레이턴시 영향 없지만 같은 dispatch 안에서 batch 가 자연. `/api/log-behavior` route 가 이미 `events: []` 배열 받게 설계됨 — helper 만 batch 인자 받도록 가벼운 확장.
- **사유**: code-reviewer W3 (2026-04-26, Step 3f). 비용 영향 미미 (N=보통 1~3) 라 별도 commit 분리 가능.
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §code-reviewer W3
- **회수 예정**: **별도 소규모 commit** (M1.6 Step 4 또는 5 batch)
- **블록킹**: No
- **구현 힌트**: `sendBehaviorEvent(eventType, payload)` → `sendBehaviorEvents(events: Array<{ eventType, payload }>)` 시그니처 변경. 단일 호출은 wrapper helper 로 호환성 유지.

### [3-36] extractOldRow Partial<T> 타입 명시 — DELETE 페이로드 PK-only 보장
- **설명**: `apps/web/lib/dataService/payload.ts:30` `extractOldRow<T>` 가 `Partial<T> | null` 반환하는데, `useDataServiceRow.onChange` (hooks.ts:148) 에서 `match(prev as T)` 캐스트 강제. DELETE 페이로드는 REPLICA IDENTITY 정책에 따라 PK 컬럼만 올 수 있음. 카드의 `match` 함수가 PK 외 컬럼 참조하면 런타임 NPE 가능. 현재 TickerCard `match` 는 symbol/exchange/market_type 모두 PK 라 안전, 다만 contract 가 명시되어 있지 않음.
- **사유**: code-reviewer W5 (2026-04-26, Step 3f). 타입 시그니처를 `Partial<T>` 그대로 hook 까지 통과시키고 (`match: (row: Partial<T> | T) => boolean`), 카드 작성자에게 "DELETE 시 PK만 보장" 을 타입으로 강제.
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §code-reviewer W5
- **회수 예정**: **M1.6 Step 5** (RTL/CI 증강 batch)
- **블록킹**: No

### [3-37] client-side sha256 server 재계산 — admin analytics 시점 위조 방지
- **설명**: `ChatInputBar.tsx` 가 Web Crypto SubtleCrypto.digest 로 user_query_hash 계산 → server 가 받기만 하고 검증 없이 logChat 컬럼에 저장. 베타 단계에선 위조 incentive 0 (admin 분석 데이터 오염만 가능, 권한 상승 X) 수용. M1.7 admin UI 가 hash 기반 dedup/유사쿼리 분석 시작 시점에 server-side 재계산 필수.
- **사유**: security-auditor W-1 (2026-04-26, Step 3f). 비용은 SHA-256 50만 호출/일 기준 무시 가능 (<1ms each, 단일 워커).
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §security-auditor W-1
- **관련**: ROADMAP §M1.7 admin UI Step
- **회수 예정**: **M1.7 admin UI Step** (또는 M2 분석 루프) — `KNOWN_RISKS.md` 등재 후 트리거
- **블록킹**: No (베타 단계 안전)
- **구현 힌트**: `route.ts` 에서 받은 query 를 Node `crypto.createHash('sha256').update(query).digest('hex')` 로 재계산 → 받은 hash 와 비교 (mismatch 시 server 값 사용 + warn). 또는 client hash 무시하고 server 만 진실.

### [3-38] middleware matcher 컨벤션 명문화 — 모든 인증 endpoint 두 겹 auth 의무화
- **설명**: 현재 matcher: `["/api/orchestrate/:path*", "/api/log-behavior/:path*"]`. 향후 추가 endpoint 후보 (`/api/log-chat`, `/api/admin/*`, `/api/cards/*`, `/api/user/*`) 가 matcher 누락되면 single point of failure. **컨벤션**: "모든 신규 인증 필요 route handler 는 (a) middleware matcher 등록 + (b) 핸들러 첫 줄 `getSupabaseServerClient().auth.getUser()` 검증" 두 겹 패턴 명문화.
- **사유**: security-auditor W-3 (2026-04-26, Step 3f). 컨벤션 미명시 시 backend-infra-specialist 가 M1.7 admin route 추가 시 누락 위험.
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §security-auditor W-3
- **회수 예정**: **M1.7 admin Step 0** — `POLICIES.md` 또는 `docs/Architecture.md` §middleware 섹션에 컨벤션 명문화
- **블록킹**: No

### [3-39] ~~M1.3 Step 5b 잠복 버그 — `!miniTicker@arr` price_change_pct 영구 stale~~ — ✅ **2026-04-27 M1.6 Step 3.5 hotfix 로 회수 완료**

> M1.3 Step 5b 에서 ticker WS 를 `!miniTicker@arr` (mini, 6필드) 로 설정 → `priceChangePercent` (24h 변화율) 가 페이로드에 없어 DB `now_*_ticker.price_change_pct` 가 M1.3 Step 4 시점 값으로 영구 stale. 약 7일간 잠복. 사용자 발견 (BTCUSDT Binance 사이트 +0.80% / DB -0.282% 차이 1.08%). M1.6 Step 3.5 hotfix 로 `!ticker@arr` (full 17필드) 전환 — 매초 P/p/w/n/O/C 6필드 적재. **CLAUDE.md / PRD / Architecture 에 "사이트=DB 일치" 도메인 원칙 명문화** (위생 #9). 세부: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md`.

### [3-40] SPOT bid/ask + prevClose 5필드 적재 — USDM bookTicker stream 동시 도입
- **설명**: SPOT `!ticker@arr` 는 21 필드 (b/B/a/A/x 추가). USDM 은 17 필드 (best bid/ask 미포함, `<symbol>@bookTicker` 별도 stream 필요). 본 hotfix (Step 3.5) 에선 USDM 일관성 위해 `bid_price` / `bid_qty` / `ask_price` / `ask_qty` / `prev_close_price` 5 필드 미적재 — schema 컬럼은 존재. SPOT now_spot_ticker schema 에는 5 컬럼 모두 있고, USDM now_futures_ticker schema 에는 없음.
- **사유**: crypto-domain-expert 자문 (2026-04-27, Step 3.5 hotfix). SPOT 만 채우면 카드 측 분기 복잡 + 사용자 혼란 ("BTCUSDT 현물엔 bid 보이는데 선물엔 NULL?"). USDM bookTicker stream + COINM 호환성 동시 검토 후 일괄 적재.
- **출처**: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md` §crypto-domain-expert Q2
- **회수 예정**: **M2 확장 루프** (Order book / Liquidation 카드 본격 도입 시 동시 작업)
- **블록킹**: No
- **구현 힌트**: tickerWsHandler 의 normalizeSpotFullTicker 에 5 필드 추가 (간단) + USDM/COINM 은 BinanceWsRelay 의 subscriptions 에 `<symbol>@bookTicker` per-symbol 추가 (chunk 분할 필요, BinanceKlineRelay 패턴 참고) + bookTickerWsHandler 신규.

### [3-41] ticker WS payload 3배 증가 모니터링 — Hetzner CPU 부담 관측
- **설명**: `!miniTicker@arr` (6 필드) → `!ticker@arr` (17 필드) 전환으로 페이로드 크기 ~3배 (12K → 34K 필드/sec). Hetzner 1Gbps 네트워크 무시 가능 (1.2 MB/s 수준), CPU JSON 파싱은 ~3배 증가. 현 dev 환경 (로컬 Node) 에선 미미하지만 Hetzner 실서버 배포 시 (Launch §L.3) 모니터링 권장.
- **사유**: crypto-domain-expert 자문 (2026-04-27, Step 3.5). 즉시 위험 0, Hetzner 배포 시점 관측.
- **출처**: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md` §crypto-domain-expert Q4
- **회수 예정**: **Launch §L.3 Hetzner 배포** 시점 부하 모니터링 (CPU / RSS / GC pause)
- **블록킹**: No

### [3-42] price_change_pct ±50% sanity guard — 극단값 null 처리
- **설명**: CLAUDE.md 위생 원칙 #5 (극단값 sanity guard) 적용. Binance API `priceChangePercent` 가 ±50% 초과 시 (a) 워밍업 부족 / (b) stale 비교 / (c) API 이상 가능성 → 기본 null 처리 + 콘솔 경고. 현 hotfix 는 raw 값 그대로 적재.
- **사유**: crypto-domain-expert 자문 (2026-04-27, Step 3.5). volume_chg_5m 은 이미 가드 있음 — 일관성.
- **출처**: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md` §crypto-domain-expert 추가 권고
- **회수 예정**: **별도 소규모 commit** (M1.6 Step 4 또는 5 batch)
- **블록킹**: No
- **구현 힌트**: `tickerWsHandler.ts` 의 `normalizeSpotFullTicker` / `normalizeFuturesFullTicker` 안에서 `parseNum(r.P)` 후 `Math.abs(pct) > 50 ? null : pct` 처리 + console.warn.

### [3-43] ~~`docs/canonical-metrics.md` 신설 — 거래소별 metric 정의 통일 docs~~ — ✅ **2026-05-26 M1.8 §8.5-c 로 회수 완료**

> docs/canonical-metrics.md 신설 (~500줄, 9 섹션) — 7 metric × 9 interval × 단위 × 정밀도 × 사이트 URL 매트릭스 + Binance USDM 본 마일스톤 cover + COINM `[8-3]` M1.9 + OKX/Bybit/Bitget M2+ 청사진. `@crypto-domain-expert` 가 owner (D5). commit `e4e8082`. 세부: `docs/task-record/M1.8-step5-market-units-canonical.md` §5.3.

### [3-43-원본] `docs/canonical-metrics.md` 신설 — 거래소별 metric 정의 통일 docs (M2-plan §Step 0 docs sweep 시 본문 통째 삭제 예정)
- **설명**: 거래소별 metric 정의 차이 (예: Funding Rate 8h 표시 vs 1h 환산 / OI 명목금액 vs 계약수 / Mark Price vs Last Price 기준 PnL 계산) 를 canonical 정의로 통일하는 reference docs. 사이트=DB 일치 원칙 (CLAUDE.md 위생 #9) 의 "현실 한계 (b)" 대응.
- **사유**: crypto-domain-expert 자문 (2026-04-27, Step 3.5). M2 거래소 다변화 (OKX/Bybit/Bitget) 시점 전 신설 필수.
- **출처**: `docs/task-record/M1.6-step3.5-ticker-stream-hotfix.md` §crypto-domain-expert Q3
- **회수 예정**: **M2 시작 직전** — 4개 거래소 비교 + canonical 정의 + 거래소별 변환 함수 위치 명시
- **블록킹**: No

### [3-44] 차트 mount 1~2초 빈 공백 동안 last price + 24h chg 한 줄 placeholder
- **설명**: KlineChartCard 의 TradingView iframe 로드 동안 (1~2초) 카드가 텅 빈 상태로 보임. 그 동안 카드 헤더 아래 "BTCUSDT $77,781 +0.5%" 같은 한 줄 placeholder 를 띄우면 트레이더 인내 ↑ + "이 카드 죽었나?" 체감 0. iframe load 이벤트로 placeholder fade-out.
- **사유**: crypto-trader 자문 (2026-04-27, M1.6 Step 3 잔여 검증 통과 시 advisory 1번째). 신규 기능 영역, 사용자 결정 권한.
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §crypto-trader 자문 (Phase 2 통과 후)
- **회수 예정**: **사용자 결정** — M1.6 Step 4 진행 전 채택 / M1.7 / M2+ 모두 가능. 채택 시 `roadmap-milestone-manager` 위임으로 step 분해.
- **블록킹**: No
- **구현 힌트**: `KlineChartCard.tsx` 의 mount 시점에 `now_spot_ticker` / `now_futures_ticker` 1 row fetch (이미 dataService 어댑터 존재) → `<div data-placeholder>` 1줄 렌더 → TradingView `tv.widget.onChartReady()` 콜백에서 placeholder 제거.

### [3-45] 동일 query hash + 5분 이내 재호출 시 "최근 결과 재사용" hint 토스트
- **설명**: 사용자가 동일 query (예: "BTCUSDT spot price") 를 5분 이내 재호출 시 (sha256 결정성으로 hash 매칭) "Showing recent result from 3 min ago. Re-render?" 영어 토스트 + Re-render 버튼. 채택 시 부수 효과로 Anthropic API 비용 절감.
- **사유**: crypto-trader 자문 (2026-04-27, M1.6 Step 3 잔여 검증 통과 시 advisory 2번째). user_query_hash 의 자연스러운 UX 활용. 신규 기능 영역, 사용자 결정 권한.
- **출처**: `docs/task-record/M1.6-step3-data-service-frontend.md` §crypto-trader 자문 (Phase 2 통과 후)
- **회수 예정**: **사용자 결정** — M1.7 (rate limit / cost 통제 컨텍스트와 동일 그룹) 가장 자연스러움. 채택 시 `roadmap-milestone-manager` 위임.
- **블록킹**: No
- **구현 힌트**: `submitOrchestrate.ts` 진입 시 `log_chat` 5분 이내 동일 hash 확인 (단, RLS 로 본인 row 만) → 매칭 시 토스트 + 사용자 confirmation 후 fetch. 비용 절감 분석 어드민 메트릭과 묶음.

### [3-46] queryableFields 깊은 검증 — operator + value type 3축 Zod refinement
- **설명**: M1.6 Step 4 에서 `queryableFields` 의 **field 이름만** 등록 set 으로 검증 (Q2=C 좁은 검증 채택). operator 제약 (예: `volume_chg_5m` 은 `number` 타입에 `>` / `<` / `=` 만 허용) + value 타입 검증 (string vs number vs enum) 은 deferred. AI 가 `volume_chg_5m > "abc"` 같은 잘못된 값 타입 emit 시 현 schema 통과 → silent NO MATCH.
- **사유**: 사용자 결정 (Q2=C, 2026-04-28) — M1.6 Step 4 사전 결정. queryableFields 메타데이터 풍부화 + Zod superRefine 가 1.5h 추가 작업. Step 4 scope 폭증 위험. 운영 로그에서 hallucinated value 빈도 측정 후 도입 판단이 합리.
- **출처**: 사용자 결정 (Q2, 2026-04-28) — M1.6 Step 4 사전 결정 + `[3-32]` 후속
- **회수 예정**: **M1.6 Step 5 또는 M2 초반** — `log_validation_failure` 에서 hallucinated value type 빈도 측정 후
- **블록킹**: No
- **구현 힌트**: `datasourceRegistry` 의 `queryableFields` 를 현재 `string[]` (이름만) → `Array<{ field: string, type: "number" | "string" | "enum", operators: Array<"=" | ">" | "<" | "above" | "below"> }>` 확장. `AiCardConfigSchema.filters` 에 `superRefine` 으로 datasource 별 (1) field 등록 여부 (2) operator 호환성 (3) value 타입 일치 3축 검증. registry 자체 메타데이터로 검증 — 하드코딩 분기 없음.

### [3-47] datasource 메타에 `siteParityUrl` 필드 신설 — 거래소 사이트↔DB metric 매핑 docs
- **설명**: 각 datasource 가 거래소 공식 사이트의 어느 화면 / 어느 metric 에 매핑되는지 메타데이터로 명시 (예: `now_futures_ticker` → `https://www.binance.com/en/futures/markets`). M1.6 Step 4 에서는 description 안에 평문 주석으로만 두고, M2 거래소 다변화 (OKX/Bybit/Bitget) 시점에 정식 필드로 승격.
- **사유**: crypto-domain-expert 자문 (2026-04-28). CLAUDE.md §위생 #9 (사이트=DB 일치 원칙) 의 자동 추적 인프라. M2 다거래소 시 "OKX 사이트의 어느 화면이 OKX premium_index 와 매핑되나" 자동 검증 가능. 단일 거래소 시점에선 ROI 낮음.
- **출처**: `crypto-domain-expert` 자문 (2026-04-28, Step 4 사전) §운영 권고 5번 + §Q3 마지막 단락
- **관련**: `[3-43]` `docs/canonical-metrics.md` 신설과 함께 도입
- **회수 예정**: **M2 거래소 다변화 시점** — `[3-43]` canonical-metrics.md 신설과 동시 batch
- **블록킹**: No
- **구현 힌트**: `DatasourceEntrySchema` 에 `siteParityUrl: z.string().url().optional()` 추가. 등록 헬퍼는 거래소별 multi-URL `Record<ExchangeId, string>` 으로 — Binance 1개일 땐 `{ binance: "..." }`, M2 에 OKX 추가 시 `{ binance: "...", okx: "..." }` 자연 확장.

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

### [3-50] `!ticker@arr` (full 17필드) WS 복귀 — **spot 부분 진행 (M1.8 §8.4-e, 2026-05-28) / USDM·COINM M2+ 이월 (server-side 가설 confidence 95%+, 2026-05-03)**

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

### [3-59] Binance fstream WS server-ping listener + pingTimeout 마켓별 차등 (Phase B, 24h 모니터링 후 결정)

- **설명**: `[3-52]` 의 후속 작업. **Phase A (firstMessageWatchdog) 는 "연결 후 첫 메시지 0건" 만 catch** — 일단 메시지 흐르기 시작 후 stall 은 기존 `staleConnectionMs=120s` 담당. **Phase B = client-side `ws.on('ping', ...)` listener 추가** + `pingTimeout` 마켓별 차등 설정으로 server ping 미수신 자체를 능동 감지.

- **🎯 context7 발견 (2026-04-30, ws v8.18.3 + Binance Derivatives 공식 docs)**:
  - **Binance USDM/COINM** (`fstream/dstream`): server **3분 주기 ping** 전송, client **10분 내 pong** 회신 안 하면 disconnect. ws library 는 pong 자동 응답 (확인). 즉 Binance 가 우리 쪽 broken connection 인지하는데 **최대 13분 소요**.
  - **Binance SPOT** (`stream.binance.com`): server **20초 주기 ping** (별도, 더 짧음).
  - **ws library 자체**: client-side 자동 ping/pong 옵션 X. `client.on('ping', ...)` 핸들러 명시 + `pingTimeout` 패턴이 정공.

- **🔥 USDM stale 3분 28초 패턴이 server ping 주기 (3분) 와 정확히 일치** — Hetzner Linux 에서도 재현 → 클라이언트 환경 가설 100% reject + **server ping 주기 동기화된 패턴** 확정. 환경 무관 가설로 confidence 매우 상승.

- **🎯 첫 6h baseline 데이터 정량 강화 (2026-04-29 12:42~18:42 UTC)**: monitor.sh 자동 측정 결과 USDM stale events **75회 / 6h = 정확히 5분 주기**. 이론값 (server ping 3분 + staleConnectionMs 120s = 5분) 와 100% 일치. 즉 Phase B 의 client-side ping listener 패턴 (server ping 도착 능동 감지) 이 정확한 정공임을 6h 만의 데이터로도 정량적 confidence 80%+ 달성. 24h 누적 시 ~300회 추정.

- **사유**: 24h monitoring 으로 실제 ping 도착 분포 측정 후 적용. 즉시 적용 비추 — pingTimeout 너무 짧으면 false reconnect 폭증, 너무 길면 stale 그대로. M1.6 Step 4 hotfix 의 가설 단정 학습 사례 (memory `feedback_environment_diagnostic_priority.md`) 정합.

- **출처**: `[3-52]` 본문 분리 (2026-04-30) + backend-infra-specialist context7 조사 (2026-04-30, ws v8.18.3 + Binance Derivatives docs) + 사용자 결정 (옵션 A: Phase A 즉시, Phase B 24h 후)

- **관련**: `[3-52]` Phase A (firstMessageWatchdog 즉시 회수), `[3-50]` `!ticker@arr` full 17필드 복귀 결정 근거, M1.7 Step 0 Substep 0.5 monitoring 데이터

- **회수 예정**: **Substep 0.6 또는 M1.7 Step 1+** — 24h monitoring 데이터 분석 후

- **블록킹**: No (Phase A + REST 1분 보강으로 운영 가능 수준)

- **구현 힌트 (24h monitoring 데이터 후 정공)**:
  1. **client-side ping listener 추가**: 각 ws connection 에 `ws.on('ping', () => statusMap[market].lastPingAt = Date.now())` 등록. `staleConnectionMs` 의 메시지 기반 detect 외에 ping 기반 detect layer 추가.
  2. **pingTimeout 마켓별 차등**:
     - SPOT: 21초 (server ping 20s + 1s 여유)
     - USDM/COINM: 200초 (server ping 3분 + 20s 여유)
  3. **24h monitoring 측정 항목** (Substep 0.5 의 monitor.sh metric 5 신설 후보):
     - USDM/COINM 각 connection 의 `ping` 이벤트 도착 간격 (3분 ±N) 분포
     - watchdog 발동 빈도 vs reconnect 후 정상 복구 여부
     - **ping 정상 수신 + 메시지 0건 케이스** 발생 여부 → 진짜 selective 메시지 stall 가설 (server side bug) 확정 근거
  4. **변경 후 24h 추가 monitoring** → ping 이벤트 도착 분포 + stale event 빈도 정량 비교 → 가설 확정 또는 reject
  5. **만약 ping 정상 수신 + 메시지 0건 패턴 확인 시**: Binance server-side bug 가설 확정 → `[3-50]` full ticker 복귀 시도 의미 없음 (mini/full 무관) → deferred 연장 (M2 또는 영구) + Binance 측 issue report 검토

- **monitor.sh metric 5 추가 후보** (선택): `firstMessage watchdog 발동` 카운트 (Phase A 효과 측정) + `ping 수신` 빈도 (Phase B 진단 보조). 현재 metric 4 (stale 감지) 와 분리.

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

### [3-54-원본] 24h Volume Leaders 도메인 결함 정공 — `quote_volume_usd` 컬럼 + worker USDT 환산
- **설명**: 2026-04-30 사용자 결정으로 **B1 description 가이드 + buildSystemPrompt default scope 단락 모두 제거** (CLAUDE.md "AI 의도 추론 공간 좁히지 마라" 원칙 정합 회복, 글로벌 타겟 + 확장성 우선). 정공은 `now_*_ticker` 에 `quote_volume_usd NUMERIC` 컬럼 신설 + worker 적재 시점에 USDT 환산 (cross-pair price 활용). USDM 의 `quote_volume` 은 이미 USDT, SPOT 의 `quote_volume` 은 quote_asset 따라 IDR/JPY/TRY 등 다양. USDT 환산 = `quote_volume × QUOTE_TO_USDT_RATE[quote_asset]`. 이 컬럼이 생기면 모든 consumer (AI orchestrator / CoinListCard / admin dashboard) 가 `ORDER BY quote_volume_usd DESC` 한 번으로 글로벌 정렬 일관 처리.
- **사유**: crypto-domain-expert 자문 (2026-04-28) + 사용자 의사결정 (2026-04-30, B1 가이드 제거 결정). registry description 가이드는 AI 의도 추론 공간 좁힘 + 신규 quote asset 추가 시 stale + 글로벌 타겟에서 fiat 페어 트레이더 차단. 컬럼 차원 정공이 단일 진실 공급원 + AI 자연어 의도 추론 ("show USDT only") 그대로 보존.
- **출처**: `crypto-domain-expert` 자문 (2026-04-28, USDM stuck 진단 동시) §Q3 정공 + 사용자 본 사고 (BTCIDR Top 1 노출, 2026-04-28)
- **회수 예정**: **M1.7 Step 7 또는 M2 초입** ([3-50] full ticker 복귀와 함께 worker 적재 정공 batch)
- **블록킹**: No (B1 임시 hotfix 로 사용자 화면 정상화)
- **구현 힌트**: (1) 마이그레이션 — `now_spot_ticker` / `now_futures_ticker` 에 `quote_volume_usd NUMERIC` 컬럼. (2) 워커 — `tickerWsHandler.handleTickerBatch` 안에서 `QUOTE_TO_USDT_RATE` 계산 (USDTIDR / USDTJPY / USDTTRY / BTCUSDT 등의 last_price 역수). (3) 환산 실패 시 `quote_volume_usd = NULL` (graceful). (4) symbols 마스터에 `is_global_quote BOOLEAN` 메타 컬럼도 함께 신설 (GLOBAL_QUOTES whitelist 데이터 레이어 분리).

### [3-56] symbols 마스터 reload 주기 단축 — 상폐빔 / 신규 상장 빠른 반영 (트레이더 UX)
- **설명**: 현재 `apps/worker/src/poller/tasks/symbolsReloadTask.ts` (또는 유사) 가 **24h 주기**로 Binance `/api/v3/exchangeInfo` (spot) + `/fapi/v1/exchangeInfo` (USDM) + `/dapi/v1/exchangeInfo` (COINM) 호출 → status === "TRADING" 만 allowlist Set 으로 추출. 상폐 임박 (status SETTLING/PRE_SETTLE 변경) 또는 신규 상장 (status PRE_TRADING → TRADING 변경) 시점에 최대 24h 지연 발생.
- **사유**: 사용자 트레이더 인사이트 (2026-04-30) — "상폐빔 (Delisting Pump): 상장폐지 임박 코인의 마지막 펌핑 1~3일 안에 5~30% 변동, 트레이더에게 short-term 핵심 기회. 신규 상장 첫 24h~1주 거래량 폭증 + 변동성 매우 큼." 24h reload 는 이 두 trader UX 에 부적합. 1h 주기로 단축 → 지연 24x 감소. exchangeInfo API weight = 10/호출 × 3 endpoint × 24/일 = 720 weight/일 (cap 6000/min 기준 무시 가능).
- **출처**: 사용자 도메인 인사이트 (2026-04-30, M1.7 Step 0 Substep 0.4 검증 시점)
- **관련**: `[3-57]` 상폐 임박 / 신규 상장 카드 type, M1.4 Step 4.7 lifecycle gate 의 자연 follow-up
- **회수 예정**: **M1.7 Step 1 또는 M2 초입** (베타 운영 시점에 가치 폭증)
- **블록킹**: No (24h 지연도 일부 사용자에게 acceptable, 다만 trader UX 개선 가치 큼)
- **구현 힌트**: (1) `symbolsReloadTask.ts` 의 cron interval 24h → 1h 변경 (또는 환경변수 `SYMBOLS_RELOAD_INTERVAL_MIN=60`). (2) reload 실패 시 graceful — 기존 allowlist 유지 + 다음 cycle 재시도. (3) reload 결과 변화 (added / removed symbols) 를 journald 에 INFO 로그 — 신규 상장/폐지 detect 시점 추적. (4) 더 공격적 (10분 주기) 도 가능하지만 트레이더 UX 와 API weight 균형점 1h 가 최적.

### [3-57] 상폐 임박 / 신규 상장 카드 type — 트레이더 short-term 트레이딩 기회 알림 (M2+ feature)
- **설명**: TRAVIS 의 새 컴포넌트 type — (a) "Delisting Imminent" 카드: status 가 PRE_SETTLE / SETTLING / DELIVERING 으로 변경된 심볼 목록 + 마지막 거래 시각 + 변동률 (상폐빔 추적). (b) "New Listings" 카드: status 가 PRE_TRADING → TRADING 으로 변경된 심볼 + 거래 시작 시각 + 첫 24h 거래량/변동률. componentRegistry 에 신규 등록 → AI 자동 활용 가능.
- **사유**: 사용자 도메인 인사이트 (2026-04-30) — "상폐 직전 펌핑과 신규 상장 분석/트레이딩 트레이더 많아 추후 빠른 반영 필요." 단순 데이터 빠른 반영 ([3-56]) 외에 "이 시점에 어떤 코인들이 status 변경됐나?" 직접 query 가능한 카드가 핵심.
- **출처**: 사용자 도메인 인사이트 (2026-04-30) + crypto-trader UX 가치 추정
- **관련**: `[3-56]` reload 주기 단축, M1.4 Step 4.7 lifecycle gate 인프라 위에 카드 layer 추가
- **회수 예정**: **M2 (다거래소 + 분석 layer)** 시점 — OKX/Bybit/Bitget 의 상장폐지/신규 상장 인지 패턴이 통일된 후
- **블록킹**: No (M2+ feature)
- **구현 힌트**: (1) `symbolsReloadTask` 가 status 변경 detect 시 별도 테이블 (`symbol_lifecycle_events`) 에 적재 — `event_type IN ('listed', 'pre_settling', 'delisted')` + `event_timestamp`. (2) 신규 컴포넌트 `delisting-imminent-card` / `new-listings-card` registry 등록. (3) `symbol_lifecycle_events` queryableFields 에 `event_type` / `event_timestamp` / `since` 추가. (4) crypto-trader 자문으로 카드 UX 검증 — 어떤 metric 표시가 트레이더에게 가장 valuable 한지 (예: "since listing X hours / volume change vs 1h ago").

### [3-58] 24h 모니터링 알림 자동화 영구화 — Slack/Discord webhook (베타 ops)
- **설명**: M1.7 Step 0 Substep 0.5 의 systemd timer + monitor.sh 자동화 위에 알림 layer 추가. metric 4 (USDM stale event count) 또는 metric 7 (Supabase staleness) 이 임계값 (`[HIGH]`) 초과 시 Slack/Discord webhook push. 베타 사용자 100명+ 도달 시 사고 인지 시간 단축 핵심.
- **사유**: 24h 단발 검증은 monitor.sh dump 만으로 충분하지만, 베타 운영 영구 단계에서는 [HIGH] 알림 즉시 받아야 (worker 죽음 1h 안에 사용자 카드 stale → 신뢰 손상). monitor.sh 의 line ~262 주석 블록에 추가 위치 마크 이미 있음 (1줄 추가 + worker.env 에 `SLACK_WEBHOOK_URL=...` 추가만 필요).
- **출처**: backend-infra-specialist 자문 (2026-04-30, monitor 자동화 작성) §9 알림 옵션 가이드
- **회수 예정**: **M1.7 Step 1+ (allowlist 게이트 + admin role 추가 후)**
- **블록킹**: No (베타 100명 이하 단계는 dump 만으로 충분)
- **구현 힌트**: monitor.sh 마지막 부분 주석 해제 + worker.env 에 webhook URL 추가. Discord 도 동일 패턴, payload `{"content": "..."}` 로 변경. 알림 빈도 control 위해 "[HIGH] 가 이전 6h 와 동일하면 push 안 함" 같은 쿨다운 로직 추가 권장.

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

### [3-60] history_futures_liquidation USDM 채널 silent stall — 4.6일 갭 (2026-04-27 ~ 진행중, 2026-05-02 발견)

- **설명**: 사용자 직접 발견 (2026-05-02, Supabase MCP 분포 확인) — `history_futures_liquidation` 의 `market_type` 분포가 비정상. 전체 13,811 rows 중 `futures_usdm` 13,474 / `futures_coinm` 337 (USDM 우세는 정상 — USDM 608 심볼 vs COINM 30 심볼). **그러나 USDM 마지막 row 가 2026-04-27 09:39:19 UTC** (약 4.6일 / 401,370초 stale), `futures_coinm` 는 2026-05-02 00:20:03 UTC (49분 전, 정상). 4월 27일 이후 USDM 청산이 단 1건도 적재되지 않음. 코드 레벨로는 `apps/worker/src/index.ts:74-86` `WS_SUBSCRIPTIONS.futures_usdm` 에 `!forceOrder@arr` 정상 등록 + `apps/worker/src/ws-relay/streams/forceOrderWsHandler.ts:65-67` `canHandle` 가 USDM/COINM 둘 다 처리 — 즉 런타임에 USDM 측 `!forceOrder@arr` 메시지가 워커에 도달하지 못하는 상태.

- **사유**: 시점 (2026-04-27) 이 `[3-50]` `!ticker@arr` → `!miniTicker@arr` 임시 롤백 (M1.6 Step 4 hotfix B) 와 동일일이고 `[3-59]` USDM stall 사고 (server ping 3분 + staleConnectionMs 120s = 5분 주기 stall) 와 같은 영역. 그러나 ticker 는 stall 후 5분 안에 자동 재연결로 1초 stale 회복되는 반면, **forceOrder 는 이벤트성 (replay 없음) 이라 stall 구간 동안 발생한 청산 이벤트를 영구 손실**. monitor.sh metric 4 는 ticker `now_*` stale 만 보고 있어 forceOrder 의 silent failure 4.6일을 detect 못 한 사각지대. USDM 608 심볼 (BTCUSDT/ETHUSDT 등) 의 분당 수십~수백 건 청산이 4.6일 동안 0건은 도메인적으로 불가능 — 가설: (a) `[3-59]` 의 server-side push 결함이 USDM forceOrder 에만 selective 적용, (b) 워커 가용성 갭 (4월 27일 ~ 4월 30일 Hetzner 이전 사이) 누적, (c) USDM connection 자체는 살아있으나 `!forceOrder@arr` subscribe 만 silently drop. 24h 모니터링 데이터로 `[3-59]` Phase B 가설 확정 후 본 항목 영역 좁힘.

- **출처**: 사용자 직접 발견 (2026-05-02) + Supabase MCP `history_futures_liquidation` 4 SQL 분포·시간대·RLS·인덱스 확인 + `apps/worker/src/index.ts:74-86` + `apps/worker/src/ws-relay/streams/forceOrderWsHandler.ts:65-67`

- **관련**: `[3-50]` `!ticker@arr` 복귀 (USDM 같은 영역), `[3-59]` Phase B server-ping listener (USDM stall 본질 진단), M1.7 Step 0 Substep 0.5/0.6 24h 자동 모니터링

- **회수 예정**: **M1.7 Step 0 Substep 0.5/0.6 (24h 모니터링) 완료 후 → M1.6 잔여 Step 5+** (사용자 결정 2026-05-02). 24h 데이터로 `[3-59]` server-ping 가설 확정 / 환경 무관 확인 후 일괄 처리. **자연 회수 가능성**: `[3-59]` Phase B 적용으로 USDM stall 이 정상화되면 `forceOrder` 도 자동 회복될 수 있어 추가 조치 불필요할 가능성. 정상화 후에도 USDM forceOrder 갭이 남으면 Step 5+ 에 추가 진단 등록.

- **블록킹**: 🟡 데이터 정확도 (사이트=DB 일치 원칙 §9 위배 — 베타 시연 시 청산 데이터 의존 카드 Liquidation Heatmap 등 미구현이라 즉시 위험 0, 다만 USDM forceOrder 는 BTCUSDT 분당 수십 건 발생하는 핵심 시그널이라 카드 도입 시점에 도메인 결함 노출)

- **구현 힌트**:
  1. **즉시 진단 SQL** (Substep 0.6 분석 직후): `SELECT date_trunc('hour', trade_time) AS hour, market_type, COUNT(*) FROM history_futures_liquidation WHERE trade_time > NOW() - INTERVAL '24 hours' GROUP BY hour, market_type ORDER BY hour DESC;` — 24h 안 USDM forceOrder 0건 지속이면 `[3-59]` Phase B 적용 전·후 비교 retest 필수.
  2. **monitor.sh metric 신설 후보** (M1.7 Step 0+ 또는 M1.6 잔여 Step): USDM hot 심볼 (BTCUSDT/ETHUSDT) 의 1시간 청산 0건 detect → `[HIGH] USDM forceOrder dead` 알림. 이벤트성 테이블의 silent failure 잡기 위한 별도 헬스체크 (현재 metric 4 ticker stale 와 분리). hot 심볼 임계: BTCUSDT 1h 청산 0건 = 시장 데드 (현실적으로 발생률 거의 0%).
  3. **데이터 갭 보정 가능성**: 4.6일 누락 청산은 복원 불가. Binance REST `/fapi/v1/forceOrders` 는 signed endpoint (트레이더 본인 계정 전용) 이고, 공개 시장 청산 이력 endpoint 부재. 갭은 **영구 손실 수용** + monitor 강화로 신규 갭 방지에 집중.
  4. **dataService 측면 의심 배제**: `insertLiquidation` 자체는 INSERT only / dedup 미적용 / `retryOnTransient` 가드 정상 — 코드 레벨 의심 없음. 가설은 WS layer (USDM connection 의 `!forceOrder@arr` 메시지 수신 자체 0건). worker 로그에서 같은 구간 `forceOrderWsHandler` 호출 카운트 확인.
  5. **회수 후 task-record**: `docs/task-record/M1.6-stepN.md` 에 (a) Substep 0.5/0.6 24h 누적 USDM forceOrder count (b) `[3-59]` Phase B 적용 전·후 효과 (c) silent failure detect 강화 결과 기록.

### [3-61] ~~LoginForm/SignupForm `submittingRef` 동기 race guard 미도입~~ — ✅ **2026-05-03 별도 소규모 commit 으로 회수 완료**

> ChatInputBar `[2-6]` 패턴 그대로 LoginForm.tsx / SignupForm.tsx 에 `submittingRef = useRef(false)` 추가 + `onSubmit` 첫 줄 `if (submittingRef.current || submitting) return; submittingRef.current = true;` (두 겹 가드) + `finally { submittingRef.current = false; if (mountedRef.current) setSubmitting(false); }`. RTL 테스트 (iv) 를 `Promise.all([user.click(btn), user.click(btn)])` 진짜 race 시뮬로 강화 — signIn/signUp 1회만 호출 + disabled 1차 방어선도 같이 작동 두 겹 검증. 14/14 RTL PASS + type-check 0 errors. M1.6 Step 5 task-record §잠복 버그에서 발견된 자연 발생 deferred 가 30분 fix 로 처리됨.

### [3-62] `apps/web/app/api/orchestrate/route.ts` 750줄 분할 (단일 책임)
- **설명**: `route.ts` 가 750줄 — HTTP layer + AI orchestration core + dev fixture + schema bridge + token aggregation + message catalog 6 책임 혼재. CLAUDE.md "파일 하나에 너무 많이 넣지 마" 와 충돌. M1.6 Step 5 의 `orchestrateOnce` export 가 자연스러운 분할 신호.
- **사유**: code-reviewer W5 (2026-05-03, M1.6 Step 5). 동작 영향 0 — 점진적 부채.
- **출처**: `docs/task-record/M1.6-step5-test-infra.md` §code-reviewer W5
- **회수 예정**: **M1.7 또는 M2 초입** 다른 ai/orchestrate 영역 작업과 묶음
- **블록킹**: No
- **구현 힌트**: 권장 분할: `apps/web/lib/ai/orchestrate/{orchestrateOnce,inputSchema,extractPayload,forcedInvalid,messageForReason,tokenAggregation}.ts` + `apps/web/app/api/orchestrate/route.ts` 는 POST 핸들러만 (~200줄). import 경로는 alias `@/lib/ai/orchestrate/...` 로 통일.

### [3-63] ~~`route.ts:519` `_userId` underscore prefix 정리~~ — ✅ **2026-05-04 M1.6 Step 6a 로 회수 완료**

> `let _userId` → `let userId` + `_userId = user.id` → `userId = user.id` + 5곳의 `userId: _userId` → object shorthand `userId,` 일괄 정리. line 545~546 의 "unused 가 아님" 주석 자연 제거. underscore prefix 의 가짜 unused 신호 차단. 세부: `docs/task-record/M1-complete.md` §6a.

### [3-64] DOMPurify 도입 트리거 — M2+ 본문 무제한 필드 추가 시
- **설명**: 현재 `apps/web/lib/sanitizeTitle.ts` 자체 정규식 (em/strong whitelist, ~0.5KB) 이 `.max(80)` Zod 길이 가드 + 짧은 메타 텍스트 (title/kicker/subtitle) 표면 안에서 **20 XSS 벡터 모두 안전 처리** 입증 (M1.6 Step 6c security-auditor + code-reviewer 자문). DOMPurify ~50KB 도입은 현재 overkill. 단 향후 카드 description / body / summary / 사용자 발화 echo / 마크다운 렌더 등 **본문 길이 무제한 필드** 가 추가되는 시점 = 정규식 한계 부각 → DOMPurify 검토.
- **사유**: code-reviewer S1 + security-auditor Q3 (2026-05-03~04, M1.6 Step 6c). 현재 도입 비용 > 안전성 이득. 트리거 명시로 향후 결정 시점 못 박기.
- **출처**: `docs/task-record/M1-complete.md` §6c W-2 회수 / `docs/task-record/M1.6-step5-test-infra.md` 의 sanitize baseline
- **회수 예정**: **M2+ 본문 무제한 필드 추가 시** (예: AI description / summary / 마크다운 렌더 / user echo)
- **블록킹**: No (현재 표면 안전)
- **구현 힌트**: `pnpm add dompurify isomorphic-dompurify` + `sanitizeTitle.ts` 를 `sanitizeRichText.ts` 로 확장. 옵션: `ALLOWED_TAGS: ['em','strong','a','code','p','br']` + `ALLOWED_ATTR: ['href']`. ALERT: 본문 필드 추가 시 zod-schema-architect 동시 자문 필수 (`.max(N)` 길이 가드 + Zod refinement).

### [3-65] dataService `initialFetch` helper 확장 — orderBy / in / between / projection
- **설명**: 현 `apps/web/lib/dataService/initialFetch.ts` 는 `eq` 등호 매칭 + `limit` + `single` 모드만 지원 (M1.6 Step 6c W-1 회수 시 YAGNI 판단). M2+ 에서 카드가 `created_at desc` 정렬 / `IN (a, b, c)` 다중 매칭 / `BETWEEN` 시간 범위 / `select('col1, col2')` projection 같은 더 풍부한 SELECT 패턴 필요해지면 helper 확장.
- **사유**: code-reviewer S2 + S4 (2026-05-04, M1.6 Step 6c). 현재 카드 2종 (CoinListCard / TickerCard) 만 helper 사용 + `eq + limit + single` 시그니처로 충분. M2+ 카드 다양화 시 자연 재방문.
- **출처**: `docs/task-record/M1-complete.md` §6c code-reviewer S2/S4
- **회수 예정**: **M2+ 카드 컴포넌트 5종 이상 도달 시점** ([6-2] Launch Readiness L.1 의 자연 신호) 또는 새 카드가 처음으로 orderBy/in/between 요구할 때
- **블록킹**: No (현 helper 충분)
- **구현 힌트**: `InitialFetchOptions` 에 `orderBy?: { field: string; direction: "asc" | "desc" }` / `inFilters?: { column: string; values: string[] }` / `between?: { column: string; min: string|number; max: string|number }` / `projection?: string[]` 추가. backward compatible (모두 optional). M2 데이터 다이어트 시점에 networking 비용 절감 효과 확인.

### [3-66] `proxy.ts` 의 dataService catch 블록 — `MissingSupabasePublicEnvError` 외 unexpected error 흔적 남기기
- **설명**: `apps/web/lib/dataService/initialFetch.ts:65~68` catch 블록이 모든 에러를 graceful 빈 결과로 삼킴 (env 누락 / SSR 환경 의도). 단 미래에 `getDataSourceClient()` 가 다른 이유 (예: M2+ Connection error / 네트워크 일시 장애) 로 throw 하면 silent breakage — 디버깅 어려움. unexpected error 시 `console.warn` 흔적 남기기.
- **사유**: code-reviewer W3 (2026-05-04, M1.6 Step 6c). 현재 `getDataSourceClient` 가 `MissingSupabasePublicEnvError` 만 throw 하므로 동작 영향 0 — but 미래 방어선.
- **출처**: `docs/task-record/M1-complete.md` §6c code-reviewer W3
- **회수 예정**: **M2+ 데이터 소스 다변화 시 (initialFetch helper 가 GraphQL/TimescaleDB 등 새 adapter 사용 시)** 또는 별도 ~5분 commit
- **블록킹**: No (현재 silent 가 의도된 graceful)
- **구현 힌트**: `import { MissingSupabasePublicEnvError } from "@/lib/supabase/browserClient";` 후 catch 블록을 `catch (err) { if (!(err instanceof MissingSupabasePublicEnvError)) console.warn("[initialFetch] unexpected:", err); return options.single ? null : []; }` 로 확장.

### [3-67] self-correction retry live E2E 부재 — mock 한계로 Anthropic invariant 위반 잠복
- **설명**: `orchestrateOnce.test.ts (g) correction` 케이스가 Anthropic SDK 를 mock 하므로 messages "모양" 만 검증하고 "Anthropic 이 받아들일지" 는 모름. M1.7 hotfix (2026-05-04) 에서 retry messages 가 `tool_use` 다음에 `tool_result` 가 아닌 텍스트를 넣어 100% 400 으로 죽던 잠복 버그가 production Vercel 배포 후 사용자 첫 시도에서 노출. 회귀 방지선: live Anthropic 호출로 retry 경로 1회 검증 케이스 추가 (`tests/e2e/m1.5-orchestrate.spec.ts` 또는 별도 `correction-live.spec.ts`).
- **사유**: 토큰 비용 (1회 ~$0.001) 정도라 비용 부담 낮음. mock 만으로는 SDK invariant (tool_use ↔ tool_result, role 교차, content array shape) 검증 불가 — 구조적 한계. 단 CI 매 push 마다 돌리면 비용 + 외부 의존, 그러므로 nightly 또는 manual trigger 가 적합.
- **출처**: `docs/task-record/M1.7-hotfix-correction-tool-result.md` §5
- **회수 예정**: M1.7 Step 6 (운영도구) 또는 M2 초입 (테스트 인프라 정리)
- **블록킹**: No (단위 테스트 강화로 같은 원인 재발은 차단됨 — 하지만 다른 invariant 잠복 가능)
- **구현 힌트**: ① 의도적으로 Zod 실패할 input 을 1차에 시드 (예: `cards` 필드를 string 으로 강제하는 dev-only flag) → retry 가 trigger 되도록 → 200 응답 + 카드 0~N 장. ② 또는 강제 fallback flag (`FORCE_INVALID_RESPONSE`) 의 retry 분기 확장. live API 키 필요 → CI 시크릿.

### [3-68] ~~`transient_error` 의 과적재 — 401/402/429/5xx/timeout 을 한 enum 으로 묶음~~ — ✅ **2026-06-02 M1.9 Step 0 으로 회수 완료**

> `classifyTransportStatus(status?)` 순수 헬퍼로 401/403→`auth_error` / 402/429→`quota_error` / 그 외→`transient_error` 3분류. `AnthropicTransportError` 에 `status?` 필드 추가(haikuClient 가 `Anthropic.APIError` 에서 추출, route 는 숫자만 소비 = SDK 결합 격리). enum 2값 추가 + messageForReason 2 case(영문) + orchestrateOnce d1~d5 경계 테스트(14 tests). **DB 마이그레이션 불필요** (fallback_reason = CHECK 없는 VARCHAR(40)). code-reviewer 0 Critical(W1/W2/W4/S1/S2 즉시 반영) + crypto-trader quota 402 문구 정직화. 잔여 튜닝(auth 톤/분리 가시성 S3, W3 529 명시) → 실사용 피드백 이월. 단일 진실: `docs/task-record/M1.9-step0-transient-error-diagnostics.md`. 운영자 알림 UI 는 `[4-28]`/M2+ 운영도구 별도 트랙.

---

## 3.5. 🟠 M1.7 (Closed Beta Ops) — 클로즈드 베타 운영 전제 조건 (2026-04-25 신설)

> **배경**: 사용자 방침 (2026-04-25) — 클로즈드 베타 배포 전, M1 완료 로그인 구조의 4가지 구멍(공개 signup + email confirm OFF + admin 부재 + rate limit 부재) 을 전부 막는 별도 미니 마일스톤. `docs/ROADMAP.md §M1.7` 본문이 단일 진실 원천. 아래 항목은 해당 Step 과 매핑된 이월 작업 상세.

> **🚨 카테고리 의미 변경 (2026-05-18, `docs/M2-plan.md` 결정)**: 본 §3.5 의 8 항목 (`[3.5-1]`~`[3.5-7]`) 은 "다음 마일스톤 = M1.7" 가정으로 작성됐으나, 사용자가 **"M1.7 건너뛰고 M2 직행"** 결정. 항목 자체는 보존 — 외부 베타 진입 시 그대로 활성화. **회수 트리거 = 외부 베타 손님 받기 결정 시점** (M1.7 Step 1~6 활성화). 단, `[3.5-7]` funding/OI 단위 변환은 misread 차단 차원에서 **선행 처리** (`docs/M2-plan.md §Step 1`). 각 항목의 "회수 예정: M1.7 Step X" 표기는 그대로 유지 (= 외부 베타 진입 시 = 동일 의미).

### [3.5-1] `/signup` 공개 → allowlist 게이팅
- **설명**: `user_allowlist(email PRIMARY KEY, invited_by, invited_at, used_at, note)` 테이블 신설 + signup 직전 Edge Function 또는 server action 으로 allowlist 조회. 미등록 이메일 → `"Not invited to the beta yet."` 영어 에러 반환. 이메일이 있으나 이미 `used_at` 세팅됨 → 일반 "Email already registered" 에러.
- **사유**: 현재 누구나 회원가입 가능 → Haiku 비용 제어 불능. "closed" beta 의 정의 자체가 성립 불가능한 상태.
- **출처**: `docs/ROADMAP.md §M1.7 Step 1` (신설)
- **회수 예정**: **M1.7 Step 1**
- **블록킹**: 🔴 **클로즈드 베타 배포 블록킹**
- **구현 힌트**: Supabase RLS 로 `user_allowlist` SELECT 는 service_role 만 허용 (anon 차단). 프론트에서 signup 호출 전 `/api/auth/check-invite` 를 거쳐 service_role 로 allowlist 조회 → 통과 시만 `supabase.auth.signUp()` 실행. admin 페이지에서 invite 추가·철회 가능.

### [3.5-2] Admin role (`app_metadata.role`) + `/admin` 페이지 (Tier 1 필수 5 + Tier 2 동시 2)
- **설명**: `auth.users.app_metadata.role = "admin"` 을 Supabase Dashboard 에서 본인 계정에만 직접 주입. service_role 만 수정 가능 → 권한 상승 공격 원천 차단. JWT claim 에 embed → middleware/RLS 가 DB 조회 없이 즉시 판정. `/admin` 라우트는 middleware matcher 에 추가해 비-admin 은 401/404.
- **Tier 1 (필수 5)**: 유저 목록 (email, 가입일, 마지막 활동, 7d 쿼리수, status) / Allowlist CRUD / 오늘의 요약 dashboard (신규가입·활동유저·Haiku 호출수·실패율·예상비용) / Kill switch (유저별 Disable 토글) / 월 Haiku 예산 progress bar (80% 시 경고 색)
- **Tier 2 (동시 착수 2)**: 유저 상세 페이지 (최근 10 쿼리 + 카드 분포 + 재시도·refusal 카운트) / Validation failure feed (최근 20건 + 원본 쿼리 + Zod 에러 — 개발자 디버그용)
- **사유**: 베타 중 "누가 들어왔는지 / 얼마나 쓰는지 / 뭘 물어보는지" 를 Supabase Dashboard + 생 SQL 로만 운영하면 매일 아침 마찰 누적. 투자역·PM·운영자·시니어 개발자 4개 관점 교집합이 Tier 1+2. 상세: 사용자 대화 세션 (2026-04-25).
- **출처**: `docs/ROADMAP.md §M1.7 Step 2~3` (신설)
- **회수 예정**: **M1.7 Step 2~3**
- **블록킹**: 🔴 **클로즈드 베타 배포 블록킹**
- **구현 힌트**: `apps/web/app/admin/` 라우트 신규. RLS 강화 — `user_allowlist` / 집계 뷰 등 admin 전용 테이블·뷰에 `(auth.jwt() ->> 'role') = 'admin'` policy. middleware 는 기존 `/api/orchestrate` 외에 `/admin/:path*` 추가 → `user.app_metadata.role !== 'admin'` 이면 `NextResponse.rewrite('/404')`. **모든 UI 문자열 영어** (`project_english_only_global`).

### [3.5-3] `/api/orchestrate` 유저별 일 rate limit
- **설명**: `route.ts` POST 핸들러 "0) Auth 두 겹 방어" 블록 바로 아래에 "0.5) Rate check" 추가. 오늘(UTC 00:00~) 해당 `user_id` 의 `log_chat` row count 가 `DAILY_HAIKU_LIMIT_PER_USER` (초기 예시 100 — **단계별 차등 운영**, 실사용 데이터로 확정) 초과 → 429 + 영어 토스트. admin role 은 `DAILY_HAIKU_LIMIT_ADMIN` (초기 예시 10000) 적용 — 사실상 무제한.
- **사유**: 베타테스터 1명이 실수 또는 악의로 Haiku 10,000 회 호출 시 일 수백 달러 청구 위험. 상한이 유일한 안전장치. **비용 직관 (초기 예시 100 call/day/user 기준)**: 단가 ~$0.0035/call × 100 = 일 $0.35, 베타 10명 × 30일 = 월 $105 상한. 실제 한도는 단계별 차등이므로 비용도 그에 따라 변동.
- **출처**: `docs/ROADMAP.md §M1.7 Step 4` (신설)
- **회수 예정**: **M1.7 Step 4**
- **블록킹**: 🔴 **클로즈드 베타 배포 블록킹**
- **구현 힌트**: `select count(*) from log_chat where user_id = $1 and created_at >= date_trunc('day', now() at time zone 'utc')` — 인덱스 `(user_id, created_at desc)` 필수. middleware 에 올리기보단 route.ts 에 두어야 edge latency 영향 최소. 429 응답 body 예: `{ error: "rate_limit_exceeded", message: "You've reached today's query limit ({daily_limit}/day). It resets at 00:00 UTC.", remaining: 0, resetAt: "..." }` — `{daily_limit}` 는 현재 단계의 실제 한도값 동적 주입.

### [3.5-4] UI 사용량 고지 — "42 / {daily_limit} queries today" 상시 표시 + 429 토스트 (English-only)
- **설명**: (a) ChatInputBar 상단 또는 UserMenu 영역에 `"{used} / {limit} queries today"` 표기. 제출 성공 시마다 증가, 매일 00:00 UTC 에 리셋. (b) 429 수신 시 토스트 `"You've reached today's query limit ({limit}/day). It resets at 00:00 UTC."`. `{limit}` 는 **현재 단계의 실제 한도값** 을 백엔드에서 동적 주입 (단계별 차등 운영, [3.5-3] 참조). **모든 문구 영어** — `project_english_only_global` 준수.
- **사유**: 제한을 UX 투명성 없이 기계적으로 차단하면 유저가 혼란 ("왜 갑자기 안 되지?"). 미리 남은 횟수 보여주는 cooldown 표기가 투명성·신뢰 확보의 표준 UX 패턴. 투자자 관점 — 유저 교육 비용 ↓.
- **출처**: 사용자 (2026-04-25) 요청 — `docs/ROADMAP.md §M1.7 Step 4`
- **회수 예정**: **M1.7 Step 4** (rate limit 과 동일 배치)
- **블록킹**: 🔴 클로즈드 베타 배포 블록킹
- **구현 힌트**: 신규 `GET /api/usage` 반환 `{ used: 42, limit: <단계별 현재 한도, 초기 예시 100>, resetAt: "2026-04-26T00:00:00Z" }`. React 쪽에서 `useSWR`/`useQuery` 로 주기 refetch (예: 30초). 제출 성공 시 optimistic increment. ChatInputBar 근처 배치 시 `fixed bottom-20 left-1/2 -translate-x-1/2` 같은 subtle 위치 권장. admin 에겐 `"Admin — unlimited"` 같은 별도 문구 표시.

### [3.5-5] Supabase `Confirm email` ON + Magic link 병행 활성화
- **설명**: Supabase Dashboard → Authentication → Settings → `Confirm email` **ON** 토글 (코드 변경 0). 기존 `SignupForm.tsx` 의 `if (!data.session)` 분기가 이미 `"Account created. Check your email to confirm before signing in."` 영어 메시지를 표시하므로 Dashboard 설정만으로 자동 동작. 추가로 `/login` 하단에 `"Forgot password? Get magic link"` 링크 추가 → `supabase.auth.signInWithOtp({ email })`.
- **사유**: 이메일 소유권 미검증 상태로 외부 유저 받으면 throwaway/봇 계정 양산. Launch §L.1 이메일 로그인 완료 기준과 직접 연결.
- **출처**: `docs/ROADMAP.md §M1.7 Step 5` (신설)
- **회수 예정**: **M1.7 Step 5**
- **블록킹**: 🔴 클로즈드 베타 배포 블록킹
- **구현 힌트**: Magic link UI 는 새 페이지 `/login/magic` (email 입력 1칸 + submit) 또는 기존 `/login` 에 토글. `signInWithOtp` 는 비밀번호 없이 동작 — 이메일 링크 클릭으로 세션 발급.

### [3.5-6] `@security-auditor` 종합 감사 — closed beta 개방면
- **설명**: M1.7 신규 표면 (`/admin` + allowlist API + JWT admin claim + rate limit + Magic link) 에 대한 전수 감사. M1.6 Step 6 의 M1 보안 감사를 M1.7 신규 범위로 연장.
- **사유**: 관리자 권한 표면은 한 번이라도 틈이 생기면 전체 보안이 무너짐. 외부 유저 개방 **전** 필수 감사.
- **출처**: `docs/ROADMAP.md §M1.7 Step 5` (신설)
- **회수 예정**: **M1.7 Step 5** 마무리
- **블록킹**: 🔴 클로즈드 베타 배포 블록킹
- **구현 힌트 — 감사 체크리스트**:
  1. 비-admin JWT 로 `/admin` fetch 시 항상 차단 (403/404 + 본문에 admin 정보 누출 없음)
  2. 비-admin 이 `user_allowlist` SELECT 시도 시 RLS 차단 (empty result + 정보 누출 없음)
  3. 유저가 `updateUser({ data: { role: "admin" } })` 시도 시 — `app_metadata` 는 수정 안 되고 `user_metadata` 에만 세팅되어 admin 승격 불가 확인
  4. rate limit 헤더 스푸핑 (X-Forwarded-For 등) 으로 우회 불가 — user_id 기반이므로 IP 독립
  5. Magic link 토큰 재사용 방지 (Supabase 기본 정책 확인)
  6. admin `Disable` 토글이 실제로 즉시 반영되는지 (JWT 캐시 TTL 고려 — 필요 시 `log_chat` 조회로 session 무효화 병행)
  7. `app_metadata.role` 이 JWT 에 실제 embed 되는지 Supabase 설정 확인 (일부 환경에서 `jwt` table 별도 sync 필요)

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

### [3.5-9] Windows 에서 commit 한 .sh 파일의 git mode 영구 100755 정책 — systemd `203/EXEC` 재발 차단

> **사고 발현 (2026-05-02 M1.7 Step 0 Substep 0.5)**:
> - Hetzner 24h 자동 모니터링 timer 가 6h 주기로 firing 됐으나 `travis-monitor.service` 가 매번 `status=203/EXEC` 로 즉사 → 24h 동안 baseline 비교 데이터 0건 누적.
> - 원인 확정: `apps/worker/scripts/monitor.sh` 의 git mode 가 `100644` → Hetzner `git pull` 후 execute 비트 없음 → systemd `execve(2)` 가 EXEC 단계에서 fail.
> - 첫 1회 (2026-04-29 18:42) 만 성공한 이유: 사용자가 `bash monitor.sh` 형태로 직접 호출 (interpreter 직접 호출은 +x 불필요). 그 후 자동 timer firing 은 항상 EXEC 단계라 절대 못 넘김.
> - 즉시 복구: `chmod +x` + `systemctl reset-failed` + `systemctl start` (1회 정상 실행 검증, 2026-05-02 00:05:28 UTC).
> - 부분 영구화: `git update-index --chmod=+x apps/worker/scripts/monitor.sh apps/worker/scripts/monitor-install.sh` 적용 (2026-05-02 commit) → 현재 worker 디렉터리 전체 .sh 의 git mode 100755 통일.

- **설명**: Windows 의 `git config core.fileMode = false` (기본값) 가 NTFS 의 항상-+x 보고를 회피하느라 mode 변경 추적을 끔. 결과: Windows 에서 `git add scripts/foo.sh` 시 mode 가 `100644` 으로 commit → Linux systemd 가 ExecStart 의 .sh 를 실행 시 `status=203/EXEC` 로 즉사. 본 항목은 **(a) `apps/worker/.gitattributes` 1줄 정책 + (b) PR 체크리스트 1줄 + (c) M1.7 Step 1+ 신규 .sh 추가 시 자동 검증 스크립트** 의 영구 대책 패키지.
- **사유**: M1.7 Step 1 (auth)~Step 6 (security audit) 에서 admin/rate-limit 운영용 .sh 다수 추가 예정 (allowlist 갱신 / log rotation / DB cleanup 등). 단발성 fix 만 반복하면 매번 Hetzner 재배포 시 동일 함정 재발 → 사용자 신뢰 누수. .gitattributes + PR 체크리스트로 1회 영구 차단이 본질.
- **출처**: `docs/task-record/M1.7-step0-hetzner-migration.md` §Substep 0.5 24h 갭 사고 (2026-05-02)
- **관련**: `[3-58]` 베타 ops 알림 자동화 (timer firing 실패 자체도 알림 대상), `[3.5-6]` @security-auditor 종합 감사 (배포 스크립트 권한 점검 포함)
- **회수 예정**: **M1.7 Step 1 시작 시점** — admin tool 운영 스크립트 신규 추가 직전, .gitattributes 1줄 + 모든 worker .sh 의 git mode 100755 일괄 점검
- **블록킹**: 🟠 현 마일스톤 완료 기준 (M1.7 베타 운영 신뢰성 직결 — 모니터링/알림/admin 운영이 모두 .sh 의존)
- **구현 힌트**:
  - (1) `apps/worker/.gitattributes` 신설 — `*.sh text eol=lf` (Windows CRLF 자동 변환 차단) + 별도 `apps/worker/scripts/*.sh` 는 `git update-index --chmod=+x` 로 commit 시점에 100755 보장 (gitattributes 만으로는 mode 강제 불가).
  - (2) PR 체크리스트 1줄 추가 (`docs/CONTRIBUTING.md` 또는 PR 템플릿) — "신규 `.sh` 추가 시 `git ls-files -s <path>` 가 100755 인지 검증".
  - (3) CI 에서 `apps/worker/scripts/*.sh` 의 git mode 가 100755 인지 grep 검증 — `git ls-files -s apps/worker/scripts/*.sh | grep -v '^100755 ' | wc -l` 가 0 이어야 통과.
  - (4) 다른 deploy 스크립트 (`apps/worker/deploy/*.sh` — bootstrap/runtime-setup 등 향후 추가) 도 동일 정책 적용.

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

## 3.8. 🟡 M1.8 (선물 데이터 카탈로그 완성) — 진행 중 (2026-05-24 신설)

> 본 마일스톤 진행 중 신규 발견 6건 + Substep 8.0 (사전 진단 + 자문) 에서 결정된 보류·연기 항목.
> 회수 대기 항목 (M1.8 진행으로 묘비 처리 예정) 은 §3 / §3.5 / §4 에 분산 — Substep 8.5 완료 시점에 일괄 청소.
> 단일 진실 원천: `docs/ROADMAP.md §M1.8` + `docs/task-record/M1.8-step0-pre-infra.md`.

### [8-1] 자동 site-vs-db consistency probe — 사이트=DB 일치 자동 검증 봇
- **설명**: M1.8 종단 게이트의 "7 metric × 9 interval = 63 셀 사이트=DB 수동 검증" 을 자동화. Playwright 또는 직접 스크래핑으로 Binance 사이트 위젯값 추출 → DB 컬럼과 ±tickSize 이내 일치 검증 봇. 정기 실행 (예: 1h 주기) + 실패 시 슬랙/디스코드 알림.
- **사유**: M1.8 시점에는 도입 ROI 낮음 (Binance 단일 거래소 + 사용자 1명 + 수동 검증 1회면 충분). M2 거래소 다변화 (OKX/Bybit/Bitget) + 외부 베타 진입 후 매번 수동 검증 비용이 누적되면 자동화 가치 ↑.
- **출처**: `docs/task-record/M1.8-step0-pre-infra.md` §7 / `@roadmap-milestone-manager` scope 3중 차단
- **회수 예정**: **M2 거래소 다변화 시점 + 외부 베타 진입 후**
- **블록킹**: No
- **구현 힌트**: Playwright MCP + canonical-metrics.md 의 사이트 URL 컬럼 활용. 거래소별 widget selector 등록 패턴.

### [8-2] ~~annualizedBasisRate PERPETUAL 정의 확정 + 카드 노출 결정~~ — ✅ **2026-05-26 M1.8 §8.2a-2 WebFetch spike 로 D16 옵션 B 확정**

> **확정 사실**: WebFetch (`/futures/data/basis?pair=BTCUSDT&contractType=PERPETUAL&period=1h&limit=2`, 2026-05-26) 결과 = `"annualizedBasisRate": ""` **빈 문자열** (Binance PERPETUAL 환경 의도적 비움). 잠정 가설 `basisRate × (365 × 24 / fundingIntervalHours)` 무의미 (Binance 가 비워두면서 의미 자체 없음 시그널).
>
> **결정**: D16 옵션 B 확정 — `normalizeUsdmBasis` 에서 `num("") → null` 자동 변환 (DB 저장 정상) + **카드 노출 X** (M1.8 §8.5 의 marketUnits.ts 헬퍼에 미포함). M2 단계에서 다른 거래소 (OKX/Bybit/Bitget) 의 동일 metric 정의 확보 시 canonical-metrics.md 에 재검토 — 그러나 본 마일스톤에선 종결.
>
> 회수 출처: `docs/task-record/M1.8-step0-pre-infra.md` §3 Q4 + `docs/task-record/M1.8-step2a-2-fetchers.md` §3 Sub-substep A2.

### [8-3] COINM dapi 매핑 (Top LSR Positions / Global LSR / Basis)
- **설명**: M1.8 §8.2 의 worker 3 fetcher 신설은 USDM (fapi) 만 다룸. COINM (dapi) 의 대응 endpoint 경로 / 응답 필드 / contractSize 결합 / contractType 파라미터 (CURRENT_QUARTER 등 포함 여부) 가 `@crypto-domain-expert` 자문 confidence Low. M1.8 USDM 완료 후 별도 마일스톤 (M1.9 또는 M2 초반) 으로 분리.
- **사유**: COINM 은 USDM 대비 (a) 단위 다름 (contract count vs base asset) (b) 무기한 + 분기물 구분 필요 (c) Binance docs URL 일부 404 발생 — 추가 spike 필요. USDM 우선 진행이 정공.
- **출처**: `docs/task-record/M1.8-step0-pre-infra.md` §3 Q1 (COINM dapi 매핑 confidence Low)
- **회수 예정**: **M1.9 Step 2 확정 (2026-06-01)** — `docs/ROADMAP.md §M1.9`. forward-fill 일반화에 COINM 포함.
- **★ 2026-06-01 갱신**: **COINM 과거 14일 대량 backfill 은 불필요로 결정** — M1.9 forward-fill 을 ~1달 가동하면 30일 누적 → 베타 진입 시 "최근 14일" 충분 커버 (시간이 backfill 대체). 단 COINM fetcher/normalize 3종(OI=contract 단위 / Taker 응답 스키마 상이 / dapi URL) **신규 코드는 여전히 필요**.
- **블록킹**: No
- **구현 힌트**: dapi endpoint path 는 `/dapi/v1/...` + `/futures/data/...` 패턴. contractSize 는 `/dapi/v1/exchangeInfo.symbols[].contractSize` 에서 확인. `BTCUSD_PERP` 같은 무기한만 다루므로 contractType=PERPETUAL 고정.

### [8-4] Binance docs 도메인 마이그레이션 — 코드 주석 citation URL 일괄 교체
- **설명**: 구 `binance-docs.github.io` URL 이 코드 주석에 남아 있을 가능성. 신 `developers.binance.com` 으로 일괄 교체 + WebFetch redirect 안내만 반환 사례 차단.
- **사유**: `@crypto-domain-expert` 자문 (2026-05-24) 의 "Q10 추가 발견 #1". 구 URL 도 redirect 작동하지만 1) WebFetch 시 redirect 메시지만 받음 2) 미래 deprecation 위험.
- **출처**: `docs/task-record/M1.8-step0-pre-infra.md` §3 Q10
- **회수 예정**: **M2 거래소 다변화 시 docs sweep 동시** — OKX/Bybit/Bitget 도입 시점에 어차피 모든 도메인 docs URL 재정비
- **블록킹**: No
- **구현 힌트**: `grep -r "binance-docs.github.io" apps/ packages/ docs/ .claude/` 후 일괄 replace.

### [8-5] Supabase MCP `list_migrations` 0 반환 — schema_migrations 추적 회복
- **설명**: 2026-05-24 진단 결과 Supabase MCP `mcp__supabase__list_migrations` 가 빈 배열 반환. `supabase/migrations/*.sql` 파일은 존재하지만 Supabase 의 `supabase_migrations.schema_migrations` 추적 테이블에 record 없음. 별개 문제로 M1.8 본 마일스톤 scope 외이지만 운영 위생 차원에서 회수 가치.
- **사유**: 원인 미진단 — Supabase Studio 가 사용하는 추적 테이블과 MCP 가 보는 위치 차이 가능성. 또는 마이그레이션 적용 시 record 안 남긴 절차 문제.
- **2026-05-28 추가 (security-auditor FG-5)**: M1.8 §8.1 schema 변경 (funding 분리 `predicted_funding_rate`/`last_settled_funding_rate` + `basis`/`basis_rate` ADD + `symbols.funding_interval_hours`) 이 `supabase/migrations/` 파일로 **기록 안 됨** (SQL editor 직접 적용 추정). 런타임 DB 컬럼은 존재 확인됨 (보안/기능 결함 0). 새 환경 복제 시 §8.1 컬럼 누락 위험 → 본 [8-5] 추적 회복 시 `YYYYMMDDHHMMSS_m1_8_step1_funding_basis.sql` 소급 기록 포함. **backend-infra-specialist** 소관 (SQL 작성·적용).
- **출처**: `docs/task-record/M1.8-step0-pre-infra.md` §2 Fact 5 + `docs/task-record/M1.8-final-gate.md §FG-5` (security-auditor 2026-05-28)
- **회수 예정**: **M2 진입 직전 docs/운영 정리 (M2-plan §Step 4)** — 또는 Hetzner 운영 점검 사이클에 묶음
- **블록킹**: No
- **구현 힌트**: Supabase Studio Migrations 탭 직접 확인 + supabase_migrations schema 직접 조회.

### [8-6] USDM `<symbol>@bookTicker` WS 도입 — 선물 호가 (bid/ask) 수집
- **설명**: 2026-05-24 진단 결과 `now_futures_ticker` 에 `bid_price` / `ask_price` / `bid_qty` / `ask_qty` 컬럼 자체가 없음 (SPOT 에는 있지만 미채움). Binance USDM 사이트의 Order Book 1번째 row 와 일치시키려면 `<symbol>@bookTicker` WS 별도 도입 필요. 사용자 사이트=DB 일치 요구 #1 의 violation.
- **사유**: 본 M1.8 의 scope 는 선물 indicator (funding/OI/LSR/Taker/Basis) 카탈로그 완성 + canonical 정의. 호가 (orderbook) 는 별도 도메인이라 본 마일스톤에 흡수 시 scope creep. M2 사용자 실사용 피드백에서 "호가 보고 싶다" 가 나오면 자연 회수.
- **출처**: `docs/task-record/M1.8-step0-pre-infra.md` §2 Fact 3
- **회수 예정**: **M2+ 사용자 실사용 피드백 후** — 또는 외부 베타 진입 직전 (호가 정보 빠지면 트레이더 신뢰 영향)
- **블록킹**: No
- **구현 힌트**: `<symbol>@bookTicker` per-symbol stream. SPOT 1408 + USDM 608 + COINM 30 = 약 2046 connection chunk 분할 필요. `BinanceKlineRelay` 의 CHUNK_SIZE=250 패턴 재사용 가능.

### [8-7] `set_updated_at_now()` 트리거 함수 `search_path` 명시 — Supabase 보안 advisor WARN
- **설명**: Supabase get_advisors 가 `function_search_path_mutable` 로 분류. `public.set_updated_at_now()` 함수의 search_path 가 명시되지 않아 잠재 RLS 우회 risk (악의적 schema 가 호출 경로에 끼어들면 권한 상승). M1.3 Step 4 (2026-04-19) 시점에 추가된 BEFORE UPDATE 트리거 함수 — 본 M1.8 §8.1 시점에 처음 발견.
- **사유**: 본 M1.8 scope 는 funding/OI 카탈로그 완성. 트리거 함수 보안 hardening 은 별도 영역. 정공 = `ALTER FUNCTION public.set_updated_at_now() SET search_path = pg_catalog, public;` 한 줄 추가 후 advisor 재실행.
- **출처**: M1.8 §8.1 직후 `mcp__supabase__get_advisors` 결과 (2026-05-25) / `docs/task-record/M1.8-step0-pre-infra.md` §2 보안 advisor
- **관련**: [Supabase docs — lint 0011](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- **회수 예정**: **M2 진입 직전 docs 정리 (M2-plan §Step 4) 또는 외부 베타 진입 직전 보안 감사** — 어느 쪽이든 일괄 처리
- **블록킹**: No
- **구현 힌트**: 단일 ALTER FUNCTION. 트리거 동작에 영향 없음 (search_path 명시만). M1.8 종단 게이트 통과 후 별도 commit 권장.

### [8-8] `rls_auto_enable()` anon/authenticated 호출 가능 — Supabase 자동 함수 노출
- **설명**: Supabase get_advisors 가 `anon_security_definer_function_executable` + `authenticated_security_definer_function_executable` 2건으로 분류. Supabase 가 자동 설치한 `public.rls_auto_enable()` event trigger 보조 함수가 `/rest/v1/rpc/rls_auto_enable` 경로로 anon + authenticated 둘 다 호출 가능. SECURITY DEFINER 라 호출 시 service_role 권한으로 실행.
- **사유**: Supabase 자동 설치 함수라 우리가 만든 게 아님. 다만 `/rest/v1/rpc/rls_auto_enable` 노출 자체가 information disclosure (함수 존재 확인) 또는 사용자 의도와 무관한 트리거 동작 risk. 정공 = `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;`. 함수 자체는 event trigger 가 자동 호출하므로 RPC 노출 차단해도 본 기능 영향 없음.
- **출처**: M1.8 §8.1 직후 `mcp__supabase__get_advisors` 결과 (2026-05-25) / `docs/task-record/M1.8-step0-pre-infra.md` §2 보안 advisor
- **관련**: [Supabase docs — lint 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) / [lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- **회수 예정**: **M2 진입 직전 docs 정리 (M2-plan §Step 4) 또는 외부 베타 진입 직전 보안 감사** — `[8-7]` 와 함께 일괄 처리
- **블록킹**: No
- **구현 힌트**: `REVOKE EXECUTE` 2건 (anon + authenticated). `[8-7]` 과 묶어서 single commit 권장. `@security-auditor` 자문 후 적용.

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

### [8-16] `tickerWsHandler.canHandle` marketType 분기 단위 테스트 신설 (code-reviewer FG-5 W2)
- **설명**: §8.4-e 로 `tickerWsHandler.canHandle` 이 marketType 분기 (spot → `!ticker@arr`, futures → `!miniTicker@arr`) 가 됐으나, 이 분기 invariant 를 직접 검증하는 단위 테스트 부재. `streamRouter.test.ts` 는 mock handler (`canHandle: streamName.includes(...)`) 만 사용 → 실제 핸들러 분기 사각지대. `tickerWsHandler.test.ts` 파일 자체 없음.
- **사유**: 이 분기가 §8.4-e 의 핵심 회귀 방어선 (spot 에 mini 오면 false 여야 함) 인데 type-check + 216 test 가 분기 로직 정확성을 보장 못 함. `feedback_mock_test_invariant_blind_spot` (mock 은 외부/핸들러 invariant 사각지대) 와 동일 결.
- **출처**: `docs/task-record/M1.8-final-gate.md §FG-5` (code-reviewer 2026-05-28 W2)
- **회수 예정**: **다음 worker 코드 commit** 또는 M1.8.5 (history fetcher 테스트와 함께 일괄)
- **블록킹**: No
- **구현 힌트**: `createTickerWsHandler({...}).canHandle` 4 케이스 — spot+`!ticker@arr`→true / spot+`!miniTicker@arr`→false / futures_usdm+`!miniTicker@arr`→true / futures_usdm+`!ticker@arr`→false. ~6줄.

### [8-17] marketUnits.ts 표시 레이어 follow-up 3건 (crypto-trader FG-5 관찰)
- **설명**: M1.8 §8.5 `marketUnits.ts` 헬퍼는 **단위 misread 우려 0** (crypto-trader FG-5 판정) 이나 경계조건 관찰 3건:
  - **Q1 (formatPct 오용 가드)**: `formatPct` (이미 percent 인 값) 와 `formatFundingRate` (raw decimal → ×100%) 의 출력이 둘 다 `%` 라 외양 동일 → 카드 개발자가 raw 컬럼에 `formatPct` 오용 시 100배 작게 무증상 표시 risk. grep gate 가 이를 잡는지 = code-reviewer 영역.
  - **Q2 (formatBasis quote 하드코딩)**: `formatBasis` 의 quote 기본값 `"USDT"` 하드코딩 → USDC-M 페어 미주입 시 오표시 (BTCUSDT 만 보면 안 잡힘). `[8-3]` COINM / M2 멀티-quote 와 연관.
  - **Q3 (LSR 모집단 라벨)**: Global LSR ≈ Top Accounts 우연 수렴 시 모집단 차이 라벨 부재로 사용자 "중복?" 멈칫 가능성.
- **사유**: 전부 제품 결정 (crypto-trader advisory only — 제품 판단은 사용자 몫). 헬퍼 결함 아님 — 경계/UX. M1.8 종단 게이트 차단 사유 아님.
- **출처**: `docs/task-record/M1.8-final-gate.md §FG-5` + `.claude/agent-memory/crypto-trader/project_m1_8_gate_review.md` (2026-05-28 Q1~Q3)
- **회수 예정**: **M2 멀티-quote/거래소 다변화** (Q2) + **사용자 제품 결정** (Q1/Q3)
- **블록킹**: No

### [8-19] normalize.ts 파일 분리 (현 539줄 → 4 파일 spot/usdmNow/coinmNow/historyFutures) — Step 3 D-Q4 이월 기술부채
- **출처**: M1.8.5 Step 3 D-Q4 결정 (2026-05-31). @backend-infra-specialist 자문 권고 — Step 3 scope 폭주 회피 위해 본 마일스톤에선 `normalize/historyFutures.ts` 만 신설 + 기존 `normalize.ts` 그대로 유지.
- **카테고리**: 🟡 다음 마일스톤 (M2 진입 직전 docs/code sweep)
- **블록킹**: No (기존 normalize.ts 정상 동작)
- **스코프**:
  - `apps/worker/src/adapters/binance/normalize.ts` 539줄 → `normalize/{spot,usdmNow,coinmNow,historyFutures}.ts` 4 파일 이전
  - `normalize/index.ts` 신설 (전체 re-export, 호출자 import path 변경 없음)
  - 이전 후 `normalize.ts` deprecated 마커 또는 삭제
- **회수 시점**: M2 Step 0 또는 외부 베타 진입 직전 docs/code sweep
- **구현 힌트**: `historyFutures.ts` 가 이미 정상 동작 = 분리 패턴 검증 완료. 나머지 3 파일 분리는 mechanical refactor (단위 테스트 0건 변경).

### [8-20] ~~별도 backfill worker 분리~~ — ✅ **2026-06-02 M1.9 Step 1 로 회수 완료**

> `packages/exchange-collectors` 추출(client 싱글톤·history fetcher·`executeHistoryBackfill` 코어·`_upsertRetry`) + `@travis/shared` 로 `TierPoller`/`IPoller`/`PollTask` 승격 + 신규 `apps/collector-history` 골격(forwardFill **stub**, 별도 IP 두 번째 서버용) + deploy 자산(`travis-collector-history.service`). 순수 구조 추출 = 기능 0, worker 77 test 회귀 0 + collector dry-boot 로 동작 불변 실증. 별도 IP = same-IP `-1003` ban 의 절대 선결. code-reviewer 0 Critical. 실 forward-fill 구현은 Step 2, 배포·롤아웃은 Step 3. 단일 진실: `docs/task-record/M1.9-step1-collector-infra.md`.

### [8-28] collector-history 유지보수 부채 3건 (M1.9 Step 1 code-reviewer W1/W2/S1)
- **설명**: 순수 추출 부산물 유지보수 항목. (W1) `withTimeout` 이 worker(`utils/withTimeout.ts`) + collector-history(`index.ts` 인라인) 2벌 — `@travis/shared` 통합 후보. (W2) `supabase.ts`/`dataService.ts` worker↔collector 2벌 복제 — 옵션 변경 시 silent drift 위험, 3벌째(거래소 추가) 생기면 추출 검토. (S1) worker `types.ts` 의 collectors 타입 re-export = 한시적 호환 레이어 — 어댑터를 점진적으로 `@travis/exchange-collectors` 직접 import 로 전환 시 제거.
- **카테고리**: 🟢 M2+ (거래소/소스 추가 시 자연 통합) — W1 은 Step 2 forward-fill 실 fetch 시작 시 통합 적기.
- **출처**: `docs/task-record/M1.9-step1-collector-infra.md §7` + code-reviewer M1.9 Step 1 (2026-06-02).
- **블록킹**: No

### [8-21] ~~historyFetchers.ts `mapNormalized` 공통 헬퍼 추출 (code-reviewer W2)~~ — ✅ **2026-05-31 Step 4 hotfix 로 회수**

> Step 4 첫 배포 hotfix (200 rate-limit envelope crash 방어) 에서 `mapPage<TRaw>(res, normalize)` 공통 헬퍼 신설 — 6 fetcher 가 `return mapPage(res, (r) => normalizeX(r, period))` 1줄로 통일 + `Array.isArray` 가드 동시 확보. `docs/task-record/M1.8.5-step4-deploy.md §8.5`.

### [8-22] backfill 대량 루프 sanity warn 로그 집계 (code-reviewer W3)
- **설명**: `warnIfRatioOutOfRange` / basis warn 이 행 단위 console.warn. Step 4 backfill(608심볼 × 9 interval × 최대 500행)에서 LSR 구조적 극단 종목 다수면 수천~수만 줄 warn 폭발 → 진짜 이상이 묻힘.
- **출처**: code-reviewer M1.8.5 Step 3 W3 (2026-05-31). `project_volume_chg_5m_ui_policy` 계열 "극단값 알리되 노이즈 억제" 정합.
- **카테고리**: 🟡 **M1.8.5 Step 4** (backfill loop 작성 시 심볼·interval 단위 warn 집계 또는 sampling)
- **블록킹**: No

### [8-23] historyFutures normalize 마이크로 강건성 3건 (code-reviewer S1~S3)
- **설명**: (S1) `interval` 컬럼 타입을 `BinanceHistoryPeriod` enum 으로 좁혀 미지원 interval 컴파일 차단 / (S2) `epochMsToIso` 상한 sanity (미래·30일 초과 timestamp warn) / (S3) `market_type: "futures_usdm"` 리터럴 6회 → 상수.
- **출처**: code-reviewer M1.8.5 Step 3 S1~S3 (2026-05-31). S3 는 M2 COINM history 확장 분기점 신호.
- **카테고리**: 🟢 M2+ (COINM history 확장 시 동시 처리 자연)
- **블록킹**: No

### [8-24] history 시계열 카드 default interval 조합 + funding history 효용 (crypto-trader Q1/Q3 advisory)
- **설명**: crypto-trader advisory (제품 결정 = 사용자 몫). (Q1) 카드 default interval 조합 관찰 — 스캘퍼=OI+Taker(5m/15m), 스윙=Top-LSR vs Global-LSR divergence(1h/4h), 포지션=OI(1d/12h), basis 효용 편중(디폴트 후순위 무방). (Q3) funding rate 시계열 효용 순위가 basis 보다 위 — `[8-5]` funding 분리 영역 우선순위 참고.
- **출처**: crypto-trader M1.8.5 Step 3 advisory Q1/Q3 (2026-05-31). Q2(14일 lookback)는 D26(Step 5 sliding window)에 흡수.
- **카테고리**: 🟢 M2+ (카드 UI 구축 시 사용자 제품 결정). funding history(Q3)는 `[8-5]` 와 연계.
- **블록킹**: No

### [8-25] backfill quota 실측 + freshness completion-marker (M1.8.5 Step 4 자문 후속)
- **설명**: 두 후속:
  - (a) `/futures/data/*` IP 카운터 **endpoint별 독립 vs 합산** 실측 (crypto-domain-expert 권고): 단일 IP 에서 `openInterestHist` 만 5분간 1100회 호출 → 429 발생 시점으로 판정. 응답 헤더 raw 덤프로 `X-MBX-USED-WEIGHT-1M` 외 IP 카운터 헤더 존재 확인. docs 미명시 영역 확정.
  - (b) **C2 completion-marker**: historyBackfillTask freshness skip 의 row-count 임계(20M)가 partial-run 오판 가능 → 배포 전략(D-Q5) 확정 시 completion-marker(예: log_behavior event 또는 worker_state)로 대체.
- **출처**: M1.8.5 Step 4 — code-reviewer C2 + backend-infra-specialist + crypto-domain-expert 자문 (2026-05-31). 자문 기록: `.claude/agent-memory/crypto-domain-expert/` + `docs/task-record/M1.8.5-step4-deploy.md §4`.
- **카테고리**: 🟡 **M1.9 Step 1~2** (M1.8.5 완료로 현 마일스톤 종료. (a) IP 카운터 endpoint별 독립/합산 실측 = 별도 worker forward-fill 폴링 설계 시 / (b) completion-marker = forward-fill 증분 task 의 freshness 정밀화 시)
- **블록킹**: No (배포는 조건부 GO — 보수적 100 req/min + 429 graceful 로 활성화 가능)
- **관련**: `[8-20]` (별도 IP/worker 분리 = 정공, M2+) / `[8-18]` (sliding window D26)

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

### [8-18] history 14일 sliding window archive 정책 (D26=C 보류, M1.8.5 Step 5)
- **설명**: `history_futures_indicator` 가 무한 성장하지 않도록 14일(또는 합의된 보존기간) 초과 row 를 자동 정리(archive/삭제)하는 정책. 선택지: (A) Supabase pg_cron + DELETE 일배치 / (B) **PostgreSQL native PARTITION BY RANGE(recorded_at) + 오래된 파티션 drop (선호)** / (C) **현재 보류 (채택)**.
- **★ 2026-06-01 공식 문서 확인**: Supabase 는 대용량 시계열에 **native range partition by date 권장** (`pg_partman` 보다 native 우수). ⚠️ **TimescaleDB 는 Postgres 17 에서 deprecated** → 의존 금지. 따라서 향후 (B) native partition 이 정공 (파티션 단위 통째 drop = sliding window 가 깔끔). `supabase.com/docs/guides/database/partitions`.
- **D26 채택 (C) 근거** (2026-06-01, M1.8.5 Step 5): 운영 1주 데이터 없이 archive 주기·방식 결정 금지 (CLAUDE.md deferred-decision 원칙). 현재 용량 1.5GB (Supabase Pro 8GB 의 19%) → 즉시 위험 0. forward-fill(`[8-26]`)로 history 가 계속 자라기 시작하는 시점부터 의미 有.
- **출처**: M1.8.5 Step 5 D26 결정 (`docs/task-record/M1.8.5-step5-backfill-run.md §4`) + ROADMAP §M1.8.5 G4.
- **카테고리**: 🟡 다음 마일스톤 (M1.9 이후) — `[8-26]` forward-fill (M1.9) 가동 + 수십 GB 도달 후 재결정 (현재 1.5GB = Pro 8GB 의 19%, 즉시 위험 0).
- **블록킹**: No
- **관련**: `[8-26]` (forward-fill — sliding window 의 전제: 새것이 계속 쌓여야 청소가 의미) / `[3-18]` (log_chat 용량 모니터링, 동일 archive 결).

### [8-27] 확장성 감사 — registry/worker 구조적 빚 6건 (2026-06-01 `@backend-infra-specialist` + `@zod-schema-architect`)
- **설명**: M1.9 진입 전 사용자 질문("다양한 거래소 + 다양한 데이터 소스 추가 시 확장 용이한가?")에 대한 2-자문 감사 결과. 빚 6건 식별. **M1.9 무관** (단일 거래소 forward-fill 에선 6건 모두 발현 X) — 각 빚은 해당 기능 추가 Step 에서 회수. 지금은 "가시화 기록"만 (미리 추상화 = YAGNI 위반).

| # | 빚 | 위치 (file:line) | 회수 시점 |
|---|----|------|-----------|
| 1 | datasource id = Supabase 테이블명 강결합 → 외부 API 소스(뉴스/매크로) 수용 불가. `fetchKind`/`tableName` 분리 필요 (`[3-7]` enum 승격과는 별개 문제) | `apps/web/.../CoinListCard.tsx:90` + `defaults.ts:18-27` | 비-거래소 데이터 소스 추가 Step |
| 2 | `COMMON_QUERYABLE_FIELDS` 자동 머지 opt-out 불가 → 뉴스에 exchange/market_type/symbol 거짓 필터 노출 | `datasourceRegistry.ts:124-168` | 비-거래소 소스 추가 Step |
| 3 | 비정형 텍스트 페이로드(뉴스 본문/썸네일/링크) 선언 자리 없음 | `datasourceRegistry.ts:42-60` + `componentRegistry.ts:42` | 뉴스 카드 추가 Step |
| 4 | `CardDataBindingSchema` `.strict()` 가 거래소 용어로 잠금 → 뉴스 category / 매크로 series_id 자리 없음 | `aiCardConfig.ts:56-96` | 비-거래소 카드 추가 Step |
| 5 | `promptInjection` 무조건 전량 평탄 직렬화 (계층화 0) → 거래소 N개면 토큰·선택정확도 동시 저하 | `promptInjection.ts:96-145` | **거래소 2개째 진입 직전 (선행 리팩터링) → 🟡 승격** |
| 6 | `exchange` enum 2~3곳 하드코딩(registry-파생 X) → 거래소 추가가 "등록만으로" 안 됨 (수동 동기화). 근본 해결: `getAllExchanges().map(e=>e.id)` 파생 | `datasourceRegistry.ts:129-131` + `exchangeRegistry.ts:14` | **거래소 2개째 진입 직전 (선행 리팩터링) → 🟡 승격** |

- **사유**: 미리 추상화 시 안 쓸 추상화 양산 (`feedback_registry_flexibility` = 유연성은 registry 풍부함이지 사전 추상 레이어 아님). 빚 #5/#6 은 거래소 2개째에 동시 발현 → 거래소 다변화 Step 의 선행 리팩터링으로 묶음. 빚 #1~#4 는 해당 비-거래소 소스 추가 Step 의 본 작업.
- **worker 측 (backend 자문)**: 별도 collector 인프라는 `packages/exchange-collectors` 추출 + `apps/collector-history` 범용 골격(`[8-20]` 스코프). `client.ts:58-59` rate-limit 싱글톤이 Binance 전역 → 다거래소 일반화는 M2.
- **출처**: 2026-06-01 확장성 2-자문. `future.md §1`(온디맨드 소스)/`§2`(Composable 컴포넌트) 트랙과 매핑. exchange registry 자체는 "어댑터+등록만으로 OK" = 최고 설계 (빚 아님).
- **카테고리**: 🟢 M2+ 확장 루프 (빚 #5/#6 은 거래소 추가 시 🟡 승격)
- **블록킹**: No

### [8-29] crypto-domain-expert memory `project_m1_9_step2c_coinm_history.md` 오독 정정 (COINM topLongShortAccountRatio 키)
- **설명**: M1.9 Step 2-C 자문에서 crypto-domain-expert 가 "COINM `topLongShortAccountRatio` 만 request 키가 `symbol`(나머지 5개 pair)" 라고 공식문서 기반 판정했으나, **라이브 dapi 실측(2026-06-04) 결과 `symbol` 전송 시 `-1130 parameter 'pair' is invalid`** → 6개 metric 전부 `pair` 가 정답. 코드는 라이브 기준으로 교정 완료(`fetchCoinmTopLongShortAccountHistory`)했으나, **해당 agent memory 파일은 여전히 오독 내용 보유** → 차기 거래소/COINM 작업 시 같은 오류 재발 위험.
- **사유**: 코드는 이미 정확. memory 정정은 차기 작업 전이면 충분(현재 블록킹 0). agent 가 자기 memory 를 수정하거나, genagent/직접 Edit.
- **출처**: `docs/task-record/M1.9-step2-forward-fill.md §2-C` (라이브 실측 버그 2건).
- **카테고리**: 🟡 다음 마일스톤 (거래소 #2 또는 COINM 후속 작업 직전)
- **블록킹**: No
- **구현 힌트**: `.claude/agent-memory/crypto-domain-expert/project_m1_9_step2c_coinm_history.md` 의 "account=symbol 키" 단락에 "라이브 반증: 6개 전부 pair" 정정 추가. 더불어 "외부 API 키/필드는 공식문서 + 라이브 1콜 교차검증" 패턴을 memory 에 일반 교훈으로.

### [8-30] M1.9 Step 2-C code-reviewer 잔여 (W2 taker ratio sanity + W4 fetcher 쿼리 단위테스트 + S2 중복)
- **설명**: Step 2-C code-reviewer(0 Critical) 잔여 권고 3건:
  - **W2**: COINM taker ratio 는 직접 계산(takerBuyVol/takerSellVol)이라 입력 이상이 ratio 로 전파될 여지가 USDM(서버 제공)보다 큼. taker ratio sanity guard(극단값 warn) 추가 고려. 단 지금 추가 시 USDM 과 비대칭 → 별도 Step(USDM+COINM 동시).
  - **W4**: fetcher 레벨 쿼리 조립 단위테스트 0건 (USDM·COINM 둘 다). COINM `pair` 키·contractType 등 쿼리 정확성은 현재 라이브 실측으로만 검증됨. binanceFetch mock 한 fetcher 테스트 추가 시 회귀 그물 강화. (단, 라이브 실측이 더 강한 검증이라 우선순위 낮음.)
  - **S2**: `mapPage`/`notNull` 가 USDM(`historyFetchers.ts`)·COINM(`coinmHistoryFetchers.ts`)에 글자까지 복제. `_fetcherHelpers.ts` 추출 시 거래소 #2(OKX) 추가 시 삼중 복제 방지.
- **사유**: 전부 유지보수·테스트 강화 (정확성 결함 아님 — 라이브로 검증됨). M1.9 종단 게이트 차단 사유 아님.
- **출처**: `docs/task-record/M1.9-step2-forward-fill.md §2-C` code-reviewer W2/W4/S2.
- **카테고리**: 📋 상시 부채 (테스트/리팩터)
- **블록킹**: No

### [8-31] forward-fill 동시 task IP 요청 예산 — shared /futures/data 요청 limiter (code-reviewer W2 심화)
- **설명**: forward-fill 은 market×interval그룹 = USDM 3 task(+COINM 3) 가 TierPoller 로 독립 스케줄 → 부팅 catch-up 시 동시 발화. `client.ts` 는 `/futures/data`(weight 0)에 **전역 proactive spacing 없음**(weight throttle 미적용 + 반응적 -1003 backoff 만). 각 task 의 reqPerMin throttle 은 독립이라 합산됨.
- **★ 라이브 실측 (Step 3, 2026-06-04) — 예산 분배만으론 불충분 확정**: 별도 IP(49.13.138.121)인데도 `/futures/data/basis`에 -1003 ban. 4중 원인: ① 예산 산수가 **5분 sliding window(1000/5min)** 미반영(분당 평균 아님) ② **basis만 별도 카운터** — 2023-10-19 change-log "1000/5min" 조정 목록에서 빠져 fapi weight 풀(2400/min)에 걸림(crypto-domain 확정) ③ 첫 catch-up(4일) 페이지 폭발 ④ 재시도(maxRetries=3) 증폭. + **이슈3 shutdown SIGKILL**(같은 뿌리 = task별 독립 단위 ↔ 프로세스 전역 제약 비협조).
- **즉효 fix 적용 (Step 3, code-reviewer 0 Critical)**: ① task **staggered start**(`PollTask.initialDelayMs`, taskIndex×30s) ② **basis 2400ms floor**(25/min, `MetricFetcher.minReqIntervalMs`) ③ `TimeoutStopSec=180`+`KillSignal=SIGTERM`. **피크 완화일 뿐 근본 아님.**
- **proper fix (deferred, 다음 세션 근본)**: ⓐ 프로세스 전역 `/futures/data` 요청 token-bucket(요청 카운트, weight 아님 — `[8-10]`와 별개) ⓑ `executeHistoryBackfill` **AbortSignal 협조적 취소**(cycle 즉시 중단 → `TimeoutStopSec` 의존 제거, 도입 후 180→축소) ~~ⓒ per-metric lastCallAt~~ ✅ **회수 (2026-06-05)** ⓓ circuit breaker / maxRetries 하향.
- **✅ ⓒ 회수 (2026-06-05, Step 1)**: `PerMetricThrottle` 클래스 신설 (`packages/exchange-collectors/src/core/perMetricThrottle.ts`) — 공통 floor(60000/reqPerMin)는 전역 1개 유지 + metric 자체 floor(basis 2400ms)는 `Map<metricName, lastCallAt>` 로 그 metric 자신의 직전 호출에만 적용. **★ 실측 정직성**: lag 개선은 ~14%(basis cycle 팽창 제거분)뿐. lag 주범은 "심볼수×metric÷reqPerMin = cycle 하한"이라는 폴링 구조 자체 → **사용자가 lag 1~3h 를 history 누적 목적상 허용 결정**(실시간 5m 은 now_* 카드 담당). ⓒ는 "산식 정확화 + 구조 정리". W1(basis floor cycle 팽창)/S1(부분) 동반 해소. worker 110 test 회귀 0 · code-reviewer 0 Critical.
- **★ crypto-domain 자문 (COINM 롤아웃 합산 산수, 2026-06-05)**: COINM PERPETUAL = **17 심볼**(USDM 450 의 3.8%, dapi exchangeInfo 라이브 확인, 금속/지수 0). 권고 shared bucket = **통계 5종 합산 150/min**(1000/5min 의 75%) + **basis 합산 30/min**(2400/min fapi weight 풀). dapi·fapi 는 같은 IP 카운터 공유 가정(공식 분리 미보장). → COINM 켜도 ban 0. 단 ⓐ 도입 시 basis 클로저 USDM·COINM 공유 필요(S1).
- **잔여 (다음 Step)**: ⓐ token-bucket(COINM 롤아웃 전 필수) → ⓓ circuit breaker → ⓑ AbortSignal(+`TimeoutStopSec` 축소). 부수 W3(코어 `coinmSymbolToPair` 직접 import) / S1(`nowMs` 그룹 1회 — ⓒ 에서 부분 해소) / Step3-W4(STAGGER group-relative).
- **출처**: `docs/task-record/M1.9-step2-forward-fill.md §2-E` + `docs/task-record/M1.9-step3-rollout.md`(라이브 실측 + 즉효 fix + ⓒ/[8-33] 회수).
- **카테고리**: 🟠 현 마일스톤 완료 기준 (**잔여 근본 fix ⓐ는 COINM 롤아웃 전 필수** — USDM만으로도 ban 발생 → 6 task 합산 crypto-domain 확인 완료, 17심볼 안전) / ⓓ circuit breaker 는 📋. ⓒ ✅ 회수.
- **블록킹**: No (즉효 fix + ⓒ + 반응 backoff 로 USDM 가동 가능, production 무관. 단 COINM 롤아웃은 ⓐ 후 권장)
- **관련**: `[8-10]`(weight dispatcher) / `feedback_binance_futures_data_ip_quota`

### [8-32] COINM 분기물(dated) history + forward-fill 활용 시나리오 (crypto-trader advisory 2026-06-04)
- **설명**: M1.9 forward-fill scope=COINM PERPETUAL 만 (분기물 BNBUSD_260626 제외). crypto-trader advisory:
  - **분기물 basis 비대칭**: 무기한 baseis ≈ 펀딩(정보량 적음), cash-and-carry/캐리 트레이딩의 본질은 **분기물 basis**. COINM 분기물 history 제외 시 이 신호 누락. 사용자가 COINM 분기물을 실제 거래하는지가 결정 핵심 (제품 판단 = 사용자 권한).
  - **활용 시나리오 high-value** (M2 카드 입력 우선순위): ① OI 추세 + 가격 다이버전스, ② LSR 극단값 역추세. 이 둘이 압도적.
  - 순차 롤아웃 시 COINM 빈 기간 "준비 중 vs 고장" 침묵 오해 관찰 포인트.
- **사유**: 전부 advisory (제품 판단 사용자 몫). M1.9 차단 사유 아님. M2 카드 scope 확정 시 `@roadmap-milestone-manager` 로.
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_9_forwardfill_review.md` + `docs/task-record/M1.9-step2-forward-fill.md §2-E`.
- **카테고리**: 🟢 M2+ 확장 루프 (실사용 피드백 트랙)
- **블록킹**: No

### [8-33] 금속 선물(XAU/XAG/XPT/XPD...) basis `-4104` Invalid contract type — fetch 대상 제외 ✅ **회수 (2026-06-05, [8-31]ⓒ 동반)**
- **설명**: forward-fill 라이브 가동(2026-06-04) 로그에서 `XAUUSDT`/`XAGUSDT`/`XPTUSDT`/`XPDUSDT`(금/은/백금/팔라듐 선물)의 basis fetch 가 `Binance 400: {"code":-4104,"msg":"Invalid contract type."}` 반복. 이 심볼들은 USDM 선물이지만 `/futures/data/basis` (PERPETUAL contractType) 를 지원 안 함.
- **✅ 해소 (2026-06-05)**: **-4104 응답 학습 캐시(reactive)** 채택 (`packages/exchange-collectors/src/core/unsupportedMetricCache.ts` 신규). 한 번 -4104 난 (marketType, symbol, metric) 을 in-memory Set 에 학습 → 이후 cycle skip.
  - **★ 라이브 교차검증으로 자문 가정 정정** (`external_api_live_smoke` 규율): crypto-domain-expert 권고는 "`underlyingType !== COIN` 사전 제외" 였으나, fapi 라이브 실측(2026-06-05) 결과 (a) 진짜 -4104 기준은 `contractType=TRADIFI_PERPETUAL`(77종 중 **75종**: 금속=COMMODITY/주식=EQUITY·KR_EQUITY/프리마켓=PREMARKET) 이고 (b) INDEX 2종(BTCDOMUSDT·ALLUSDT)은 contractType=PERPETUAL 이라 basis **정상 지원** → underlyingType 제외 시 INDEX 2종 false positive, (c) `symbols` 테이블에 underlyingType 컬럼 부재 → DB 변경 필요(scope 밖). 따라서 reactive 캐시(대안 b)가 정공.
  - **안전 경계**: `isUnsupportedContractTypeError` 가 `-4104` 만 학습 (`-1003` rate limit 은 절대 학습 금지 — 정상 심볼 영구 skip 치명 버그 방지). 두 에러 경로(400 status + 2xx envelope) 모두 substring 매칭.
  - **검증**: worker 110 test(+5) 회귀 0 · type-check 6패키지 · code-reviewer 0 Critical(W1 주석 반영).
- **출처**: `docs/task-record/M1.9-step3-rollout.md` (라이브 실측 이슈 + ⓒ/[8-33] 회수 §).
- **카테고리**: ✅ 회수 완료 (묘비)
- **블록킹**: No

### [8-11] Partial update 시 NOT NULL 컬럼 함정 — per-row UPDATE 패턴 의무화 (CLAUDE.md §위생 #10 후보)
- **설명**: M1.8 §8.2a-2 fundingInfoTask DB sync 2 hotfix 거쳐 발견된 함정 패턴 영구 기록.
- **함정 메커니즘**:
  - Supabase JS `.upsert(rows, { defaultToNull: false })` 가 PostgREST 에 `INSERT ... ON CONFLICT ... DO UPDATE SET ...` 으로 변환
  - INSERT 절의 VALUES 에 NOT NULL 컬럼 누락 → PostgreSQL 이 NULL 인식 → NOT NULL 위반
  - ON CONFLICT 의 UPDATE 절이 발동하기 **전에** INSERT 절에서 fail
  - 즉 `defaultToNull: false` 는 UPDATE 측면만 안전, INSERT 측면 NOT NULL 위반은 못 막음
- **패턴 분류**:
  - ✅ **안전 (기존 `upsertNowFuturesTickerPartial` 등)**: 테이블의 모든 data 컬럼이 nullable → INSERT 절에 NOT NULL 컬럼 없음
  - ❌ **함정 (M1.8 §8.2a-2 fundingInfoTask)**: 테이블에 NOT NULL 컬럼 있음 + partial input row 가 NOT NULL 컬럼 누락
- **정공 (M1.8 §8.2a-2 hotfix² 적용)**: NOT NULL 컬럼 있는 테이블의 partial update 는 `.update().eq()` per-row 패턴 의무화. INSERT 절 자체를 거치지 않음. PK 일치 row 없으면 graceful 0 rows affected.
- **사유**: 본 마일스톤에서 2 hotfix 거쳐 회복. 미래 같은 영역 (예: `user_settings` 같은 user_* 테이블의 partial update / 새 운영 메타 테이블) 도입 시 동일 함정 회피 영구 가이드 필요.
- **출처**: `docs/task-record/M1.8-step2a-2-fetchers.md` §5 Sub-substep G3/G4 + commit `0568ff7` + `7e682b0`
- **관련**: `[8-10]` full rate-limit dispatcher (같은 운영 부채 영역)
- **회수 예정**: **CLAUDE.md §데이터 위생 #10 신설** (사용자 직접 Edit, self-modification 보호 우회) 또는 `packages/data-service/IDataService.ts` 내 doc-comment 영구 명문화. M2 진입 직전 또는 외부 베타 직전 docs sweep 시 등록.
- **블록킹**: No
- **구현 힌트**:
  - 새 partial update 메서드 추가 시 코드 review checklist 에 "테이블에 NOT NULL 컬럼 있나? 있으면 per-row UPDATE 사용" 항목 추가
  - 대안 (효율 ↑): SQL function (RPC) `update_xxx_bulk(rows JSONB)` — UPDATE ... FROM (VALUES ...) AS subq(...) 패턴. M2+ 또는 외부 베타 직전 도입 가치.

### [8-10] Full rate-limit dispatcher (queue + priority + 별도 task budget) — Binance IP weight
- **설명**: M1.8 §8.2a-2 D17 (자문 권고) 의 full dispatcher 구현. 현재 `binance/client.ts` 의 단순화 (module state + 80% warn + 90% sticky throttle 2배 60초) 가 본 마일스톤 scope. Full dispatcher 의 추가 기능:
  - **Queue + priority**: perSymbolTask vs fundingInfoTask vs premiumIndexTask 호출이 같은 IP bucket 공유 시 우선순위 (OI/Funding 높음, Basis 낮음 등) 자동 sort
  - **Per-task budget**: 각 task 의 weight 사용량 추적 + 한 task 가 quota 80% 점유 시 다른 task 의 호출 지연
  - **Adaptive throttle**: 80%/90% 단순 threshold 가 아닌 trend 기반 (e.g. 슬라이딩 5분 평균이 70% 도달 시 미리 throttle)
  - **Cycle skip**: 90% 초과 시 다음 cycle 통째 skip + 모니터링 알림
- **사유**: M1.8 §8.2a-2 의 단순화 (module state + sticky throttle) 가 (a) 80% 도달 시 가시성 ✅ (b) 90% 도달 시 자동 backoff ✅ (c) 24h 누적 실측 가능 ✅ 세 가지 핵심 가치 모두 확보. queue/priority/per-task budget 은 perSymbolTask 6 fetcher cycle 시간 12분 너무 길거나 IP weight 100% 초과 사고 시 도입 가치.
- **출처**: `docs/task-record/M1.8-step0-pre-infra.md` §3 Q3 (자문 D17) / `docs/task-record/M1.8-step2a-2-fetchers.md` §5 Sub-substep D
- **관련**: `[8-9]` Hetzner deploy 자동화 (운영 부채 같은 영역) / `[8-3]` COINM dapi 매핑 (rate budget 영향 같은 영역)
- **회수 예정**: **M2+ 트리거 3가지 중 먼저 도달**: (a) perSymbolTask cycle 시간 15분 초과 (b) IP weight 100% 초과 사고 1회 (c) 외부 베타 진입 직전 안정성 감사
- **블록킹**: No
- **구현 힌트**: `binance/client.ts` 의 `binanceFetch` 를 `Dispatcher` 클래스로 wrap. queue + priority + 5분 슬라이딩 윈도우. `getRateLimitState()` 이미 export 됨 — 외부 모니터링/대시보드 통합 시점에 같은 함수 활용.

### [8-9] Hetzner deploy 자동화 — chown 영구 정리 + sudo NOPASSWD 선택 + deploy script
- **설명**: M1.8 §8.2a-1 deploy (2026-05-26) 시점에 3가지 운영 부채 직접 노출:
  - (a) `/opt/travis/.../node_modules` 일부 디렉토리 root 소유 — M1.7 Step 0 setup 시 sudo 로 한번이라도 pnpm install 실행해 발생. `chown -R travis:travis` 로 영구 정리 후 향후 install 모두 travis 권한.
  - (b) sudo NOPASSWD 미설정 → SSH non-interactive 자동화 불가. password 분실 사고 (M1.7 Step 0 후 23일 만에 password 망각) 도 발생. `/etc/sudoers.d/travis-systemctl` 같은 부분 NOPASSWD 설정 옵션 (전체 NOPASSWD 보다 보안 ↑) — `systemctl restart travis-worker` / `systemctl status travis-worker` / `journalctl -u travis-worker` 만 NOPASSWD.
  - (c) `apps/worker/scripts/deploy.sh` 신설 — git pull + CI=true pnpm install + pnpm -r build + systemctl restart + journalctl 한 줄 wrapper. 사용자 입장에서 매번 명령 chain 복붙 부담 ↓.
- **사유**: 본 M1.8 §8.2a-1 deploy 가 5번의 시도 끝에 성공 (password 분실 + node_modules 권한 + PowerShell line-wrap typo `travis-worke` + systemctl Unit not found + less pager 함정 등). 외부 베타 진입 시점 또는 더 자주 deploy 하는 시점에 운영 비용 누적. M2 사용자 실사용 피드백 직전 정리 가치 있음.
- **출처**: `docs/task-record/M1.8-step1-hotfix-rename-funding.md` deploy 실측 (2026-05-26)
- **관련**: `[8-5]` Supabase MCP migrations 추적 (운영 위생 같은 영역)
- **회수 예정**: **M2 진입 직전 (M2-plan §Step 4 docs 정리 시) 또는 외부 베타 진입 직전 보안 감사**
- **블록킹**: No
- **구현 힌트**: (a) `sudo chown -R travis:travis /opt/travis/{node_modules,packages/*/node_modules,apps/*/node_modules}` 한 번 실행. (b) `sudo visudo -f /etc/sudoers.d/travis-systemctl` → `travis ALL=(root) NOPASSWD: /bin/systemctl restart travis-worker, /bin/systemctl status travis-worker, /bin/journalctl -u travis-worker *`. (c) `apps/worker/scripts/deploy.sh` 신설 — `set -euo pipefail` + 단계별 echo + retry 로직.

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

## 4. 🟢 M2+ 확장 루프 (YAGNI — 실측 후 도입)

### [4-1] Prompt caching (Anthropic `cache_control: ephemeral`)
- **설명**: system prompt + `tools[0].input_schema` 를 5분 TTL 캐싱 breakpoint 로 묶어 입력 토큰 비용 90%+ 절감.
- **사유**: Step 2a.5 실측에서 tool_use 는 input 6,957 tokens / call (text-only 3,177 의 2.2배). `$0.0033/call → $0.00033/call` 예상. 단, 현재 개발자 1명 호출량이 적어 당장 ROI 낮음.
- **출처**: `docs/task-record/M1.5-step2-orchestrate-route.md` §3-A, §2a.5
- **회수 예정**: **M2 초반** (호출량 증가 or 사용자 확보 시)
- **블록킹**: No
- **구현 힌트**: `apps/web/lib/ai/haikuClient.ts` 의 `messages.create()` 에서 system param 을 message content block 으로 변환 후 `cache_control: { type: "ephemeral" }` 첨부. Anthropic SDK 지원 여부 확인 필요 (2026-04 기준 지원 중).

### [4-2] Sonnet alias → date-pinned snapshot 교체
- **설명**: 현재 `ESCALATE_TO_SONNET_FLAG = false` 상수만 존재. M2 에서 실제 Sonnet 호출을 켜기 전 `"claude-sonnet-4-6"` alias 를 `"claude-sonnet-4-6-YYYYMMDD"` snapshot 으로 고정.
- **사유**: alias 는 Anthropic 이 최신 모델로 점진 이전하면서 출력 일관성이 미묘하게 바뀔 수 있음. 프로덕션은 snapshot pin 이 원칙.
- **출처**: `docs/task-record/M1.5-step1-haiku-client.md` §6 code-reviewer 이월
- **회수 예정**: **M2 진입 시 Sonnet 실제 호출 직전**
- **블록킹**: No
- **구현 힌트**: `apps/web/lib/ai/haikuClient.ts` L37 의 `SONNET_MODEL_ID` 상수 변경. Anthropic 공식 문서에서 최신 Sonnet 4.6 snapshot id 확인.

### [4-3] Example JSON drift 방지 (시스템 프롬프트 동적화)
- **설명**: `buildSystemPrompt.ts` 의 example 에 하드코딩된 id (`"ticker_spot"`, `"ticker-card"`) 를 `promptInjection()` 과 동기화하도록 변경.
- **사유**: registry 가 변해도 example 이 구버전 id 를 참조하면 AI 가 그 id 를 답에 사용 → Zod 검증 실패. 수동 관리 드리프트 리스크.
- **출처**: `docs/task-record/M1.5-step1-haiku-client.md` §6 code-reviewer Minor 3
- **회수 예정**: **M1.6 프롬프트 고도화 단계 or M2 초반**
- **블록킹**: No
- **구현 힌트**: `buildSystemPrompt()` 에서 example section 을 생성할 때 `registry.getAll()[0]?.id` 같은 동적 참조 사용.

### [4-4] 부분 성공 허용 (partial card upsert)
- **설명**: AI 가 10장 카드를 반환했는데 1장만 Zod invalid 일 때, 유효한 9장은 즉시 렌더 + invalid 1장만 재요청.
- **사유**: Haiku 4.5 JSON 준수력이 높아 실측 전 선제 구현은 over-engineering. 실사용 데이터에서 "invalid rate ≥5%" 확인되면 도입.
- **출처**: `docs/task-record/M1.5-step2-orchestrate-route.md` §3-A
- **회수 예정**: **M1.5 완료 후 실사용 로그 관찰 → 임계 초과 시 M2**
- **블록킹**: No
- **구현 힌트**: 현재 전체 재시도 루프 내부에 분기만 추가. `OrchestrateResponseSchema` 구조 변경 불필요 (runtime 분기).

### [4-5] `history_*_kline` 테이블에 5m/1h/1d 저장
- **설명**: Step 5 WS 에서 `!kline_1m@arr` 외에 `!kline_5m@arr`, `!kline_1h@arr`, `!kline_1d@arr` 스트림 추가 수신 후 DB 저장.
- **사유**: E1 scope 결정으로 현재는 1m kline 을 메모리 window 로만 사용 (volume_chg_5m 계산용). 5m/1h/1d 는 M1.4 에서 TradingView 임베드로 커버되므로 당장 불필요.
- **출처**: `docs/task-record/M1.3-step5-ws-relay.md` §E1 scope, `docs/task-record/M1.3-step4-polling-precompute.md` §사용자 결정 8
- **회수 예정**: **M2 실제 kline 쿼리 기반 카드 등장 시** (예: 자체 차트 컴포넌트, 전략 백테스트 카드)
- **블록킹**: No
- **구현 힌트**: 봉 완성(`k.x=true`) 시에만 저장 vs 미완성 봉도 upsert 정책 결정 필요.

### [4-6] 스캘퍼 1초 단위 mark_price 카드 + 1m 미완성봉 표시
- **설명**: 현재 WS 로 1초 markPrice 수신 중이나 M1.4 카드는 TickerCard Realtime(1~3초) + TradingView 임베드 조합이라 스캘퍼용 1초 반응 UI 없음.
- **사유**: crypto-trader 자문에서 스캘퍼 Persona 는 1분 단위 의사결정 부족 지적. M1.4 완료 후 실 사용 체감 판단.
- **출처**: `docs/task-record/M1.3-step4-polling-precompute.md` §crypto-trader Q1, `docs/task-record/M1.3-step3-binance-adapter.md` §Q3
- **회수 예정**: **M2 스캘퍼 카드 도입 시**
- **블록킹**: No
- **구현 힌트**: `apps/worker/src/compute/markPriceWindow.ts` (신규) 로 1s 메모리 저장 + 신규 `ScalperTickerCard` 에서 subscribe.

### [4-7] `volume_chg_5m` 해석 A→B 극단값 clip 정책 확정
- **설명**: 현재 해석 A fallback 에서 `|volumeChg| > 50` 시 null clip. 실제 거래량 폭발 vs 계산 오류 구분 로직 없음.
- **사유**: YAGNI — 실 1m kline 수집 충분히 축적 후 "얼마나 자주 ±50% 이상 변하는가" 통계 기반 임계치 재조정 필요.
- **출처**: `docs/task-record/M1.4-step4.7-data-hygiene.md` §6 알려진 잔여 이슈
- **회수 예정**: **M2 데이터 분석 단계**
- **블록킹**: No

### [4-8] 중국어 밈 심볼 입력 UX
- **설명**: Binance 정상 상장 중인 중국어 meme 코인(예: `币安人生USDT`, `我踏马来了USDT`) 검색/자동완성 지원.
- **사유**: UI 렌더는 무관하지만 ChatInputBar 검색 필드에서 CJK 입력 고려 필요. 확장 루프 검색 기능 고도화 시.
- **출처**: `docs/task-record/M1.4-step4.7-data-hygiene.md` §6
- **회수 예정**: **M2 검색 기능 고도화**
- **블록킹**: No

### [4-9] Worker 시간대별 부하 동적 tier 조정
- **설명**: 현재 모든 심볼 동일 주기(ticker 3s, perSymbol ~341s). 실사용 로그로 "알트 3~4선은 느려도 OK" 패턴 확인 시 동적 가중치.
- **사유**: 사용자 철학 "모든 코인 공평" 유지. 실 트레이더 로그 분석 후 도입.
- **출처**: `docs/task-record/M1.3-step4-polling-precompute.md` §crypto-trader Q5
- **회수 예정**: **M2 사용자 행동 분석**
- **블록킹**: No

### [4-10] `IExchangeAdapter` 인터페이스 재설계
- **설명**: 현재 `tickerTask` 가 Binance 하드코딩. OKX 추가 시 loop 구조로 추상화 재검토.
- **사유**: YAGNI — 단일 거래소 상태에서 선제 추상화하면 잘못된 추상이 되기 쉬움. M2 OKX 추가 실 API 응답 패턴 보고 재설계.
- **출처**: `docs/task-record/M1.3-step4-polling-precompute.md` §주요 의사결정 #6 (옵션 B 보류)
- **회수 예정**: **M2 OKX 추가 시**
- **블록킹**: No

### [4-11] Zod 3.x → 4.x 마이그레이션 검토
- **설명**: 현재 Zod 3.24 사용. 4.x 는 2025년 후반 출시됐으나 생태계 호환성 불안정.
- **사유**: 안정판 유지 원칙.
- **출처**: `docs/task-record/M1.2-step1-zod-tsconfig.md` §설계 결정 #1
- **회수 예정**: **M2+ Zod 생태계 호환성 안정화 후**
- **블록킹**: No

### [4-12] `updateMode: "reactive"` 도입
- **설명**: 현재 `value` / `content` 2종만 지원. `reactive` 는 M2+ 예약.
- **사유**: M1 에서는 `value` (단일 값 갱신) + `content` (목록 필터링) 2종이면 3종 카드 커버 충분.
- **출처**: `docs/task-record/M1.2-step2-registry-interfaces.md` §스코프 경계
- **회수 예정**: **M2+ (예: 체결 내역 스트리밍 등 이벤트 기반 카드 도입 시)**
- **블록킹**: No

### [4-13] 인터랙션 `drill_down` / `linked_selection` / `hover_preview` 구현
- **설명**: `InteractionType` enum 에 선언만 되어 있고 실제 구현은 M1 에서 `spawn` 만.
- **사유**: M1 단계는 "spawn 으로 카드 생성" 최소 경로만 증명. UI 복잡성은 확장 루프.
- **출처**: `docs/task-record/M1.2-step2-registry-interfaces.md` §설계 결정 #3, `docs/ROADMAP.md` §확장 루프 카테고리 4
- **회수 예정**: **M2+ (Drill-down 은 back-navigation 스택 설계 필요)**
- **블록킹**: No

### [4-14] `oi_chg_24h` / `funding_rate_chg_Xh` 사전계산 승격
- **설명**: 스윙 트레이더가 가장 자주 보는 지표지만 현재 미 사전계산.
- **사유**: M1.3 최소 범위에서 사전계산은 `price_chg / volume_chg / oi_chg (5m/15m/1h/4h)` 만. 24h / 펀딩변화 는 사용자 로그에서 스크리닝 빈도 확인 후 승격.
- **출처**: `docs/task-record/M1.3-step2-dataservice-methods.md` §Q3, `docs/task-record/M1.3-step3-binance-adapter.md` §추가 관찰
- **회수 예정**: **M2 확장 루프 (datasource 카테고리)**
- **블록킹**: No

### [4-15] `volume_ratio` 의미 재정의 (kline 기반)
- **설명**: Step 4 정의("24h 평균 대비 1시간 평균")는 근사치. Step 5 kline 기반 실시간 비교로 재정의 권고.
- **사유**: crypto-trader 관점에서 현재 정의가 의미 희석 가능.
- **출처**: `docs/task-record/M1.3-step4-polling-precompute.md` §crypto-trader Q4
- **회수 예정**: **M2 데이터 정확도 개선 루프**
- **블록킹**: No

### [4-16] LSR 3개 개념 분리 (`topLongShortAccount` / `topLongShortPosition` / `globalLongShortAccount`)
- **설명**: 현재 datasource 엔트리 하나에 LSR 3개 개념 묶임. AI 쿼리 혼동 가능성 낮지만 관찰.
- **사유**: 실사용 데이터 부족. 확장 루프에서 AI 쿼리 로그 분석 후 판단.
- **출처**: `docs/task-record/M1.3-step3-binance-adapter.md` §추가 관찰
- **회수 예정**: **M2+**
- **블록킹**: No

### [4-17] `tool_use` 를 `dataService` 메서드 노출 경로로 활용
- **설명**: 현재 tool_use 는 `AiCardConfig` JSON 반환용. M2+ 에서 AI 가 `dataService.queryNowTickers({...})` 같은 메서드를 tool 로 직접 호출하는 방향.
- **사유**: M1.5 범위 밖. 실측 없이 선제 도입 YAGNI.
- **출처**: `docs/task-record/M1.5-step2-orchestrate-route.md` §스코프 경계
- **회수 예정**: **M2+ 확장 루프**
- **블록킹**: No

### [4-18] ChatInputBar 로딩 스피너 / 취소 버튼 / 스트리밍 응답
- **설명**: 현재 `/api/orchestrate` 는 request→response 직렬. 로딩 UI 는 M2+.
- **사유**: M1.5 Step 3 는 "기본 루프" 증명만. 고급 UX 는 확장 루프.
- **출처**: `docs/ROADMAP.md` §M1.5 Step 3 스코프 경계
- **회수 예정**: **M2+ UX 폴리싱**
- **블록킹**: No

### [4-19] CoinListCard 기본 Top N 필터 스코프 — USDT-only vs 전체 진실
- **설명**: Step 3c 실측에서 "거래량 상위 5개" → CoinListCard 가 BTCJPY / BTCIDR / USDCUSDT / USDCIDR / SOLIDR 를 반환. 법정통화 페어가 상위에 뜸 — 실제 Binance spot 거래대금 진실은 맞지만 트레이더 관점 유용성 낮음.
- **사유**: crypto-trader Q1 (2026-04-22). **사용자 결정: 현재는 "전체 진실 유지"** — M1 완료 후 실사용 피드백에서 재평가.
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_5_step3_review.md` / `docs/task-record/M1.5-step3-chat-integration.md`
- **회수 예정**: **M1 완료 후 사용자 실사용 피드백 시점** — 기본 quote 필터(USDT-only) 승격 여부 결정
- **블록킹**: No
- **구현 힌트**: (A) AI system prompt 에 "별도 지시 없으면 quote=USDT 필터 기본" 주입, (B) 또는 datasourceRegistry 에 `defaultFilters` 필드 추가해 AI 가 읽게 함. B 가 더 레지스트리 패턴 일관적.

### [4-20] empty 응답 UX — 힌트/한국어 토스트 보강
- **설명**: Haiku 가 `cards: []` + (선택) `notes` 반환 시 사용자는 "내 쿼리가 왜 안 만들어졌는지" 피드백 약함. 스캘퍼는 조용한 실패 선호, 스윙은 한국어 힌트 선호.
- **사유**: crypto-trader Q2 (2026-04-22).
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_5_step3_review.md`
- **회수 예정**: **M1 완료 후 사용자 실사용 피드백 시점**
- **블록킹**: No
- **구현 힌트**: Haiku 가 `notes` 를 항상 생성하도록 system prompt 강화 (빈 cards 시 "왜 못 만들었는지" 한 줄 설명 의무).

### [4-21] 로딩 중 최소 시각 피드백 — dot 3개 등
- **설명**: 현재 Q3=(A) 미니멀 로딩 UX 만 적용 (input/button disabled + placeholder "AI 에게 물어보는 중..."). 스피너 / 진행바 / dot 애니메이션 등 시각 신호 없음. 스캘퍼 persona 에서는 4.3초 대기가 "앱이 멈췄나" 오해 가능.
- **사유**: crypto-trader Q3 (2026-04-22).
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_5_step3_review.md`
- **회수 예정**: **M2+ UX 폴리싱** ([4-18] 과 함께 처리)
- **블록킹**: No
- **구현 힌트**: 버튼 아이콘 (`CornerDownLeft`) 을 로딩 중 dot 3개 애니메이션으로 교체. CSS only (Framer Motion 불필요).

### [4-22] refusal 토스트 문구 — 거절 이유 살짝 노출 vs 현행 단순 톤
- **설명**: Step 3d 에서 결정된 `"해당 요청은 처리할 수 없어요. 다른 방식으로 질문해 주세요."` 는 "왜 거부됐는지" 를 감춘다. 스윙/포지션 페르소나에서는 같은 본질 쿼리를 단어만 바꿔 재시도 → 학습 곡선 증가 가능. 두 종류 거절(투자조언 / 스코프외) 이 동일 문구로 표시되는 한계.
- **사유**: crypto-trader Q1 (2026-04-23, Step 3d). **사용자 방침**: [9-9] M1 완료 후 실사용 피드백 시점에 결정.
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_5_step3d_review.md` / `docs/task-record/M1.5-step3d-refusal-branch.md`
- **회수 예정**: **M1 완료 후 사용자 실사용 피드백 시점**
- **블록킹**: No
- **구현 힌트**: (A) system prompt 에 refusal 사유 카테고리 힌트 추가 후 messageForReason 분기 확장, (B) 또는 refusal 블록 본문(거부 사유 문자열) 수집해 토스트에 첨부. B 는 Anthropic SDK 의 refusal 블록 실제 content shape 확인 필요.

### [4-23] refusal 사유 카테고리 enum 백엔드 로그 분리 보존
- **설명**: 현재는 `fallbackReason: "refusal"` 만 기록되고 **어떤 유형의 거부**인지는 기록 안 됨 (투자 조언 / 스코프 외 / 정책 위반 등). 향후 토스트/예시/가이드 결정 자유도 확보용.
- **사유**: crypto-trader Q2 (2026-04-23, Step 3d). [9-9] 영역.
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_5_step3d_review.md`
- **회수 예정**: **M1 완료 후 사용자 실사용 피드백 시점** ([4-22] 와 함께)
- **블록킹**: No
- **구현 힌트**: `log_validation_failure` 테이블에 `refusal_subcategory VARCHAR` 컬럼 추가 (M1.6 컬럼 확장과 함께) + 시스템 프롬프트에 "refusal 시 reason 코드 emit" 지시.

### [4-24] refusal 관찰 패턴 3종 (O1~O3, 데이터 누적 후 UX 결정)
- **설명**:
  - **O1**: refusal 사유 카테고리 백엔드 분리 보존 → 토스트/예시/가이드 결정 자유도 확보 ([4-23] 과 연관)
  - **O2**: refusal 빈도 + 직전 입력 패턴 누적 → 지원 안 되는 쿼리 Top N onboarding 반영
  - **O3**: 같은 사용자 연속 2~3회 refusal 시 인라인 예시 힌트 트리거 검토
- **사유**: crypto-trader 이월 관찰 (2026-04-23, Step 3d). 모두 데이터 누적 후 판단.
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_5_step3d_review.md`

### [4-25] Playwright `data-card-id` 유일성 assertion
- **설명**: `m1.5-orchestrate.spec.ts` 의 (E) 동일 쿼리 2회 테스트에서 "카드 2개 존재" 만 확인. `data-card-id` 유일성까지 assertion 하면 `resolveUniqueId` 동작 증거가 더 강해짐.
- **사유**: code-reviewer S4 (2026-04-23, Step 4).
- **출처**: `docs/task-record/M1.5-complete.md` §7 code-reviewer S4
- **회수 예정**: **M2+** (E2E spec 고도화 단계)
- **블록킹**: No
- **구현 힌트**: `const ids = await page.locator("[data-card-id]").evaluateAll(els => els.map(el => el.getAttribute("data-card-id"))); expect(new Set(ids).size).toBe(ids.length);`
- **회수 예정**: **M1 완료 후 실사용 데이터 1~2주 누적 후**
- **블록킹**: No

### [4-26] AI 시스템 프롬프트 Phase 2 — 계층 라우팅 (Stage1 분류 → Stage2 카테고리 주입)
- **설명**: registry 가 30~50 entry 도달 시 매 요청 시스템 프롬프트 ~15K 토큰 → 비용·latency·정확도 모두 저하. Stage 1 (Haiku, 가벼움, 시스템 프롬프트 ~500 token) 이 쿼리를 카테고리 (예: `price-display` / `screening` / `chart` / `news` / `liquidation` / `indicator` / `orderbook` / `macro`) 로 분류 → Stage 2 가 해당 카테고리에 등록된 component / datasource 만 시스템 프롬프트 주입 → 매 요청 ~4K 토큰 유지.
- **사유**: AI 전문가 분석 (사용자 질문 답변, 2026-04-28). registry 확장이 본질인 TRAVIS 구조에서 시스템 프롬프트 부풀음은 필연. Anthropic 공식 "Routing pattern" (Building Effective Agents) 직접 매칭. **TRAVIS 의 "AI 자율 판단 / 하드코딩 금지" 원칙과 완전 정합** — Stage 1 도 LLM 분류, if-else 분기 없음. 카테고리 자체를 레지스트리에 등록하면 "등록만 하면 자동 사용" 일관성 유지.
- **출처**: 사용자 질문 (2026-04-28) — "시스템 프롬프트 방대해질 것 같다" → AI 전문가 답변 §Phase 2 진화 경로
- **회수 예정**: **M2 거래소 다변화 시점** (registry 30+ entry / 시스템 프롬프트 10K+ 토큰 측정 기반 진입 결정). M1.7 admin dashboard "average system prompt tokens" 메트릭 노출 → 임계 도달 자동 알림 권고.
- **블록킹**: No
- **구현 힌트**: (1) 카테고리 자체를 `categoryRegistry` 로 신설 (4번째 레지스트리) 또는 기존 component/datasource 메타에 `category: string` 필드 추가. (2) Stage 1 = 단순 분류 Haiku 호출 (`messages.create({ system: "Classify this query into one of: ...", max_tokens: 50 })`). (3) Stage 2 = 기존 `orchestrateOnce` 흐름 + `promptInjection({ filterByCategory: stage1.category })`. (4) Stage 1 latency ~500ms 추가 — total 5s → 5.5s. cache hit 시 무관. (5) Stage 1 분류 오류 시 fallback: 전체 카테고리 dump (비용 ↑, 정확도 보존).

### [4-27] AI 시스템 프롬프트 Phase 3 — Embedding RAG (pgvector top-K retrieval)
- **설명**: registry 100+ entry (CoinGlass / TradingView 수준 커버리지) 도달 시 카테고리 라우팅도 한계 (카테고리 1개에 50+ entry 누적). 모든 registry entry 의 `description` + 메타데이터를 embedding (OpenAI `text-embedding-3-small` 1536d / Voyage `voyage-3` 1024d / Cohere `embed-v4`) 으로 벡터화 → Supabase `pgvector` 에 저장. 사용자 쿼리 → embed → 코사인 유사도 top-K (예 K=10~15) entry 만 시스템 프롬프트 주입. 거의 무한 확장 가능.
- **사유**: AI 전문가 분석 (사용자 질문 답변, 2026-04-28). Anthropic 공식 "RAG pattern" 직접 매칭. **TRAVIS 인프라 적합도 ↑** — Supabase 이미 사용 중 → `vector` extension 활성화 1줄, 별도 Pinecone / Weaviate 불필요. **4 레지스트리 메타데이터 구조가 본질적으로 RAG-ready** (각 entry 가 `description` + queryableFields 등으로 이미 구조화).
- **출처**: 사용자 질문 (2026-04-28) — "시스템 프롬프트 방대해질 것 같다" → AI 전문가 답변 §Phase 3 진화 경로
- **회수 예정**: **M3+ (registry 100+ entry / 시스템 프롬프트 30K+ 토큰 측정 기반 진입 결정)**. Phase 2 가 임계 도달 후 자연스러운 다음 단계.
- **블록킹**: No
- **구현 힌트**: (1) Supabase Dashboard → Database → Extensions → `vector` 활성화. (2) `registry_embeddings(id text PRIMARY KEY, kind text CHECK kind IN ('component','datasource','interaction'), embedding vector(1536), description text, updated_at timestamptz)` 테이블 신설. (3) `registerComponent` / `registerDatasource` / `registerInteraction` 호출 시 hook 으로 embedding 생성 + upsert (worker 부트스트랩 또는 Edge Function). (4) `/api/orchestrate` 진입 시 `query → embed → SELECT id FROM registry_embeddings ORDER BY embedding <=> query_embedding LIMIT 15` → top-K id 만 `promptInjection({ filterByIds: [...] })`. (5) embedding 모델 비용: ~$0.02/M tokens (text-embedding-3-small) → 100K query/일 < $1/일.

### [4-28] Multi-provider AI fallback (Anthropic 단일 의존 해소)
- **설명**: 현재 AI orchestrator 는 `@anthropic-ai/sdk` 단일 SDK 만 호출 (Haiku 4.5 primary + Sonnet 4.6 escalation 플래그). Anthropic API incident 시 TRAVIS 전체 다운 = 외부 베타 사용자 N명 동시 사용 불가. `apps/web/lib/ai/` 에 provider-agnostic 추상 (`aiClient.ts`) + provider 어댑터 (`providers/{anthropic,gemini,openai}.ts`) 도입 → primary 실패 시 fallback 자동 전환. 4 레지스트리 / `dataService` 의 abstraction 사상과 동일한 결.
- **사유**: 단일 공급사 의존 = 운영 가용성의 근본 위험 (vendor lock-in + incident risk). 비용 절감보다 가용성이 1차 동기. 2024~2026 Anthropic Status Page 이력 기준 partial outage 월 1~2회 / major incident (1시간+) 분기 1~2회 빈도. 사용자 결정 (2026-05-19) — "Sonnet 큰 모델 추가 라우팅" 보다 "다른 provider fallback" 이 본질적 가치. Sonnet 라우팅은 §4 세션 컨텍스트 추론 + §5 크로스 데이터 JOIN 분석 등장 시 별개 동기로 진행 (`docs/future.md §6`).
- **출처**: 사용자 결정 (2026-05-19), `docs/future.md §6`
- **회수 예정**: **M2+ 트리거 3가지 중 먼저 도달 시**: (a) Anthropic incident 1회 실측 영향 (사용자 1시간+) / (b) 외부 베타 진입 직전 / (c) 월간 Anthropic 비용이 fallback 도입 비용 (개발 8~16h + 어댑터 유지) ROI 회수 시점.
- **블록킹**: No
- **구현 힌트**:
  - 추상 인터페이스: `aiClient.ts` 의 `callLLM({ system, messages, tools, modelHint }) → ToolUseResult` — 어댑터 내부에서 각 provider tool_use spec 변환.
  - 어댑터: Anthropic `tool_use` block ↔ OpenAI `function_call` ↔ Gemini `functionCall` 매핑.
  - 1차 fallback 후보: **Gemini 2.5 Flash** (가격 + Google 인프라 별도성 → 지역 분산 효과). 2차: GPT-4.1-mini. Llama via Groq 는 function calling 안정성 검증 후.
  - 로그: `log_chat` 에 `provider` 컬럼 신설 (현재 `model_id` 만 존재). provider 별 retry / fallback 비율 / latency 비교 가능.
  - Health check: primary 연속 실패 N회 → circuit breaker open → fallback 전환. recovery 는 timer 또는 manual.
  - 테스트: `orchestrateOnce.test.ts` 에 provider 별 시나리오 추가 + "primary 강제 실패 → fallback 발동" E2E.
- **단점 / 주의 (구현 시 검토)**:
  - tool_use / function_call schema 차이 흡수 = 어댑터 레이어 비용
  - structured output 품질 편차 (Gemini Flash 의 strict enum 정확도 평가 필요)
  - cold-start: fallback 전환 시 1~3초 추가 latency = 사용자 체감 4초 → 6~7초 가능성
  - `log_chat` / `log_validation_failure` 분석이 provider 차원 추가됨

---

## 5. 🟠🟡 M1.5~M1.6 사이 UX/안정성 폴리싱

### [5-1] 데이터 신선도 배지 (age 초 단위 표시)
- **설명**: 카드에 "3초 전", "45초 전" 마지막 업데이트 표시. volume_chg_5m 해석 A vs B 구분 표시도 여기에 통합 가능.
- **사유**: crypto-trader 자문 Q4 (3차). 트레이더는 데이터 지연에 민감하므로 age 가시화 요청. M1.4 에서 스코프 포함 안 됨.
- **출처**: `docs/task-record/M1.4-step3-cards-and-dual-theme.md` §8 crypto-trader 3차 Q4, `docs/task-record/M1.4-step4.7-data-hygiene.md` §6
- **회수 예정**: **M1.5 Step 4 또는 M1.6 UX 폴리싱**
- **블록킹**: No
- **구현 힌트**: `useRealtimeRow` / `useRealtimeTable` 훅에 `lastUpdatedAt` 타임스탬프 반환 추가. 카드 헤더에서 `(Date.now() - lastUpdatedAt)/1000` 계산 후 "Ns ago" 렌더.

### [5-2] `volume_chg_5m` "(근사)" 뱃지 제거
- **설명**: 현재 M1.4 카드에서 해석 A fallback 시 "(근사)" 뱃지 + hover 툴팁 표시. Step 5 WS 로 해석 B 전환이 10분+ 구동 시 발동되면 뱃지 제거.
- **사유**: UX 투명성 정책(옵션 A)으로 2026-04-20 결정.
- **출처**: `docs/task-record/M1.3-step4-polling-precompute.md` §volume_chg_5m M1.4 UI 표기 정책, memory `project_volume_chg_5m_ui_policy.md`
- **회수 예정**: **Step 5 WS 해석 B 안정화 확인 후 (M1.5 Step 4 또는 M1.6)**
- **블록킹**: No

### [5-3] Binance USDM 어댑터 `contractType` 필터 (delivery 계약 제외)
- **설명**: 현재 `normalize.ts` 가 PERPETUAL / CURRENT_QUARTER / NEXT_QUARTER 모두 `market_type='futures_usdm'` 으로 저장. Delivery 계약 혼재.
- **사유**: M1.5 Step 0 에서 `tvSymbolMap` 이 `symbol.includes("_")` 로 null 반환해 graceful 처리 중. 근본 해결은 adapter 레벨 filter.
- **출처**: `docs/task-record/M1.5-step0-pre-infra.md` §6 조사 중 발견
- **회수 예정**: **M1.5 완료 후 backend-infra-specialist 재검토**
- **블록킹**: No
- **구현 힌트**: `apps/worker/src/adapters/binance/normalize.ts` 에서 `contractType` 필드 확인 후 `"PERPETUAL"` 만 저장.

### [5-4] `log_validation_failure` "Symbol is on delivering" 로그 축적 정리
- **설명**: worker REST per-symbol task 가 SETTLING/DELIVERING 심볼 대부분 skip 하지만 일부 edge case 에서 여전히 호출 시도 → 실패 로그 축적.
- **사유**: 미치명 이슈. M1.5 `@backend-infra-specialist` 재검토 대상.
- **출처**: `docs/task-record/M1.4-step4.7-data-hygiene.md` §6
- **회수 예정**: **M1.5 완료 후 또는 M1.6 코드 정리**
- **블록킹**: No

### [5-5] USDC-M 심볼 (`BTCUSDC` 등) 지원 검증
- **설명**: Binance `/fapi/v1/exchangeInfo` 응답에 USDC-M 퍼페추얼 포함 가능성. 현재 `.P` suffix 부착 후 TradingView 에 맡김.
- **사유**: USDC-M 자체는 M1.5 Step 0 에서 코드 경로 대응됨. TV 지원 여부는 실사용에서 확인.
- **출처**: `docs/task-record/M1.5-step0-pre-infra.md` §6
- **회수 예정**: **M1.5 Step 4 E2E 또는 실사용 피드백**
- **블록킹**: No

### [5-6] ~~XSS sanitize 재검증~~ — ✅ **2026-05-04 M1.6 Step 6c 로 회수 완료**

> `@security-auditor` M1 종합 감사 (Duty 4 — XSS sanitize) 통과: 정규식 자체는 12 추가 벡터 (img/svg/javascript:/iframe srcdoc/details ontoggle/style/broken closing/mixed case/entity-encoded/nested/HTML comment/double-bracket) 모두 안전 처리 입증. **실제 vulnerability 0~2%** 판정. `apps/web/lib/__tests__/sanitizeTitle.test.ts` 에 12 벡터 회귀 테스트 추가 (기존 8 → 20 시나리오, mustNotContain 원칙 = "raw HTML 태그 패턴만 검증, escape 된 텍스트 안의 attribute 단어는 visible text 라 위험 0"). DOMPurify 도입은 M2+ 본문 무제한 필드 추가 시 `[3-64]` 트리거. 세부: `docs/task-record/M1-complete.md` §6c.

---

## 6. 🔵 Launch Readiness (§L.1 ~ §L.4)

> **비전공자 요약**: "실제 사이트를 공개하기 전 체크리스트". M1.6 완료 후 "언제든 시작 가능". 마일스톤이 아닌 체크리스트.

### 6-A. 기능 최소 요건 (§L.1)

### [6-1] 거래소 최소 2개 연결 (spot + futures)
- **설명**: Binance(현재) + OKX/Bybit/Bitget 중 최소 1개 추가. 경로 A + 경로 B 모두.
- **출처**: `docs/ROADMAP.md` §L.1
- **회수 예정**: **확장 루프에서 1~2 루프 반복**
- **블록킹**: No

### [6-2] 컴포넌트 5종 이상 `componentRegistry` 등록
- **설명**: 현재 3종(TickerCard / CoinListCard / KlineChartCard). 예상 추가: Heatmap, PnL, Liquidation Feed, Orderbook, Funding Table.
- **출처**: `docs/ROADMAP.md` §L.1, §확장 루프 카테고리 2
- **회수 예정**: **확장 루프 카테고리 2 반복**
- **블록킹**: No

### [6-3] 뷰 저장 / 불러오기 (좌측 "My Views" 패널)
- **설명**: 사용자가 조립한 카드 배치를 저장·복원. **PRD §5 UI 구조** 의 좌측 패널 (Claude/ChatGPT 사이드바 방식).
- **출처**: `docs/PRD.md` §5, `docs/ROADMAP.md` §L.1, §확장 루프 카테고리 5
- **회수 예정**: **확장 루프 카테고리 5** (M1.6 로그인 + `user_views` 테이블 선행)
- **블록킹**: No
- **구현 힌트**: 뷰 저장 포맷 스펙은 현재 미결정(§향후 결정 사항). `user_views` 테이블에 레이아웃 JSON + cards 배열 저장.

### [6-3.5] 우측 "세션 채팅 기록 / AI 로그" 패널
- **설명**: 현재 세션의 사용자 쿼리 목록 + 각 쿼리에 대한 AI 응답 JSON 요약. **PRD §5 UI 구조** 의 우측 패널 (토글 가능).
- **사유**: PRD 에 명시된 UI 요소지만 M1 수직 슬라이스 스코프 밖. `log_chat` 테이블이 선행돼야 의미 있음 (현재는 클라이언트 메모리만).
- **출처**: `docs/PRD.md` §5 UI 구조, `UI-reference-3.html`
- **회수 예정**: **M1.6 `log_chat` 테이블 완성 후 확장 루프 카테고리 5** (`user_views` 패널과 같은 루프에서 처리)
- **블록킹**: No
- **구현 힌트**: `apps/web/components/panels/SessionLogPanel.tsx` 신규. `log_chat` 테이블에서 `user_id + session_id` 조건으로 본인 세션 조회. Supabase Realtime 으로 실시간 append. 토글 상태는 `user_preferences` 또는 localStorage.

### [6-4] Drill-down 인터랙션
- **설명**: 카드 클릭 → 더 상세한 카드로 전환. back-navigation 스택 포함.
- **출처**: `docs/ROADMAP.md` §L.1
- **회수 예정**: **확장 루프 카테고리 4**
- **블록킹**: No

### [6-5] 뉴스 피드 1개 이상 통합
- **설명**: 사용자 로그인 후 "최근 관련 뉴스" 카드.
- **출처**: `docs/ROADMAP.md` §L.1, §확장 루프 카테고리 7
- **회수 예정**: **확장 루프**
- **블록킹**: No

### [6-6] Tavily 웹 검색 폴백
- **설명**: 희귀 쿼리(~5%)에 대한 웹 검색 대체 경로.
- **출처**: `docs/ROADMAP.md` §L.1, §확장 루프 카테고리 7
- **회수 예정**: **확장 루프**
- **블록킹**: No

### 6-B. 안정성·보안 (§L.2)

### [6-7] 사용자 거래소 API 키 암호화 저장 (Edge Functions, **읽기 전용**)
- **설명**: Binance/OKX/Bybit/Bitget 개인 키를 Supabase Edge Functions 에서만 복호화. **거래 실행 코드 금지** — TRAVIS 는 compliance boundary 로 read-only.
- **출처**: `docs/ROADMAP.md` §L.2, §확장 루프 카테고리 6
- **회수 예정**: **확장 루프 카테고리 6**
- **블록킹**: No

### [6-8] "거래 실행 코드 없음" grep 검증
- **설명**: 코드 전체에서 거래소 주문 API 호출 (`POST /order`, `placeOrder` 등) 검색 → 0건.
- **출처**: `docs/ROADMAP.md` §L.2
- **회수 예정**: **Launch 직전 최종 검증**
- **블록킹**: No

### [6-9] 환경 변수 프론트 노출 검증 (`NEXT_PUBLIC_*` 외)
- **설명**: service_role / Anthropic key 등이 client bundle 에 포함되지 않았는지 grep.
- **출처**: `docs/ROADMAP.md` §L.2
- **회수 예정**: **Launch 직전**
- **블록킹**: No

### 6-C. 관측·운영 (§L.3)

### [6-10] Hetzner VPS 프로비저닝 + 워커 배포 (현재 로컬)
- **설명**: 로컬 워커 → 24/7 상시 운영. 권장 스펙: CAX21 ARM 4vCPU/8GB/€7.21 월, 지역 Hillsboro OR 또는 Helsinki.
- **사유**: 2026-04-19 결정으로 M1 Step 6 삭제 + Launch Readiness 로 이관. M1.5 까지 로컬 개발로 엔드투엔드 증명.
- **출처**: `docs/task-record/M1.3-step3-binance-adapter.md` §사용자 결정 1, `docs/ROADMAP.md` §L.3, §향후 결정
- **회수 예정**: **Launch Readiness §L.3 진입 시**
- **블록킹**: No
- **구현 힌트**: Docker image + systemd 자동재시작 + pm2 또는 GitHub Actions 배포.

### [6-11] Supabase Pro plan ($25/월) 업그레이드 결정
- **설명**: 2026-04-20 Step 5 1시간 smoke 에서 Free tier compute sleep + cold-start + shared compute 한계로 Cloudflare 522 간헐 발생. 단기 처방(warm-up ping, 대시보드 keep-alive) 완화 가능하나 근본 해결은 Pro.
- **사유**: M1.4 작업 중 실제 방해 시점에 결정 (실측 ROI 기반). 대안: Hetzner self-host Postgres (§L.3 VPS 배포 함께 검토).
- **출처**: `docs/task-record/M1.3-step5-ws-relay.md` §Supabase Free Tier 한계 진단, `docs/ROADMAP.md` §향후 결정
- **회수 예정**: **M1.4~M1.5 실 사용 중 방해 시점**
- **블록킹**: No
- **구현 힌트**: Pro 이점 — sleep 제거 / 2vCPU / 8GB RAM / 60 connections / dedicated compute.

### [6-12] 워커 24/7 모니터링 (pm2 재시작 카운트 0)
- **출처**: `docs/ROADMAP.md` §L.3
- **회수 예정**: **Launch Readiness**
- **블록킹**: No

### [6-13] Supabase DB 크기 + 쿼리 레이턴시 알림
- **설명**: ARCHITECTURE §10 "하이브리드 전환 트리거" 감지용.
- **출처**: `docs/ROADMAP.md` §L.3
- **회수 예정**: **Launch Readiness**
- **블록킹**: No

### [6-14] AI 검증 실패율 알림 (임계치는 운영 중 튜닝)
- **출처**: `docs/ROADMAP.md` §L.3
- **회수 예정**: **Launch Readiness**
- **블록킹**: No

### [6-15] 거래소 WS 재연결 실패 알림 + Supabase Realtime 끊김 감지
- **출처**: `docs/ROADMAP.md` §L.3
- **회수 예정**: **Launch Readiness**
- **블록킹**: No

### [6-16] Vercel 배포 실패 Slack/이메일 알림 (선택)
- **출처**: `docs/ROADMAP.md` §L.3
- **회수 예정**: **Launch Readiness**
- **블록킹**: No

### [6-17] 1시간 steady-state smoke 완주 (현재 미완료)
- **설명**: Step 5 에서 Supabase Free tier 문제로 1시간 smoke 연기. M1.4 카드 구현 중 자연스러운 end-to-end 로 대체 중. Pro 업그레이드 또는 Hetzner self-host 후 재도전.
- **출처**: `docs/task-record/M1.3-step5-ws-relay.md` §1시간 steady-state smoke 상태
- **회수 예정**: **Pro 업그레이드 또는 §L.3 VPS 배포 후**
- **블록킹**: No

### 6-D. 법적·정책 (§L.4)

### [6-18] 서비스 약관 + 개인정보 처리방침
- **출처**: `docs/ROADMAP.md` §L.4
- **회수 예정**: **Launch 직전**
- **블록킹**: No

### [6-19] 면책 조항 (거래 실행 안 함, 투자 조언 아님)
- **출처**: `docs/ROADMAP.md` §L.4
- **회수 예정**: **Launch 직전**
- **블록킹**: No

### [6-20] GDPR / 쿠키 고지
- **출처**: `docs/ROADMAP.md` §L.4
- **회수 예정**: **Launch 직전**
- **블록킹**: No

### [6-21] 거래소 제휴(어필리에이트) 정책 고지 (해당 시)
- **출처**: `docs/ROADMAP.md` §L.4
- **회수 예정**: **Launch 직전 (제휴 계약 발생 시)**
- **블록킹**: No

---

## 7. ⚪ 무기한 deferred / ARCHITECTURE §10 장기

### [7-1] Storage Phase 2 — Supabase + TimescaleDB/ClickHouse 하이브리드
- **설명**: `_history_*` 시계열 규모가 임계점 초과 시 TimescaleDB/ClickHouse 로 이관. `dataService` 내부 구현만 교체.
- **출처**: `docs/ARCHITECTURE.md §10`, `docs/ROADMAP.md` §스토리지 확장, `docs/task-record/M1.3-step5-ws-relay.md` §처방 테이블
- **회수 예정**: **Launch 이후 데이터 규모 임계 도달 시**
- **블록킹**: No
- **구현 힌트**: `dataService` 가 M1.1 부터 존재하므로 AI·프론트 코드 불변.

### [7-2] Storage Phase 3 — S3/R2 Parquet + DuckDB/ClickHouse cold query
- **설명**: 장기 archive.
- **출처**: `docs/ARCHITECTURE.md §10`
- **회수 예정**: **무기한 (Phase 2 이후)**
- **블록킹**: No

### [7-3] TimescaleDB vs ClickHouse 선택
- **설명**: 실데이터 쿼리 패턴 관찰 후 결정.
- **출처**: `docs/ROADMAP.md` §향후 결정
- **회수 예정**: **Phase 2 진입 시**
- **블록킹**: No

---

## 8. 📋 CLAUDE.md 데이터 위생 8원칙 (상시 부채)

> **비전공자 요약**: "새 거래소·새 지표를 붙일 때마다 반드시 거쳐야 하는 8단계 체크리스트". M1.4 Step 4.7 의 상장폐지 심볼 사고(ALPACAUSDT +391% 노출) 재발 방지용.

**매 신규 adapter/handler 추가 시 PR 본문 또는 task-record 에 체크 로그 기록 의무**:

1. **Instrument lifecycle status 필드 파악** — 공식 문서 context7/WebFetch 조회 후 "정상 거래" 값만 allowlist
2. **REST + WS 양쪽 allowlist 필터** — WS 는 비정상 심볼도 push 가능 (Binance `!miniTicker@arr` 대표)
3. **24h 이하 주기 자동 재로드** — 상장폐지/신규상장 감지 지연 상한 24h
4. **stale row 정리 + 감지** — DB trigger 또는 프론트 쿼리 필터
5. **극단값 sanity guard** — 예상 범위 벗어나면 null + 경고 로그
6. **워밍업 가드** — 롤링 윈도우 샘플 부족 시 null
7. **Supabase RLS 사전 점검** — `SELECT * FROM pg_policies WHERE tablename=?` 로 policy 존재 확인
8. **공식 문서 근거 주석** — 링크/버전/조회일 인라인 기록

**출처**: `.claude/CLAUDE.md` §데이터 소스 위생 원칙, `docs/task-record/M1.4-step4.7-data-hygiene.md`
**회수 예정**: **매 확장 루프마다 반복** (적용 의무)
**블록킹**: 확장 루프 신규 데이터 소스 추가 시 Yes

---

## 9. 💭 ROADMAP §향후 결정 사항 (아직 미결정)

> **비전공자 요약**: "언젠가 결정해야 하지만 지금은 실측/관찰이 부족해 보류". ROADMAP 원문 그대로 이관.

### [9-1] `_history_*` 테이블 보존·다운샘플링·인덱스·파티셔닝 정책
- **회수 예정**: 확장 루프 (`_history_*` 실 사용 시)

### [9-2] Drill-down 인터랙션 UI 구체 형태
- **회수 예정**: 확장 루프 카테고리 4 진입 시

### [9-3] 뷰 저장 포맷 + 공유 URL 스펙
- **회수 예정**: 확장 루프 카테고리 5 진입 시

### [9-4] `_now` 사전 계산 대상 지표 구체 목록 및 승격 기준
- **설명**: 현재 `price_chg_5m/15m/1h/4h`, `volume_chg_5m/15m/1h`, `oi_chg_5m/15m/1h/4h` 만. 추가는 사용자 로그 분석 후.
- **회수 예정**: 사용자 로그 분석 시점 (M2+)

### [9-5] `_history` 기반 카드의 기본 `refreshInterval` 및 사용자 조절 범위
- **회수 예정**: `_history` 기반 카드 도입 시

### [9-6] TradingView 임베드 vs 자체 차트 구체 분기 기준
- **설명**: 현재는 TV 임베드 우선. `.P` suffix/null 반환으로 미지원 심볼은 TV 가 "Symbol not found" 내부 처리.
- **출처**: memory `project_tradingview_chart_policy.md`
- **회수 예정**: 자체 차트 컴포넌트 도입 필요 시

### [9-7] Launch 시점 및 첫 소셜 로그인 제공자
- **회수 예정**: 확장 루프 진행 중 결정

### [9-8] Claude Code 워크플로우 부트스트랩(커스텀 agent/command) 추가 도입 시점
- **설명**: 현재 day-1 core (`genagent`, `code-reviewer`, `roadmap-milestone-manager`, `crypto-trader`) + M1.2 (zod/frontend/backend) + M1.3 (crypto-domain-expert) + M1.5 (ai-orchestrator-specialist) 생성 완료. M1.6 `security-auditor` 예약.
- **회수 예정**: 마일스톤 도달 시 genagent 자동 생성

### [9-9] M1 완료 후 사용자 직접 실사용 → 제품 판단 재평가 (2026-04-22 신설)
- **설명**: M1.5 Step 3 완료 시점에서 crypto-trader 자문이 여러 UX Q 를 제기 (Top N 필터 스코프 / empty UX / 로딩 피드백 / 카드 타이틀 톤 등). **사용자 방침**: "M1 완료 후 내가 직접 사용하면서 피드백하고 고치려고 한다" (2026-04-22). CLAUDE.md "제품 판단은 내 의견 존중" 원칙과 정합.
- **범위**: [4-19] Top N 필터 / [4-20] empty UX / [4-21] 로딩 피드백 / [4-18] 스트리밍 등 "UX 폴리싱" 성격 전부.
- **사유**: M1 은 "수직 슬라이스 엔드투엔드 증명" 이 목적. 제품 UX 판단은 **실사용 데이터가 쌓인 후** 에야 유효한 피드백 가능. 선제 튜닝은 YAGNI.
- **회수 예정**: **M1.6 완료 후 사용자가 본인 트레이딩 워크플로우에 TRAVIS 를 실제로 끼워 넣는 시점 ~ Launch Readiness 사이**
- **블록킹**: No (오히려 M1 완료를 촉진하는 원칙)
- **구현 힌트**: M1 종료 시 "UX Q 목록" 을 `docs/task-record/M1-complete.md` 에 모으고, 사용자가 본인 피드백 가능한 체크리스트로 변환. 피드백 수집 → 우선순위 판단 → 확장 루프 편성.

### [9-10] crypto-trader UX 회고 체크리스트 (2026-04-23 신설, Step 0.1 추가 2026-04-24)
- **설명**: crypto-trader 가 각 Step 에서 advisory 로 제시한 관찰 포인트 + Q 질문들을 [9-9] 원칙 하에 피드백 체크리스트로 편입. 실사용 데이터 없이 지금 결정하면 역풍 가능성.
- **범위 (M1.5 Step 4, 2026-04-23)**:
  - **관찰 1**: English 쿼리 비영어권 수용성 — 토큰 쿼리(`BTCUSDT price`, `top gainers`) 가 사실상 DSL 로 자리잡을 가능성. 실사용 패턴이 자연어 vs 토큰 쿼리 중 어느 쪽인지 측정.
  - **관찰 2**: 동일 쿼리 2회 UX (현재 카드 2개 생성 vs 대안 업데이트) — 로딩 피드백 도입과 묶어서 판단. 실 중복 Enter 빈도 측정 필요.
  - **관찰 3**: Fallback 토스트 `"Couldn't build a valid response..."` 행동 유도성 — 발생률 측정 후 inline 예시(`Try: "BTCUSDT price" or "top gainers"`) 추가 여부 결정.
  - **관찰 4**: 카드 생성 3~7초 체감 — 지연 자체보다 **로딩 피드백 부재**가 주 문제일 가능성. 로딩 스피너 vs 스트리밍 중 선택.
  - **관찰 5**: 3카드 집합 vs 펀딩/OI/호가 카드 추가 시점 — 실 사용자 피드백 후 페르소나별 우선순위 판단. roadmap-milestone-manager 와 공동 판단.
  - **Q1**: 로딩 피드백을 M1.5 폴리싱에 포함할지 [9-9] 편입할지
  - **Q2**: Fallback 토스트에 placeholder 예시 재활용 (저비용 개선) 지금 넣을지 [9-9] 편입할지
  - **Q3**: 다음 카드 타입 (펀딩/호가 등) 추가를 M2 초반 scope 확정 vs M1 피드백 기반 결정
- **범위 (M1.6 Step 0.1, 2026-04-24, 카드 제목 톤 전환)**:
  - **관찰 6**: 카드 타이틀 심볼 2중 노출 — `kicker:"BTCUSDT · SPOT"` + `title:"BTCUSDT"` 가 스캘퍼 안전장치로 작용할지, 모바일/좁은 캔버스에서 공간 낭비로 작용할지 실사용 관찰. 대안: kicker 한 줄 병합.
  - **관찰 7**: `"24h Volume Leaders"` 용어 모호성 — "volume" 이 base (coin quantity) 인지 quote (거래대금 USD) 인지 트레이더 해석 갈림. 대안 `"Top Quote Volume · 24h"` 대비 모호성 감소 효과 측정.
  - **관찰 8**: 3 카드 제목 톤 일관성 — 지금 Ticker (`"BTCUSDT"`) / List (`"24h Volume Leaders"`) / Kline (`"BTCUSDT 1m Candles"`) 가 심볼-only / descriptor-only / 심볼+descriptor 세 패턴. 나란히 캔버스에 놓였을 때 스캔 리듬 평가. 공통 포맷 수렴 vs 카드별 자유도 우선.
- **사유**: crypto-trader 원칙 advisory 따라 전부 "실사용 데이터 수집 후 판단" 대상. Step 0.1 관찰 3건은 크립토-트레이더가 직접 "Q3: [9-9] 편입 권고" 라고 조언.
- **출처**: `docs/task-record/M1.5-complete.md` §7 + `docs/task-record/M1.6-step0.1-urgent-fixes.md` §서브에이전트 자문
- **회수 예정**: **M1 완료 후 [9-9] 체크리스트 편성 시**
- **블록킹**: No

---

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

---

## 🚦 현재 다음 행동 (✅ **M2-plan Step 0 진행 중**, 2026-05-20)

1. **🎉 M1 전체 완료** (2026-05-04, `docs/task-record/M1-complete.md`). 13 테이블 + 4 레지스트리 + 3 카드 + Hetzner 24/7 워커 + Supabase Auth + RLS + log 인프라 모두 작동.
2. **현재: M2-plan Step 0 docs 정리** (2026-05-20 ~ 진행). DB_SCHEMA.md 13 테이블 상세 보강 + Architecture/PRD/ROADMAP/future cross-link 정합화. 신규 발견 2건 (rls_auto_enable / migrations 빈 상태) 은 DB_SCHEMA.md 본문에 기록.
3. **다음 단계 = M2-plan Step 1**: [3.5-7]([3-48]) funding/OI 단위 변환 hotfix — 실사용 중 100배 misread 차단 목적. 작업량 ~30m~1h. canonical-metrics.md 신설 ([3-43] 회수) 동시 진행.
4. **그 다음 = M2-plan Step 2 (자유 페이스, 며칠~2주)**: 사용자(바이낸스 선물 3년차 트레이더) 가 본인 트레이딩 워크플로우에 TRAVIS 끼워 사용 → [9-9]/[9-10] 체크리스트 (카드 타이틀 톤 / Top N 필터 / empty UX / 로딩 피드백 등) 실사용 데이터 누적 → M2 우선순위 판단.
5. **M1.7 Step 1~6 보류** (외부 베타 진입 트리거 시 활성화): auth allowlist [3.5-1] / admin Tier 1+2 [3.5-2] / rate-limit [3.5-3]+[3.5-4] / Magic link [3.5-5] / security audit [3.5-6]. 현재는 사용자 단독 실사용 단계라 즉시 베타 게이트 불필요 (2026-05-18 결정).
6. **M2+ 확장 루프 후보**: [4-1]~[4-28] / [3-50] quote_volume USD 환산 / [3-43] canonical metrics / [3-62] route.ts 분할 / [3-64] DOMPurify / [3-65] initialFetch 확장 — 실측 피드백 기반 우선순위 분해 (M2-plan §Step 3).
7. **상시 부채 [📋 1]**: 신규 데이터 adapter 추가 시마다 9 데이터 위생 원칙 (CLAUDE.md §데이터 소스 위생) 체크리스트 통과 의무.

---

**문서 유지 규칙**: 항목 완료 시 즉시 제거 + 해당 Step task-record 에 회수 기록 링크. 신규 이월 발생 시 적절한 카테고리에 추가하고 출처 파일·회수 예정 시점·블록킹 여부를 반드시 명시.

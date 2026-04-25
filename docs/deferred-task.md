# TRAVIS — 이월 및 향후 처리 작업 대장 (Deferred Tasks)

> **작성일**: 2026-04-22 (M1.5 Step 2 완료 직후)
> **최근 갱신**: 2026-04-23 (**M1.5 완료 선언** — Step 4 회수 6건 + 신규 이월 4건 ([3-10]/[3-11]/[4-25]/[9-10]))
> **집계 범위**: `docs/task-record/` 전 Step 27개 + `docs/ROADMAP.md` §Deferred Decisions + `docs/ROADMAP.md` §L Launch Readiness
> **업데이트 규칙**: 각 항목이 완료되면 **즉시 제거**하고 해당 Step task-record 에 회수 기록을 남긴다. "결정 확정 시 제거" 는 살아있는 문서의 핵심 규율.

---

## 0. 한 줄 요약 (비전공자용)

**집을 짓다가 "이건 아직 결정하지 말고 나중에 하자"고 노트에 적어둔 할 일 목록**입니다. TRAVIS 는 "deferred decision (지금 결정하지 않고 미루기)" 원칙을 따르므로, 각 Step 마다 의도적으로 연기한 작업이 쌓입니다. 이 문서는 그것들을 한 곳에 모아 **"언제 꺼내 써야 할지"** 를 시점별로 분류합니다.

- **🔴 지금 당장 블록킹**: M1.5 Step 3 착수 전 반드시 해결
- **🟠 M1.5 완료 기준**: Step 3~4 에서 함께 해결
- **🟡 M1.6 (로그인/RLS)**: 인증 도입 시 일괄 처리
- **🟢 M2+ 확장 루프**: 실사용 데이터 관찰 후 도입
- **🔵 Launch Readiness (§L.1~L.4)**: 실서비스 배포 시 체크리스트
- **⚪ 무기한 / 장기**: ARCHITECTURE §10 스토리지 Phase 2~3 등
- **📋 상시 부채**: 새로운 adapter 추가 시 매번 체크 (데이터 위생 8원칙)
- **💭 미결정 (ROADMAP §향후 결정)**: 실측/관찰 후 결정

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

### [2-6] ChatInputBar `useCallback` stale closure — 중복 제출 race 가능성
- **설명**: `handleSubmit` 의 deps 에 `isLoading` 은 들어있지만, React batch 렌더 타이밍에 따라 1초 안에 Enter 2번 → 첫 번째의 `setStatus("loading")` 이 두 번째 handler closure 에 반영되지 않아 `isLoading === false` 로 보여 Haiku 이중 호출.
- **사유**: code-reviewer C1 (2026-04-22). CLAUDE.md "graceful 처리" 정신상 비용 2배/race 이론적 위험.
- **출처**: `docs/task-record/M1.5-step3-chat-integration.md` §code-reviewer C1, Step 4 RTL 테스트도 1차 방어선(disabled)만 커버 — 본질 해결 아님.
- **회수 예정**: **M1.6 Step 3** (dataService 프론트 레이어 `[3-10]` 리팩터링 시 동시 처리)
- **블록킹**: No (실측 재현 어려움)
- **구현 힌트**: `chatStoreApi = useChatStoreApi()` 로 store 의 `getState()` 를 콜백 시점에 직접 조회. `input` 을 deps 에서 제거해 handler 재생성을 막고, `getState().input.trim()` 으로 즉시 읽기. 이미 canvasStoreApi / showToast 같은 안정적인 참조만 deps 로 둠.

### [2-8] `handleSubmit` 57줄 multi-responsibility — 순수 함수 추출
- **설명**: `ChatInputBar.handleSubmit` 에 fetch + HTTP 에러 분기 + JSON parse + dispatcher 호출 + 토스트 + 상태 전이 6가지 책임 혼재. 현재는 해독 가능하지만 AbortController / 스트리밍 / 로딩 피드백이 추가되면 스파게티.
- **사유**: code-reviewer W3 (2026-04-22). CLAUDE.md "파일 하나에 너무 많이 넣지 마" + "스파게티 금지".
- **출처**: `docs/task-record/M1.5-step3-chat-integration.md` §code-reviewer W3
- **회수 예정**: **M1.6 Step 3** (dataService 프론트 레이어 `[3-10]` 리팩터링 시 동시 처리)
- **블록킹**: No
- **구현 힌트**: `apps/web/lib/ai/submitOrchestrate.ts` 신규 — `submitOrchestrateQuery(query, { canvasStore, showToast, setStatus })` 순수 함수로 추출. ChatInputBar 는 UI + trim + 중복 제출 가드만 유지. 이 구조는 향후 "다른 경로에서 오케스트레이터 트리거" (URL 쿼리스트링, 카드 drill-down 등) 재사용 가능.

---

## 3. 🟡 M1.6 (인증/RLS) 도입 시 일괄 처리

> **[3-1] `log_validation_failure` 테이블 컬럼 확장** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. user_id (UUID, ON DELETE SET NULL, NULL 허용) / attempt_number (SMALLINT DEFAULT 1) / model_id / system_prompt_version / user_query_hash 5 컬럼 추가. 기존 dev 디버깅 row 5건 DELETE. 세부: `docs/task-record/M1.6-step2-logs-rls.md`.
>
> **[3-2] `log_validation_failure` 에 RLS policy 추가** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. `CREATE POLICY ... FOR SELECT TO authenticated USING (auth.uid() = user_id)`. INSERT/UPDATE/DELETE policy 0개 → service_role 전용 (RLS bypass).
>
> **[3-3] `log_chat` / `log_behavior` 테이블 생성 + RLS** — ✅ **2026-04-25 M1.6 Step 2 로 회수 완료**. log_chat 13 컬럼 (id/user_id/query_text/ai_response/status CHECK/fallback_reason/model_id/input_tokens/output_tokens/latency_ms/attempt_number/system_prompt_version/user_query_hash/created_at) + log_behavior 5 컬럼 (id/user_id/event_type 자유 문자열/payload/created_at). 각 SELECT RLS 본인만 + (user_id, created_at DESC) 인덱스. 1 query = 1 row (옵션 B, 재시도 attempt 합산).

### [3-4] CI 빌드에 RLS 검증 스크립트 추가
- **설명**: `user_*` / `log_*` 접두 테이블 중 RLS 없는 테이블이 존재하면 빌드 실패. 간단한 SQL 스크립트로 `pg_policies` 조회 후 확인.
- **사유**: M1.4 Step 4.5 에서 "RLS enabled + policy 0개 = deny-all" 함정을 직접 겪었음. 재발 방지용 자동 검증.
- **출처**: `docs/ROADMAP.md` §M1.6, CLAUDE.md §데이터 소스 위생 원칙 #7
- **회수 예정**: **M1.6 Step 5**
- **블록킹**: No
- **구현 힌트**: GitHub Actions 에서 Supabase MCP execute_sql 로 `SELECT tablename FROM pg_tables t WHERE (tablename LIKE 'user_%' OR tablename LIKE 'log_%') AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename);` 실행 → 결과 0행이 아니면 exit 1.

### [3-5] ~~이메일 로그인 UI~~ + 소셜 로그인 1개 (이메일 부분 ✅ 회수, 2026-04-24 M1.6 Step 1)
- **설명**: 최소 1개 소셜 로그인 (예: Google OAuth). 이메일/비밀번호 login/logout/signup UI 는 M1.6 Step 1 에서 완료.
- **진척 (2026-04-24, M1.6 Step 1)**: shadcn form + zodResolver + Supabase Auth `signInWithPassword`/`signUp` + UserMenu (이메일 + Log out, 우상단 fixed). 세부: `docs/task-record/M1.6-step1-auth-middleware.md`.
- **사유**: M1.6 이후부터는 누가 무엇을 했는지 `log_chat`/`log_behavior` 에 쌓임.
- **출처**: `docs/ROADMAP.md` §M1.6, §L.1
- **회수 예정**: **Launch §L.1** (소셜 1개)
- **블록킹**: No

### [3-6] ~~비로그인 상태 `/api/orchestrate` 401 거부~~ — ✅ **2026-04-24 M1.6 Step 1 로 회수 완료**

> `middleware.ts` matcher `/api/orchestrate/:path*` + `@supabase/ssr` `createServerClient` 의 `auth.getUser()` 로 401 JSON. route.ts POST 핸들러 맨 앞에 두 겹 방어(defense-in-depth) 추가. ChatInputBar 가 401 body 의 `message` 를 유저 토스트로 그대로 노출해 "Please sign in to use AI features." 안내가 도달. 세부: `docs/task-record/M1.6-step1-auth-middleware.md`.

### [3-7] `datasource` / `componentId` 자유문자열 → registry enum 승격 (zod-schema-architect 자문)
- **설명**: `AiCardConfigSchema.datasource`, `.componentId` 가 현재 `z.string().min(1)` — AI 가 `"now_spot_ticker"` / `"ticker_spot"` / `"ticker-card"` / `"ticker"` 등 drift 값을 모두 emit 해도 Zod 통과. 방어선 역할 불가. 레지스트리에 등록된 id 값으로 제약 필요.
- **사유**: code-reviewer W2 (2026-04-22). M1.5 Step 3c 에서 `registerCards.ts` id 통일로 급한 불은 껐지만 schema 레벨 방어선이 없어 재발 위험 상존. M1.6 에서 `user_id` migration 과 함께 `@zod-schema-architect` 자문으로 구조 개편이 자연스러움. crypto-domain-expert 와도 연계 — 레지스트리에 등록된 테이블명 ↔ 프론트 datasource id 매핑 정의 필요.
- **출처**: `docs/task-record/M1.5-step3-chat-integration.md` §code-reviewer W2 + `docs/task-record/M1.6-step0.1-urgent-fixes.md` (진척)
- **회수 예정**: **M1.6 Step 4** (zod-schema-architect 자문 선행)
- **블록킹**: No
- **진척 (2026-04-24, Step 0.1)**: `ticker_spot` / `ticker_futures` → `now_spot_ticker` / `now_futures_ticker` 로 **id 2개만** 테이블명과 일치화 (**대안 A 임시 적용**). 이로 인해 프론트 `supabase.from(datasource)` 호출이 실제 테이블에 도달 → realtime error / 목록 실시간 갱신 안됨 증상 해결. 하지만 **Zod enum 방어선은 여전히 미구현** — AI 가 "ticker_spot" (옛 값) 이나 오타 값을 emit 해도 런타임까지 통과. 나머지 6개 datasource (`premium_index` / `open_interest` / `long_short_ratio` / `taker_long_short` / `symbols_meta` / `liquidation`) 는 현재 프론트 사용처 없어 **미변경** — Step 4 일괄 처리. 참고로 Step 0.1 수정 전에도 테스트 픽스처 / `devInject.ts` / narrow type cast 등은 **이미 `now_*_ticker` 문자열을 사용** 중이었고 `defaults.ts` 만 `ticker_*` 로 남아있는 drift 였음.
- **감사 범위 (Step 4 대안 B 승격 시 동반 변경 필수)** — code-reviewer W2 (2026-04-24):
  - **AI-facing literal 4곳** (대안 B 전환 시 `ticker_spot`/`ticker_futures` 로 되돌림):
    - `packages/shared/src/schemas/__tests__/aiCardConfig.test.ts:21,77` (Zod 스키마 테스트 픽스처)
    - `apps/web/lib/__tests__/actionDispatcher.test.ts:37,50` (dispatcher 테스트 픽스처)
    - `apps/web/lib/devInject.ts:18,87` (JSDoc + console 출력 개발자 예시)
    - `apps/web/lib/ai/buildSystemPrompt.ts:114,118` (`<example>` JSON — Step 0.1 에서 교체됨)
  - **narrow type cast 2곳** (대안 B 전환 시 dataService 레이어로 이관 — `[3-10]` 과 일괄 처리):
    - `apps/web/components/cards/TickerCard.tsx:69` (`type NowTickerTable = ...`)
    - `apps/web/components/cards/CoinListCard.tsx:33` (동일)
  - **유지되는 정당 하드코딩** (대안 B 와 무관 — DB 구현 레이어):
    - `packages/data-service/src/**` (`.from("now_*_ticker")` — dataService 역할)
    - `apps/worker/src/**` (워커 직접 upsert — 3 경로 중 B)
    - `packages/data-service/src/types/tables.ts` (Supabase generated type 별칭)
- **구현 힌트**: (A) `OrchestrateResponseSchema` 를 registry 레지스트리 상태에 의존하는 동적 Zod 스키마 빌더로 변환, (B) 또는 `z.custom()` refinement 로 runtime 에 registry lookup — 장점 단점 자문 필요. datasourceRegistry 의 entry 에 `tableName` 필드를 추가해 "레지스트리 id (프론트 계약) ↔ Supabase 테이블명 (백엔드 구현)" 매핑을 1곳에서 관리하는 **대안 B 로 승격** 가능성 검토 대상. 대안 B 승격 시 위 감사 범위의 AI-facing literal 4곳 + narrow type 2곳을 동반 변경.

### [3-8] fallbackReason enum 세분화 — `parse_error` / `schema_drift` 분리 검토
- **설명**: 현재 `extract` 단계(JSON.parse 실패, tool_use 블록 누락) 와 `zod` 단계(스키마 불일치) 의 에러가 모두 `fallbackReason: "validation_exhausted"` 로 뭉뚱그려져 있음. Step 3d 가 `refusal` 을 별도 축으로 분리한 것과 대비되어, 운영 로그에서 "왜 validation_exhausted 가 늘었지?" 를 분석할 때 stage 컬럼 없이는 구분 불가.
- **사유**: code-reviewer W1 (2026-04-23, Step 3d). 운영 가시성 손실 — 크래시는 없으나 사후 분석 도구가 무뎌짐.
- **출처**: `docs/task-record/M1.5-step3d-refusal-branch.md` §code-reviewer W1
- **회수 예정**: **M1.6 Step 4** ([3-7] 과 함께 zod-schema-architect 자문 배치)
- **블록킹**: No
- **구현 힌트**: `OrchestrateFallbackReasonSchema` 에 `"parse_error"` (JSON.parse / tool_use 추출 실패) + `"schema_drift"` (Zod 실패 — 등록되지 않은 componentId 등) 2개 분리 검토. `messageForReason` switch 에도 분화된 한국어 메시지.

### [3-9] `orchestrateOnce` 단위 테스트 (Anthropic SDK mock)
- **설명**: 현재 orchestrate 라우트의 실패 분류 로직(`refusal` / `validation_exhausted` / `transient_error` 분기) 은 actionDispatcher 수준에서만 검증되고, `orchestrateOnce()` 자체의 단위 테스트는 0 건. Anthropic SDK mock 으로 3종 시나리오 자동화 필요.
- **사유**: code-reviewer (2026-04-23, Step 3d) 추가 제안. Haiku 실호출 기반 E2E 는 비결정적이라 단위 mock 이 실질 회귀 방지.
- **출처**: `docs/task-record/M1.5-step3d-refusal-branch.md` §code-reviewer 추가 제안
- **회수 예정**: **M1.6 Step 5** (Anthropic SDK mocking 인프라 구축)
- **블록킹**: No
- **구현 힌트**: `apps/web/app/api/orchestrate/__tests__/route.test.ts` 신규. `@anthropic-ai/sdk` 를 `vi.mock()` 으로 가로채 `message.stop_reason` + `content` 조작. 3 시나리오: (a) refusal → `fallbackReason: "refusal"`, (b) invalid JSON → `validation_exhausted`, (c) 네트워크 실패 → `transient_error`.

### [3-10] 프론트 카드 `supabase.from(` 직접 호출 → dataService 레이어 도입
- **설명**: `CoinListCard.tsx:75` 가 `supabase.from(datasource).select(...)` 을 직접 사용. CLAUDE.md "dataService 경유" 원칙 위반. `TickerCard` / `KlineChartCard` 등 다른 카드에도 같은 패턴 있을 가능성 → **전수조사 + 프론트용 `dataService` 레이어 도입**.
- **사유**: code-reviewer W1 (2026-04-23, Step 4). M1.6 auth 도입 시 user 격리·RLS 테스트·mock injection 이 모두 어려워짐. 카드 단위 리팩터링이 필요하므로 Step 4 scope 밖.
- **출처**: `docs/task-record/M1.5-complete.md` §7 code-reviewer W1
- **회수 예정**: **M1.6 Step 3** ([2-6]/[2-8] ChatInputBar 리팩터링과 동일 batch)
- **블록킹**: No
- **구현 힌트**: `apps/web/lib/dataService/index.ts` 생성 → `getTickerRow(datasource, exchange, symbol)`, `getTickerList(datasource, filters)` 등 카드별 shape 에 맞춘 메서드 노출. 내부에서만 `supabase.from()` 호출. 기존 모든 카드 컴포넌트의 `supabase.from` 을 grep → 일괄 교체.

### [3-12] UserMenu 초기 mount loading → email FOUC 엣지 미세 조정
- **설명**: `apps/web/components/auth/UserMenu.tsx` 에서 `loading=true` 동안 null 렌더. `getUser().then(setEmail + setLoading(false))` 와 `onAuthStateChange` 동기 초기 emit 의 interaction 으로 "email 세팅됐는데 loading 이 아직 true 라 수백 ms 빈 영역" 발생 가능.
- **사유**: code-reviewer W3 (2026-04-24, M1.6 Step 1). 실 UX 영향 미미 — crash 위험 없음.
- **출처**: `docs/task-record/M1.6-step1-auth-middleware.md` §code-reviewer W3
- **회수 예정**: **M1.6 Step 5 or 6** 미세 조정 배치
- **블록킹**: No
- **구현 힌트**: `getUser().then()` 에서 setEmail + setLoading(false) 를 한 React 배치로. `onAuthStateChange` 에도 `setLoading(false)` 호출로 sync emit 경로 동시 해제.

### [3-13] auth 폼 RTL 테스트 (LoginForm / SignupForm / UserMenu)
- **설명**: M1.6 Step 1 에서 RTL 테스트 신규 작성 0건. zodResolver 검증 (이메일 형식 / 8자 미만 비밀번호) + 이중 제출 가드 (`submitting`) + `mountedRef` 가드 + router.replace 성공 경로 회귀 커버 0%.
- **사유**: code-reviewer W4 (2026-04-24, M1.6 Step 1). M1.5 Step 4d 에서 RTL 인프라(vitest jsdom + jest-dom) 이미 구축, 30~40분 투자로 확보 가능.
- **출처**: `docs/task-record/M1.6-step1-auth-middleware.md` §code-reviewer W4
- **회수 예정**: **M1.6 Step 5** (RTL 증강 시 `[3-11]` 과 함께)
- **블록킹**: No
- **구현 힌트**: `apps/web/components/auth/__tests__/LoginForm.test.tsx` + `SignupForm.test.tsx` + `UserMenu.test.tsx`. `vi.mock("@/lib/supabase/browserClient")` 로 supabase 가로챔. 각 3~4 시나리오: valid submit, zod 실패, server error, 중복 submit 방어.

### [3-14] middleware env 누락 시 500 → 503 + 응답 본문 최소화 (@security-auditor 영역)
- **설명**: 현 `middleware.ts` 는 `NEXT_PUBLIC_SUPABASE_*` env 누락 시 `{ error: "server_misconfigured" }` + 500 반환. 공격자에게 "Supabase 설정 미완료" 를 알리는 information disclosure. 503 + `{ error: "service_unavailable" }` 로 변경하고 운영 기준 응답 본문 최소화 검토.
- **사유**: code-reviewer W5 (2026-04-24, M1.6 Step 1). 보안 성격이라 `@security-auditor` 종합 감사 scope.
- **출처**: `docs/task-record/M1.6-step1-auth-middleware.md` §code-reviewer W5
- **회수 예정**: **M1.6 Step 6** (`@security-auditor` 종합 감사)
- **블록킹**: No

### [3-15] `apps/web/lib/supabase.ts:27` console.warn 한국어 — English-only 정책 일관 (ChatInputBar 부분 ✅ 회수 2026-04-24)
- **설명**: 유일 잔존 한국어 — `apps/web/lib/supabase.ts:27` `console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 누락")` (dev console 전용, UI 노출 X).
- **진척 (2026-04-24, M1.6 Step 1 D/E 사용자 실측 후속)**: ChatInputBar 잔여 한국어 5곳 **영어 회수 완료** — catch 토스트 `"Network error. Please try again shortly."` / aria-live `"Asking AI..."` / placeholder `"Asking AI..."` / aria-label `"AI prompt"` / button aria-label `"Submit"`. `ChatInputBar.test.tsx` 의 `getByLabelText("카드 생성 프롬프트")` 3곳 → `"AI prompt"` 동기화 (55/55 PASS 유지). 추가로 `LoginForm.tsx` / `SignupForm.tsx` 의 `<form>` 요소에 `noValidate` 속성 추가해 브라우저 HTML5 native validation 의 **OS/브라우저 한국어 locale tooltip** (예: Chrome ko-KR `"이메일 주소에 '@'를 포함하세요"`) 차단 → Zod 영어 메시지로 일원화.
- **사유**: M1.5 시절 English-only 정책 정립 이전 잔재. `project_english_only_global` memory 와 불일치. 남은 `lib/supabase.ts:27` warn 은 dev console 전용이라 유저 직접 노출 없음 + Step 3 에서 레거시 파일 통째로 제거 예정이라 우선순위 낮음.
- **출처**: M1.6 Step 1 ChatInputBar C1 편집 중 발견 + M1.6 Step 1 D/E 단계 사용자 브라우저 실측 (2026-04-24)
- **관련**: `[3-17]` (Multiple GoTrueClient 경고도 동일 `lib/supabase.ts` 레거시 파일이 원인 — 동일 Step 3 배치에서 동시 해소)
- **회수 예정**: **M1.6 Step 3** (`apps/web/lib/supabase.ts` 레거시 파일 제거와 함께 자동 해소 — `[3-10]` / `[3-17]` 3종 배치)
- **블록킹**: No

### [3-16] Next.js 16.2.x `middleware.ts` → `proxy.ts` deprecation 대응
- **설명**: Next.js 16.2.4 dev 기동 로그 경고 — `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` `apps/web/middleware.ts` 를 `apps/web/proxy.ts` 로 리네임. API 동일 — 파일명/convention 만 변경.
- **사유**: 현재 dev 서버는 정상 동작 — 기능 영향 0 (M1.6 Step 1 A 단계 로그에서 `GET / 200` + 401 응답 정상). 단 매 기동마다 경고 + 향후 Next.js major 에서 제거될 가능성.
- **출처**: M1.6 Step 1 A 단계 `pnpm dev` 실측 (2026-04-24). 공식 문서: <https://nextjs.org/docs/messages/middleware-to-proxy>
- **회수 예정**: **M1.6 Step 6** (`@security-auditor` 종합 감사 + Next.js 업데이트 배치 시) 또는 사용자 판단 시 별도 소규모 commit
- **블록킹**: No
- **구현 힌트**: `git mv apps/web/middleware.ts apps/web/proxy.ts` 가 1차 시도. 내부 로직 변경 없음. 단 `@supabase/ssr` 공식 가이드가 아직 `middleware.ts` 기준으로 작성돼 있으므로, Next.js 공식 migration 가이드와 호환 여부를 rename 후 A/B 단계 수동 검증으로 재확인 필요.

### [3-17] Multiple GoTrueClient instances 경고 — 레거시 `lib/supabase.ts` 제거
- **설명**: A 단계 브라우저 콘솔 경고 — `[browser] GoTrueClient@sb-...-auth-token:1 (2.103.1) Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key. (lib/supabase/browserClient.ts:81:37)`. 원인: M1.6 Step 1 에서 신규 `apps/web/lib/supabase/browserClient.ts` 를 도입했으나 **기존 `apps/web/lib/supabase.ts` (M1.5 이전 레거시) 가 동일 cookie storage 키에 두 번째 GoTrueClient 를 등록** → 공존 상태.
- **사유**: Supabase 공식 — 동일 storage key 에 복수 `GoTrueClient` 인스턴스가 있으면 concurrent 사용 시 undefined behavior. 현 단계 실 기능 영향 0 (A 단계 정상 통과). 기술 부채/경고 로그 오염 측면의 정리 대상.
- **출처**: M1.6 Step 1 A 단계 `pnpm dev` 실측 — 브라우저 DevTools console (2026-04-24)
- **관련**: `[3-15]` (동일 `lib/supabase.ts` 레거시 파일의 또 다른 증상) + `[3-10]` (dataService 레이어 도입 시 레거시 호출처 마이그레이션 자연 동반)
- **회수 예정**: **M1.6 Step 3** (`[3-10]` dataService 도입 + `[3-15]` English-only 스위프 + 본 건 = 레거시 파일 일괄 제거 3종 배치)
- **블록킹**: No
- **구현 힌트**: `grep` 으로 `apps/web/lib/supabase.ts` import 전수조사 → 각 호출처를 `getSupabaseBrowserClient()` (세션 경로) 또는 `dataService` (데이터 읽기 경로) 로 마이그레이션 → 레거시 파일 삭제. 삭제 후 재기동해 browser console 에 경고 사라졌는지 확인.

### [3-11] RTL dispatcher mock shape assertion 추가
- **설명**: `ChatInputBar.test.tsx` 의 `vi.mock("@/lib/actionDispatcher")` 가 입력 인자를 검증하지 않아, ChatInputBar 가 넘기는 raw 응답이 `OrchestrateApiResponseSchema` 를 만족하는지 확인 안 함. 계약 깨져도 테스트 통과.
- **사유**: code-reviewer W4 (2026-04-23, Step 4). 테스트 본래 목적(계약 증명)을 일부 놓침.
- **출처**: `docs/task-record/M1.5-complete.md` §7 code-reviewer W4
- **회수 예정**: **M1.6 Step 5** (Anthropic SDK mock 인프라 `[3-9]` 와 함께)
- **블록킹**: No
- **구현 힌트**: `vi.mock("@/lib/actionDispatcher", () => ({ dispatchOrchestrateResponse: vi.fn((raw, deps) => { expect(raw).toHaveProperty("kind"); ... return { success: true, ... }; }) }))`.

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

### [3-27] log* logger 공통 factory 추출 (3 파일 boilerplate 임계점)
- **설명**: `logChat.ts` / `logValidationFailure.ts` 가 ~90% 중복 (lazy SupabaseDataService singleton + try/catch shape + console.error). Step 3 에서 `logBehavior.ts` 추가 시 3 파일 동일 boilerplate → factory 추출 임계점 도달.
- **사유**: code-reviewer W2 (2026-04-25, M1.6 Step 2). DRY 원칙 + 유지보수 비용.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §code-reviewer W2
- **회수 예정**: **M1.6 Step 3** logBehavior.ts 추가 직전에 `createLogger<TInput, TInsert>()` factory 추출 결정
- **블록킹**: No
- **구현 힌트**: `apps/web/lib/ai/createLogger.ts` 신규. 의존성: 테이블 이름 + row mapper 함수 + service 인스턴스. 호출부는 `const logChat = createLogger<LogChatInput, ChatLogInsert>({ ... })` 식.

### [3-28] migration A-1 (DELETE) 멱등성 가드 — 운영 진입 후 재실행 위험
- **설명**: `migrations/20260425000001_m1_6_step2_logs.sql:34` `DELETE FROM log_validation_failure` 가 멱등성 없음. 로컬 reset / branch DB / 강제 재실행 시 운영 row 삭제 위험. 마이그레이션 파일 상단에 "A-1 은 dev 전용, M1.7 운영 진입 후 재실행 금지" 주석 + 옵션으로 `WHERE created_at < '2026-04-25'` 가드 추가.
- **사유**: code-reviewer W3 (2026-04-25, M1.6 Step 2). 운영 진입(M1.7) 전이라 지금은 안전.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §code-reviewer W3
- **회수 예정**: **M1.7 Step 0** (운영 진입 직전 마이그레이션 파일 상단 경고 주석 추가)
- **블록킹**: No

### [3-29] log_chat.fallback_reason DB CHECK 제약 추가
- **설명**: 현재 application enum (`OrchestrateFallbackReason`) 만 강제. 직접 INSERT / 디버깅 스크립트가 임의 문자열 적재 가능. enum 안정화 후 `CHECK (fallback_reason IN ('validation_exhausted', 'transient_error', 'upstream_error', 'timeout', 'refusal'))` 추가.
- **사유**: security-auditor W2 (2026-04-25, M1.6 Step 2). service_role 전용 INSERT 가 사실상 게이트라 즉시 위험 낮음.
- **출처**: `docs/task-record/M1.6-step2-logs-rls.md` §security-auditor W2
- **관련**: `[3-8]` (fallbackReason enum 세분화 — parse_error / schema_drift 분리)
- **회수 예정**: **M1.6 Step 4** [3-8] enum 세분화 직후 또는 **M1.7** admin migration 일괄
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

### [3-32] AI hallucinated filter field (`base_asset`) — datasource queryableFields 명시화 + Zod reject
- **설명**: 사용자 수동 검증 (2026-04-25, M1.6 Step 2 후) 시 `"show me top gaining altcoins on binance"` query 에서 AI 가 `filters: [{field:"base_asset",value:"BTC",operator:"!="},{field:"base_asset",value:"ETH",operator:"!="}]` emit. 그러나 `base_asset` 컬럼은 `symbols` 테이블에만 존재 (now_spot_ticker 에 없음) → CoinListCard filterEvaluator 가 매 row 에서 `base_asset` undefined → "NO MATCHES" 표시. AI 가 "altcoin = not BTC/ETH" 라는 합리적 추론을 했지만 실제 schema 모름.
- **사유**: registry description 에 datasource 별 queryableFields 가 명시되지 않음. AI 가 hallucinated field 사용해도 Zod 가 reject 안 함. CoinListCard 가 silent NO MATCH 로 처리해 사용자 디버깅 불가.
- **출처**: 사용자 수동 검증 (2026-04-25, M1.6 Step 2 검증 세션)
- **관련**: `[3-7]` (componentId / datasource Zod enum 승격) — 동일 군집
- **회수 예정**: **M1.6 Step 4** ([3-7] 과 함께 `@zod-schema-architect` 자문 batch)
- **블록킹**: No (현 베타에서는 사용자가 명시 query 회피 가능)
- **구현 힌트**: (1) `defaults.ts` 의 `datasourceRegistry` 각 entry 에 `queryableFields: ["last_price", "price_change_pct", "volume", "price_chg_5m", ...]` 명시. (2) `buildSystemPrompt` 에서 datasource 설명 시 이 목록 자동 주입. (3) `AiCardConfigSchema.filters` Zod 가 datasource 의 queryableFields 와 cross-validate (또는 client-side filterEvaluator 가 unknown field 발견 시 silent NO MATCH 대신 의도적 console.warn + UI 힌트). (4) 향후 `base_asset` 같은 cross-table 필터를 진짜 지원하려면 `symbols` JOIN 또는 dedicated `now_spot_ticker_with_symbol_meta` view 도입 검토 (M2+).

### [3-33] Realtime channel reuse error — `useRealtimeTable` hook channel 이름 unique 화 (M1.4 잠복 버그)
- **설명**: 동일 datasource (예: `now_spot_ticker`) 를 구독하는 카드 2개 이상 동시 mount 시 `useRealtimeTable` 이 같은 channel 이름 (`realtime:table:now_spot_ticker`) 에 새 subscribe 시도 → Supabase Realtime 거부 (`cannot add 'postgres_changes' callbacks for realtime:table:now_spot_ticker after 'subscribe()'.`). 사용자 수동 검증 (2026-04-25) 에서 첫 query NO MATCHES + 재query 정상 응답 후 발현.
- **사유**: M1.4 useRealtimeTable hook 작성 시 "동일 datasource 카드 N개 동시 마운트" 시나리오 미고려. Supabase 정책상 한 channel 에는 한 번의 subscribe.
- **출처**: 사용자 수동 검증 (2026-04-25). 위치: `apps/web/lib/hooks/_realtimeInternal.ts:63` + `apps/web/lib/hooks/useRealtimeTable.ts:156`
- **회수 예정**: **M1.6 Step 3** — **사용자 결정 (2026-04-25, Option C)**: dataService 프론트 레이어 도입 시 단일 channel 통합으로 자연 해소. 별도 hotfix commit 미발생. **Step 3 작업 순서상 dataService 통합을 ChatInputBar 리팩터링보다 먼저** 진행 (베타 차단 해소 우선).
- **블록킹**: 🟠 **M1.6 Step 3 우선순위 1번** — 베타 사용자가 동일 ticker 카드 2개 추가하면 즉시 발현
- **구현 힌트**:
  - **Option A (선택 안 됨)**: channel 이름에 카드 id 추가 → 단순하지만 N개 WebSocket 연결 발생.
  - **Option B (선택 안 됨)**: 단일 channel + ref counting (Map<channelName, Set<cardId>>).
  - **✅ Option C (사용자 채택, 2026-04-25)**: Step 3 dataService 프론트 레이어 도입 시 모든 카드가 dataService 의 단일 subscribe 를 공유. 가장 깔끔한 구조적 해결. dataService 가 카드별 callback 등록 + 자체 ref counting 으로 channel 생애주기 관리.

---

## 3.5. 🟠 M1.7 (Closed Beta Ops) — 클로즈드 베타 운영 전제 조건 (2026-04-25 신설)

> **배경**: 사용자 방침 (2026-04-25) — 클로즈드 베타 배포 전, M1 완료 로그인 구조의 4가지 구멍(공개 signup + email confirm OFF + admin 부재 + rate limit 부재) 을 전부 막는 별도 미니 마일스톤. `docs/ROADMAP.md §M1.7` 본문이 단일 진실 원천. 아래 항목은 해당 Step 과 매핑된 이월 작업 상세.

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
- **설명**: `route.ts` POST 핸들러 "0) Auth 두 겹 방어" 블록 바로 아래에 "0.5) Rate check" 추가. 오늘(UTC 00:00~) 해당 `user_id` 의 `log_chat` row count 가 `DAILY_HAIKU_LIMIT_PER_USER` (기본 100) 초과 → 429 + 영어 토스트. admin role 은 `DAILY_HAIKU_LIMIT_ADMIN` (기본 10000) 적용 — 사실상 무제한.
- **사유**: 베타테스터 1명이 실수 또는 악의로 Haiku 10,000 회 호출 시 일 수백 달러 청구 위험. 상한이 유일한 안전장치. 현 단가 ~$0.0035/call 기준 100 call/day/user = 일 $0.35, 베타 10명 × 30일 = 월 $105 상한.
- **출처**: `docs/ROADMAP.md §M1.7 Step 4` (신설)
- **회수 예정**: **M1.7 Step 4**
- **블록킹**: 🔴 **클로즈드 베타 배포 블록킹**
- **구현 힌트**: `select count(*) from log_chat where user_id = $1 and created_at >= date_trunc('day', now() at time zone 'utc')` — 인덱스 `(user_id, created_at desc)` 필수. middleware 에 올리기보단 route.ts 에 두어야 edge latency 영향 최소. 429 응답 body 예: `{ error: "rate_limit_exceeded", message: "You've reached today's query limit (100/day). It resets at 00:00 UTC.", remaining: 0, resetAt: "..." }`.

### [3.5-4] UI 사용량 고지 — "42 / 100 queries today" 상시 표시 + 429 토스트 (English-only)
- **설명**: (a) ChatInputBar 상단 또는 UserMenu 영역에 `"{used} / {limit} queries today"` 표기. 제출 성공 시마다 증가, 매일 00:00 UTC 에 리셋. (b) 429 수신 시 토스트 `"You've reached today's query limit ({limit}/day). It resets at 00:00 UTC."`. **모든 문구 영어** — `project_english_only_global` 준수.
- **사유**: 제한을 UX 투명성 없이 기계적으로 차단하면 유저가 혼란 ("왜 갑자기 안 되지?"). 미리 남은 횟수 보여주는 cooldown 표기가 투명성·신뢰 확보의 표준 UX 패턴. 투자자 관점 — 유저 교육 비용 ↓.
- **출처**: 사용자 (2026-04-25) 요청 — `docs/ROADMAP.md §M1.7 Step 4`
- **회수 예정**: **M1.7 Step 4** (rate limit 과 동일 배치)
- **블록킹**: 🔴 클로즈드 베타 배포 블록킹
- **구현 힌트**: 신규 `GET /api/usage` 반환 `{ used: 42, limit: 100, resetAt: "2026-04-26T00:00:00Z" }`. React 쪽에서 `useSWR`/`useQuery` 로 주기 refetch (예: 30초). 제출 성공 시 optimistic increment. ChatInputBar 근처 배치 시 `fixed bottom-20 left-1/2 -translate-x-1/2` 같은 subtle 위치 권장. admin 에겐 `"Admin — unlimited"` 같은 별도 문구 표시.

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

### [5-6] XSS sanitize 재검증 (M1.6 security-auditor)
- **설명**: M1.4 Step 4 에서 `sanitizeTitle` 자체 구현 (8 테스트). M1.6 security-auditor 자문으로 재검증.
- **사유**: 자체 구현 sanitizer 는 항상 공격 벡터 누락 가능. 전문가 재검증 필요.
- **출처**: `docs/task-record/M1.4-step4-final.md` §7-5
- **회수 예정**: **M1.6 security-auditor 도입 시**
- **블록킹**: No

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

## 📊 카테고리별 건수 요약 (2026-04-24 M1.6 Step 1 검증 중, 환경 경고 2건 추가)

| 카테고리 | 건수 | 블록킹 | 가장 빠른 회수 시점 |
|---|---|---|---|
| 🔴 M1.6 착수 전 필수 | **0** | — | — (M1.5 Step 4 회수 완료) |
| 🟠 M1.5 완료 기준 | **0 (전부 회수)** | — | — |
| 🟡 M1.6 auth/RLS + Zod enum 승격 + 기타 | **16** (Step 1 회수 [3-6] -1 / 이메일 부분 [3-5] 축소 / 신규 [3-12]~[3-15] +4 / A 단계 실측 경고 [3-16]/[3-17] +2) | No | M1.6 진입 중 |
| 🟠🟡 M1.5~M1.6 폴리싱 | 6 | No | M1.5~M1.6 |
| 🟢 M2+ 확장 루프 | 25 | No | M2 실측 후 |
| 🔵 Launch Readiness | 22 | No | Launch 직전 |
| ⚪ 무기한/장기 | 3 | No | 데이터 규모 임계 |
| 📋 상시 부채 (데이터 위생) | 1 | 확장 시 Yes | 매 신규 adapter |
| 💭 ROADMAP 미결정 + 사용자 피드백 | 10 | No | M1 완료 후 |
| **총계** | **83** | **0건 블록킹** | — |

---

## 🚦 현재 다음 행동 (M1.6 Step 1 완료 직후, 2026-04-24)

1. **M1.5 완료 (2026-04-23) + M1.6 Step 0.1 (2026-04-24, 긴급수정) + M1.6 Step 0 (2026-04-24, 사전 인프라) + M1.6 Step 1 (2026-04-24, Supabase Auth + middleware + 401 + UserMenu) 연속 완료**. Step 1 에서 회수: [3-6] 완전 회수, [3-5] 이메일 부분 회수 (소셜 1개는 Launch §L.1 잔존). 신규 이월: [3-12]~[3-15] (code-reviewer W3/W4/W5 + ChatInputBar 잔여 한국어).
2. **M1.6 Step 2 (로그 테이블 + RLS 일괄 — [3-1]/[3-2]/[3-3] batch) 즉시 착수 가능.** 🔴 블록킹 0건. 착수 시점 사용자 질문 필요: `log_validation_failure` 기존 5 row 의 `user_id` 백필 전략 (NULL 유지 vs dev userId 백필).
3. M1.6 Step 4 에서 `@zod-schema-architect` 자문 선행 예정: [3-7] datasource/componentId enum 승격 (대안 A vs B) + [3-8] fallbackReason 세분화 (`unauthorized`/`parse_error`/`schema_drift` 3종 추가) + [3-10] dataService 프론트 레이어 설계 = 3건 일괄 설계. 특히 [3-8] 의 `unauthorized` 는 Step 1 C1 에서 ChatInputBar 401 분기로 임시 처치했으므로 Step 4 enum 추가 시 자연 전환.
4. M1.6 Step 5 에서 [3-9] (Anthropic SDK mock 단위 테스트) + [3-11] (RTL dispatcher shape assertion) + [3-13] (auth 폼 RTL) 일괄 처리.
5. M1.6 Step 6 에서 [3-14] middleware 500 → 503 + [3-4] CI RLS 스크립트 + 완료 기준 5건 = `@security-auditor` 종합 감사 대상.
6. **M1 (M1.6) 완료 후 [9-9] 실사용 피드백 수집** → crypto-trader 관찰 5 + Q1/Q2/Q3 + Step 3d Q1/Q2 + [4-19]~[4-25] 우선순위 판단.

---

**문서 유지 규칙**: 항목 완료 시 즉시 제거 + 해당 Step task-record 에 회수 기록 링크. 신규 이월 발생 시 적절한 카테고리에 추가하고 출처 파일·회수 예정 시점·블록킹 여부를 반드시 명시.

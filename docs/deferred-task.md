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

### [3-1] `log_validation_failure` 테이블 컬럼 확장 (5→10 컬럼)
- **설명**: 현재 5 컬럼(id/query_text/ai_response/error_type/error_message/created_at) 에 다음 5개 추가:
  - `user_id UUID REFERENCES auth.users(id) NOT NULL` — 로그인 연동
  - `attempt_number INT NOT NULL DEFAULT 1` — 1차/2차 실패 구분
  - `model_id VARCHAR(50)` — haiku/sonnet 모델별 실패율 추적
  - `system_prompt_version VARCHAR(40)` — git commit SHA, 프롬프트 버전별 교정율 분석
  - `user_query_hash VARCHAR(64)` — sha256, PII 격리 + 동일 쿼리 클러스터링
- **사유**: M1.5 단계는 개발자 1명이라 5 컬럼으로 충분. M1.6 에서 `user_id` migration 이 어차피 필수이므로 **그 시점에 일괄 ALTER** 하는 것이 migration 비용·타이밍 모두 최적.
- **출처**: `docs/task-record/M1.5-step2-orchestrate-route.md` §3-B, `docs/ROADMAP.md` §M1.6
- **회수 예정**: **M1.6 Step 2** (RLS 일괄 batch)
- **블록킹**: No
- **구현 힌트**: M1.5 Step 2 에서 확장 메타를 `error_message` prefix 로 임시 인코딩하는 옵션 있음 (`[attempt=N, model=<id>, commit=<sha>]`). 채택 시 M1.6 migration 에서 백필 파싱으로 역산 가능.

### [3-2] `log_validation_failure` 에 RLS policy 추가
- **설명**: 현재 RLS 활성·policy 0개 (service_role 만 접근). M1.6 에서 `auth.uid() = user_id` 조건으로 본인 로그만 조회 가능하게 제한.
- **사유**: M1.5 에서는 service_role 만 쓰기를 해서 사용자-단위 격리 불필요. 로그인이 생기는 M1.6 부터 격리 필수.
- **출처**: `docs/ROADMAP.md` §M1.6
- **회수 예정**: **M1.6 Step 2**
- **블록킹**: No

### [3-3] `log_chat` / `log_behavior` 테이블 생성 + RLS
- **설명**:
  - `log_chat` — 사용자 쿼리·AI 응답 JSON·타임스탬프
  - `log_behavior` — 카드 클릭/드래그/삭제/저장 등 주요 이벤트 (구체 이벤트 목록은 M1.6 에서 결정)
  - 각각 `auth.uid() = user_id` RLS
- **사유**: M1 에서 축적해 두지 않으면 M2+ 에서 "Sonnet 에스컬레이션 트리거 분석" / "사용자 행동 패턴 분석" 등의 데이터 원천이 사라짐.
- **출처**: `docs/ROADMAP.md` §M1.6 산출물
- **회수 예정**: **M1.6 Step 2**
- **블록킹**: No

### [3-4] CI 빌드에 RLS 검증 스크립트 추가
- **설명**: `user_*` / `log_*` 접두 테이블 중 RLS 없는 테이블이 존재하면 빌드 실패. 간단한 SQL 스크립트로 `pg_policies` 조회 후 확인.
- **사유**: M1.4 Step 4.5 에서 "RLS enabled + policy 0개 = deny-all" 함정을 직접 겪었음. 재발 방지용 자동 검증.
- **출처**: `docs/ROADMAP.md` §M1.6, CLAUDE.md §데이터 소스 위생 원칙 #7
- **회수 예정**: **M1.6 Step 5**
- **블록킹**: No
- **구현 힌트**: GitHub Actions 에서 Supabase MCP execute_sql 로 `SELECT tablename FROM pg_tables t WHERE (tablename LIKE 'user_%' OR tablename LIKE 'log_%') AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename);` 실행 → 결과 0행이 아니면 exit 1.

### [3-5] 이메일 로그인 UI + 최소 1개 소셜 로그인
- **설명**: shadcn/UI 기반 login/logout/signup 페이지 + Google OAuth (Launch Readiness 조건).
- **사유**: M1.6 이후부터는 누가 무엇을 했는지 `log_chat`/`log_behavior` 에 쌓임.
- **출처**: `docs/ROADMAP.md` §M1.6, §L.1
- **회수 예정**: **M1.6 Step 1 (이메일) + Launch §L.1 (소셜 1개)**
- **블록킹**: No

### [3-6] 비로그인 상태 `/api/orchestrate` 401 거부
- **설명**: 현재 `/api/orchestrate` 는 사용자 검증 없이 동작. M1.6 이후 비로그인 요청 401 반환.
- **사유**: 비용 통제 + 로그 격리.
- **출처**: `docs/ROADMAP.md` §M1.6 완료 기준
- **회수 예정**: **M1.6 Step 1** (middleware 단계)
- **블록킹**: No

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

### [3-11] RTL dispatcher mock shape assertion 추가
- **설명**: `ChatInputBar.test.tsx` 의 `vi.mock("@/lib/actionDispatcher")` 가 입력 인자를 검증하지 않아, ChatInputBar 가 넘기는 raw 응답이 `OrchestrateApiResponseSchema` 를 만족하는지 확인 안 함. 계약 깨져도 테스트 통과.
- **사유**: code-reviewer W4 (2026-04-23, Step 4). 테스트 본래 목적(계약 증명)을 일부 놓침.
- **출처**: `docs/task-record/M1.5-complete.md` §7 code-reviewer W4
- **회수 예정**: **M1.6 Step 5** (Anthropic SDK mock 인프라 `[3-9]` 와 함께)
- **블록킹**: No
- **구현 힌트**: `vi.mock("@/lib/actionDispatcher", () => ({ dispatchOrchestrateResponse: vi.fn((raw, deps) => { expect(raw).toHaveProperty("kind"); ... return { success: true, ... }; }) }))`.

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

## 📊 카테고리별 건수 요약 (2026-04-23 M1.5 완료 기준)

| 카테고리 | 건수 | 블록킹 | 가장 빠른 회수 시점 |
|---|---|---|---|
| 🔴 M1.6 착수 전 필수 | **0** | — | — (M1.5 Step 4 회수 완료) |
| 🟠 M1.5 완료 기준 | **0 (전부 회수)** | — | — |
| 🟡 M1.6 auth/RLS + Zod enum 승격 + 기타 | 11 (Step 4 W1/W4 추가: [3-10]/[3-11]) | No | M1.6 진입 시 |
| 🟠🟡 M1.5~M1.6 폴리싱 | 6 | No | M1.5~M1.6 |
| 🟢 M2+ 확장 루프 | 25 (Step 4 S4 추가: [4-25]) | No | M2 실측 후 |
| 🔵 Launch Readiness | 22 | No | Launch 직전 |
| ⚪ 무기한/장기 | 3 | No | 데이터 규모 임계 |
| 📋 상시 부채 (데이터 위생) | 1 | 확장 시 Yes | 매 신규 adapter |
| 💭 ROADMAP 미결정 + 사용자 피드백 | 10 (Step 4 [9-10] 추가) | No | M1 완료 후 |
| **총계** | **78** | **0건 블록킹** | — |

---

## 🚦 현재 다음 행동 (M1.6 Step 0 완료 직후, 2026-04-24)

1. **M1.5 완료 (2026-04-23) + M1.6 Step 0.1 (2026-04-24, 긴급수정) + M1.6 Step 0 (2026-04-24, 사전 인프라) 연속 완료**. `@security-auditor` 서브에이전트 신설 (6 duty / MCP context7+supabase / Bash 의도적 제외). `@supabase/ssr` 설치 + shadcn form/label 추가 (Step 1 UI 준비 완료).
2. **M1.6 Step 1 (Supabase Auth 이메일+비밀번호 + middleware + `/api/orchestrate` 401) 즉시 착수 가능.** 🔴 블록킹 0건. 확정 사항: (a) 이메일+비밀번호 방식 (매직링크 X — Supabase 무료 rate limit 4/h 회피), (b) `apps/web/(auth)/login|signup` 신규 라우트, (c) `middleware.ts` matcher = `/api/orchestrate/:path*`.
3. M1.6 Step 4 에서 `@zod-schema-architect` 자문 선행 예정: [3-7] datasource/componentId enum 승격 (대안 A 유지 vs 대안 B 승격 결정 + Zod enum 방어선 추가) + [3-8] fallbackReason 세분화 + [3-10] dataService 프론트 레이어 설계 = 3건 일괄 설계.
4. M1.6 진입 시 [3-1]~[3-11] + [5-6] 일괄 처리.
5. **M1 (M1.6) 완료 후 [9-9] 실사용 피드백 수집** → crypto-trader 관찰 5 + Q1/Q2/Q3 + Step 3d Q1/Q2 + [4-19]~[4-25] 우선순위 판단.

---

**문서 유지 규칙**: 항목 완료 시 즉시 제거 + 해당 Step task-record 에 회수 기록 링크. 신규 이월 발생 시 적절한 카테고리에 추가하고 출처 파일·회수 예정 시점·블록킹 여부를 반드시 명시.

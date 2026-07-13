# TRAVIS — 이월 및 향후 처리 작업 대장 (Deferred Tasks)

> **작성일**: 2026-04-22 (M1.5 Step 2 완료 직후)
> **최근 갱신**: 2026-07-13 — `[10-100]` 대청소 완료 (묘비 86건+이력 → `docs/deferred-archive.md` 이관, 열린 항목 209건 + 집계표 재계산). 구 갱신 이력 원문(2026-05~07 상세)은 archive 부록 2 참조 — 이후 이 줄은 최신 1~2건만 짧게 유지하고 사이클 상세는 각 task-record 가 단일 진실.
> **집계 범위**: `docs/task-record/` 전 Step 27개 + `docs/ROADMAP.md` §Deferred Decisions + `docs/ROADMAP.md` §L Launch Readiness
> **업데이트 규칙**: 각 항목이 완료되면 **즉시 제거**하고 해당 Step task-record 에 회수 기록을 남긴다. "결정 확정 시 제거" 는 살아있는 문서의 핵심 규율.
> **✅ 회수(묘비) 규칙**: 회수된 항목은 본 문서에서 **제거**하고 전문을 `docs/deferred-archive.md` 로 이관한다 (원 섹션 표기 + 회수 커밋·task-record 링크 보존). 본문 상세의 단일 진실은 `docs/task-record/`.

---

## 0. 한 줄 요약 (비전공자용)

**집을 짓다가 "이건 아직 결정하지 말고 나중에 하자"고 노트에 적어둔 할 일 목록**입니다. TRAVIS 는 "deferred decision (지금 결정하지 않고 미루기)" 원칙을 따르므로, 각 Step 마다 의도적으로 연기한 작업이 쌓입니다. 이 문서는 그것들을 한 곳에 모아 **"언제 꺼내 써야 할지"** 를 시점별로 분류합니다.

- **🔴 지금 당장 블록킹**: 현 Step 착수 전 반드시 해결 (2026-07-13 현재 0건)
- **🟠 현 마일스톤 완료 기준**: 마무리 Step 에서 함께 해결 (§5 폴리싱 등)
- **🟡 다음 마일스톤**: 다음 마일스톤 착수 시 일괄 처리 (M1.6 잔여 / M1.7 은 외부 베타 진입 시)
- **🟢 M2+ 확장 루프**: 실사용 데이터 관찰 후 도입 (`docs/M2-plan.md §Step 2~3`)
- **🔵 Launch Readiness (§L.1~L.4)**: 실서비스 배포 시 체크리스트
- **⚪ 무기한 / 장기**: ARCHITECTURE §10 스토리지 Phase 2~3 등
- **📋 상시 부채**: 새로운 adapter 추가 시 매번 체크 (데이터 위생 9원칙, CLAUDE.md §데이터 소스 위생)
- **💭 미결정 (ROADMAP §향후 결정 + 사용자 피드백)**: 실측/관찰 후 결정 (M1 완료 후 `[9-9]`/`[9-10]` 활성화)

---

## 1. 🔴 현 Step 블록킹 (착수 전 필수 확인)

**현재 🔴 블록킹 항목 없음** (2026-07-13 대청소 시점 기준). 새 Step 착수 전 본 섹션을 반드시 확인하고, 블록킹 발생 시 여기에 즉시 등재한다.

> M1 시기 블록킹 회수 이력(`[1-1]`~`[1-3]`)은 `docs/deferred-archive.md` §1 참조.

---

## 2. 🟠 M1.5 완료 기준 — ✅ 전부 회수 완료 (2026-04-23)

> 전 항목(`[2-1]`~`[2-8]`) 회수 완료 — 전문은 `docs/deferred-archive.md` §2 참조. 상세: `docs/task-record/M1.5-complete.md`.

---

## 3. 🟡 M1.6 (인증/RLS) 도입 시 일괄 처리

> 인트로 묘비 `[3-1]`~`[3-3]`(log 테이블/RLS, 2026-04-25 회수)은 `docs/deferred-archive.md` 참조.

### [3-5] ~~이메일 로그인 UI~~ + 소셜 로그인 1개 (이메일 부분 ✅ 회수, 2026-04-24 M1.6 Step 1)
- **설명**: 최소 1개 소셜 로그인 (예: Google OAuth). 이메일/비밀번호 login/logout/signup UI 는 M1.6 Step 1 에서 완료.
- **진척 (2026-04-24, M1.6 Step 1)**: shadcn form + zodResolver + Supabase Auth `signInWithPassword`/`signUp` + UserMenu (이메일 + Log out, 우상단 fixed). 세부: `docs/task-record/M1.6-step1-auth-middleware.md`.
- **사유**: M1.6 이후부터는 누가 무엇을 했는지 `log_chat`/`log_behavior` 에 쌓임.
- **출처**: `docs/ROADMAP.md` §M1.6, §L.1
- **회수 예정**: **Launch §L.1** (소셜 1개)
- **블록킹**: No

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

### [3-54-원본] 24h Volume Leaders 도메인 결함 정공 — `quote_volume_usd` 컬럼 + worker USDT 환산
- **설명**: 2026-04-30 사용자 결정으로 **B1 description 가이드 + buildSystemPrompt default scope 단락 모두 제거** (CLAUDE.md "AI 의도 추론 공간 좁히지 마라" 원칙 정합 회복, 글로벌 타겟 + 확장성 우선). 정공은 `now_*_ticker` 에 `quote_volume_usd NUMERIC` 컬럼 신설 + worker 적재 시점에 USDT 환산 (cross-pair price 활용). USDM 의 `quote_volume` 은 이미 USDT, SPOT 의 `quote_volume` 은 quote_asset 따라 IDR/JPY/TRY 등 다양. USDT 환산 = `quote_volume × QUOTE_TO_USDT_RATE[quote_asset]`. 이 컬럼이 생기면 모든 consumer (AI orchestrator / CoinListCard / admin dashboard) 가 `ORDER BY quote_volume_usd DESC` 한 번으로 글로벌 정렬 일관 처리.
- **사유**: crypto-domain-expert 자문 (2026-04-28) + 사용자 의사결정 (2026-04-30, B1 가이드 제거 결정). registry description 가이드는 AI 의도 추론 공간 좁힘 + 신규 quote asset 추가 시 stale + 글로벌 타겟에서 fiat 페어 트레이더 차단. 컬럼 차원 정공이 단일 진실 공급원 + AI 자연어 의도 추론 ("show USDT only") 그대로 보존.
- **출처**: `crypto-domain-expert` 자문 (2026-04-28, USDM stuck 진단 동시) §Q3 정공 + 사용자 본 사고 (BTCIDR Top 1 노출, 2026-04-28)
- **회수 예정**: **M1.7 Step 7 또는 M2 초입** ([3-50] full ticker 복귀와 함께 worker 적재 정공 batch)
- **블록킹**: No (B1 임시 hotfix 로 사용자 화면 정상화)
- **구현 힌트**: (1) 마이그레이션 — `now_spot_ticker` / `now_futures_ticker` 에 `quote_volume_usd NUMERIC` 컬럼. (2) 워커 — `tickerWsHandler.handleTickerBatch` 안에서 `QUOTE_TO_USDT_RATE` 계산 (USDTIDR / USDTJPY / USDTTRY / BTCUSDT 등의 last_price 역수). (3) 환산 실패 시 `quote_volume_usd = NULL` (graceful). (4) symbols 마스터에 `is_global_quote BOOLEAN` 메타 컬럼도 함께 신설 (GLOBAL_QUOTES whitelist 데이터 레이어 분리).

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

### [3-62] `apps/web/app/api/orchestrate/route.ts` 750줄 분할 (단일 책임)
- **설명**: `route.ts` 가 750줄 — HTTP layer + AI orchestration core + dev fixture + schema bridge + token aggregation + message catalog 6 책임 혼재. CLAUDE.md "파일 하나에 너무 많이 넣지 마" 와 충돌. M1.6 Step 5 의 `orchestrateOnce` export 가 자연스러운 분할 신호.
- **사유**: code-reviewer W5 (2026-05-03, M1.6 Step 5). 동작 영향 0 — 점진적 부채.
- **출처**: `docs/task-record/M1.6-step5-test-infra.md` §code-reviewer W5
- **회수 예정**: **M1.7 또는 M2 초입** 다른 ai/orchestrate 영역 작업과 묶음
- **블록킹**: No
- **구현 힌트**: 권장 분할: `apps/web/lib/ai/orchestrate/{orchestrateOnce,inputSchema,extractPayload,forcedInvalid,messageForReason,tokenAggregation}.ts` + `apps/web/app/api/orchestrate/route.ts` 는 POST 핸들러만 (~200줄). import 경로는 alias `@/lib/ai/orchestrate/...` 로 통일.

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

## 3.8. 🟡 M1.8 (선물 데이터 카탈로그 완성) — ✅ 마일스톤 완료 (2026-05-28) — 잔여 이월 항목만

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

### [8-28] collector-history 유지보수 부채 3건 (M1.9 Step 1 code-reviewer W1/W2/S1)
- **설명**: 순수 추출 부산물 유지보수 항목. (W1) `withTimeout` 이 worker(`utils/withTimeout.ts`) + collector-history(`index.ts` 인라인) 2벌 — `@travis/shared` 통합 후보. (W2) `supabase.ts`/`dataService.ts` worker↔collector 2벌 복제 — 옵션 변경 시 silent drift 위험, 3벌째(거래소 추가) 생기면 추출 검토. (S1) worker `types.ts` 의 collectors 타입 re-export = 한시적 호환 레이어 — 어댑터를 점진적으로 `@travis/exchange-collectors` 직접 import 로 전환 시 제거.
- **카테고리**: 🟢 M2+ (거래소/소스 추가 시 자연 통합) — W1 은 Step 2 forward-fill 실 fetch 시작 시 통합 적기.
- **출처**: `docs/task-record/M1.9-step1-collector-infra.md §7` + code-reviewer M1.9 Step 1 (2026-06-02).
- **블록킹**: No

### [8-22] backfill 대량 루프 sanity warn 로그 집계 (code-reviewer W3)
- **설명**: `warnIfRatioOutOfRange` / basis warn 이 행 단위 console.warn. Step 4 backfill(608심볼 × 9 interval × 최대 500행)에서 LSR 구조적 극단 종목 다수면 수천~수만 줄 warn 폭발 → 진짜 이상이 묻힘.
- **출처**: code-reviewer M1.8.5 Step 3 W3 (2026-05-31). `project_volume_chg_5m_ui_policy` 계열 "극단값 알리되 노이즈 억제" 정합.
- **★ 관련 (2026-06-07)**: `[8-34]` 가 COINM 상한을 20 으로 올려 *현재* false positive 40% 를 제거했으나, 본 항목(행 단위 warn 폭발의 집계/샘플링 구조)은 여전히 미해결 — 같은 함수(`warnIfRatioOutOfRange`) 대상. COINM 신규 저유동 상장으로 LSR>20 정상값이 다수 생기면 다시 폭발 가능. 두 항목 동시 검토 권장.
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

### [8-27] 확장성 감사 — registry/worker 구조적 빚 6건 (2026-06-01 `@backend-infra-specialist` + `@zod-schema-architect`)
- **설명**: M1.9 진입 전 사용자 질문("다양한 거래소 + 다양한 데이터 소스 추가 시 확장 용이한가?")에 대한 2-자문 감사 결과. 빚 6건 식별. **M1.9 무관** (단일 거래소 forward-fill 에선 6건 모두 발현 X) — 각 빚은 해당 기능 추가 Step 에서 회수. 지금은 "가시화 기록"만 (미리 추상화 = YAGNI 위반).

| # | 빚 | 위치 (file:line) | 회수 시점 |
|---|----|------|-----------|
| 1 | datasource id = Supabase 테이블명 강결합. **✅ `table` 분리 회수 (M2 테마 A Step 1, 2026-06-09)** — `DatasourceEntrySchema.table` + `resolveDatasourceTable` 로 논리 id↔물리 테이블 분리, dataService 가 resolve. **잔여 = `fetchKind`** (supabase_table vs external_api 구분, 외부 API 소스/뉴스·매크로 수용용 — 비-거래소 소스 추가 Step). 단일 진실 `task-record/M2-themeA-card-expressiveness.md §3` | `datasourceRegistry.ts` (회수) / 외부 fetch 분기 (잔여) | 잔여 `fetchKind` = 비-거래소 데이터 소스 추가 Step |
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
- **proper fix**: ~~ⓐ 프로세스 전역 `/futures/data` token-bucket~~ ✅ **회수 (2026-06-05)** · ~~ⓑ AbortSignal 협조적 취소~~ ✅ **회수 (2026-06-05)** · ~~ⓒ per-metric lastCallAt~~ ✅ **회수 (2026-06-05)** · ⓓ circuit breaker / maxRetries 하향 (잔여, 📋).
- **★★ basis `-1003` 근본 메커니즘 확정 + "구조 해소" 표현 정정 (2026-06-06, crypto-domain-expert 공식 docs + 라이브 smoke)**: 라이브 24h **1171회**(100% basis) 지속 → 추적 결과 **우리가 못 고치는 Binance 측 현상**으로 확정. ① fapi `/futures/data/basis` **weight=0** (과거 자문 "weight 1" 은 dapi 기준 → fapi 정정, `X-MBX-USED-WEIGHT-1M` 헤더 미반환으로 라이브 입증). ② `-1003` 의 `2400 req/min` = **REQUEST_WEIGHT 풀** (raw 요청 수 아님 — fapi exchangeInfo 에 RAW_REQUESTS 한도 부재). ③ `10.119.x.x` = RFC1918 사설 IP = **Binance 내부 LB 노드** (우리 공인 IP 49.13.138.121 아님, 매 에러 가변). → **-1003 = 그 순간 우리를 받은 Binance LB 노드 weight 풀이 타 트래픽 합산으로 순간 포화. 우리 위반 아님(basis weight 0 → 우리 기여 ≈0). ⓐ token-bucket 으로 30/min 지켜도·줄여도 근절 불가 — backoff 흡수가 정공.** ~~"ⓐ token-bucket 으로 구조 해소"~~ 표현은 **"ⓐ 는 catch-up burst 완화일 뿐, basis -1003 자체는 Binance 측 원인이라 근절 불가, graceful backoff 가 흡수(데이터 무해)"** 로 정정. 24h 1171회 = **무해 소음**(G2 BTC/ETH/COINM site=DB 소수점 일치가 증명). ⓓ circuit breaker 도 basis -1003 을 못 막음(Binance 측) — ⓓ 는 일반 복원력 항목으로만 정당. crypto-domain memory: `project_m1_9_basis_1003_mechanism.md`.
- **✅ ⓐ 회수 (2026-06-05, Step 2)**: `FuturesDataRateLimiter` 신설 (`packages/exchange-collectors/src/core/futuresDataRateLimiter.ts`) — 순수 TokenBucket 2개(통계 5종 **150/min** + basis **30/min** 별도 버킷, path 로 구분) + 프로세스 전역 싱글톤. `binanceFetch` opts `rateLimiterGroup?` 미지정 시 비활성.
  - **★ opt-in 설계 (worker 보호)**: client.ts 는 worker·collector 공유 코어. worker now-poller(perSymbolTask)가 `/futures/data` 를 순간 ~1200 req/min 사용 → 전역 적용 시 worker now_* 신선도 파괴. → collector fetcher 12개(USDM 6+COINM 6)만 `"collector"` opt-in, worker 무영향(W1 fetch-mock 테스트가 "group 미지정→토큰 불변" 직접 단언).
  - **S1 자동 해소**: basis 전역 단일 버킷이 path(`/futures/data/basis`)로 USDM·COINM basis 합산 통제 → 이전 task별 독립 클로저 문제 구조 소멸.
  - **검증**: worker **122 test(+12)** 회귀 0 · type-check 6패키지 · code-reviewer 0 Critical(W1 분기 테스트/W2 이중대기 주석/W3 reset export/S1 capacity 가드 반영).
- **✅ ⓒ 회수 (2026-06-05, Step 1)**: `PerMetricThrottle` 신설 — 공통 floor 전역 1개 + basis 2400ms metric별 Map. **★ 실측 정직성**: lag 개선 ~14%뿐, 주범은 "심볼수×metric÷reqPerMin = cycle 하한" 폴링 구조 → 사용자 lag 1~3h 허용 결정(실시간 5m=now_* 카드). worker 110 test 회귀 0.
- **✅ ⓑ 회수 (2026-06-05, Step 3)**: `executeHistoryBackfill` AbortSignal 협조적 취소. `abortableSleep` 신설(abort 시 reject 아닌 graceful resolve) + `TokenBucket.acquire(signal?)`/`RateLimiterClock.sleep(signal?)` 확장 + interval/symbol/page 3경계 `aborted` 체크→graceful return(부분 결과, throw 0) + signal 을 `HistoryFetchWindow` 에 실어 12 fetcher 시그니처 보존 + collector index.ts `AbortController`(`poller.stop()` 전 `abort()` 발사) + `.service` `TimeoutStopSec 180→30`. **라이브 동기**: 06-05 07:01 재배포 시 SIGKILL `Failed` 실측. worker **130 test(+8)** 회귀 0 · code-reviewer 0 Critical. **★ 관찰 포인트(S1 워스트케이스)**: `retryOnTransient`(upsert 재시도)는 abort 미인지 → 라이브에서 30초 SIGKILL 재발 시 upsert retry 경로 1순위 의심(정상 Supabase 면 무관).
- **잔여 (다음 — shutdown 품질·복원력, COINM 차단 사유 아님)**: ⓓ circuit breaker/maxRetries 하향. 부수 W3(코어 `coinmSymbolToPair` 직접 import)/Step3-W4(STAGGER group-relative).
- **★ ⓓ 재평가 (2026-07-12, [10-35] 사이클 3 Step 5)**: ⓓ 는 **별개 복원력 축으로 존치 확정** — 레버 1(예산 분할 제거)과 무관하고, basis -1003 은 Binance 측 원인이라 circuit breaker 로도 못 막음(위 2026-06-06 판정 유지). 일반 복원력 항목(📋)으로만 정당, 신선도 사이클에서 회수하지 않음.
- **출처**: `docs/task-record/M1.9-step2-forward-fill.md §2-E` + `docs/task-record/M1.9-step3-rollout.md`(라이브 실측 + 즉효 fix + ⓐⓑⓒ/[8-33] 회수).
- **카테고리**: 🟠 현 마일스톤 완료 기준 (ⓐⓑⓒ ✅ 회수 — COINM 롤아웃 전제 충족) / ⓓ circuit breaker 만 잔여(📋, COINM 차단 사유 아님).
- **블록킹**: No (ⓐⓑⓒ + 즉효 fix + 반응 backoff 로 USDM 가동 가능, production 무관)
- **관련**: `[8-10]`(weight dispatcher) / `[8-27]`(거래소 2개째 시 futuresDataRateLimiter 도 path 하드결합 추상화 동반 — code-reviewer S2) / `feedback_binance_futures_data_ip_quota`

### [8-32] COINM 분기물(dated) history + forward-fill 활용 시나리오 (crypto-trader advisory 2026-06-04)
- **설명**: M1.9 forward-fill scope=COINM PERPETUAL 만 (분기물 BNBUSD_260626 제외). crypto-trader advisory:
  - **분기물 basis 비대칭**: 무기한 baseis ≈ 펀딩(정보량 적음), cash-and-carry/캐리 트레이딩의 본질은 **분기물 basis**. COINM 분기물 history 제외 시 이 신호 누락. 사용자가 COINM 분기물을 실제 거래하는지가 결정 핵심 (제품 판단 = 사용자 권한).
  - **활용 시나리오 high-value** (M2 카드 입력 우선순위): ① OI 추세 + 가격 다이버전스, ② LSR 극단값 역추세. 이 둘이 압도적.
  - 순차 롤아웃 시 COINM 빈 기간 "준비 중 vs 고장" 침묵 오해 관찰 포인트.
- **사유**: 전부 advisory (제품 판단 사용자 몫). M1.9 차단 사유 아님. M2 카드 scope 확정 시 `@roadmap-milestone-manager` 로.
- **출처**: `.claude/agent-memory/crypto-trader/project_m1_9_forwardfill_review.md` + `docs/task-record/M1.9-step2-forward-fill.md §2-E`.
- **카테고리**: 🟢 M2+ 확장 루프 (실사용 피드백 트랙)
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

## 10. 🟢 실사용 피드백 — M2 테마 (2026-06-08 세션 #1 신설)

> **단일 진실 = `docs/task-record/M2-step2-usage-feedback.md` §H** (6건 코드·DB 확정 진단 + 테마 A~D + 진행 모델). 본 섹션은 **검색용 1줄 요약 + 테마 매핑**. 진행 모델 = 확장 루프(백로그 + 테마 단위 한 번에 하나 착수 + 실사용 병렬). **▶ 다음 = 테마 A 착수** (A-1, 사용자 2026-06-08).

### [10-4] 차트 timeframe/지표 매번 설정 → 유저 프리퍼런스 — 테마 C
- **근본**: `buildSystemPrompt` 에 user preference 주입 메커니즘 0 (locale 만). ⚠️ TradingView 기본 iframe studies(MA) 주입 제한 → Advanced Chart 위젯 업그레이드 선결 가능. PRD §5 좌/우 패널과 묶음(사용자 요구).
- **★ scope 추가 (2026-06-12, 테마 B Q1 사용자 결정)**: **기본 quote 스코프도 프리퍼런스 영역** — "top gainers 의 기본 quote(USDT 등)" 를 description 단서로 박는 건 보편 유저 가정 = 소프트 하드코딩으로 기각.
- **★ 설계 확정 (2026-06-16, 사용자)**: 프리퍼런스 = **enum 선택지 아니라 자유 텍스트 "Custom Instructions"**(ChatGPT식). enum 은 향후 데이터소스/컴포넌트 확장마다 손봐야 하고 AI 의도추론 공간 죽임. 자유 텍스트 + 인젝션 5겹 방어(구분/프레이밍/우선순위/탈출차단/출력단 Zod 백스톱/본인세션 폭발반경). `preferences.customInstructions`(string) 1키로 시작. 상세 = `M2-themeC-ui-shell.md §5`.
- **회수 예정**: 테마 C Step 4 (Saved Views v2 다음). **블록킹**: No.

### [10-5] 코인 로고 표시 — 테마 D (흡수)
- **근본**: 로고 데이터/표시 없음. crypto-trader: 티커 1차 식별자·로고 보조/장식. UI-3 흑백 충돌 + 1400심볼 누락/CDN 리스크 → grayscale + 모노그램 fallback. **로고 URL = CoinGecko/CMC 메타데이터 동반**.
- **회수 예정**: 테마 D 또는 CoinGecko 데이터소스 추가 시. **블록킹**: No.

### [10-6] crude oil 등 비크립토 차트 거부 — 테마 D
- **근본**: GUARDRAILS "no datasource fits → cards:[] + notes" + tvSymbolMap 크립토 4거래소만(`EXCHANGE_PREFIX`). ★ TradingView 자체는 `TVC:USOIL`/`SPX`/DXY 지원 → "passthrough"(차트는 datasource 불필요)로 확장 가능. PRD 비전(크립토 타겟) scope 논의 필요.
- **회수 예정**: 테마 D (F6). **블록킹**: No.

### [10-10] 카드 `defaultSubtitle` marketType raw enum 노출 + 기존 카드 한국어 stub — 일괄 cleanup
- **근본**: (a) IndicatorCard/TickerCard 의 `defaultSubtitle` 이 `config.subtitle` 없을 때 `futures_usdm` 같은 raw enum 을 그대로 join 노출(글로벌 톤 부적합, AI 가 보통 subtitle 채워 빈도 낮음). (b) TickerCard/CoinListCard 의 LoadingStub 한국어 "연결 문제 가능…" 잔존(English-only 위반 — IndicatorCard 는 Step 2 에서 영어화 완료). 출처: code-reviewer W4/S3 (M2 테마 A Step 2, 2026-06-09).
- **해결 힌트**: `marketType → "USDⓜ Perp"` 류 라벨 맵 공통 헬퍼 + 3 카드 일괄 적용. 일관성 위해 한 번에.
- **회수 예정**: 테마 A Step 5(통합) 또는 별도 cleanup. **블록킹**: No.
- **카테고리**: 📋 상시 부채

### [10-12] WS 연결 관리 코드 3중복 (BaseWsConnection 추출) + coalescer rule 선형 탐색
- **근본**: `BinanceWsRelay` / `BinanceKlineRelay` / `BinanceChunkedRelay`(Step 2.5 신설) 가 연결 라이프사이클(재연결 backoff / stale 감지 / firstMessage watchdog / graceful stop) 코드를 3중복. CLAUDE.md "3번째 출현 시 제네릭화" 기준 도달 — 단 incident 수정 중 무사고 kline relay 불변 유지가 우선이라 의도적 보류 (YAGNI 원칙, `reference_travis_extensibility_audit`). 부수: `StreamCoalescer.ingest` 의 rule `find()` 선형 탐색은 메시지당 반복 (rule 3개라 현재 무해, 스트림 종류 증가 시 누적).
- **해결 힌트**: BaseWsConnection 공통 추출 + suffix 매칭 구조화. 출처: code-reviewer W2/W4 (Step 2.5, 2026-06-10) + `BinanceChunkedRelay.ts` 헤더 주석.
- **회수 예정**: 거래소 2개째 WS 추가 또는 다음 WS 구조 작업 시. **블록킹**: No.
- **카테고리**: 🟢 M2+ (구조 부채)

### [10-14] Binance WS 공급자 정책 감시 — dstream(COINM)·spot (⚡ 2026-07-06 1차 적중·대응 완료)
- **근본**: `[10-11]` 재규명(incident doc §10) — USDM 은 2026-04-23 레거시 WS URL 폐지로 `/market` 이전 완료. COIN-M(dstream)·spot 은 레거시 URL 사용 중 — 공급자 정책 변경 감시 대상.
- **⚡ 1차 적중 (2026-07-06, ff#2 Step 6 라이브 발견)**: **Binance CM migration**(change-log 2026-06-10, effective **2026-06-30**) 으로 dstream `!forceOrder@arr` 가 **UM+CM 병합 스트림**化 → COINM 라벨 오염 21.9만 행. 당일 규명(crypto-domain — 신규 `st` 필드 1=UM/2=CM 권위 판별자)·**2단 가드 배포**(st 우선+교차 멤버십 폴백, `b946eb4`)·오염 220k DELETE·재오염 0 실측. 상세 = `M2-pathA-ff2-liquidation.md` 헤더+§4.
- **잔여 감시**: ① CM migration 이 **다른 dstream @arr 스트림**(miniTicker/markPrice — 현재 COINM 수집 경로!)에도 병합을 확대하는지 — 확대 시 tickerWsHandler 등도 st 류 판별 필요 ② spot 레거시 URL 폐지 공지. WS 작업 시마다 + 분기별 체크.
- **회수 예정**: 공지/증상 발견 시 즉시. **블록킹**: No. **카테고리**: 📋 상시 부채 (데이터 위생 — 공급자 endpoint 정책 감시)

### [10-16] `now_futures_indicator` 동일 row 다중 task 동시 update 경합 (deadlock 무대)
- **근본**: 2026-06-11 사고 중 deadlock 의 무대 = relation 18692 (`now_futures_indicator`). production worker 의 markPrice WS coalescer(1초) + OI/LSR/taker/basis 폴링 task 들이 **같은 심볼 row 의 다른 컬럼**을 병렬 update — DB 가 빠를 땐 무사고, IO 고갈로 트랜잭션이 느려지면 row lock 대기 → deadlock 연쇄 (2차 증상). `feedback_concurrent_upsert_deadlock` 규율(단일 task 내 순차 await)로는 task 간 경합을 못 막음.
- **해결 힌트**: 발현 조건이 "DB 이미 비정상" 이므로 근본 우선순위는 [10-15]. 완화 후보: task 간 phase 시차(jitter) / 컬럼군별 update 묶음. 과설계 주의 (정상 상태에선 무해).
- **회수 예정**: deadlock 재관측 시. **블록킹**: No.
- **카테고리**: 🟢 M2+ (관측 기반)

### [10-17] Supabase Disk IO 운영 관측 루틴 + Medium 업그레이드 판단 기준
- **근본**: 2026-06-11 사고 — Nano(0.5GB) 시절 Disk IO Budget 이메일 경고를 임계 전 신호로 활용 못 함. Small(2GB) 업그레이드 완료(실질 +$5/월) 했으나 burst 형이라 영구 보장 아님.
- **해결 힌트**: Dashboard → Reports → Database 의 "Disk IO % consumed" 일/시간 그래프를 주요 배포 후·주 1회 확인. **Medium($60/월) 판단 기준**: [10-15] 회수 후에도 Disk IO consumed 70%+ 가 반복되면 상향. 이메일 경고 수신 = 즉시 세션에서 진단 (이번 사고 재현 절차: incident doc §대응).
- **회수 예정**: 상시 운영 루틴. **블록킹**: No.
- **카테고리**: 📋 상시 부채 (운영 관측)

### [10-18] `useSymbolMetaBulk` — 리스트 카드 심볼 메타 라벨 + funding interval 정규화
- **근본**: 테마 A Step 3 결정 — IndicatorListCard 는 심볼메타(funding interval 라벨/tickSize) 생략 (무라벨 fallback, YAGNI). N 심볼 bulk 조회(`in` 쿼리)는 정렬 변동마다 재조회 트리거 관리가 복잡해 보류. 도메인 동반 이슈: 1h-interval 코인 funding 을 8h 코인과 단순 정렬하면 기간 왜곡 — interval 정규화는 bulk meta 없이는 불가 (같은 묶음).
- **회수 예정**: 리스트 메타 라벨 필요 신호(실사용) 발생 시. **블록킹**: No. **카테고리**: 🟢 M2+

### [10-19] table hook `watchColumns` 확장 (리스트 fan-out 절감)
- **근본**: `useDataServiceTable` 은 watchColumns dirty check 없음 — 500ms throttle 가 상한 (CoinListCard 1,400행 검증 패턴). indicator 리스트 descriptor 의 watchColumns 는 현재 Step 4 flash 기준으로만 소비. 실기기(UHD 620) 다중 리스트 카드 jank 관측 시 table hook 에도 watchColumns flush 억제 검토 (code-reviewer Step 3 W2).
- **회수 예정**: jank 실측 시. **블록킹**: No. **카테고리**: 🟢 M2+ (관측 기반)

### [10-20] FLIP `<tr>` transform WebKit 한계 + indicator 카드 value/content 변별 관찰
- **근본**: ① `<tr>`(table-row) transform 은 WebKit(Safari) 미지원 가능 — 미동작 시 모션만 소실 (기능 무손실 graceful). 대응은 리스트 행 grid 전환 (마크업 변경, frontend 자문 2026-06-11). ② indicator-card(value) vs indicator-list-card(content) 가 같은 5 datasource 공유 — schema 로 둘 다 valid, 변별은 description/updateMode 뿐. AI 1차 출력이 단일/리스트 의도를 정확히 가르는지 라이브 관찰 (zod-schema-architect W1).
- **회수 예정**: ① Safari 지원 결정 시 ② 실사용 중 오선택 관측 시. **블록킹**: No. **카테고리**: 🟢 M2+ (관측 기반)

### [10-23] symbols 동기화 잔여 — 신규 상장 즉시 반영 단계 + 사라진 row 잔존 처리 — **1단계 ✅ 회수 (2026-06-12)**
- **근본**: ① ~~현 구조(부팅 1회 + 24h 주기)는 신규 상장 반영이 최대 ~24h 지연~~ → **1단계 회수로 ≤1h 단축**. ② 신규 심볼의 WS(markPrice 1초/ticker/forceOrder) 구독은 워커 재시작까지 대기 (부팅 스냅샷 정책) — 그 사이 REST 폴링(premiumIndex 30m)만. ③ syncSymbolsTask 는 upsert 만 — exchangeInfo 응답에서 **완전히 사라진** 심볼 row 가 옛 status 로 잔존 가능 (보통 SETTLING/CLOSE 전이를 거쳐 잡히지만 즉시 제거 케이스 빈틈).
- **신규 상장 즉시 반영 단계별 옵션 (사용자 질문 2026-06-11, 전부 가능 — 비용/규모 순)**:
  - **1단계 ✅ 회수 (2026-06-12, 사용자 결정 — 테마 B 워커 배포 동반)**: sync 주기 24h→1h (`syncSymbolsTask.ts` INTERVAL_MS/initialDelayMs + 주석·테스트·fundingInfoTask 로그 메시지 정합, worker 169 test PASS). 실측 근거: 06-12 관측에서 신규 상장 심볼이 fundingInfoTask DB sync 에서 **11시간 skip 지속** 후에야 24h cycle 로 회수됨. weight 10×3/h 무시 수준. 최대 지연 ≤1h.
  - **2단계 (~1h 작업, 수 분 내)**: 이벤트 트리거 — ticker24hrBatchTask(1분 주기)가 전체 배치 응답에서 **allowlist 밖 낯선 심볼**을 이미 만나고 있음(현재 필터로 버림) → 발견 시 syncSymbols 즉시 실행. 최대 지연 ~1-2분 (DB 등재 + REST 폴링 개시).
  - **3단계 (중간 규모)**: ChunkedRelay 증분 구독 API — 재시작 없이 신규 심볼 WS 1초 실시간 합류. 2+3 묶으면 "상장 수 분 내 풀 실시간". 트레이더 가치 큼 (상장 직후 funding/변동성 극단).
- **해결 힌트(③)**: 응답 심볼 집합 ↔ DB diff → 미존재 row status='CLOSE' 마킹. **통합 출처**: `[3-56]` (2026-04-30 트레이더 인사이트 — 상폐빔/신규상장, 2026-06-12 본 항목으로 통합. 잔여: worker in-memory allowlist refresh 24h 도 ②와 동반 단축 검토). **회수 예정**: 사용자 우선순위 결정 시 (2+3 은 WS 작업 동반). **블록킹**: No. **카테고리**: 🟢 M2+ (2·3단계)

### [10-24] `not_in` / `!=` 서버 pushdown — "exclude fiat" 1-clause 표현력
- **근본**: 테마 B 는 `"="`(string)/`"in"` 만 서버 pushdown — `!=` 는 클라이언트 전용이라 limit(500) 윈도우 절단에 노출. `not_in` 은 FilterClauseSchema 자체에 없어 "exclude fiat" 이 `!=` AND 체인으로만 표현 가능 (신규 regional fiat 추가 시 누락 취약).
- **crypto-trader (2026-06-12)**: 실질 갭 작음 — 트레이더는 "뺄 것" 이 아니라 "볼 것"(USDT/USDC in 양수 화이트리스트) 을 지정. 현 설계 지지.
- **해결 힌트**: FilterClauseSchema 에 not_in 분기 + `.not("col","in",...)` / `.neq()` pushdown. 출처: 테마 B (`M2-themeB-quote-asset.md §6`). **블록킹**: No. **카테고리**: 🟢 M2+ (실사용 욕구 관측 시)

### [10-25] registry Operator enum ↔ FilterClauseSchema 이중 진실 불일치 (contains/not_in drift)
- **근본**: `datasourceRegistry.ts` OperatorSchema 엔 `not_in`/`contains` 가 있으나 `FilterClauseSchema` 엔 없음 → registry 에 선언하면 AI emit → schema reject 함정. 테마 B 는 ticker quote_asset 에서 수동 회피했으나 **`symbols_meta.quote_asset` 의 `contains` 는 잔존** (defaults.ts:408). 출처: code-reviewer W2 (테마 B, 2026-06-12).
- **해결 힌트**: (a) 두 enum 단일 진실화 또는 (b) registerDatasource 시 "FilterClauseSchema 지원 operator 만" superRefine 가드 — `@zod-schema-architect` 위임 후보. `feedback_zod_string_not_defense` 와 같은 뿌리 (선언만으로 방어선 아님). **블록킹**: No (self-correction 이 흡수). **카테고리**: 🟢 M2+ (다음 registry/schema 작업 동반)

### [10-27] `enrichTickerRow` early-return 의 pre-compute key 비균일 — mixed-batch 잠재 위반 점검
- **근본**: price/volume 비정상 row 는 pre-compute 8 key 없이 반환, 정상 row 는 merge — 같은 배치에 15-key/23-key 혼재 가능 (tickerWsHandler.ts enrich 단계. 테마 B 의 quote_asset 은 normalize 단계라 무관). production 가동 중 무사고 → upsert 가 비균일 key 를 어떻게 처리하는지(defaultToNull) 확인 후 무해 판정 또는 empty pre-compute merge 로 균일화. 출처: 테마 B Plan 검토 + code-reviewer W3 (2026-06-11~12). `feedback_mixed_batch_invariant` 직결.
- **블록킹**: No. **카테고리**: 🟢 M2+ (다음 worker ticker 작업 동반)

### [10-28] quote_asset NOT NULL 승격
- **근본**: 테마 B 는 NULL 허용으로 출시 (ticker24hrBatchTask partial 선INSERT + 구워커 과도기 보호). 신워커 안정화 후 NOT NULL 승격 가능 (backfill 고아 0건 실측이라 데이터 청소 불필요).
- **블록킹**: No. **카테고리**: ⚪ 무기한 (실익 작음 — evaluateFilters null→false 안전)

### [10-29] `now_futures_indicator` 에 quote_asset 확장 — funding/OI 랭킹 USDC 분리
- **근본**: 테마 B 는 ticker 2테이블만 — indicator 랭킹엔 USDC 38페어가 USDT 와 혼합. **crypto-trader (2026-06-12): "거슬리는 수준"** — BTCUSDC/BTCUSDT 별개 funding 사이클이라 같은 코인 2줄 중복 + 얇은 USDC OI 극단값이 군중쏠림 오독 유발.
- **★ 사용자 라이브 판정 (2026-06-12 G2 ⑤)**: "highest funding rates" 실화면에서 **"안 거슬림"** → 승격 불필요 확정, 🟢 유지. crypto-trader advisory 와 실사용 체감이 갈린 사례 — "M1 완료 후 사용자 피드백 원칙" 대로 실측이 우선.
- **해결 힌트**: 테마 B 와 동일 패턴 (컬럼 + backfill + lookup 적재 + queryableField). ⚠️ `[10-16]` deadlock 무대라 쓰기 경로 추가 신중 (markPrice coalescer 단일 경로에만 적재 검토). 출처: 테마 B 설계 결정 + crypto-trader Q2 (2026-06-12). **블록킹**: No. **카테고리**: 🟢 M2+ (실사용 랭킹 오독 관측 시 🟡 승격)

### [10-30] ticker24hrBatchTask 하향·제거 재검토 — COINM ticker full 승격 선결
- **근본**: USDM·spot 은 Step 2.5 chunked `@ticker` full 승격으로 24h 변화율이 WS 로 채워져 REST 1분 batch 가 중복. 단 **COINM 은 `!miniTicker@arr`(6필드) 잔류라 24h 변화율(P/p/w/n/O/C)을 이 task 만이 채움** — 제거 시 COINM 카드가 Binance 사이트와 어긋남 (위생 #9 위반). **2026-06-12 사용자 판단: 현행 유지** (1분 cycle 2.5초, 호출 3건 — 비용 미미. 신규상장 row 선점 INSERT 가 quote_asset NULL 허용 `[10-28]` 사유와도 연동).
- **해결 힌트**: COINM 을 chunked full 로 승격(또는 `!ticker@arr` full 전환)하는 작업과 동반 회수 — 그때 (a) task 완전 제거 또는 (b) 안전망으로 10분 하향 중 택1. `[10-28]` NOT NULL 승격과 연동 인지.
- **회수 예정**: COINM WS 구조 작업 시. **블록킹**: No. **카테고리**: ⚪ 무기한 (실익 작음)

### [10-31] worker TierPoller in-flight task AbortSignal 미전파 — restart 마다 30s 대기 + SIGKILL
- **근본**: 2026-06-12 테마 B 배포 재시작에서 실측 — WS 27연결은 1초 내 code=1000 graceful 종료됐으나 `[TierPoller] stopping: 1개 진행 중 작업 완료 대기` 가 30s(`TimeoutStopSec=30`)를 소진 → systemd `State 'stop-sigterm' timed out. Killing` → **SIGKILL**. 원인 = perSymbolTask 등 장주기 cycle(~11분)이 AbortSignal 없이 완주 대기. `[8-31]`ⓑ 는 **collector 에만** AbortController 를 심었고 worker poller 는 미적용 (M1.9 검증의 "1초 graceful 2회"도 collector 측이었음).
- **영향**: 데이터 손상 0 (멱등 upsert cycle 중단 — 다음 cycle 재기록). restart 마다 30s 지연 + SIGKILL 노이즈만.
- **해결 힌트**: collector 패턴 이식 — worker index.ts AbortController + TierPoller/태스크에 signal 전파 + fetch 경계 graceful return. 출처: 게이트 ② 배포 실측 (2026-06-12). **블록킹**: No. **카테고리**: 🟢 M2+ (다음 worker 구조 작업 동반)

### [10-32] COINM delivering 8심볼 REST 실패 노이즈 — allowlist status 가드 점검
- **근본**: COINM perSymbol REST(OI/LSR/taker)가 APEUSD_PERP/GALAUSD_PERP/ICXUSD_PERP 등 8심볼에서 `-4108 Symbol is on delivering or delivered or pre-trading` / empty array 로 매 cycle 실패 (배포 전 26h 에 77회 — 기존 현상, graceful skip 정상). Binance COINM 상장폐지 진행 페어로 추정.
- **해결 힌트**: ① symbols.status 가 DELIVERING/CLOSE 로 전이됐는지 vs exchangeInfo 가 여전히 TRADING 으로 보고하는지 확인 ② 전자면 COINM perSymbol task 의 allowlist 필터 적용 누락 점검 (위생 #2), 후자면 -4108 응답 시 해당 심볼 일시 제외 캐시. `[8-22]` warn 집계와 동반 회수 후보. 출처: 게이트 ② 배포 검증 (2026-06-12). **블록킹**: No. **카테고리**: 🟢 M2+ (노이즈만, 데이터 영향 0)

### [10-36] S4 조건부 upsert (dead tuple 근본 차단) — retention 후 추세 관측 판단
- **근본**: forward-fill 멱등 재쓰기가 dead tuple 생성 (`[10-15]` ②). S1(lookback 2→1) + S3 retention + autovacuum 으로 S3 직후 dead tuple **148만→7만** 양호. S4(`INSERT ... ON CONFLICT DO UPDATE ... WHERE existing.* IS DISTINCT FROM excluded.*` RPC, dataService 내부 구현만 교체·시그니처 불변)는 생성 자체 원천 차단이나 현재 불필요 가능성 높음(backend 예측).
- **판단 기준**: 며칠 dead tuple/live 비율 추세 관측 → 상시 높으면(예: 20%+ 지속) S4 적용, 낮으면 폐기. ⚠️ RPC 전환 시 mixed-batch 불변(`feedback_mixed_batch_invariant`) RPC 내 재현 필수.
- 출처: M2 retention S4 보류 (사용자 결정 2026-06-13). 단일 진실 `docs/task-record/M2-history-retention.md`. **블록킹**: No. **카테고리**: 🟢 M2+ (관측 기반)

### [10-37] `history_futures_indicator` 디스크 즉시 축소 (table_total 미반환분) — 선택
- **근본**: S3 retention DELETE 는 공간을 OS 반환 않고 재사용 표시 → `table_total` 2287MB 유지(평형엔 충분, 더 안 자람). 즉시 디스크 축소는 `pg_repack`(온라인 무중단) 또는 `VACUUM FULL`(ACCESS EXCLUSIVE — 라이브 불가).
- **현재 불필요**: 8GB 한도 대비 DB 2.3GB + 평형 → 여유 충분. 디스크 압박 재발 시에만 검토.
- 출처: M2 retention S3 (2026-06-13). **블록킹**: No. **카테고리**: ⚪ 무기한 (디스크 압박 시)

### [10-38] aiCardConfig.ts 잔여 한국어 describe 전수 영문화 — English-only 부채
- **근본**: `packages/shared/src/schemas/aiCardConfig.ts` 의 `.describe()` 다수가 한국어(datasource/exchange/marketType/symbol/kicker/title/subtitle/interval + CardActionSchema trigger/type/parameterMapping). ★ ai-orchestrator-specialist 자문(2026-06-14)으로 확인: 이 describe 들은 `route.ts:126` zodToJsonSchema → tool `input_schema` 경로로 **실제 AI 에 도달** → English-only 정책(`project_english_only_global`) 기술적 위반. 지금까지 미발견 사유 = buildSystemPrompt 본문만 영문 점검, tool schema 경로가 감사 사각지대.
- **이미 처리**: list 다이얼 3개(filters/sort/limit)는 `[10-33]` Step 1 에서 영문화 완료(2026-06-14). 본 항목 = **나머지 전부**.
- **해결 힌트**: 한 번에 전수 영문화(부분 영문화는 무해하나 부채 누적). zod describe 만 변경이라 검증 로직 무관. `@security-auditor` 또는 별도 cleanup commit 후보. 다른 schema 파일(filterClause/orchestrateResponse 등)의 한국어 describe 도 동시 점검 권장.
- **출처**: `[10-33]` Step 1 자문 (`M2-[10-33]-all-coins.md` Step 1). **블록킹**: No. **카테고리**: 🟡 다음 (English-only cleanup)

### [10-41] 셸 개폐 UX 고도화 — ESC 닫기/단일 패널 정책 + rail 발견성 nudge
- **근본**: (a) `uiShellStore` 에 `setLeft/setRight` 를 준비했으나 Step 0 은 토글만 연결 — 좁은 화면에서 양쪽 동시 열면 캔버스 과축소 → ESC 닫기 또는 "한쪽 열면 반대쪽 자동 닫힘" 정책 검토 (code-reviewer S1). (b) crypto-trader: 세로 rail 라벨이 저대비라 첫 세션에 발견 못할 가능성 (Step 0 에서 대비 `text-foreground/60`→`/75` 1차 완화). 추가 nudge(첫 방문 하이라이트/펄스 등)는 신규 동작이라 `@roadmap-milestone-manager` 분해 영역.
- **회수 예정**: 테마 C Step 1+ 사용자·`@crypto-trader` 결정. **블록킹**: No. **카테고리**: 🟡 다음 (UX 고도화)

### [10-44] My Views UX 톤 통일 — window.confirm → 인라인 확인 + notice 슬롯 개선
- **근본**: 테마 C Step 2 Sub-step 3 에서 저장은 인라인 입력(모달 없음)인데 복원/삭제만 `window.confirm`(OS 팝업) — 톤 불일치 + 메인스레드 블로킹 + Playwright dialog 핸들러 필요. 또 notice 단일 슬롯을 save/load/delete 가 공유해 메시지 상호 덮어쓰기. **사용자가 "확인 후 삭제/복원"을 명시 확정**했으므로 현재 window.confirm 수용 — 향후 인라인 확인(행이 "Delete?/Cancel"로 잠깐 전환)으로 통일 + notice 종류 태깅/자동소멸.
- **출처**: code-reviewer W3/W4 (테마 C Step 2 Sub-step 3, 2026-06-16, `M2-themeC-ui-shell.md §3.5`). **블록킹**: No. **카테고리**: 🟡 다음 (UX 고도화)

### [10-45] MyViews fetch 로직을 클라이언트 API 헬퍼로 추출
- **근본**: `MyViews.tsx` 가 fetchViews/handleSave/handleLoad/handleDelete 의 fetch 호출을 직접 보유(305줄). `lib/savedView/savedViewClient.ts` 로 추출하면 컴포넌트는 순수 UI 만 남고 테스트 용이. 현재 단일 책임이라 위반은 아님(code-reviewer W5/S = 권장).
- **출처**: code-reviewer S (테마 C Step 2 Sub-step 3, 2026-06-16). **블록킹**: No. **카테고리**: 🟢 M2+ (리팩터 부채)

### [10-46] saved_views 자동 저장 동시 탭 last-write-wins → 낙관적 잠금 승격 (공개 베타 시)
- **근본**: Views v2 Sub-step 3 자동 저장은 낙관적 잠금/버전 컬럼 없이 last-write-wins. 같은 뷰를 두 탭/기기에서 열고 편집 시 나중 저장이 이김. 단독 베타 실사용 단계에선 충분(유저 본인 소유 UI 레이아웃, RLS 가 무결성 방어, 잃는 건 "방금 한 편집"뿐). **기반 이미 있음**: PATCH 응답 `updated_at` 을 lastSavedAt 으로 받음 → 승격 시 `expectedUpdatedAt` 동봉 → `.eq("updated_at", expected)` 0행이면 409 → 클라 재로드로 확장.
- **출처**: backend-infra-specialist + code-reviewer (Views v2 Sub-step 3, 2026-06-18, `M2-themeC-ui-shell.md §4.8`). **블록킹**: No. **카테고리**: 🟢 M2+ (멀티 탭/기기 흔해질 때)

### [10-47] keepalive 64KB 상한 < 서버 512KiB cap 불일치 + flush 잔여 유실
- **근본**: Views v2 자동 저장의 종료 flush(visibilitychange/pagehide/언마운트)는 `fetch(keepalive:true)` PATCH. keepalive 본문은 브라우저 64KB 상한인데 서버 cap 은 512KiB → 64KB~512KiB 크기 뷰는 평상시(debounce, keepalive off)는 저장되나 "탭 닫는 순간 마지막 저장"만 조용히 실패 가능. + in-flight + 새 변경 + 즉시 언마운트가 겹치면 pendingAfterFlight 재무장이 dispose 에 막혀 마지막 변경 유실(best-effort). 현실 빈도 낮음(visibilitychange:hidden 이 unload 보다 먼저 거의 항상 성공).
- **해결 힌트**: 큰 스냅샷은 종료 시 무손실 보장이 어려우니 (a) 저장 인디케이터로 "미저장 변경 있음" 노출(Sub-step 4) 또는 (b) 종료 직전 동기 flush 보장 강화. 출처: nextjs-frontend + backend-infra (Views v2 Sub-step 3, 2026-06-18). **블록킹**: No. **카테고리**: 🟡 다음 (대형 뷰 등장 시)

### [10-48] 자동 저장 거짓 PATCH 미세 케이스 — z-order 재정렬 / seeding-during-inflight
- **근본**: ① React Flow 가 노드 선택/드래그 시작 시 선택 노드를 배열 끝으로 z-order 재정렬 → `state.nodes` 순서 변동 → 시각 무변화인데 해시 달라져 거짓 PATCH 1회(1.5s debounce+멱등으로 1회 수렴, 무해). ② `seed()` 가 in-flight PATCH 도중 발생 시 lastSavedHash 가 진행 중 저장 해시로 덮어써질 이론적 레이스(handleLoad busy 가드로 트리거 난이도 높음).
- **해결 힌트**: ①거짓 PATCH 줄이려면 serialize 시 `cards` 를 `config.id` 정렬(단 hydrate z-order trade-off 확인) ②seed 에 세대 카운터 가드. 둘 다 무해라 관측 후 판단. 출처: backend-infra + code-reviewer W2 (Views v2 Sub-step 3, 2026-06-18). **블록킹**: No. **카테고리**: 🟢 M2+ (관측 후)

### [10-49] Sub-step 4/5 라이브 UX 잔여 — rename 발견성 / 인디케이터 폭 / 더블클릭 경계 (①은 ✅ 회수)
- **① (crypto-trader Q1) 안심 신호 공백 → ✅ 회수 (Sub-step 5, 2026-06-18)**: "Saved ✓" 페이드 후 공백 문제는 라이브 실측 후 사용자 결정 = **상시 "Saved" 잔류**(ViewSaveIndicator idle/saved 에서 항상 "Saved ✓" + 마지막 저장 시각 hover title). commit `ef0a073`.
- **잔여 근본**: ② (crypto-trader Q2) rename 발견성이 행 `title` 툴팁("double-click to rename")에만 의존 → 묻힐 위험(보이는 affordance 없음). ③ (code-reviewer W3) 활성 행 이름 버튼(truncate)과 ViewSaveIndicator 가 가로폭 경쟁 → **상시 Saved 로 idle 폭은 안정됐으나** Saving…/Couldn't save 전환 시엔 여전히 폭 변동. ④ (code-reviewer W1) 단일클릭 로드 도중(>200ms 네트워크) 같은 행 더블클릭 시 로드 끝난 뒤 rename UI 진입(저빈도 경계).
- **해결 힌트**: ②는 hover 시 연필 아이콘 등 보이는 affordance / ③은 인디케이터 고정 min-width 또는 absolute / ④은 로딩 중 행 더블클릭 무시. 출처: code-reviewer W1/W3 + crypto-trader Q2 (`M2-themeC-ui-shell.md §4.9·§4.10`). **블록킹**: No. **카테고리**: 💭 미결정 (실사용 체감 후 사용자 결정)

### [10-50] 활성 뷰 전환/New view 시 1.5초 미만 마지막 변경 유실 (flush-on-switch)
- **근본**: 활성 뷰 A 에서 변경 후 1.5초 debounce 만료 전에 다른 뷰 로드/New view 하면, A 의 마지막 micro-변경이 PATCH 안 되고 드롭됨(`seed()`/`clearActive()` 가 대기 타이머를 clearTimer). 기존 스냅샷 load 동작과 동수준이라 신규 회귀 아님. 자동 저장 "당신 작업은 저장됨" 약속의 미세 빈틈. + 삭제 직전 in-flight PATCH 가 DELETE 와 경쟁 시 404 → 인디케이터에 "Couldn't save" 한 순간 스침(행은 이미 사라진 뒤, 무해).
- **해결 힌트**: 뷰 전환/New view 핸들러가 전환 전 현재 활성 뷰를 동기 flush(또는 controller 에 flushAndSwitch 노출). 단 비동기라 UX 지연 trade-off. 출처: code-reviewer (Views v2 Sub-step 4, 2026-06-18). **블록킹**: No. **카테고리**: 🟢 M2+ (공개 베타 전 검토, `[10-46]` LWW 와 함께)

### [10-51] user_preferences `preferences` JSONB 전체 교체 → 다중 키 시 머지 전환 필요
- **근본**: `/api/preferences` PUT 이 `preferences: { customInstructions }` 로 **전체 교체** upsert (`apps/web/app/api/preferences/route.ts:96`). 현재 JSONB 키가 `customInstructions` 1개뿐이라 안전하나, **미래에 다른 preference 키(예: `quoteScope`, 차트 기본 timeframe 등)가 추가되면 전체 교체가 그 키를 통째로 날린다**. 보안 결함 아님(본인 row 만, RLS 정상) — 데이터 손실 위험.
- **해결 힌트**: 두 번째 preference 키 추가 PR 의 **선행 조건** — PUT 을 "기존 preferences 읽어 spread 머지 후 upsert"(또는 부분 JSONB 갱신 `jsonb_set`)로 전환. 지금 머지 구현은 YAGNI(키 1개) → scope 밖. 코드에 인라인 주석 박제됨(route.ts:90~95).
- **출처**: backend-infra-specialist + security-auditor W-2 (M2 테마 C Step 4 Sub-step 3, 2026-06-18). **블록킹**: No. **카테고리**: 🟡 다음 (두 번째 preference 키 추가 시 동반 — Step 4 자체엔 무관).

### [10-54] 경로 A 공개 WS 서버를 Binance 수집 파이프라인과 별도 프로세스/박스로 분리 (베타 전)
- **근본 (security-auditor 사전감사 §5, 2026-06-22)**: 공개 WS 서버가 핵심 수집(Binance→Supabase)과 **같은 Node 프로세스·이벤트 루프·박스(CPX22 2vCPU/4GB)**. WS 측 DDoS/남용이 CPU/메모리를 빨면 수집 degrade → 시세 stale(위생 #9 위협, T1). 솔로 단계는 인증 게이트+구독 cap+graceful 격리로 수용(크래시 전파는 막힘, 느려질 수만 있음).
- **해결 힌트**: `LiveBus.ts:9-13` 가 이미 "프로세스 내부 방송 단일 경계"로 설계 → 분리 시 **LiveBus 구현만 Redis pub/sub 로 교체**, WS 서버를 별도 프로세스/박스로(수집 코드 무변경). M1.9 별도 IP 박스(`49.13.138.121`) 패턴 재사용 가능. ★ 경로 A 는 거래소 REST 를 안 부르므로 M1.9 같은 same-IP ban 리스크는 **없음** — 자원(CPU/RAM) 경쟁만 관전.
- **회수 예정**: 외부 사용자(베타) 받기 전 = 블로커. **블록킹**: No (솔로 단계). **카테고리**: 🔵 Launch Readiness.

### [10-55] 베타 진입 시 Cloudflare Spectrum(L4 WS 프록시) 또는 엣지 rate-limit 재평가
- **근본 (security-auditor 사전감사 §2, 2026-06-22)**: DNS-only(회색 구름) 채택으로 Hetzner 워커 IP 가 공개 DNS 노출 → CF 프록시의 DDoS 흡수·IP 은닉·엣지 rate-limit 부재. (DNS-only 선택 자체는 CF 무료 플랜의 WS 100초 idle timeout 회피라는 타당한 이유 — Caddy 직접 TLS.) 솔로 단계는 ufw+인증+구독 cap 으로 애플리케이션 레이어 자가 방어 충분.
- **해결 힌트**: 베타 트래픽 증가 시 CF Spectrum(WS 친화 L4 프록시) 또는 엣지 WAF/rate-limit 재검토. **+ (노출-직후 재감사 W-3, 2026-06-22)**: DNS-only 라 origin IP(`178.105.38.94`) 공개 — 보완 = `fail2ban`(SSH brute) + `ufw limit 22/tcp`. 동일 박스가 `SUPABASE_SERVICE_ROLE_KEY` 보유 워커라 직타 스캔 대상. **블록킹**: No. **카테고리**: 🔵 Launch Readiness.

### [10-56] 경로 A WS — IP당/유저당 동시 연결 수 상한 (공개 베타 전)
- **근본 (security-auditor 코드 재감사 관찰, 2026-06-22)**: 연결당 구독 cap·메시지 rate limit(`[10-52]` 완료)은 있으나, **유효 토큰 1개로 소켓을 무한 개수 여는** 핸드셰이크-레벨 동시 연결 cap 은 미구현. 인증은 통과하므로 정상 유저 1명이 수천 소켓 오픈 가능(메모리·fan-out 부하). 솔로/베타 소수 + Caddy 앞단 연결 제한으로 현재 수용.
- **해결 힌트**: WsServer 핸드셰이크에서 userId(sub) 또는 IP 기준 동시 연결 카운터 + 상한(예: IP당 5, 유저당 10). Caddy 레이어 connection limit 과 병행 가능. **블록킹**: No. **카테고리**: 🔵 Launch Readiness (`[10-54]` 분리 작업과 동반 가능). _(노출-직후 재감사 W-2, 2026-06-22 라이브 재확인 — 솔로 단계 수용.)_

### [10-59] `apps/web` lint 실행 불가 — `eslint-plugin-import` 누락 (환경/툴링)
- **근본 (Step 4 Phase A 세션 발견, 2026-06-23)**: `pnpm -F web lint` 가 `Error: Cannot find module 'eslint-plugin-import'`(eslint-config-next 의 peer dep)로 **실행 자체가 안 됨** — 룰 위반이 아니라 config 로딩 실패. type-check·test 는 정상이라 품질 검증엔 영향 없으나 CLAUDE.md 워크플로의 lint 게이트가 web 에서만 비활성. worker lint 은 정상(다른 config).
- **해결 힌트**: `pnpm add -D eslint-plugin-import --filter web` (또는 pnpm 호이스팅 점검). 1회 복구면 끝. **블록킹**: No(type-check/test 가 대체). **카테고리**: 📋 상시 부채.

### [10-58] 경로 A 토큰 subprotocol — TLS 종단 신뢰 의존 (인프라 변경 시 재점검)
- **근본 (security-auditor Phase A 토큰첨부 감사 W-1, 2026-06-23)**: 세션 access_token 을 `Sec-WebSocket-Protocol` 헤더(subprotocol)로 전달 = 쿼리스트링 대비 액세스로그/Referer 비노출 이점은 실재하나, **헤더 기반 토큰의 공통 한계로 TLS 종단 지점이 평문 토큰을 본다**. 현재는 Caddy 단일 종단(`wss://ws.use-travis.com` → `127.0.0.1:8081` 같은 박스 loopback)이라 종단=목적지 = **위험 0**.
- **재점검 트리거**: CF Spectrum/엣지 프록시 도입(`[10-55]`) · WS 서버 별도 박스 분리(`[10-54]`) 등 **TLS 종단과 워커 사이에 네트워크 홉이 생기는 인프라 변경 시** 토큰이 그 구간을 평문으로 지나는지 재평가(내부망 TLS 또는 토큰 회전 단축). **블록킹**: No. **카테고리**: 🔵 Launch Readiness (`[10-54]`/`[10-55]` 동반).

### [10-53] 경로 A 플립(Step 4) 전 선결 2건 — 재연결 error 깜빡임 + seq 순서 보장
- **근본 (code-reviewer W2/W3, M2 경로 A Step 3b, 2026-06-22)**:
  - **(a) 재연결 중 카드 error 깜빡임**: liveConnection 이 끊김 시 backoff 자동 재연결하나, 상태가 `errored→closed→connecting→open` 으로 흐르며 hooks `applyStatus` 가 `errored/closed` 를 카드 `error/idle` 로 노출 → **재연결 중 정상 상황인데 카드가 잠깐 빨간 error 표시**. 경로 B(Supabase)는 라이브러리가 재연결 내부 흡수라 안 보였음. ws_direct ticker 플립(Step 4) 시 사용자 신뢰 영향.
  - **(b) seq 순서 미사용**: 워커 envelope 의 `seq`(순번)를 `liveTopicManager.dispatch` 가 안 쓰고 무조건 마지막 payload 적용. ticker(1초 합산 저빈도)는 역전 사실상 0 이라 MVP OK, 단 고빈도 trade 스트림(Step 4+) 도입 시 "오래된 seq 가 최신 덮어쓰기" 잠복.
- **해결 힌트**: (a) `mapStatus` 에서 활성 토픽이 있는 동안 `errored` 를 낙관적으로 `subscribing`(loading)으로 매핑하는 방안 — Step 4 플립 전 `@crypto-trader` 자문(에러 깜빡임 vs stale 신뢰). (b) seq 역전 드롭을 rAF 코얼레서 도입(고빈도 스트림) 시점에 동반. **블록킹**: No(현재 휴면). **카테고리**: 🟡 다음 (경로 A Step 4 플립 선결).
- **진행 (Step 4 Phase A, 2026-06-23)**: (a) **hook 레벨 완료** — `liveTopicManager.mapStatus` 를 재연결-인지로 전환(활성 토픽 동안 errored/closed → subscribing). `@crypto-trader` 자문 = **옵션 C**(값 흐림 + "updated Ns ago" + 5초 유예 후 중립어 승격, 사용자 결정 2026-06-23). 깜빡임 차단 단위 테스트 추가. **TickerCard 의 옵션 C 시각 표현(흐림/타임스탬프/승격)은 Phase B 플립 커밋에 동반**(가시 변경이라 휴면 Phase A 와 분리). (b) seq 는 여전히 보류(저빈도 ticker, 고빈도 스트림 도입 시).
- **진행 (Step 4 Phase B 코드, 2026-06-24)**: (a) **TickerCard 옵션 C UI 구현 완료** — 재연결 시 값 흐림(opacity-40 + transition) + freshness 라인("updated Ns ago", `formatRelativeTime`+`useNow(5s)` 재사용) + 5초 유예 후 "reconnecting…" 중립 문구. 빨간 error 금지 불변식 = mapStatus 단일 책임으로 구조 보장(code-reviewer S2 확인). W2 가드(초기 로딩≠재연결, `hasConnectedRef`) 동반. **★ code-reviewer C1 동시 회수**: 경로 A 방송 row 에 `updated_at` 부재(DB DEFAULT NOW() 컬럼) → freshness 깨짐 → 워커 `withBroadcastTimestamp`(방송 payload 에만 주입, upsert 무변경) 수정. 잔여 = B-1 워커 재배포 + B-2 플립 push + B-3 라이브 G2. (b) seq 보류 유지.

### [10-60] 옵션 C 재연결 라벨 등장 타이밍 5~10초 (useNow 5s 틱 종속)
- **근본 (code-reviewer W3, M2 경로 A Step 4 Phase B, 2026-06-24)**: `showReconnectLabel` 이 `useNow(5000)` 틱 기준 elapsed 로 판정 → "5초 유예" 명세지만 실제 라벨은 5~10초 사이 등장(저사양 고려해 별도 1초 타이머 회피한 의도된 트레이드오프). 브리프 깜빡임엔 안 뜨므로(하한 5초 보장) 기능상 무해.
- **해결 힌트**: 정밀 5초가 필요하면 카드별 `setTimeout(5000)` 1회 또는 `useNow(1000)` 로 상향(저사양 부담↑). 현재 5초=하한으로 충분. **블록킹**: No. **카테고리**: 🟢 M2+ (저비용, UX 정밀화).

### [10-61] 옵션 C 장기 재연결 실패 시 한 단계 승격 ("data may be delayed")
- **근본 (code-reviewer S2, 2026-06-24)**: mapStatus 가 활성 토픽 동안 errored/closed 를 영구 subscribing 으로 낙관 매핑 → 워커가 정말로 오래(예: 1시간+) 죽으면 카드가 영원히 "reconnecting…" 만 표시, 사용자가 "왜 안 변하지?" 를 영영 모를 수 있음. (단 freshness 라인의 "updated 47m ago" 가 부분 보완.)
- **해결 힌트**: reconnectedFor 가 임계(예: 60초)를 넘으면 "data may be delayed" 같은 한 단계 강한(빨간 아님) 중립 문구로 승격. 옵션 C 합의 범위 내 확장. **블록킹**: No. **카테고리**: 💭 미결정 (B-3 라이브 체감 후).

### [10-62-orig] ws_direct ticker — marketType 누락 시 영구 loading (경로 B 는 동작했음)
- **근본 (code-reviewer S3, 2026-06-24)**: TickerCard 의 `selector` 는 `symbol && marketType` 일 때만 생성 → marketType 없으면 buildLiveTopic 실패 → hooks 가 graceful skip(warn + loading 유지). 경로 B(realtime)는 match 콜백이 marketType 없이도 동작했으나 경로 A 는 토픽 조립에 필수 → marketType 없는 ticker 카드는 플립 후 영구 빈 화면 가능.
- **해결 힌트**: (1) AI 가 ticker-card 를 marketType 없이 emit 가능한지 schema/registry 확인 → 필수화, 또는 (2) selector 조립 실패 시 해당 카드만 경로 B 폴백. **B-3 라이브에서 빈 카드 발생 여부 우선 확인.** **블록킹**: No(라이브 확인 필요). **카테고리**: 🟡 다음 (Phase B 라이브 검증 동반).
- **★ 일반화 (code-reviewer Suggestion #1, fast-follow #1 Step 1, 2026-06-26)**: 동일 비대칭이 **IndicatorCard(`premium_index`)** 에도 적용됨 — `match`(IndicatorCard.tsx:68)는 `(!marketType || ...)` 로 marketType optional, `selector`(IndicatorCard.tsx:91)는 `symbol && marketType` 필수. premium_index 는 선물 전용이라 marketType 이 항상 있어야 정상이나 강제 스키마 가드 없음. → **fast-follow #1 Step 5(premium_index ws_direct 플립) 착수 전 필수 점검**: (a) AiCardConfig superRefine 에서 premium_index 계열 marketType 필수화, 또는 (b) Step 6 라이브에서 marketType 없는 indicator 카드 빈 화면 발생 여부 확인. ticker(이 항목 본문)와 한 묶음으로 처리.
- **★ partial watchColumns 전제 (code-reviewer Step 2 Suggestion S1, 2026-06-26)**: partial+ws_direct datasource 의 watchColumns 에 "방송 안 되는 + 느리게만 바뀌는 + 빠른 동반 컬럼이 없는" 컬럼만 있으면 dirty check 가 매 틱 잉여 통과(저사양 UHD620 부담). premium_index 는 mark_price(매초 변동)가 watched 라 무해(moot). **미래 partial datasource(OI 등) 추가 시: "빠른 동반 watched 컬럼 존재" 전제를 점검**, 없으면 dirty check 를 merged 기준으로 돌리거나 watchColumns ∩ 방송컬럼 교집합 정공. Step 5 함께 점검.

### [10-63] 옵션 C freshness 라인 정상 시 항상 노출 — 노이즈 vs brownout 방어 trade-off
- **근본 (nextjs-frontend Q4 + code-reviewer, 2026-06-24)**: 고빈도 ticker(sub-second)는 정상 시 freshness 가 거의 "just now" 고정 → 정보량 낮은 시각 노이즈. 단 **항상 노출 = status=ready 인데 push 만 멈추는 brownout([10-11] @arr stall 실패 모드) 을 잡는 유일한 신호**(재연결 감지로 안 잡힘). 현재 brownout 방어 우선으로 항상 노출 채택(8px ink-4 = 최소 시각 비중).
- **해결 힌트**: B-3 라이브에서 `@crypto-trader` 가 실제 체감 후 결정 — 유지 / 정상 시 숨김(재연결만) / 절충(N초 무갱신 시에만 노출). **블록킹**: No. **카테고리**: 💭 미결정 (B-3 crypto-trader 자문).

### [10-64] 경로 A WS — JWKS fetch 실패 시 WS 전량 거부 알람 (관측)
- **근본 (security-auditor W-2, M2 경로 A Step 4 Phase B, 2026-06-24)**: 워커 WS 인증이 ES256/JWKS 검증으로 전환됨(`createSupabaseTokenVerifier`). createRemoteJWKSet 가 키를 캐시하지만, 첫 검증 시점에 Supabase auth 가 일시 다운이면 JWKS fetch 실패 → 모든 핸드셰이크가 `malformed` 로 fail-closed 거부 → 로그인 사용자도 WS(경로 A) 전량 끊김(경로 B·REST 는 무관). 보안상 올바른 방향(fail-closed)이나 가용성 관측 포인트.
- **해결 힌트**: JWKS unreachable / 핸드셰이크 거부 spike 알람. 정상 가동 후엔 캐시로 영향 작음. **블록킹**: No. **카테고리**: 🔵 Launch Readiness.

### [10-65] 경로 A WS 토큰 — `iss`(issuer) 클레임 검증 추가 (멀티프로젝트 대비)
- **근본 (security-auditor W-3, 2026-06-24)**: 현재 alg(ES256)+aud(authenticated)+서명(JWKS)만 검증, `issuer` 미검증. JWKS 가 우리 프로젝트 키만 담아 단일 Supabase 프로젝트에선 실질 위험 0(타 발급자 토큰은 서명 불일치로 거부). 멀티테넌트/멀티프로젝트 확장 시 `issuer: "<SUPABASE_URL>/auth/v1"` 추가가 정석.
- **해결 힌트**: jwtVerify options 에 issuer 추가. ⚠️ **정확한 iss 값을 라이브 토큰 디코드로 먼저 검증할 것**(alg 버그처럼 틀린 값이면 전량 거부 재발) — `feedback_external_api_live_smoke`. **블록킹**: No. **카테고리**: 🟢 M2+ (저비용, 멀티프로젝트 선행).

### [10-66] 경로 A 방송 updated_at 정밀화 — 코얼레스 윈도우 종료 / Binance `E` 필드
- **근본 (crypto-domain-expert, M2 경로 A Step 4 Phase B, 2026-06-24)**: `withBroadcastTimestamp` 가 배치 시작 시각(`handleTickerBatch` 의 `now=Date.now()`)을 주입. StreamCoalescer 1초 합산이라 "윈도우 시작 vs 종료"에 최대 1초 차. freshness(5초 granularity)엔 무해하나, "이 가격이 도착한 시각" 의미엔 **마지막 수신 이벤트 시각**(윈도우 종료) 또는 Binance payload `E`(event time) 필드가 더 정확(워커 시계 드리프트도 제거).
- **해결 힌트**: 코얼레서가 윈도우 종료 시각/마지막 E 를 enriched 에 전달. **블록킹**: No. **카테고리**: 🟢 M2+ (저비용 정밀화).
- **★ markPrice 확장 (fast-follow #1 Step 3, 2026-06-26)**: 동일 이슈가 markPrice 방송에도 적용. **USDM markPrice 도 ticker 와 동일하게 chunked + StreamCoalescer(1초 batch)** 경유(`CHUNKED_STREAM_SUFFIXES.futures_usdm` 에 `@markPrice@1s` + `COALESCER_RULES` batch) → `withBroadcastTimestamp` 의 `now=Date.now()` 가 flush 시각. COINM 만 native `!markPrice@arr@1s`(코얼레서 미경유, E 필드 직접 가용). 정밀화 시 USDM/COINM 둘 다 마지막 `E`(markPrice payload 의 event time) 사용 정공.

### [10-69] `/futures/data/basis` 418 ban escalation 관찰 (2026-06-26, fast-follow #1 Step 6 라이브)
- **근본 (라이브 워커 로그 관찰)**: 09:44~ `/futures/data/basis` 가 `429`→**`418 banned; IP(10.119.x.x)`** escalation + 5분+ 지속. ★ 10.119.x = **Binance 내부 LB 사설 IP**(우리 공개 IP 178.105.38.94 아님 — `project_m1_9_complete` 규명: "basis -1003 전부 내부 LB IP, 우리 무관, backoff 흡수"). ticker/premium/sync 정상 완료 = 우리 IP 건재. **경로 A(fast-follow #1)와 무관 — basis 는 별도 perSymbolTask REST 폴링.** 단 429→418 + 지속은 baseline("backoff 흡수")보다 심해 **basis 메트릭 일시 stale** 가능.
- **해결 힌트**: basis 폴링 freshness 모니터링(site=DB basis 컬럼). 심하면 `[8-31]`ⓓ token-bucket 을 basis endpoint 에도 opt-in 또는 basis 폴링 주기 완화. **블록킹**: No(우리 IP·경로 A 무관). **카테고리**: 🟢 M2+ (관측, basis 데이터 stale 사용자 체감 시 🟡 승격).

### [10-70] WS-derived metrics 컴퓨팅 레이어 — 사용자 제안 (2026-06-26)
- **근본 (사용자 질문)**: "가능한 모든 데이터를 WS로 불러오고, basis 같은 건 우리가 받는 선물/현물/index 가격으로 **내부 실시간 계산** 가능하지 않나?" — 정확히 옳은 부분 있음. **분류 3층**: (A) **WS push** = price/mark/index/funding-predicted/(trades·depth=#3) → 직접 소비. (B) **WS 미push 이나 1차값에서 계산 가능** = basis(= mark − index, 둘 다 markPrice 스트림에 이미 있음) · taker buy/sell(aggTrade의 maker flag, #3 선결) · 커스텀 spread/ratio. (C) **WS 미push + 계산 불가(전 트레이더 포지션 집계)** = OI · LSR → REST 폴링 유일(게으름 아님, 구조적). ★ TRAVIS 는 **이미 이 패턴 사용** — `preCompute.ts` 가 WS ticker 롤링윈도우로 price_chg/volume_chg 계산. basis 는 동종 확장.
- **★ 핵심 caveat (위생 #9 site=DB)**: 계산값이 **Binance 사이트 표시값과 정확히 일치**해야 함. basis 는 Binance `/futures/data/basis` 의 정의(futuresPrice·indexPrice·window)와 우리 mark−index 가 **같은 공식·입력인지 검증 필수** — 다르면 도메인 결함. 안전: 공식 불명확/proprietary 면 계산 대신 REST canonical 유지 또는 계산+주기적 REST 교차검증.
- **해결 힌트**: 별도 테마 "derived real-time metrics". **Step 0 = `@crypto-domain` 으로 (a) Binance OI/LSR WS 부재 재확인 (b) basis 공식·입력 정확 정의 (c) taker=aggTrade 유도 가능성** 공식 docs 근거 확정 후 착수 판단. basis 가 최우선 후보(이미 mark+index 스트림 보유 = 신규 스트림 0, 뺄셈만). **블록킹**: No. **카테고리**: 🟢 M2+ (탐색, fast-follow #2·#3 후 또는 병행).

### [10-74] descriptor 시스템 3중 → 2중 (✅ 부분 진전 2026-06-30) → 단일심볼 흡수 잔여
- **근본 (2026-06-29, Composable Stage 1 Step 1 + code-reviewer W3 + registry-map)**: 같은 datasource 의 표시 메타가 평행 descriptor 테이블에 중복 존재. **✅ Step 4(2026-06-30): `indicatorListDescriptors.ts` 삭제 → 3중→2중** (`indicatorDescriptors.ts`[단일심볼 IndicatorCard] + `tableDescriptors.ts`[통합 set form]). 잔여 = Step 1 색 계약 확장(tone+intensity 분리 / labelColumn / rowKeyFields / defaultLimit)이 단일심볼 카드엔 아직 미적용 → 향후 BigValue/Detail 일반화(**Stage 1b**) 시 `indicatorDescriptors` 도 통합 계약으로 수렴해야 drift 누적 방지.
- **해결 힌트**: Stage 1b(`ticker-card`→BigValue·`indicator-card`→Detail 일반화) 착수 시 단일심볼 descriptor 를 `tableDescriptors` 식 계약(또는 공유 base)으로 흡수 + tone/intensity 직교 색 계약 일관 적용. **블록킹**: No(현 2중은 의도된 과도기). **카테고리**: 🟢 M2+ (Stage 1b descriptor 수렴). **출처**: `tableDescriptors.ts` + `M2-composable-expressiveness.md §10 Step 3+4`.

### [10-80] 테이블 훅 이벤트성 set 의 shape 인식 eviction — maxRows 삽입순 축출은 과도기
- **근본 (2026-07-05, ff#2 Step 4 code-reviewer C2)**: `useDataServiceTable` working Map 은 상한이 없었고, 이벤트성 set(청산 — INSERT 마다 새 pk)은 세션 내내 무한 누적 + flush 전량 복사 O(n) 폭증(폭락장 캐스케이드 = 최악 타이밍). **1겹 방어 적용됨**: `maxRows` 옵션(TableCard `LIVE_ROWS_CAP=5000`) — 초과 시 삽입 순서 앞부터 축출. ⚠️ 의도된 트레이드오프: 정렬-상위 fetch("biggest" 류)의 초기 행이 장수 세션(라이브 5000건+ 후)에서 먼저 축출될 수 있음.
- **해결 힌트**: 근본 = shape 인식 eviction(Stage 2 — datasource.shape=events 면 시간 기준, set 이면 pk 덮어쓰기 자연 유계) 또는 활성 sort 기준 최하위 축출. Phase B G2 에서 캐스케이드 시 Map 성장 관측. **블록킹**: No. **카테고리**: 🟢 M2+ (Stage 2 shape 정식화 동반).

### [10-81] AI 상대시간 필터 역량 — 시스템 프롬프트 현재시각 미주입
- **근본 (2026-07-05, ff#2 Step 4 code-reviewer C1 파생)**: buildSystemPrompt 에 현재 시각 주입이 없어 AI 가 "today / last hour" 를 절대 타임스탬프로 변환 불가 — 시간창 필터(청산 trade_time 등)는 사용자가 절대 시각을 명시할 때만 가능. table-card description 의 시간범위 광고는 제거해 둠(Step 4). wire 포맷 정합(ISO string)·범위 pushdown 은 해결됨 — 남은 것은 "지금"의 앵커뿐.
- **해결 힌트**: buildSystemPrompt 에 `<current_time>` ISO 1줄 주입(하드코딩 아님 — 사실 정보) + 캐시 고려(분 단위 절사로 prompt cache 친화). 회수 시 table-card/liquidation description 에 시간범위 유스케이스 복원. `@ai-orchestrator-specialist` 자문. **블록킹**: No. **카테고리**: 🟡 다음 (시간창 쿼리 수요 실측 시).

### [10-83] 청산 두 form UX advisory 묶음 — crypto-trader (2026-07-06, ff#2 완결 시점)
- **근본 (advisory only — 실사용 후 사용자 결정, [10-21]/[10-67] 선례)**: ① **notional 농도 포화 $5M**(`LIQ_NOTIONAL_SATURATION_USD`) — 알트 청산 밴드($수백~수만)가 저농도에 뭉개지고 고래(>$5M)는 clamp 로 평탄화 → 로그 스케일 또는 임계 하향 검토 ② **biggest 표 VALUE 컬럼을 맨 오른쪽으로**(현재 SIDE 뒤) — 정렬 타깃이 우측 끝인 스캔 관행 ③ **tape 라인 심볼 위치**(배지 뒤) 재검토. 지난 3대 제안(색=시장영향+라벨/절제 렌더/seed)은 반영 확인.
- **회수 예정**: 청산 카드 실사용 몇 세션 후 사용자 Q1~Q3 결정. **블록킹**: No. **카테고리**: 💭 미결정 (실사용 선별).

### [10-84] 청산 events→series 시간버킷 집계 배관 (chart form 유입용 reshape)
- **근본 (2026-07-07, 다음 단계 계획 세션)**: 청산은 `events` shape(개별 사건) — 차트(`series` 소비 form)로 그리려면 **시간 버킷 집계**(예: 5m 합계 notional, side 분리 롱/숏 양방향 바) reshape 배관이 필요. PRD §2 "같은 데이터를 snapshot/history/집계로 reshape" 의 첫 실구현 후보. 배관이 생기면 chart form 은 **코드 0줄**로 청산 유입(Form↔Data 직교의 실증 3호). 어떤 형태로 그리든 sampled 고지(심볼당 초당 1건 표본) 불변.
- **해결 힌트**: 집계 위치 후보 = ① DB 뷰/쿼리(SUM group by time_bucket — 서버 계산) ② dataService reshape 레이어(클라 계산). Stage 2 shape 정식화의 자연 확장 — `[10-80]`(shape 인식 eviction)과 같은 사이클 후보. **블록킹**: No. **카테고리**: 🟢 M2+ (GenericChart 사이클 2 완료 후 확장). **출처**: 사용자 질문 "청산을 차트로 어떻게?" (2026-07-07) + `M2-composable-expressiveness.md §11`.

### [10-85] 예상 청산 레벨 히트맵 — 파생 추정 데이터 부재 (실현 청산과 별개 물건)
- **근본 (2026-07-07, 사용자 질문 "TRAVIS 는 청산 히트맵 못 보여주나?")**: CoinGlass 식 "청산 히트맵"(가격대별 노란 띠) = 레버리지/OI 분포로 **추정한 예상 청산가 밀도 모델**(파생 데이터) — TRAVIS 는 **실현 청산**(forceOrder, sampled)만 보유하므로 현재 불가. form 부재가 아니라 **데이터 축의 갭**: 추정 모델(파생 datasource) 신설 시 heatmap form 이든 chart 든 registry 등록만으로 자동 유입. 별개로 **실현 청산 히트맵**(시간×가격 버킷 밀도)은 `[10-84]` 집계 + heatmap form(미래 form)으로 가능.
- **해결 힌트**: ff#2 Step 1 결정 ④("총청산 요약/히트맵 = 같은 forceOrder 데이터의 별도 scope, M2+ roadmap-mgr 위임")의 구체화. 추정 모델은 자체 방법론 설계(공개 표준 없음) 필요 — 수요 실측 후. **블록킹**: No. **카테고리**: 💭 미결정 (수요 실측 시 heatmap form + 파생 datasource 로). **출처**: 사용자 질문 2026-07-07 + `M2-pathA-ff2-liquidation.md §1.2 ④`.

### [10-86] ticker 테이블 write coalescing 후보 — now_spot/futures_ticker 초당 ~2,160 row-UPDATE (실측 선결)
- **근본 (2026-07-07, `[10-77]` 선결 측정 중 backend-infra 부수 발견)**: `tickerWsHandler` 가 `now_spot_ticker`(~1,441 row)+`now_futures_ticker`(~719 row)를 **초당 1회 full upsert** → 초당 ~2,160 row-UPDATE 로 `now_futures_indicator`(719/초)보다 큰 Realtime churn 원천 가능성. 단 ticker 는 이미 경로 A(ws_direct) 플립 완료라 **transport=realtime 구독자가 실제로 얼마나 남았는지 실측 필요**(구독자 0 이면 Realtime 메시지 미발생 가능 — WAL 이벤트 vs 전달 메시지 구분 확인). `[10-77]` 배포 후 Dashboard usage 추세가 기대만큼 안 떨어지면 이 항목이 잔여 주범.
- **해결 힌트**: `[10-77]` 의 `MarkPriceWriteCoalescer` 패턴 재사용(단 ticker 는 partial 아닌 full upsert 라 mixed-batch 고려 상이). 선결 = `[10-77]` G3 관측 결과 + Realtime 메시지의 테이블별 기여 실측. **블록킹**: No. **카테고리**: 🔵 Launch Readiness (`[10-77]` G3 관측 후 판단). **출처**: `M2-[10-77]-realtime-throttle.md §2-8`.

### [10-87] shape feasibility 진단의 "데이터 레이어 실서빙" AND 조건 — shapeCompat 미사용 헬퍼 방향 박제
- **근본 (2026-07-08, 사이클 2 Step 1 code-reviewer S3)**: Stage 2 Step 1 이 신설한 `shapeCompat.ts`(shapeIntersection/areShapesCompatible)는 현재 **불변식 테스트 전용**(production 미사용) — "새 데이터 등록 → 전 form 가능/불가 자동 판정" feasibility 진단의 선(先)선언 API 다. 미래에 이 진단 서피스를 만들 때 shape 교집합만 쓰면 **kline(shape=series 이나 TradingView 외부 서빙, 우리 데이터 레이어 미서빙)이 새어든다** — 반드시 "dataShapes 멤버십 + 데이터 레이어 실서빙(table 존재 등)" AND 조건으로 지어야 함 (shapeCompat.ts 헤더에 힌트 주석 있음).
- **해결 힌트**: feasibility 진단/Stage 4 착수 시 회수. 성능 참고(S1): `shapeIntersection` 이 렌더/AI 핫패스에 들어가면 `getDatasource` 의 mergeCommonFields 할당이 낭비 — 그때 raw 경량 경로 또는 메모이즈. **블록킹**: No. **카테고리**: 🟢 M2+ (Stage 4 / feasibility 서피스 동반). **출처**: `M2-cycle2-genericchart.md` Step 1 + code-reviewer S1/S3 (2026-07-08).

### [10-88] GenericChart 용 가격 history series 공급 부재 — "OI+가격" 오버레이 데이터 축 갭
- **근본 (2026-07-08, 사이클 2 계획 세션 — 사용자 오버레이 결정 (c))**: 가격 캔들/시계열은 TradingView iframe 전용(kline 은 DB 미적재, M1.3 E1 은 in-memory 1m 만) → 자체 chart form 에 "OI + 가격" 겹치기가 **물리적으로 불가**(form/계약 문제 아님 — series 공급원 부재). `[10-85]`(예상 청산 히트맵)와 같은 "데이터 축 갭" 계열.
- **해결 힌트**: (a) kline→DB 적재(용량·수집 비용 큼 — 606+ 심볼 × interval) (b) mark_price history 활용(현재 history_futures_indicator 의 mark_price 컬럼도 0행 — collector 미채움) (c) TradingView 위젯에 오버레이 통합. 수요 실측 후 방식 결정. **블록킹**: No. **카테고리**: 💭 미결정 (사이클 2 완료 후 수요 실측). **출처**: `M2-cycle2-genericchart.md` 계획 (2026-07-08, 사용자 결정 오버레이 (c) 항목).

### [10-89] useDataServiceSeries 후속 최적화 묶음 — 증분 fetch / 무해 옵션 변경 loading 플래시 / 무변화 bail-out
- **근본 (2026-07-08, 사이클 2 Step 2·4 자문+리뷰)**: 첫 구현에서 의도적으로 뺀 최적화 4건. ① **증분 fetch**(`recorded_at > lastSeen` 만) — interval 비례 refreshInterval 이 부하의 90%를 이미 잡고, forward-fill 이 최신 버킷을 UPDATE 하면 증분이 놓칠 수 있어 correct-by-construction 아님 (backend-infra YAGNI 판정). ② **무해 옵션 변경 loading 플래시**(code-reviewer S1) — maxPoints/lookbackMs/refreshIntervalMs 만 바뀌어도 재구독 clear 로 차트가 순간 비워짐. 현재는 카드 옵션이 생성 시 고정이라 무해하나, Stage 4 reactive 조정 도입 시 "datasource/symbols 변경만 clear, 나머지는 조용한 재fetch" 분리 필요. ③ **완전 무변화 라운드 bail-out**(S4) — 전 곡선 참조 동일 시 snapshot 자체 재사용으로 부모 재렌더 1회도 절약(lastUpdatedAt 전진과 트레이드오프). ④ **차트 테마 토글 색 미반영**(Step 4 문서화 한계) — `readChartTheme` 이 마운트 시 1회 CSS var 를 실색으로 해석해 세션 중 라이트↔다크 전환 시 기존 캔버스는 옛 색 유지(재마운트 시 반영, DOM 범례는 var() 라 즉응). 회수 = `.dark` 클래스 MutationObserver 로 재해석+재생성.
- **회수 예정**: 사이클 2 라이브 G2 후 부하/체감 관측 시 또는 Stage 4 reactive 도입 시. **블록킹**: No. **카테고리**: 🟢 M2+ (관측 후 선별). **출처**: `M2-cycle2-genericchart.md` Step 2 + backend-infra/zod/code-reviewer 자문 (2026-07-08).

### [10-94] uplot 업그레이드 시 bars 부호색 라이브 재검증 의무 (버전 핀 1.6.32)
- **근본 (2026-07-09, 사이클 2 Step 6 code-reviewer S2)**: 펀딩 막대의 부호색은 uPlot 내장 `disp.fill` 컬러 팩트에 의존 — `unit: 3` 리터럴(ambient const enum 이라 런타임 import 불가) + "series `width: 0` 일 때만 disp 활성" 이라는 **1.6.32 내부 구현 조건** 2곳. canvas 렌더라 단위 테스트 검증 불가(라이브만 가시). `apps/web/package.json` 에 `uplot: "1.6.32"` 정확 핀 완료.
- **회수 조건**: uplot 버전 상향 PR 에서 (a) `dist/uPlot.d.ts` 의 FacetUnit enum 값 + bars() 내부 disp 활성 조건 재확인 (b) 펀딩 차트 부호색 라이브 육안 재검증. **블록킹**: No. **카테고리**: 📋 상시 부채. **출처**: `M2-cycle2-genericchart.md §4h` + code-reviewer S2 (2026-07-09).

### [10-95] prune 함수 search_path mutable WARN 2건 — 보안 감사 시 일괄 처리
- **근본 (2026-07-09)**: `prune_history_futures_indicator`(기존)·`prune_history_futures_funding`(Step 6 신설)이 advisors "Function Search Path Mutable" WARN — 동일 부류, 신설이 선례 패턴을 그대로 미러해 승계. 실위험 낮음(SECURITY DEFINER 아님·cron 전용) 이나 Launch 보안 감사 항목.
- **해결 힌트**: 두 PROCEDURE 에 `SET search_path = public` 1줄씩 (Dashboard 1회). **블록킹**: No. **카테고리**: 🔵 Launch Readiness. **출처**: get_advisors 실측 (2026-07-09).

### [10-96] funding allowlist-drop 급증 감시 — 상위 심볼 로깅 (reviewer S2, 선택)
- **근본 (2026-07-09)**: `fundingHistoryTask` 의 USDM 전역 응답 allowlist 필터는 drop **카운트만** 로그(첫 backfill 6,342건 = 상장폐지 심볼 정산, 정상). symbols 마스터가 stale 해지면(syncSymbolsTask 사망 등) 정상 심볼까지 전부 drop 되는 잠복 사고를 카운트 급증으로만 감지 가능 — 급증 시 상위 몇 심볼을 rate-limited 로 찍는 가시화는 미구현.
- **회수 조건**: collector 로그 개선 작업 시 동반, 또는 drop 급증 실사고 1회 발생 시. **블록킹**: No. **카테고리**: ⚪ 무기한. **출처**: Phase 1+2 code-reviewer S2 (2026-07-09).

### [10-97] fundingInfoTask 죽은 getter/Map 정리 — N1 이후 런타임 소비자 0
- **근본 (2026-07-10, N1 hotfix reviewer W2)**: `getFundingIntervalHours`/`getFundingIntervalMap` + in-memory Map 은 유일 소비자(premiumIndexTask 의 last_settled 역산)가 N1 에서 제거되며 **런타임 소비자 0** 이 됨. DB dual-write(symbols.funding_interval_hours — 카드 interval 라벨)는 살아있어 task 자체는 필수. 주석은 "현재 미사용, 보존 API" 로 정직화 완료 — 완전 제거는 구조 변경이라 보류.
- **회수 조건**: fundingInfoTask 를 건드리는 다음 작업 시 동반 (getter 2종 + Map 제거 또는 실소비자 재등장). **블록킹**: No. **카테고리**: 🟢 M2+. **출처**: N1 커밋 `c2515ae` + reviewer W2 (2026-07-10).

### [10-98] chartFormat.ts 비대 (~550줄) — 자연 경계 분할 검토 ([10-90] 동류)
- **근본 (2026-07-10, Phase B reviewer W2)**: 사이클마다 성장(Step 4 신설 → Step 6 bars/stepped → 마감 툴팁/축측정). 응집도는 높으나 CLAUDE.md "파일 작게" 가이드 초과. 분할 후보 경계: ① 시간/interval 헬퍼 ② 정렬·다운샘플 ③ 플러그인(midline/tooltip) ④ 축 폭 측정 ⑤ 옵션 조립.
- **회수 조건**: 다음 chart form 확장(청산 집계 [10-84] / 히트맵 등) 착수 시 선행 분할. **블록킹**: No. **카테고리**: 📋 상시 부채. **출처**: Phase B code-reviewer W2 (2026-07-10).

### [10-102] 크로스 데이터소스 복합 쿼리 — (a) ✅ **회수 완결 (2026-07-12, 사이클 4b)** / (b) 크로스 테이블 잔여
- **✅ (a) 회수 (2026-07-12, `634c53f`+`8510e6a`, 단일 진실 `M2-cycle4b-cross-screener.md`)**: 통합 `futures_indicators` datasource(같은 테이블 여섯 번째 렌즈 — 공유 const + "통합≡5 family union" 등치 불변식 = 확장 규약) + dynamicColumns(AI filters/sort 참조 → 컬럼 파생, 큐레이션 0) + [10-79] 헤더. 라이브 G2-b: "low LSR and rising OI" 가 `futures_indicators` + `global_ls_ratio<1 × oi_chg_1h>0` 크로스 필터 + LSR·ΔOI 컬럼 동시 표시로 실증, 기존 family 오유입 0.
- **(b) 잔여 = 다른 테이블 조합**("Low LSR × top gainers" — indicator×ticker JOIN): `future.md §5` derived/virtual datasource(DB VIEW 등록 — (a) 의 table 필드 패턴이 선행 모형). **카테고리**: 💭 미결정 (테마 후보). 아래 이력 보존.
- **근본 (2026-07-11, 사용자 실사용 실증)**: 카드=단일 datasource 바인딩이라 서로 다른 datasource 의 조건을 AND 한 단일 스크리닝 카드가 불가 — AI 가 2카드 분리 또는 한 조건만 반영(현 아키텍처에선 옳은 행동). 두 층위: **(a) 같은 물리 테이블**(예: LSR×OI 급증 — 둘 다 `now_futures_indicator` 한 행)인데 datasource 별 queryableFields 가 metric 스코프로 갈려 AI 가 크로스 필터를 emit 못 함 = 레지스트리 선언 확장만으로 싼 회수. **(b) 다른 테이블**(LSR×ticker gainers — indicator×ticker)= 진짜 JOIN 필요 = `future.md §5 크로스 데이터 분석 1단계`(derived/virtual datasource — DB VIEW 등록 등, 오케스트레이터 무접촉 확장 패턴 유지) 활성화 사안.
- **해결 힌트**: (a) 먼저 (indicator 형제 metric 필드 상호 개방 or 통합 "futures screener" datasource — 데이터 레이어 문제라 form 직교 무침해) → (b) 는 테마 규모(roadmap-mgr 분해 + zod/backend 자문). 실사용 욕구 실증이므로 다음 테마 우선순위 재배치 입력(§H). **블록킹**: No. **카테고리**: 💭 미결정 (테마 후보). **출처**: 사용자 실사용 쿼리 2026-07-11 + `defaults.ts` queryableFields 스코프 실측.
- **★ 사용자 재강조 (2026-07-12, 영구 방향)**: 크로스 쿼리만이 아니라 **최대한 다양한 어떤 요청이든** 적절히 화면을 구성하는 것이 TRAVIS 의 목표(PRD §2 "유저의 어떤 요청이든"). 본 항목은 그 원칙의 현재 최대 갭 = 다음 테마 우선순위 상위 입력. `PRD §2 쿼리 자유도` + `CLAUDE.md §최상위 개발 축 4` 에 명문화 완료. **(a) 는 사이클 4(Stage 4 + 쿼리 자유도 묶음, 사용자 확정 2026-07-12) scope 로 편입.**

### [10-103] forward-fill GROUPS hot/warm/cool/cold 티어 재편 (구 [10-35] 레버 2) — 게이트에서 생략 강등
- **근본 (2026-07-12, [10-35] Step 3 게이트)**: 레버 1 후 정상상태 5m 최악 ~1.5h(단주기 순회 1바퀴). 레버 2 = GROUPS 를 hot `[5m]` / warm `[15m,30m,1h]` / cool `[2h,4h,6h]` / cold `[12h,1d]` + restMs 재편으로 5m ~30분(물리 하한 ~28분 = IP quota 1000req/5min 벽) 가능하나, **사용자 판정 "현 신선도 충분"** — 복잡도·장주기 희생 대비 잔여 이득 낮음.
- **회수 조건**: 실사용에서 5m/15m 차트 신선도 부족 체감 재발 시 재승격. 구현 힌트 = `M2-[10-35]-forward-fill-lag.md §2 레버 2`(버킷 경쟁 탓 추정 불확실 → 실측 기반 restMs 튜닝 필수). **블록킹**: No. **카테고리**: ⚪ 무기한. **출처**: `M2-[10-35]-forward-fill-lag.md §4d` 게이트 판정.

### [10-105] 차트 스타일 축 후속 확장 원장 — 로그 스케일 토글·레퍼런스 라인 + styleAxes 도입 트리거
- **근본 (2026-07-12, 사이클 4a 자문 2건)**: ① crypto-trader — 다음 스타일 축 후보 = **로그 스케일 토글**(3년차 트레이더 습관 1순위, 기하 스타일과 직교하는 별개 축)·**레퍼런스 라인/밴드**(LSR 1.0 중립선 등 유저 지정) ② zod — registry `styleAxes`(컴포넌트별 지원 스타일 축 선언) 도입 트리거 = ⓐ 2번째 스타일 축이 **다른 form** 에 생길 때 ⓑ 프롬프트 산문 안내가 스케일 정지할 때 ⓒ 잘못 쓰면 파괴적인 축 등장 시. 그 전 도입은 YAGNI. 템플릿 = `dataShapes`/`supportedUpdateModes` 동형.
- **회수 조건**: 실사용에서 로그 스케일/레퍼런스 라인 욕구 재발 시 roadmap-mgr 분해. **블록킹**: No. **카테고리**: 🟢 M2+ 확장 루프. **출처**: `M2-cycle4a-chart-style.md §3` 자문.

### [10-106] Stage 4 잔여 AI 계약 축 원장 — `data.fields` 표시 필드 직접 선택 + shape 명시 필드 트리거
- **근본 (2026-07-12, 사이클 4b Stage 4 완료 선언 시 잔여 기록)**: ① **`data.fields` 완전판** — 현재 표시 필드는 filters/sort 참조에서 간접 파생(스크리너 dynamicColumns). AI 가 "보여줄 필드"를 직접 나열하는 축은 프롬프트 비용+포맷 메타 노출 설계가 필요해 이월(참조 파생이 주 유스케이스를 커버함을 G2-b 실증). ② **shape 명시 필드 = YAGNI 확정** — component+datasource 선택이 shape 를 이미 결정(전 컴포넌트 acceptsShapes 단일 원소 핀). 도입 트리거 = "한 form 이 복수 shape 를 소비해 (component, datasource) 쌍만으로 모호해질 때".
- **블록킹**: No. **카테고리**: ⚪ 무기한 (트리거 관측 시). **출처**: `M2-cycle4b-cross-screener.md` Stage 4 판정.

### [10-107] defaults.ts(1078줄)·tableDescriptors.ts(616줄) 파일 분할 — 누적 부채 (reviewer W1)
- **근본 (2026-07-12, 사이클 4b code-reviewer W1)**: CLAUDE.md "파일 작게" 초과 — defaults.ts 는 거래소+datasource 16종+컴포넌트 6종+인터랙션이 한 파일. 선언형이라 스파게티는 아니나 성장 추세. 분할 후보: `registerTickers/registerIndicators/registerHistory/registerComponents` + registerDefaults 는 조합만. [10-98](chartFormat 552줄)·[10-90] 동류.
- **회수 조건**: 다음 registry 대규모 확장(타 거래소/뉴스) 착수 시 선행 분할. **블록킹**: No. **카테고리**: 📋 상시 부채. **출처**: 사이클 4b 리뷰.

### [10-108] 스크리너 4컬럼 절단 시 "필터한 지표 미표시" UX 관찰 (reviewer W2)
- **근본 (2026-07-12)**: AI 가 5개+ metric 참조 시 필터는 전부 적용되나 컬럼은 4개(카드 폭 물리 상한) — 5번째 참조 지표가 화면에 안 보여 "왜 이 행이 걸렸지?" 투명성 저하 가능. sort 필드는 항상 첫 컬럼이라 랭킹 축은 보존. 실사용에서 5개+ 참조 쿼리 빈도 자체가 낮을 것으로 추정 — 발생 실측 후 판단(상한 상향/subtitle "+N more" 고지/카드 wide 사이즈 연동 등).
- **회수 조건**: 실사용 체감 시 crypto-trader 자문. **블록킹**: No. **카테고리**: 💭 미결정 (실사용 관찰). **출처**: 사이클 4b 리뷰 W2.

### [10-93] 오버레이 절대량 %정규화 — "BTC vs ETH OI" 스케일 갭 (crypto-trader D)
- **근본 (2026-07-09 라이브 실측)**: 절대량 metric(OI)의 다중 심볼 오버레이에서 큰 심볼(ETH OI ~2.2M)이 y-scale 을 독식해 작은 심볼(BTC ~100K) 라인이 바닥에 붙음. crypto-domain(Step 3)·crypto-trader(D 자문) 공통 지적 — 트레이더는 절대량이 아닌 **상대 모멘텀**을 보므로 다중 심볼 시 %변화 정규화가 도메인 표준. 단 신규 인터랙션/계약 scope 라 roadmap-mgr 위임 권고(자문). ★ 부수 실측: 시간축 단서 없는 "compare X vs Y OI" 는 AI 가 표(snapshot)를 골라 이 문제를 자연 회피 — 표가 절대량 비교엔 더 나은 형태.
- **★ 도메인 판정 보강 (2026-07-10, crypto-domain-expert — 펀딩 축 추가)**: 정산 주기 상이(8h vs 4h) 심볼의 펀딩 오버레이도 같은 부류 — Binance 공식 `F = [P + clamp]/(8/N)` 이 4h 요율을 절반 스케일하므로 **raw per-settlement 겹침 = "더 싸다" 방향 오독 유발**. 권고: 단일 심볼 = raw(site=DB 유지) / 다중-주기 오버레이 = 정규화(**APR 권고**, 8h 환산 대안) + 축 라벨 고지. 정규화는 descriptor(시맨틱 레이어) 선언으로 — form 하드코딩 금지. 실간격은 fundingTime delta 유도(주기는 동적 가변 — canonical §2.1.1). CoinGlass 실표기 관행은 SPA 라 미확인(사용자 실측 요망). 부수 실측: 4h 그룹 실체 = 상품 페어군(XAU/CL/NATGAS/COPPER 등).
- **회수 예정**: 사용자 결정 후 착수 (`@roadmap-milestone-manager` 분해 — OI %정규화 + 펀딩 주기 정규화 한 묶음). **블록킹**: No. **카테고리**: 💭 미결정. **출처**: `M2-cycle2-genericchart.md §4f` 오버레이 실측 + crypto-trader 자문 2026-07-09 + crypto-domain 판정 2026-07-10 (§4i).

### [10-90] defaults.ts 비대 — registerDefaults 단일 함수 ~900줄 분할 검토
- **근본 (2026-07-08, 사이클 2 Step 3 code-reviewer W3)**: history 6종 가산으로 `packages/shared/src/registries/defaults.ts` 가 ~910줄, `registerDefaults()` 단일 함수. CLAUDE.md "파일 하나에 너무 많이 넣지 마"에 서서히 저촉 (이번 변경 기여 ~90줄 — 원인 아님, 누적 부채).
- **해결 힌트**: 도메인별 모듈 분할(`datasources/tickers.ts`/`datasources/indicators.ts`/`datasources/history.ts`/`components.ts` 등) + `registerDefaults` 는 조립만. 순수 이동 리팩터 — 거동 불변 스냅샷(정확값 핀 테스트들)이 안전망. **블록킹**: No. **카테고리**: 📋 상시 부채 (다음 registry 대규모 가산 시 회수). **출처**: code-reviewer W3 (2026-07-08).

### [10-67] 경로 A ticker UX advisory 묶음 — 옵션 C 급함 / freshness 비대칭 / flash 재배치
- **근본 (crypto-trader advisory, M2 경로 A Step 4 Phase B, 2026-06-24, advisory only)**: ① **옵션 C 재연결이 스캘퍼엔 "너무 조용"할 수 있음** — opacity 40% + 5초 유예 동안 흐린 값을 실값으로 오인 주문 여지(포지션/스윙엔 최적). 페르소나별 급함 상충 → 단일 거동 유지 vs 분기. ② **freshness 비대칭 강조** — 정상 30초 이내 거의 숨김 / 60초+ 멈추면 진하게(현재 상시 균일). brownout 빈도 데이터 축적 후 판단. ③ **% flash 가치 낮음** — 24h%는 표시값 거의 안 변해 발화 드묾 → flash 시각 자원을 거래량/체결방향 등 빠른 metric 으로 재배치 ROI 높음(다음 경로 A 확장과 묶어).
- **회수 예정**: M1 완료 후 실 스캘퍼 피드백("M1 완료 후 사용자 피드백 원칙") 또는 다음 경로 A 확장. **블록킹**: No. **카테고리**: 💭 미결정 (실사용 선별).

### [10-43] 유저 메모 카드 — 캔버스에 직접 기록하는 노트 기능 (M2+ 컴포넌트 후보)
- **아이디어 (2026-06-15, 사용자)**: 테마 C 우측 세션 로그 패널 폐기 결정과 함께 나온 대안 — 유저가 캔버스에 직접 텍스트 메모를 적어 카드처럼 배치/보존 (포스트잇/스티키 노트 식). `saved_views` 와 함께 영구 보존되면 "내 화면 = 내 작업 공간" 컨셉 강화. **AI 생성 카드가 아닌 유저 수동 생성 카드** — 컴포넌트 레지스트리에 새 유형으로 추가 가능(확장성 패턴 부합). `saved_views`(Step 2) 의 `cards_config` 직렬화 구조에 자연스럽게 얹힘.
- **회수 예정**: 테마 C 완료 후 또는 별도 확장 루프 회전. **블록킹**: No. **카테고리**: 🟢 M2+ (확장 루프 신규 컴포넌트)

### [10-21] IndicatorListCard advisory 관찰 3건 — 라이브 G2 후 사용자 결정
- **근본**: crypto-trader 사전 advisory (2026-06-11, `M2-themeA-card-expressiveness.md §4.7`) — ① funding flash 과민(1초 push 미세 변동) 시 임계값 정책 ② 기본 정렬 desc vs |절대값|(쏠림 크기, midline metric 양/음 꼬리) ③ funding 랭킹 MARK 컬럼 유지/제거. 전부 라이브 체감 후 결정 영역 ("M1 완료 후 사용자 피드백 원칙").
- **회수 예정**: 테마 A 라이브 G2 + 실사용 후 사용자 Q1~Q3 확정 시. **블록킹**: No. **카테고리**: 💭 미결정

### [10-109] UTC 표기 UX 후속 관찰 3건 — x축 상시 표식 / Last saved 로컬 예외 / 타임존 토글 (crypto-trader advisory)
- **근본 (2026-07-13, [10-99] UTC 소사이클 crypto-trader 자문 — advisory only)**: ① **차트 x축 근처 상시 "UTC" 표식 부재** — 값은 UTC 렌더지만 hover 전엔 화면 단서 없음(TradingView 는 하단 타임존 상시 표시). 밀도 최소화 vs 스캔 순간 존 착시 방지 트레이드오프. ② **"Last saved at ... UTC"** — 앱 메타 시각(내 행위 로그)은 로컬이 더 직관적일 수 있다는 관찰(정책 일관성 vs 메타 예외). ③ **타임존 토글(UTC↔Local)** — UTC 통일 정책 위의 표시 옵션 후보(정책 되돌림 아님), roadmap 위임 권고. 부수: 자문 Q1(피드 고지 흔들림)은 오독 — `· times UTC` 는 AI subtitle 무관 form 고정 span(이미 승격안 (B) 구현).
- **회수 조건**: 실사용 몇 세션 후 사용자 결정 (①② 는 1분 결정, ③ 은 수요 실측 시 roadmap-mgr). **블록킹**: No. **카테고리**: 💭 미결정 (실사용 관찰). **출처**: `M2-[10-99]-utc-display.md §4`.

### [10-8] datasource `table` 값 generated DB 타입 cross-check (drift 방어 완성)
- **근본**: `DatasourceEntrySchema.table` 은 `z.string().min(1).optional()` — 실제 존재 테이블인지 미검증. `@travis/shared` 는 runtime-agnostic 경계라 generated `Database` 타입 import 불가 → Zod enum 강제 불가. 현재 오타(`now_futures_indicatorr`)는 type/lint/test 통과하고 런타임 Supabase 404 로만 발현. `feedback_optional_type_not_discard_defense` 3번째 사례.
- **현재 충분**: 수기 9개 + `resolveDatasourceTable.test.ts` 9 매핑 박제로 방어. cross-check 는 "완성"수준.
- **해결 힌트**: DB 타입 접근 가능한 web 쪽 테스트에서 "9개 table 값이 generated Tables 키에 존재" 1줄 cross-check (경계 안 깸). 출처: code-reviewer S1/W3 (M2 테마 A Step 1, 2026-06-09). **블록킹**: No.
- **카테고리**: 🟢 M2+ (저비용, 거래소/소스 추가 시 동반)

---

## 📊 섹션별 열린 항목 집계 (2026-07-13 대청소 재계산)

> 묘비(회수 완료) 항목은 `docs/deferred-archive.md` 로 전량 이관 — 본 표는 **열린 항목만** 집계. 구 집계표(2026-05-20 스냅샷)와 🚦 이력 원문은 archive 부록 참조.

| 섹션 | 열린 항목 수 |
|---|---|
| 3. 🟡 M1.6 (인증/RLS) 도입 시 일괄 처리 | 36 |
| 3.5. 🟠 M1.7 (Closed Beta Ops) | 7 |
| 3.8. 🟡 M1.8 (선물 데이터 카탈로그 완성) | 23 |
| 4. 🟢 M2+ 확장 루프 (YAGNI — 실측 후 도입) | 28 |
| 5. 🟠🟡 M1.5~M1.6 사이 UX/안정성 폴리싱 | 5 |
| 6. 🔵 Launch Readiness (§L.1 ~ §L.4) | 22 |
| 7. ⚪ 무기한 deferred / ARCHITECTURE §10 장기 | 3 |
| 9. 💭 ROADMAP §향후 결정 사항 (아직 미결정) | 10 |
| 10. 🟢 실사용 피드백 | 75 |
| **총계** | **209** ([10-99] 회수 −1 / [10-109] 신설 +1, 2026-07-13) |

---

## 🚦 현재 다음 행동

> **★ 2026-07-13 — `[10-100]` 대청소 ✅ 완료**: 묘비 86건 전문 → `docs/deferred-archive.md` 신설 이관, 본 문서는 열린 항목 209건만 유지, §1/§2 압축 + 집계표 재계산. 이전 🚦 이력(테마 A~C 시기)은 archive 부록 참조.
> **★ 2026-07-13 #2 — `[10-99]` UTC 표기 소사이클 ✅ 당일 완료** (신규 이관 규칙 1호 적용 — 항목 제거 + archive 이관): 전 앱 절대 시각 UTC 통일 + 라벨 명시. 단일 진실 `task-record/M2-[10-99]-utc-display.md` + `canonical-metrics.md §4.4`.
> **▶ 다음 = 사이클 5 (Stage 1b — BigValue/Detail 일반화, 사용자 확정 2026-07-13)** — 착수 가이드 = `docs/task-record/M2-composable-expressiveness.md §11 항목 7` + `docs/ROADMAP.md §▶ 다음 확정`. ★ 격자 완성 게이트 = Stage 1b.

---

**문서 유지 규칙**: 항목 완료 시 본 문서에서 제거하고 **전문을 `docs/deferred-archive.md` 로 이관**(회수 커밋·task-record 링크 포함, 원 섹션 표기). 신규 이월 발생 시 적절한 카테고리에 추가하고 출처 파일·회수 예정 시점·블록킹 여부를 반드시 명시.

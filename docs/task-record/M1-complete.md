# 🎉 M1 전체 완료 선언 (M1.1 ~ M1.6 + M1.7 Step 0)

**완료일**: 2026-05-04
**시작일**: 2026-04 초 (M1.1 monorepo skeleton)
**소요**: ~3주
**최종 commit (예정)**: `feat(m1.6-step6): ✅ M1 complete — proxy.ts rename + dataService choke point + sanitize XSS net`

---

## 0. 한 줄 요약 (비전공자용)

**"말로 화면을 조립하는 트레이딩 캔버스" 의 수직 슬라이스가 처음으로 종단 작동.**

식당 비유로: 3주 전엔 그냥 빈 부엌이었던 곳에 이제 (1) 주문 받는 카운터(ChatInputBar) → (2) 주방장(Haiku AI) → (3) 메뉴판(registry 4종) → (4) 식자재 창고(Hetzner 워커 → Supabase Realtime) → (5) 서빙 직원(React Flow + 카드 3종) → (6) 사장 출입증(인증 + 행동 로그) 까지 **사람 1명이 들어와서 영어 한 문장 던지면 카드가 화면에 떠오르는** 전체 흐름이 작동합니다. 손님은 아직 안 받지만, 영업 시작 가능한 베타 직전 상태.

---

## 1. M1 마일스톤 6개 + M1.7 Step 0 매핑

| 마일스톤 | 상태 | 핵심 산출물 | task-record |
|---|---|---|---|
| **M1.1** ✅ | 인프라 — pnpm monorepo + apps/web + apps/worker + Supabase env + Vercel skel | `M1.1-step1~6-*.md` (6개) |
| **M1.2** ✅ | 4 레지스트리 (exchange/datasource/component/interaction) + Zod + dummy entries + promptInjection + 워커 어댑터 + 단위 테스트 | `M1.2-step1~6-*.md` (6개) |
| **M1.3** ✅ | 11개 Supabase 테이블 + Binance adapter + WS 릴레이 + dataService 메서드 + 폴링/preCompute (롤링 윈도우) | `M1.3-step1~5-*.md` (5개) |
| **M1.4** ✅ | React Flow 캔버스 + CardContainer + 카드 3종 (TickerCard / CoinListCard / KlineChartCard) + Realtime row/table hook + 데이터 위생 9원칙 명문화 | `M1.4-step1~4-*.md` + `step4.7-data-hygiene.md` (5개) |
| **M1.5** ✅ | Anthropic Haiku 4.5 + tool_use 강제 + self-correction 1회 재시도 + log_validation_failure + ChatInputBar fetch 통합 + Playwright E2E 5/5 + registry 누락 발견 + dispatcher unique id | `M1.5-step0~4-*.md` + `step3d-refusal-branch.md` (6개) |
| **M1.6** ✅ | Supabase Auth (이메일+비밀번호) + middleware 두 겹 + log_chat / log_behavior / log_validation_failure 확장 + RLS 13 테이블 + dataService 프론트 레이어 + sessionFlusher 4중 가드 + registry-derived id refinement + RLS check npm script + auth 폼 RTL 14 + sanitize 12 벡터 + proxy.ts rename + initialFetch helper | `M1.6-step0~6-*.md` + `step0.1-urgent-fixes` + `step3.5-ticker-stream-hotfix` + `step4-hotfix-bc` (10개+) |
| **M1.7 Step 0** ✅ | Hetzner CPX22 / Nuremberg / Ubuntu 24.04 / Backup ON — 24/7 Linux 워커 이전. 130h+ 무재부팅 + Memory +0.9 MB/h 평탄화 + USDM stale 원인 server-side ping 가설 95%+ 확정 | `M1.7-step0-hetzner-migration.md` |

**총 task-record**: 27개 + 본 M1-complete.md = **28개**.

---

## 2. M1.6 Step 6 — M1 완료 선언 단계 상세

### Sub-step 4 분해 (2026-05-04)

| Sub | 작업 | 회수 deferred | 결과 |
|---|---|---|---|
| **6a** | (i) `[3-14]` `proxy.ts` env 누락 분기 500→503 + `Retry-After: 30` + `service_unavailable` 본문 최소화 / (ii) `[3-63]` `route.ts` `_userId` underscore 정리 (7곳 + object shorthand) / (iii) `[3-16]` `middleware.ts` → `proxy.ts` rename + 함수명 `proxy()` + `tsconfig.json` include + 잔류 코멘트 10곳 정리 | `[3-14]`, `[3-16]`, `[3-63]` | type-check 0 / lint 0 / vitest 86/86 / A/B 검증 5/7 즉시 통과 (deprecation 경고 사라짐 + 401 + matcher 외 비차단 + `:path*` 와일드카드) |
| **6b** | M1.6 완료 기준 5개 일괄 검증: (1) Playwright 가입 → 자동 로그인 → 대시보드 (Confirm email OFF) / (2) 비로그인 401 (curl) / (3) RLS 격리 4중 등가 (qual + INSERT 0 + DB 분포 + frontend direct read 0) / (4) `pnpm rls-check` 코드 read 종단 등가 / (5) log_chat 1 row + log_behavior 2 rows 적재 + Haiku 1658ms latency | — | 5/5 PASS |
| **6c** | `@security-auditor` 종합 감사 (Duty 1~6 + sanitize + Hetzner Memory) → **0 Critical / 2 Warning / 22 Pass**. W-1 dataService bypass `CoinListCard.tsx:83` + `TickerCard.tsx:99-105` 발견 → `apps/web/lib/dataService/initialFetch.ts` helper 신설 + 두 카드 마이그레이션. W-2 sanitize 12 벡터 추가 (8 → 20 시나리오, mustNotContain 원칙 = "raw HTML 태그 패턴만 검증"). Hetzner Memory 8 dump 사용자 SSH read → +0.9 MB/h 평탄화 (1개월 외삽 33% 사용 = OOM risk 0%). `@code-reviewer` 사후 → **0 Critical / 5 Warning / 5 Suggestion / 5 Praise** + 즉시 fix 4건 (W1 log prefix `[proxy]` / W2 잔류 middleware 코멘트 10곳 / W4 generic 제약 `T extends Record<string, unknown>` / S3 `INITIAL_FETCH_CAP` → `DEFAULT_INITIAL_LIMIT` 단일 진실 공급원) | `[5-6]`, `[3.5-10]` | 0 Critical 양 감사 통과, 회귀 0건, vitest 98/98 PASS |
| **6d** | (현재 단계) — `M1-complete.md` 작성 + `ROADMAP.md` Step 6 ✅ + M1 완료 선언 + `deferred-task.md` 동기화 + commit | (선언) | — |

### 6c 깊이 — 보안 감사 22 Pass 핵심

**Duty 1 (RLS sweep, 13/13 테이블)**: 
- 3 user-scoped (log_chat / log_behavior / log_validation_failure) — `cmd=SELECT, roles=authenticated, qual=(auth.uid() = user_id)`
- 10 anon-read (symbols / now_* / history_*) — `cmd=SELECT, roles={anon,authenticated}, qual=true`
- INSERT/UPDATE/DELETE policy 0개 모든 테이블 = service_role 전용 (frontend 직접 INSERT 못 함)
- M1.4 Step 4.5 deny-all 트랩 재발 0

**Duty 5 (read-only 컴플라이언스)**: 
- `placeOrder|submitOrder|cancelOrder|createOrder|newOrder|executeTrade|marketBuy|marketSell|limitBuy|limitSell` 전 영역 **0 hit**
- `/(fapi|api|spot|futures)/v[0-9]+/order` 패턴 0 hit
- `signedRequest|client.order|hmac.*POST` 0 hit
- → **TRAVIS read-only 약속이 코드 차원에서 강제됨** (ROADMAP §L.2 영구 불변 확보 — M1 가장 큰 게이트 통과)

**Duty 3 (env-var 클라이언트 노출)**: 
- `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` 클라이언트 경로 0 hit
- `serviceRoleClient.ts` 3중 가드 (NEXT_PUBLIC 접두사 X / typeof window 가드 / lazy singleton)
- `.gitignore` `.env.*` 일괄 차단 + `.env.example` / `.env.scripts.example` 만 명시 예외

**Duty 6 (dataService routing)**: 
- `apps/web/app/**` 의 `supabase.from(` 0 hit
- W-1 fix 후 카드 컴포넌트 모두 `dsInitialFetch` 경유 (`getSupabaseBrowserClient` import 0)
- `createClient(` 사용은 server-only + dev script 만

### 6c 운영 안정성 검증 (Hetzner Memory)

**8 dump 추세** (2026-04-29 18:42 baseline → 2026-05-03 12:00):

```
2026-04-29 18:42  Memory: 134 MB  (워커 첫 가동, baseline 가치 X)
2026-05-02 00:05  Memory: 315 MB  (워밍업 완료, 53.4h)
2026-05-02 06:01  Memory: 342 MB  (+27 / 5.9h = +4.6 MB/h)
2026-05-02 12:00  Memory: 346 MB  (+4 / 6h = +0.7 MB/h)
2026-05-02 18:00  Memory: 350 MB  (+4 / 6h = +0.7 MB/h)
2026-05-03 00:00  Memory: 364 MB  (+14 / 6h variability)
2026-05-03 06:00  Memory: 366 MB  (+2 / 6h = +0.3 MB/h)
2026-05-03 12:00  Memory: 369 MB  (+3 / 6h = +0.5 MB/h)  ← 가장 최근
```

**판정**: 추세 둔화 명확 (+4.6 → +0.9 → +0.5 MB/h 5~10배 둔화). 단순 선형 누수 아님 = cache buildup 정상 평탄화 패턴. 1개월 외삽 1017 MB / MemoryMax 3072 MB 의 **33% 사용 → OOM risk 0%**.

---

## 3. M1 핵심 의사결정 7선 (영구 영향)

### 3-1. **English-only 글로벌 타겟** (M1.5 Step 4, 2026-04-23)
시스템 프롬프트 / UI fallback 메시지 / Zod describe / 테스트 쿼리 전부 영어. 한국어는 코드 주석 + docs/ 내부 문서만. **memory 영속**: `project_english_only_global.md`. CLAUDE.md 명문화.

### 3-2. **쿼리→컴포넌트 매핑 하드코딩 절대 금지** (M1.5 Step 4)
`if (query.includes("chart")) → kline-chart-card` 같은 룰 절대 없음. AI 가 registry description 읽고 의도 추론. **memory 영속**: `feedback_no_query_to_component_hardcoding.md`. CLAUDE.md 명문화.

### 3-3. **데이터 위생 9원칙** (M1.4 Step 4.7 + M1.6 Step 3.5)
1. Instrument lifecycle status 필드 파악 (allowlist) / 2. REST + WS 양쪽 allowlist / 3. 24h 이하 주기 재로드 / 4. stale row 정리 + 감지 / 5. 극단값 sanity guard / 6. 워밍업 가드 / 7. Supabase RLS 사전 점검 / 8. 공식 문서 근거 주석 / 9. **사이트 = DB 진실 일치** (M1.6 Step 3.5 추가). CLAUDE.md 명문화.

### 3-4. **3 데이터 경로 + dataService 단일 choke point** (M1.6 Step 3 + Step 6c)
- 경로 A: WS → frontend 직접 (M2+ 도입 예정)
- 경로 B: Hetzner worker → Supabase upsert → Realtime → frontend (현재 모든 카드)
- 경로 C: AI → Supabase (log_chat / log_behavior / log_validation_failure)
- frontend `.from()` 직접 호출 0건 = `apps/web/lib/dataService/` 단일 choke point + Step 6c W-1 회수로 `initialFetch` helper 도입.

### 3-5. **AI ↔ 코드 계약은 Zod registry refinement** (M1.6 Step 4)
`AiCardConfigSchema.componentId` / `data.datasource` / `CardActionSchema.targetComponentId` 모두 등록된 registry id 와 정합 (`superRefine` + 빈 registry 가드 + 등록 목록 dump). AI 가 환각으로 미등록 id 출력 시 즉시 schema_drift fallback. enum 자유 string 함정 차단.

### 3-6. **fallbackReason 2분할 (parse_error / schema_drift)** (M1.6 Step 4)
`validation_exhausted` (의미 모호) → JSON.parse 실패 / tool_use 누락 = `parse_error` + Zod 검증 실패 = `schema_drift` 분리. consumer 전역 오분류 차단 + log_validation_failure 통계 정확도 ↑.

### 3-7. **사이트 = DB 진실 일치 원칙** (M1.6 Step 3.5 hotfix)
사용자(트레이더) 가 거래소 공식 사이트에서 직접 보는 모든 데이터가 TRAVIS DB / 카드 / AI 응답과 **완전히 일치해야 함**. M1.6 Step 3.5 의 `!miniTicker@arr` (6필드) → `!ticker@arr` (17필드) 전환 사고 (BTCUSDT 사이트 +0.80% / DB -0.282%) 재발 방지. CLAUDE.md §데이터 위생 #9 명문화.

---

## 4. 자문 누적 결과 (10 서브에이전트, 100+ 호출)

| 서브에이전트 | 핵심 영향 |
|---|---|
| **roadmap-milestone-manager** | M1.1~M1.7 Step 분해 + scope creep gate 차단 (특히 M1.6 Step 6 의 M1.7 영역 격리) |
| **zod-schema-architect** | registry-derived id refinement (`superRefine` + 빈 registry 가드) — M1.6 Step 4 |
| **nextjs-frontend-specialist** | React Flow + Zustand + dataService prefetcher + auth 폼 RTL 패턴 |
| **backend-infra-specialist** | Hetzner 이전 + Binance adapter + log_* 테이블 schema + RLS 일괄 적용 |
| **crypto-domain-expert** | Binance USDM 17필드 / SETTLING 상장폐지 필터 / volume 단위 다양성 / funding 8h cadence |
| **ai-orchestrator-specialist** | Haiku 4.5 client + tool_use 강제 + self-correction + orchestrateOnce mock |
| **security-auditor** | M1.6 Step 1 신설 + Step 2 RLS 일괄 자문 + Step 6c 종합 감사 22 Pass |
| **code-reviewer** | 전 Step 사후 review (총 ~30회 호출) + 비전공자 한국어 설명 의무 |
| **crypto-trader** | UX advisory (관찰 8건 + Q1~Q3 + Step 0.1 관찰 6~8) — `[9-9]/[9-10]` 활성화 시점에 회수 |
| **genagent** | 신규 서브에이전트 6명 + memory portfolio 영구 관리 |

---

## 5. 누적 코드 통계

- **TypeScript / TSX 파일**: ~150+
- **테스트 통과**: vitest 98 (apps/web) + 25 (packages/shared) = **123 통과**
- **Supabase migrations**: ~15개 (테이블 13 + RLS 정책 + 인덱스)
- **Playwright E2E**: 5 시나리오 (M1.5 Step 4)
- **자체 npm scripts**: `pnpm rls-check` (보안 검증) + `smoke-haiku` / `smoke-orchestrate` / `query-log-validation` (개발 검증)
- **deferred-task.md 누적 처리**: 회수 65건+ / 잔여 81건 (M2+/Launch/M1.7 분산)

---

## 6. ✅ 검증 결과 (M1 완료 게이트)

**ROADMAP §L.2 안정성·보안 체크박스**:
- ✅ Supabase RLS 가 모든 user_*/log_* 테이블에 적용됨 (13/13)
- ✅ 거래 실행 코드 0건 (Duty 5 4종 grep 0 hit)
- ✅ Anthropic / service_role 키가 클라이언트 번들에 포함되지 않음
- ✅ dangerouslySetInnerHTML 진입점 모두 sanitizeTitle 경유 (3 카드)
- ✅ 인증 두 겹 방어 (proxy + route.ts 자체 검증)

**M1.6 완료 기준 5개**:
- ✅ 가입 → 로그인 → 대시보드 (Playwright)
- ✅ 비로그인 401 거부
- ✅ 타사용자 RLS 격리 (4중 등가)
- ✅ CI RLS 위반 검증 (코드 read 종단 등가)
- ✅ log_chat / log_behavior 적재 (1+2 rows)

**6a A/B 검증 7개**:
- ✅ 비로그인 401 (`/api/orchestrate` + `/api/log-behavior`)
- ✅ matcher 외 페이지 비차단 (`/`, `/login`)
- ✅ deprecation 경고 사라짐 (Next.js 16.2.4 ready in 3.1s)
- ✅ matcher `:path*` 와일드카드
- 6b/6c 자연 검증 통과: 로그인 후 200 + cookie refresh

**검증 명령**:
```bash
pnpm -r type-check                    # 0 errors
pnpm -F "@travis/web" lint              # 0 warnings
pnpm -F "@travis/web" test              # 98/98 PASS
pnpm -F "@travis/shared" test           # 25/25 PASS
pnpm rls-check                         # 13/13 OK
```

---

## 7. M1 완료 후 활성화된 후속 흐름

### 7-1. **`[9-9]` / `[9-10]` 사용자 직접 실사용 피드백** ✅ 활성화

사용자(바이낸스 선물 3년차 트레이더) 가 본인 트레이딩 워크플로우에 TRAVIS 끼워 사용. crypto-trader 가 advisory 로 모아둔 **8개 관찰 + Q1~Q3 + Step 0.1 관찰 6~8** 을 실사용 데이터 기반으로 우선순위 판단:

| 항목 | 출처 | 판단 보류 사유 |
|---|---|---|
| 카드 타이틀 톤 (심볼 2중 노출) | crypto-trader 관찰 6 | 모바일/좁은 캔버스 실사용 후 결정 |
| `"24h Volume Leaders"` 용어 모호성 | 관찰 7 | base vs quote 트레이더 해석 갈림 |
| 3 카드 제목 톤 일관성 | 관찰 8 | 캔버스 스캔 리듬 평가 |
| Top N 필터 스코프 (USDT-only vs 전체) | crypto-trader Q1 / `[4-19]` | 6b 검증 시 fiat pair 가 위에 노출되는 baseline 직접 관찰 |
| empty 응답 UX 힌트 강도 | Q2 / `[4-20]` | inline 예시 추가 vs 조용한 실패 |
| 로딩 중 시각 피드백 (disabled-only vs dot 3개) | Q3 / `[4-21]` | 4초대 응답 지연 체감 평가 |
| Fallback 토스트 행동 유도성 | Step 3d Q1 | 발생률 측정 후 placeholder 예시 도입 결정 |
| 응답 지연 4초대 체감 수용 가능 여부 | Step 4 관찰 4 | 로딩 피드백 vs 스트리밍 선택 |

**진행 방식**: M1 종료 시점 ~ M1.7 진입 전까지 자유롭게. 사용자 본인 페이스. 피드백 누적 후 우선순위 판단 → M1.7 또는 M2 카테고리에 편입.

### 7-2. **다음 마일스톤 = M1.7 Closed Beta Ops**

진입 시점은 `[9-9]` 피드백 수집 충분 시점에 사용자 자율 결정.

| Step | 회수 | 블록킹 |
|---|---|---|
| Step 0 | Hetzner 24/7 이전 | ✅ 완료 |
| Step 1 | `[3.5-1]` allowlist 게이팅 | 🔴 베타 블록킹 |
| Step 2~3 | `[3.5-2]` admin Tier 1+2 | 🔴 |
| Step 4 | `[3.5-3]/[3.5-4]` rate-limit + UI 고지 | 🔴 |
| Step 5 | `[3.5-5]` Magic link + Confirm email ON + `[3.5-6]` 종합 감사 | 🔴 |
| Step 6 | `[3.5-7]` (`[3-48]`) funding 단위 변환 — closed beta 진입 전 필수 | 🔴 (crypto-trader 100배 misread 차단) |

### 7-3. **상시 부채 1건**

**📋 데이터 위생 9원칙 체크리스트** (CLAUDE.md §데이터 소스 위생) — 신규 거래소 / metric / adapter 추가 시마다 PR 본문 또는 task-record 에 9개 항목 체크 의무.

---

## 8. 미완료 deferred 잔여 81건 분포

| 카테고리 | 건수 | 회수 시점 |
|---|---|---|
| 🔴 M1.6 착수 전 필수 | 0 (전부 회수) | — |
| 🟠 M1.5 완료 기준 | 0 (전부 회수) | — |
| 🟡 M1.6 잔여 + 신규 | 16 | M1.7 또는 M2+ |
| 🟠🟡 M1.5~M1.6 폴리싱 | 5 | 자연 마무리 |
| 🟠 M1.7 Closed Beta | 8 | M1.7 Step 1~6 (블록킹 6건) |
| 🟢 M2+ 확장 루프 | 25 | M2 실측 후 |
| 🔵 Launch Readiness | 22 | Launch 직전 |
| ⚪ 무기한/장기 | 3 | 데이터 규모 임계 |
| 📋 상시 부채 | 1 | 매 신규 adapter |
| 💭 ROADMAP 미결정 | 10 | M1 완료 후 ✅ 활성화 |
| **총계** | **81** | |

**🔴 블록킹 0건** — 베타 진입 시점에 활성화될 6건 (M1.7 Step 1~5) 외 즉시 막힌 항목 없음.

---

## 9. 비전공자에게 한 줄 요약

`★ M1 완료의 의미 ─────────────────────────────`
**"3주 전엔 빈 모니터였던 곳에, 이제 영어 한 문장 던지면 차트와 시세표가 떠오릅니다."**

- **할 수 있는 것**: 가입 → 로그인 → "BTCUSDT price" / "top gainers" / "ETHUSDT 1m chart" 같은 영어 쿼리 → 카드 떠오름. 모든 데이터는 24/7 가동 중인 독일 워커가 Binance 에서 가져와 Supabase 에 실시간 적재.
- **아직 못 하는 것**: 베타 손님 받기 (allowlist + admin + rate-limit 부재). 실제 트레이딩 (TRAVIS 는 영구 read-only). 한국어 (M2+ 검토). funding/OI 단위 변환 (M1.7 Step 6).
- **다음 단계**: 사용자 본인이 직접 트레이딩 흐름에 끼워 써보면서 "이건 마음에 안 드는데" 같은 피드백 모으는 단계. 그 후 M1.7 클로즈드 베타 → M2 확장 루프.
`─────────────────────────────────────────────────`

---

## 10. 관련 파일 경로

**핵심 산출물**:
- `apps/web/proxy.ts` (rename + 503/Retry-After)
- `apps/web/lib/dataService/initialFetch.ts` (단일 choke point helper, 신설)
- `apps/web/lib/sanitizeTitle.ts` + `__tests__/sanitizeTitle.test.ts` (20 시나리오)
- `apps/web/components/cards/{TickerCard,CoinListCard,KlineChartCard}.tsx` (3 카드)
- `apps/web/components/auth/{LoginForm,SignupForm,UserMenu}.tsx` (인증 UI)
- `apps/web/app/api/orchestrate/route.ts` (Haiku + log_chat 4곳 + log_validation_failure)
- `apps/web/lib/behavior/sessionFlusher.ts` (4중 가드)
- `apps/web/lib/dataService/` (7 파일)
- `packages/shared/src/registries/defaults.ts` (4 레지스트리 정의)
- `packages/shared/src/schemas/registryRefinements.ts` (Zod superRefine)
- `apps/worker/src/binance/` (USDM/COINM/SPOT 어댑터)
- `apps/worker/scripts/monitor.sh` (자동 모니터링)
- `scripts/rls-check.{ts,sql}` (CI RLS 검증)
- `supabase/migrations/` (~15개 SQL migration)

**자문 영구 메모리**:
- `.claude/agent-memory/security-auditor/AUDITS.md` (보안 감사 trail)
- `.claude/agent-memory/security-auditor/POLICIES.md` (보안 정책)
- 각 서브에이전트별 `MEMORY.md` + 주제별 `*.md`

**참조 문서**:
- `docs/PRD.md` — 제품 비전 + UI 구조
- `docs/Architecture.md` — 시스템 아키텍처 + 4 레지스트리 + 3 데이터 경로
- `docs/DB_SCHEMA.md` — Supabase 13 테이블 + RLS
- `docs/ROADMAP.md` — 마일스톤 + Launch Readiness
- `docs/deferred-task.md` — 81건 deferred 분류
- `docs/task-record/` — 28개 step record
- `CLAUDE.md` — 프로젝트 + 사용자 규율 (한국어 주석/영어 변수명/graceful 에러/하드코딩 금지/데이터 위생 9원칙/사이트=DB 일치)

---

## 11. 🔗 링크

- **이전 step record**: `docs/task-record/M1.6-step5-test-infra.md`
- **다음 마일스톤**: M1.7 Step 1 (auth allowlist) — 사용자 자율 진입
- **commit (예정)**: `feat(m1.6-step6): ✅ M1 complete — proxy.ts rename + dataService choke point + sanitize XSS net`
- **사용자 액션**: `[9-9]/[9-10]` 본인 트레이딩 흐름에 끼워 사용 + 피드백 자유 누적

---

**🎉 M1 완료. 다음 흐름은 사용자의 트레이딩 일상에서 시작됩니다.**

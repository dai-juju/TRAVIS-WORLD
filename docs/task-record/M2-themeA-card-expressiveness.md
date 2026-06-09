# M2 테마 A — 카드 표현력 확장 (진행 중)

> **상태**: 🔄 **진행 중** (2026-06-09 착수). M2-plan §Step 2 확장 루프의 첫 테마.
> **단일 진실**: 본 파일 = 테마 A 전체(Step 0~5) 추적처. 실사용 발견 맥락 = `docs/task-record/M2-step2-usage-feedback.md §H`. deferred = `[10-1]`(F1 liveness) / `[10-3]`(F3 metric 카드) / `[8-27]` #1·#4(배관 빚).
> **분해 출처**: `@roadmap-milestone-manager` (2026-06-09). 메모리 `.claude/agent-memory/roadmap-milestone-manager/project_m2_themeA_breakdown.md`.

---

## 0. 테마 A 는 무엇인가 (비전공자 요약)

실사용 세션 #1 에서 발견된 두 결함을 한 테마로 묶었다 — 둘 다 **"카드의 행(row) 표현력"** 이 부족해서 생긴 같은 뿌리이기 때문:

- **기둥 1 (F3/[10-3])**: "top OI" · "funding + LSR" 쿼리가 빨간 "realtime error" 로 깨짐. → `now_futures_indicator` 의 전 metric(펀딩·OI·LSR·basis·taker)을 카드로 표현. **데이터는 이미 DB 에 다 있음(766행) = 최저 비용·최고 체감.**
- **기둥 2 (F1/[10-1])**: gainers 리스트가 "살아있는 느낌" 약함. → flash + 순위 FLIP 모션. crypto-trader 진단: 체감 80% 가 시각 신호 부재, 20% 만 실제 latency.

두 기둥이 **공통 row 컴포넌트** 를 공유하므로 한 테마.

---

## 1. 6-Step 분해 (예상 13~18h)

| Step | 목표 | 산출물 핵심 | 회수 | 상태 |
|---|---|---|---|---|
| **0** | F3 즉시 안전망 — 깨진 "realtime error" → graceful "coming soon" | 렌더 가능 datasource allowlist (표시 계층 가드) | `[10-3]` 부분 | ✅ **완료 (2026-06-09)** |
| **1** | `[8-27]` 빚 #1 — datasource id ≠ 테이블명 분리 (`table` 필드) | registry/dataService 배관 리팩터 | `[8-27]`#1 | ✅ **완료 (2026-06-09)** |
| **2** | IndicatorCard (단일 심볼 metric 카드) | 새 카드 + registry 등록 | `[10-3]` | 📋 |
| **3** | IndicatorListCard (정렬 랭킹) → 기둥1 완결 | 새 카드 | `[10-3]` | 📋 |
| **4** | 공통 LiveRow 추출 (flash + 순위 FLIP) → 기둥2 | TickerCard flash 패턴 공유 | `[10-1]` | 📋 |
| **5** | 통합검증 + 회수 + docs sync | 신규 코드 0 | — | 📋 |

**Scope 경계 (테마 A 에서 안 함)**: 경로 A WS 직결 / `[8-27]` #2·#3·#5·#6 / 거래소 다변화(OKX·Bybit) / 새 데이터소스 / canonical 재설계.

---

## 2. Step 0 — F3 즉시 안전망 ✅ (2026-06-09)

### 문제 (코드 근거)
`initialFetch.ts:29` 의 `datasource` 타입은 실제 테이블명만 받는데, `CoinListCard.tsx:90` / `TickerCard.tsx:105` 가 `datasource as NowTickerTable` 로 강제 캐스트. AI 가 "top OI" → `datasource:"open_interest"` 발행(정당 — registry 등록됨) → `client.from("open_interest")` → 물리 테이블 없음(실테이블은 `now_futures_indicator` 1개) → throw → `status="error"` → 빨간 `! realtime error`.

### 해결 (표시 계층 방어선)
AI 프롬프트 부탁이 아니라 **렌더 직전 구조로** 차단 (M1.5 "id 충돌은 dispatcher 가 구조로 막는다" 철학):

| # | 작업 | 파일 |
|---|---|---|
| 1 | 렌더 가능 `_now` ticker 테이블 allowlist + `isRenderableTickerDatasource()` 순수 함수 + `COMING_SOON_LABEL` 상수 | ➕ `apps/web/lib/cards/renderableDatasource.ts` |
| 2 | CoinListCard: `renderable` 계산 → `enabled && renderable`(구독 skip) → 분기 맨 앞 `!renderable` → "coming soon" | ✏️ `CoinListCard.tsx` |
| 3 | TickerCard: 동일 패턴 + `ComingSoonStub` | ✏️ `TickerCard.tsx` |
| 4 | 가드 회귀 테스트 5 케이스 (ticker→true / indicator 논리id→false / 물리 indicator 테이블→false / nullish→false / allowlist 내용) | ➕ `lib/cards/__tests__/renderableDatasource.test.ts` |

문구는 **중립적 generic** "this data view is coming soon" (사용자 결정 2026-06-09 — datasource 내부 이름 비노출).

### 검증
- `pnpm -F web type-check` green / `lint` green / `test` **138 passed** (기존 133 + 신규 5, 회귀 0).
- `enabled=false` → `channelManager.subscribe()` 미호출 → 채널 누수 0 (code-reviewer 검증, hooks.ts:105-109).

### 자문 결과
- **code-reviewer**: Critical 0. W1(누락 위험 주석)·W2(물리 테이블 false 회귀 케이스)·S1(문구 상수화) **즉시 반영**. S3(타입 단일 진실)은 Step 1 에서 제거될 임시물이라 보류. "쿼리→컴포넌트 하드매핑 금지" 원칙 위반 아님 확인(렌더 가드 ≠ 의도 추론).
- **crypto-trader** (advisory): ① "coming soon" 은 빨간 error 보다 분명 우월(generic 유지 = 사용자 결정 존중). ② ★ **신호** — 하필 막힌 두 metric(OI / funding+LSR)이 본인 기록 "카드 없어 답답함" 1·2위와 일치. 잔잔한 장 며칠로 "버틸 만하다" 결론 위험 — 변동성 큰 날 답답함 1회 발생 시 Step 2(OI 카드) 당길 신호.

### 산출물
- ➕ `apps/web/lib/cards/renderableDatasource.ts`
- ➕ `apps/web/lib/cards/__tests__/renderableDatasource.test.ts`
- ✏️ `apps/web/components/cards/CoinListCard.tsx`
- ✏️ `apps/web/components/cards/TickerCard.tsx`

### Step 1 인계 메모
- 본 allowlist 는 **Step 3(IndicatorListCard 완결) 후 제거** (Step 1 은 배관만 — ticker 카드는 여전히 indicator 컬럼 못 그리므로 coming soon 유지). 코드 분석 결과 정정.
- `COMING_SOON_LABEL` 상수화로 grep 한 번에 제거 지점 추적 가능.

---

## 3. Step 1 — datasource id ≠ 물리 테이블명 분리 ✅ (2026-06-09)

### 배경 (코드 근거)
`defaults.ts:24-30` 주석이 예고한 "대안 B". M1.6 Step 0.1 에서 ticker 2개만 임시(대안 A)로 id=테이블명을 맞췄고, indicator 6개는 id≠테이블명으로 남겨둔 게 F3 로 발현. `DatasourceEntrySchema` 에 물리 테이블명 필드가 없어 datasource id 가 곧 테이블명으로 강결합 (`channelManager.ts:205` `{table: datasource}` / `initialFetch.ts:85` `from(datasource)`).

### ⚠️ Scope 정정 (사용자 승인 2026-06-09)
roadmap-mgr 분해의 #1·#4 묶음 → **코드 분석 후 #1 단일로 정정**:
- **빚 #4 제외**: indicator 카드는 datasource id 자체가 metric 그룹을 의미 → 기존 거래소 용어(datasource/symbol/filters/sort)로 충분. #4(뉴스 category/매크로 series_id)는 비-거래소용 → 잔여.
- **fetchKind 제외**: 외부 API 구분은 비-거래소용. `table` 필드만.
- **allowlist 제거는 Step 3**: Step 1 은 배관만. ticker 카드는 indicator 컬럼 못 그림 → coming soon 유지.

### 해결 (배관 계층)
| # | 작업 | 파일 |
|---|---|---|
| 1 | `DatasourceEntrySchema` 에 `table?: string` + `resolveDatasourceTable(id)` (entry.table ?? id, 미등록 graceful + store 빈 거 1회 조기경보) | `datasourceRegistry.ts` |
| 2 | 9 datasource 중 8개에 `table` 명시 (indicator 4→`now_futures_indicator`, symbols_meta→`symbols`, liquidation→`history_futures_liquidation`, ticker 2→자기자신; kline 생략) | `defaults.ts` |
| 3 | `resolveDatasourceTable` 배럴 export | `registries/index.ts` + `src/index.ts` |
| 4 | `initialFetch` `from(resolve(ds))` + `channelManager` **table 기준** 채널 운영 (같은 테이블 가리키는 논리 datasource 채널 공유) | `initialFetch.ts`, `channelManager.ts` |
| 5 | (자동 해결) 브라우저 registry — `registries/index.ts` top-level `registerDefaults()` 가 배럴 value import 시 자동 실행. 별도 부트스트랩 불필요 | — |
| 6 | 단위 테스트 — resolveDatasourceTable 9 매핑 + channelManager 채널 공유 | ➕ test 2 |

### 검증
- 전체 6 패키지 type-check Done (에러 0) / web lint green
- shared 30 test (resolveDatasourceTable 5 신규) / web 139 test (채널 공유 1 신규, 회귀 0)
- ★ 자동 등록 실증: resolveDatasourceTable value import → 브라우저 registry 자동 등록 (이전 type-only import 라 미등록이던 것 해소). promptInjection 은 `table` 미직렬화 → AI 비노출 확인.

### 자문 (code-reviewer, Critical 0)
- **즉시 반영**: W2(채널 공유 회귀 테스트) + S2(store 빈 거 1회 조기경보) + S3(주석 "배럴 자동등록"으로 갱신).
- **deferred**: W1(`[10-7]` 채널 공유 fan-out cross-talk — Step 2 indicator 카드 노출 전 회수) + S1(`[10-8]` table 값 generated DB 타입 cross-check — 현 9매핑 테스트로 충분, 무거운 대조 보류).

### 산출물
- ✏️ `packages/shared/src/registries/datasourceRegistry.ts` (table 필드 + resolveDatasourceTable)
- ✏️ `packages/shared/src/registries/defaults.ts` (8 entry table)
- ✏️ `packages/shared/src/registries/index.ts` + `src/index.ts` (배럴)
- ✏️ `apps/web/lib/dataService/initialFetch.ts` + `channelManager.ts`
- ➕ `packages/shared/src/registries/__tests__/resolveDatasourceTable.test.ts`
- ✏️ `apps/web/lib/dataService/__tests__/channelManager.test.ts` (채널 공유 케이스)

### Step 2 인계 메모 (★ 중요)
- **`[10-7]` 먼저 회수**: indicator 카드 노출 시 같은 now_futures_indicator row 를 4 도메인이 공유 → OI 만 바뀌어도 펀딩/LSR 카드 재렌더. Step 2 에서 hooks `match`/`pk` 가 "관심 컬럼 dirty check" 하도록. crypto-trader + 저사양 자문 동반.
- Step 1 로 indicator datasource 는 배관상 정상 구독 가능 → IndicatorCard 가 allowlist(`renderableDatasource.ts`)에 자기 datasource 추가하면 즉시 데이터 흐름.

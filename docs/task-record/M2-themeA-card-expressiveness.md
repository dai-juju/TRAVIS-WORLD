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
| **2** | IndicatorCard (단일 심볼 metric 카드) | 새 카드 + registry 등록 + `[10-7]` 회수 | `[10-3]` 부분 / `[10-7]` | 🔶 **코드 완료 (2026-06-09) / 데이터 보류** — 라이브 site=DB 에서 `[10-11]` @arr stall 사고 발견 (markPrice frozen). 카드 무결, DB stale. **@arr 근본 수정 후 마무리** |
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

---

## 4. Step 2 — IndicatorCard (단일 심볼 지표 카드) ✅ (2026-06-09)

### 무엇을 만들었나 (비전공자 요약)
선물 지표 한 테이블(`now_futures_indicator`, 31컬럼)의 **단일 심볼 지표 카드**. AI 가 의도(funding/OI/LSR/taker/basis)에 맞춰 datasource 를 고르면, **하나의 generic 카드**가 그 metric 그룹으로 변신 렌더. 실사용 F3([10-3]) "realtime error" 의 근본 회수 — 데이터는 이미 DB 에 다 있었고 전용 카드만 없었다.

### 설계 (확장성 우선)
**카드 1종 + descriptor 테이블**. `IndicatorCard.tsx` = 변신 액자, `indicatorDescriptors.ts` = 배치도(datasource→라벨/포맷/색/watchColumns). 새 metric = descriptor 행 1줄 추가 = 자동 지원. AI 는 datasource description 으로 의도 추론 → "쿼리→컴포넌트 하드매핑" 아님 (code-reviewer 검증 통과).

### 사용자 결정 (2026-06-09, AskUserQuestion)
- **색**: 기존 "흑백 + 방향성 2색" 하이브리드 **일관 적용**. 부호 기반(funding/basis/oi_chg) = `signTone`(양수 teal / 음수 vermilion), 1.0 중립선 기반(LSR/taker) = `midlineTone`(>1 teal / <1 vermilion), 절대값(OI 수량/가격/거래량/카운트다운) = neutral 흑백.
- **그룹**: **데이터소스별 5종** (Funding / Basis / OI / LSR(+taker 동반) / Taker). taker 는 LSR 카드에도 동반표시(빈 카드 방지). generic 컴포넌트 적응.

### substep
| # | 작업 | 파일 |
|---|---|---|
| 2.0 | **`[10-7]` 회수** — `useDataServiceRow` opt-in `watchColumns` + hook 레벨 dirty check(prev↔next watched 컬럼 비교, 안 바뀐 payload 재렌더 skip). 채널 공유 유지 → 효율 그대로, fan-out 차단만. | `types.ts` / `hooks.ts`(`hasWatchedColumnChanged` 순수함수) |
| 2.1 | **registry 재정합 (drift 회수)** — `premium_index` 의 옛 `last_funding_rate`(DB 에 없음) → `predicted_funding_rate`+`last_settled_funding_rate`(+`_time`) 분리. **`basis` datasource 신설**(table=now_futures_indicator). `annualized_basis_rate` queryableField 제외(PERPETUAL 빈값). **`indicator-card` component 등록**(dataShapes 5). | `defaults.ts` |
| 2.2 | **IndicatorCard** generic 적응 카드 + descriptor 5그룹 + freshness 라인(updated_at 상대시간, `useNow` 5s 틱) + `formatAmount` 헬퍼(taker 거래량) | `IndicatorCard.tsx` / `indicatorDescriptors.ts` / `marketUnits.ts` / `relativeTime.ts` / `useNow.ts` / `registerCards.ts` |
| 2.3 | 검증 + 자문 + docs | — |

### crypto-domain-expert 자문 결과 (2026-06-09)
- funding = predicted/realized **2분리**(교체 아님, canonical §2.1). basis = 별도 datasource(사이트 위젯 경계 다름). annualized_basis_rate queryableField 제외. estimated_settle_price queryableField 유지+카드 hide. COINM = formatOI/formatLSR marketType 분기로 자연 지원.
- **interval(4h/8h) 라벨 Step 2 생략** (8h 하드코딩 = USDM 72.7%가 4h라 오라벨=§9 위반). symbols 조인은 별도 회수 → deferred.

### 검증
- `pnpm -r type-check` 6패키지 green / web **156 test** pass (Step1 139 + watchColumns 7 + relativeTime 7 + formatAmount 3) / web lint green / shared 30 test.
- **DB 라이브 확인** (2026-06-09 SELECT): BTCUSDT predicted_funding -0.00009475 / last_settled +0.00002908 / OI 97630.299 BTC / top_ls_acc 1.9577 / basis -23.51 / basis_rate -0.0004. 전부 format 헬퍼가 canonical §5 site=DB 출력 생성.
- **RLS/Realtime 확인**: now_futures_indicator anon SELECT policy(qual=true) + supabase_realtime publication 포함 → 초기 SELECT + Realtime 구독 양쪽 작동 (위생 #7).
- **numeric JS 타입 확정**(code-reviewer W1/W2): generated `Database` 타입이 indicator 컬럼 전부 `number | null` 선언 = supabase-js 반환 계약. + production TickerCard 동일 경로(now_*_ticker numeric) 렌더 입증. dirty check `!==` / `Number.isFinite` 가드 정상.

### 자문 (code-reviewer, **Critical 0**)
- **즉시 반영**: W3(basis quote COINM→USD 분기 `basisQuoteForMarketType`) + S3(신규 카드 LoadingStub 영어화) + S6(미사용 `interest_rate` 제거).
- **deferred 등재**: W4(`defaultSubtitle` marketType raw enum 노출 — TickerCard 공통 패턴, 일괄 cleanup) + S3 잔여(기존 TickerCard/CoinListCard 한국어 stub) + funding interval 라벨 / OI baseAsset 라벨(symbols 조인) + `[10-8]`(table 값 generated 타입 cross-check, 유지).
- 검증 5항목(하드매핑 금지/graceful/dataService 우회 없음/확장성/registry↔DB 정합) 전부 통과.

### 산출물
- ✏️ `apps/web/lib/dataService/types.ts` / `hooks.ts` / `initialFetch.ts`(datasource: string 정정)
- ➕ `apps/web/lib/dataService/__tests__/watchColumns.test.ts`
- ✏️ `packages/shared/src/registries/defaults.ts`(premium_index 재정합 + basis 신설 + indicator-card 등록)
- ✏️ `packages/shared/src/registries/__tests__/resolveDatasourceTable.test.ts`(basis 매핑)
- ➕ `apps/web/lib/cards/indicatorDescriptors.ts` / `components/cards/IndicatorCard.tsx`
- ➕ `apps/web/lib/format/relativeTime.ts` / `lib/hooks/useNow.ts` + 테스트
- ✏️ `apps/web/lib/format/marketUnits.ts`(formatAmount) + 테스트 / `lib/registerCards.ts`

### Step 3 인계 메모
- **allowlist 제거는 Step 3** (IndicatorListCard 완결 후): ticker 카드는 여전히 indicator 컬럼 못 그려 `renderableDatasource.ts` allowlist 유지. IndicatorCard 는 자기 descriptor 키로 self-gate(allowlist 미사용) → Step 3 와 무관하게 독립.
- **`[10-7]` watchColumns 패턴 재사용**: IndicatorListCard(`useDataServiceTable`)도 같은 fan-out 대상이지만 이미 500ms throttle 로 완화됨. 필요 시 table hook 에도 watchColumns 확장 (현재 미적용, YAGNI).
- **공통 LiveRow(Step 4)**: IndicatorCard 는 flash/FLIP 미적용(단일 심볼이라 순위 모션 무관). freshness 라인만 보유. Step 4 는 리스트 liveness 중심.
- ★ **라이브 site=DB G2 수행 → 🔴 사고 발견 (2026-06-10)**: 배포(`1f9f448`) 후 BTCUSDT funding/OI/LSR 카드 라이브 렌더 ✅(색·레이아웃·freshness 무결). **단 funding/mark/index가 Binance와 불일치 → `[10-11]` @arr 스트림 stall 사고 확정** (USDM markPrice WS frozen + 청산 43일 정지). **카드는 무결, DB가 stale**. Step 2의 freshness 라인 + `[10-7]` dirty-check가 잠복 결함을 가시화. → **사고 근본 수정 후 Step 2 마무리(site=DB G2 통과 선언).** 단일 진실 `docs/task-record/M2-themeA-incident-arr-stream-stall.md`.

# M2 테마 A — 카드 표현력 확장 ✅ 완결

> **상태**: ✅ **완결 선언 (사용자, 2026-06-11)**. Step 0~5 전부 완료 + 라이브 G2 통과 + `[10-22]` hotfix 까지 해소. 잔여는 테마 A 와 분리된 관측·결정 항목만 (`[10-20]`/`[10-21]` + 06-12 안정성 관측). **▶ /clear 후 = 다음 테마 선택 (B 데이터 정합 / C UI 셸+프리퍼런스 / D 차트 확장).**
> **라이브 G2 결과 (2026-06-11, 사용자 육안)**: ① "top OI"/"top funding" 쿼리 → indicator-list-card 정상 생성 ② funding 랭킹 1위 ESPORTSUSDT = Binance 일치 ③ flash + 순위 슬라이드 체감 "좋네요" ④ OI 랭킹은 Binance 사이트가 OI 정렬 미지원이라 직접 대조 보류 ⑤ ★ **심볼 누락 발견** (SKHYNIXUSDT 등) → 카드 무결, **symbols 마스터 2달 stale** 잠복 결함 가시화 → 같은 세션 `[10-22]` hotfix 로 근본 해소 (아래 §4.8). ⑥ flash "박동" 체감 → 경로 B 구조 한계 확인, 경로 A 가 M2 후보 (§4.7).
> **단일 진실**: 본 파일 = 테마 A 전체(Step 0~5) 추적처. 실사용 발견 맥락 = `docs/task-record/M2-step2-usage-feedback.md §H`. Step 2.5 사고 상세 = `M2-themeA-incident-arr-stream-stall.md`. deferred = `[10-1]`(F1 liveness) / `[10-3]`(F3 metric 카드) / `[8-27]` #1·#4(배관 빚).
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
| **2** | IndicatorCard (단일 심볼 metric 카드) | 새 카드 + registry 등록 + `[10-7]` 회수 | `[10-3]` 부분 / `[10-7]` / `[10-9]` | ✅ **완료 선언 (2026-06-10)** — 코드(`1f9f448`) + `[10-11]` 사고 해소 후 사용자 G2 육안 통과(funding 수치 일치) + `[10-9]` 표시 정밀화(funding 5자리·interval 라벨·tickSize·baseAsset, `d24fd61`) |
| **2.5** | (긴급 삽입) `[10-11]` @arr stall 사고 근본 수정 | `/market` URL + BinanceChunkedRelay + StreamCoalescer + USDM full 승격 배포 | `[10-11]` 해소 / `[3-50]` | ✅ **완료 (2026-06-10 05:09 UTC 배포, `a506ca0`)** — 청산 43일 만에 재개, funding site=DB 8자리 일치. 잔여 = 2026-06-12 안정성 관측(+묘비) |
| **3** | IndicatorListCard (정렬 랭킹) → 기둥1 완결 | 새 카드 + dataShapes 결합 schema 검증 + initialFetch order | `[10-3]` | ✅ **완료 (2026-06-11, G2 통과)** |
| **4** | 공통 LiveRow (flash + 순위 FLIP) → 기둥2 | useRowFlash + useListFlip/flip.ts (훅 공유 — wrapper 컴포넌트 대신) | `[10-1]` | ✅ **완료 (2026-06-11, 모션 체감 통과)** |
| **5** | 통합검증 + allowlist→registry 파생 + docs sync | renderableDatasource 재작성 (dataShapes 파생) | `[10-3]`/`[10-1]` 묘비 | ✅ **완료 (2026-06-11)** |
| **(후속)** | `[10-22]` symbols 마스터 2달 stale hotfix (G2 가 가시화) | syncSymbolsTask 신설 + 배포 | `[10-22]` | ✅ **완료 (2026-06-11, §4.8)** |

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

### Step 2 마무리 이력 + Step 3 인계 메모
- **allowlist 제거는 Step 3** (IndicatorListCard 완결 후): ticker 카드는 여전히 indicator 컬럼 못 그려 `renderableDatasource.ts` allowlist 유지. IndicatorCard 는 자기 descriptor 키로 self-gate(allowlist 미사용) → Step 3 와 무관하게 독립.
- **`[10-7]` watchColumns 패턴 재사용**: IndicatorListCard(`useDataServiceTable`)도 같은 fan-out 대상이지만 이미 500ms throttle 로 완화됨. 필요 시 table hook 에도 watchColumns 확장 (현재 미적용, YAGNI).
- **★ `useSymbolMeta` 재사용 (Step 2 후속 [10-9] 산출, 2026-06-10)**: symbols 메타(funding_interval_hours/tick_size/base_asset/quote_asset) 1회 조회 훅 + descriptor `value(row, meta)` 2-인자 패턴. **IndicatorListCard 도 동일 훅/패턴으로 라벨·정밀도 적용 가능** (리스트는 심볼 N개라 bulk 조회 변형 필요할 수 있음 — 판단 위임).
- **공통 LiveRow(Step 4)**: IndicatorCard 는 flash/FLIP 미적용(단일 심볼이라 순위 모션 무관). freshness 라인만 보유. Step 4 는 리스트 liveness 중심.
- ★ **라이브 site=DB G2 → 사고 발견 → 해소 → ✅ Step 2 마무리 선언 (2026-06-09~10 전말)**:
  1. 배포(`1f9f448`) 후 카드 렌더 ✅ 무결 — 단 funding/mark 가 Binance 와 불일치 → **`[10-11]` 사고 확정** (카드 무결, DB stale — freshness 라인 + dirty-check 가 잠복 결함 가시화).
  2. **Step 2.5 로 근본 수정·배포** (진짜 원인 = Binance 4/23 레거시 WS URL 폐지 → `/market` + chunked. incident doc §9~§10): 청산 43일 만에 재개 + funding site=DB **8자리 일치**.
  3. **사용자 G2 육안 재검증 통과** (funding 수치 일치 — 표시 4자리 반올림만 발견) → `[10-9]` 회수로 5자리 + interval(1h/4h/8h) 라벨 + tickSize/baseAsset 정밀화 (`d24fd61`).
  4. **fundingInfoTask 24h→1h 단축** (사용자 결정 2026-06-10): Binance 가 급등락 코인 funding 주기를 공지 변경해도 최대 1h 내 라벨 동기화 (fundingInfo weight 0 — 비용 0).
  5. **▶ Step 2 ✅ 마무리 선언 (사용자, 2026-06-10).** 잔여는 Step 2 와 분리된 인프라 관측 — 2026-06-12 안정성 관측 + `[10-11]`/`[3-50]` 묘비 + ticker24hrBatchTask 제거·하향 판단 (incident doc §10.4b 체크리스트).

---

## 4.5 Step 3 — IndicatorListCard (정렬 랭킹 리스트) 🔄 코드 ✅ (2026-06-11)

> **선행 이력 (같은 세션 Phase 0)**: Supabase Disk IO 고갈 사고 진단·해소 (Nano→Small 업그레이드) — 단일 진실 `M2-themeA-incident-supabase-disk-io.md`.

### 무엇을 만들었나 (비전공자 요약)
Step 2 IndicatorCard 가 "한 종목 성적표" 라면 Step 3 는 **"반 전체 등수표"** — "top OI" / "highest funding" 류 쿼리에 여러 심볼을 metric 기준 정렬해 보여주는 리스트 카드. 기둥1([10-3]) 의 리스트 절반 완결.

### 핵심 설계 (CoinListCard 골격 × IndicatorCard descriptor 하이브리드)
| # | 결정 | 근거 |
|---|---|---|
| 1 | **dataShapes 결합 검증을 superRefine 에 추가** — `coin-list-card + open_interest` 류 조합을 schema 가 거부 (허용 목록 + "componentId 교체도 선택지" dump) | Step 5 allowlist 제거의 선결. registry 파생 = 하드매핑 아님. promptInjection 이 dataShapes 를 이미 직렬화 → AI 는 사전 인지 + schema 는 사후 방어 (zod-schema-architect 확인) |
| 2 | **initialFetch `order` 옵션** (nullsFirst:false) — 초기 SELECT 를 정렬 상위 500 으로 | limit(500)<행수(628) 시 초기 화면 틀린 랭킹 차단. 단 **초기 윈도우 한정 방어선** — 정상 상태 진실은 클라이언트 재정렬 (code-reviewer W1 톤 정정) |
| 3 | **별도 `indicatorListDescriptors.ts`** (컬럼 1~3 + defaultSort + watchColumns) — 단일 카드 descriptor 와 분리 | 인터페이스가 다름 (세로 행 vs 가로 컬럼). tone 헬퍼는 export 승격 공유 |
| 4 | sort 미지정 시 **descriptor.defaultSort** | "top OI" 처럼 정렬 의도가 암묵적인 쿼리 대응 |
| 5 | 정렬 null = 방향 무관 바닥 / 심볼메타 생략 (무라벨 fallback) / OI 단위 차이는 description 의 market_type 필터 가이드 | indicator 컬럼 NULL 흔함 / YAGNI / 하드코딩 회피 |

### 검증 (코드 게이트)
- `pnpm -r type-check` 6패키지 / web lint / **web 170 test** (신규: listDescriptors drift 5 + initialFetch order 3 + 기타) / **shared 33 test** (결합 검증 3종) 전부 green.
- ★ React Compiler 트랩: descriptor 를 일반 함수 호출로 받으면 파생값 deps 가 "may be modified later" 로 수동 memo 보존 실패 ("Compilation Skipped") → **useMemo 로 감싸 해소** (관측 기반, 컴포넌트 주석 박제).

### 자문 (zod-schema-architect + code-reviewer 병렬, **둘 다 Critical 0**)
- **즉시 반영**: 에러 메시지 componentId 힌트(S) / 서버 order 주석 톤다운(W1) / subtitle 분모 = scopeCount(exchange/marketType 적용 모수, W3) / IndicatorListRow memo(S1) / Compiler 주석 관측 톤(S2).
- **잔여 관찰**: indicator-card(value) vs indicator-list-card(content) 변별은 description/updateMode 만 — 라이브 1차 출력 관찰 영역 (zod W1). OI 혼합 정렬·taker_buy_vol 단위는 crypto-trader/도메인 라이브 검증에서 확인 (S3/S4).
- **Step 5 재점검 예약**: allowlist 제거 시 본 schema 가 단일 방어선 — 결합 테스트 커버리지 재확인.

### 산출물
- ➕ `apps/web/lib/cards/indicatorListDescriptors.ts` / `components/cards/IndicatorListCard.tsx`
- ➕ `lib/cards/__tests__/indicatorListDescriptors.test.ts` / `lib/dataService/__tests__/initialFetch.test.ts`
- ✏️ `lib/dataService/initialFetch.ts`(order) / `lib/cards/indicatorDescriptors.ts`(헬퍼 export) / `lib/registerCards.ts`
- ✏️ `packages/shared/src/registries/defaults.ts`(indicator-list-card) / `schemas/aiCardConfig.ts`(결합 superRefine) / `schemas/__tests__/aiCardConfig.test.ts`

### 잔여 (Step 3 종료 게이트)
- [ ] 라이브 G2: Vercel 배포 후 "top 10 open interest" / "highest funding rates" / "LSR ranking" 3종 쿼리 → 카드 생성 + Binance 사이트 수치 육안 대조 (비교 URL + 수치 기록).
- [ ] 잘못된 결합 emit 시 self-correction 로그 확인 (기회 발생 시).

---

## 4.6 Step 4 — 리스트 liveness: 행 flash + 순위 FLIP 🔄 코드 ✅ (2026-06-11)

### 무엇을 만들었나 (비전공자 요약)
정적인 엑셀 표 같던 리스트에 두 시각 신호를 입혔다 — ① **행 flash**: 값이 변한 줄이 0.6초 초록/빨강으로 번쩍 (거래소 호가창 체결 깜빡임), ② **순위 FLIP**: 순위가 바뀐 줄이 점프 대신 미끄러지듯 이동. `[10-1]` (crypto-trader 진단: 체감 80%가 시각 신호 부재) 의 코드 차원 회수.

### 설계 (훅 공유 — wrapper 컴포넌트 대신)
- ➕ `useRowFlash` (TickerCard ref+classList 패턴 일반화 — 신규 진입 행 무flash, 연속 갱신 방향 교체) / ➕ `flip.ts` `computeFlipDeltas` 순수 함수 + `useListFlip` (useLayoutEffect 측정 → Invert → **강제 reflow 1회** → Play).
- "LiveRow 컴포넌트" 대신 **훅 + CSS** 채택 — 각 행이 자기 마크업 유지 (DOM 구조 강요 없음). flash 기준: CoinList=last_price / IndicatorList=정렬 기준 metric 값.
- 저사양(UHD 620) 절제: 배경색·transform 만 / `prefers-reduced-motion` 훅+CSS 이중 방어 / 행 ≤ limit(20) / 행 memo / 이탈·진입 행 무애니메이션. **jank 시 useListFlip 호출부만 제거 = 4b 독립 revert.**

### 자문 반영 (nextjs-frontend-specialist + code-reviewer 병렬)
- **frontend Critical 2건 즉시 수정**: ① 단일 rAF Invert→Play 는 같은 프레임 배칭으로 transition 미발동 (고전 함정) → **`void tbody.offsetHeight` 강제 reflow 방식 교체** (rAF/cleanup 제거로 코드도 단순화) ② `<tr>` transform 의 WebKit/border-collapse 한계 → **기능 손실 없는 graceful degrade** (모션만 소실) 로 수용, Chrome 라이브 실측 게이트 + WebKit(grid 행) deferred.
- **code-reviewer (Critical 0)**: W1 인라인 transition 미정리 → `.flip-row` CSS 클래스 단일 진실로 이동 ✅. W2 flash+FLIP 동시 발동 UX → crypto-trader 라이브 평가 예약. W3 Compiler 환경 라이브 육안 확인 예약.

### 검증
- web **179 test** (useRowFlash 5 + computeFlipDeltas 4 신규) / lint / tsc green.
- 잔여 (Step 4 종료 게이트): Chrome 라이브에서 ① gainers flash 발동 ② 순위 교체 시 슬라이드 (또는 graceful 무모션 확인) ③ 카드 4~6장 동시 jank 부재.

### 산출물
➕ `lib/hooks/useRowFlash.ts` / `lib/hooks/useListFlip.ts` / `lib/cards/flip.ts` + 테스트 2 ∥ ✏️ `globals.css`(flash-row-*·.flip-row·reduced-motion) / `CoinListCard.tsx` / `IndicatorListCard.tsx`

---

## 4.7 Step 5 — allowlist → registry 파생 + 통합검증 + docs sync 🔄 코드 ✅ (2026-06-11)

### 핵심: 임시 가드의 약속 이행
Step 0 의 하드코딩 allowlist(`RENDERABLE_TICKER_TABLES`)는 모듈 주석이 "registry 파생 매핑으로 대체·삭제" 를 약속한 과도기 가드였다. Step 3 의 dataShapes 결합 schema 검증(1차, AI 경로)이 확보된 지금, 표시 계층 가드(2차)도 같은 단일 진실(componentRegistry dataShapes)에서 파생하도록 교체:
- `isRenderableTickerDatasource(datasource)` → **`isDatasourceSupportedByComponent(componentId, datasource)`** — `getComponent().dataShapes.some()`. 하드코딩 명단 0.
- 새 카드/datasource = registerComponent 만 갱신하면 **schema 검증 + 표시 가드 동시 자동 반영** (확장성 담보).
- CoinListCard/TickerCard 의 `datasource as NowTickerTable` 잔재 캐스트 제거 (initialFetch 가 논리 id string 수용 — Step 1 배관의 자연 귀결).
- `COMING_SOON_LABEL` 존치 — 미래 datasource 가 카드보다 먼저 등록되는 과도기 상시 안전망.

### 검증
- 테스트 개편: 구 allowlist 케이스 5 → registry 파생 5 케이스 (ticker 회귀 / indicator 거부 / 신설 카드 허용 / nullish graceful / **★ schema↔표시 가드 동일 판정 정합** — 두 방어선 drift 시 즉시 적발).
- web 179 test / lint / tsc green.

### docs sync
- `[10-3]`/`[10-1]` 코드 묘비 (라이브 검증 잔여 명시) + 신규 deferred `[10-18]`(useSymbolMetaBulk+interval 정규화) / `[10-19]`(table watchColumns) / `[10-20]`(FLIP WebKit + value/content 변별 관찰).

### 테마 A 잔여 (라이브 게이트 — 코드 차원은 Step 0~5 전부 완료)
- [ ] **G2**: Vercel 에서 "top 10 open interest" / "highest funding rates" / "LSR ranking" 3종 쿼리 → indicator-list-card 생성 + Binance 사이트 수치 육안 대조 (비교 URL+수치 기록).
- [ ] **모션**: Chrome 에서 gainers flash 발동 + 순위 FLIP 슬라이드(또는 graceful 무모션) + 다중 카드 jank 부재.
- [ ] **crypto-trader 라이브 advisory**: [10-1] "80% 갭" 체감 + flash×FLIP 동시 발동 자연스러움.
- [ ] 테마 A 완결 선언은 사용자 몫.

### flash "박동" 체감 — 구조 진단 (사용자 실측 2026-06-11)
사용자: "Binance/Coinglass 처럼 흐르지 않고 바뀌다 말다 한다" → **현 아키텍처에서 구조적**. 경로 B (Binance WS → worker 1s 코얼레싱 → Supabase upsert → Realtime → 프론트 500ms throttle) 라 신호가 1~2초 뭉텅이 + Supabase Realtime 처리량 한계. Binance/Coinglass 는 WS 브라우저 직결. **근본 해법 = PRD 경로 A (WS→프론트 직결) — `[10-1]` (a) 잔여이자 M2 테마 후보로 승격** (usage-feedback §E 반영).

### crypto-trader 사전 advisory (2026-06-11, 코드 기반 — 라이브 G2 체크포인트)
- **강점**: funding 1초 push + flash = 주변시 포착 / OI+ΔOI1H 쌍 = 스윙 빌드업 스캔 스윗스팟 / LSR 3컬럼 = 스마트머니 vs 군중 응축.
- **관찰 3건 (라이브 후 사용자 결정, `[10-21]`)**: ① funding flash 과민 가능성 (1초 미세 변동까지 깜빡 — OI/LSR 18분 폴링은 적정) ② 기본 정렬 desc vs **|절대값|** (midline metric 은 양/음 꼬리 둘 다 기회 — desc 면 음수 펀딩 기회가 바닥에 묻힘) ③ funding 랭킹 interval(1h/4h/8h) 혼합 비교 가능성 — 라벨 생략이 "사이트와 다른 순서" 로 보일 수 있음 (`[10-18]` 정규화와 같은 뿌리).
- **G2 시 확인 시나리오 5**: funding 랭킹 30초 응시(flash 노이즈 여부) / 멀티카드 3장 동시(시선 분산+UHD620 부하) / funding desc 맨 아래 행(음수 기회 묻힘) / Binance 펀딩 페이지와 순서 대조 / LSR 3컬럼 좁은 카드 잘림.

---

## 4.8 후속 hotfix — `[10-22]` symbols 마스터 2달 stale ✅ (2026-06-11)

### 발견 경위 (G2 가 가시화한 세 번째 잠복 결함)
사용자 G2 검증 중 funding 랭킹에서 BTWUSDT·SKHYNIXUSDT 류 심볼 누락 발견. 진단: **카드 무결** — `symbols` 마스터 테이블 전체(4,309행)가 **2026-04-19 일회성 시드(smokeBinance.ts) 이후 미갱신**. exchangeInfo→DB 주기 동기화 태스크가 설계 의도(fundingInfoTask 주석이 "syncSymbolsTask 24h cycle" 가정)와 달리 **구현 누락**. 4/19 이후 상장 심볼 전체(TradFi 신규 포함)가 TRAVIS 전 파이프라인에서 부재 — `feedback_new_card_surfaces_latent_data_defect` 의 3번째 재현 (Step 2 의 [10-11], 이번 [10-22]).

### 수정 (commit `26a7ba5`)
- ➕ `apps/worker/src/poller/tasks/syncSymbolsTask.ts` — 3마켓 exchangeInfo → 마켓별 **순차** upsertSymbols (deadlock 규율), 부분 성공 graceful. 24h 주기 + `initialDelayMs=24h`.
- ✏️ `index.ts` — **부팅 시 runSyncSymbols 명시 1회 → loadAllSymbols** 순서 (신규 심볼이 allowlist/WS 구독 스냅샷에 즉시 반영).
- ✏️ registry `contract_type` enum 에 `TRADIFI_PERPETUAL` 추가 (DB 28종 실존 drift).
- worker 166 test (신규 5) / type-check 6 / lint green.

### 배포 실측 (09:39 UTC)
- syncSymbolsTask 3/3 마켓: spot 3,591 / **usdm 792 (+80)** / coinm 38 — 4.3초.
- TRADING 로드: usdm 670 (+62 가 WS chunked 구독 즉시 합류) / spot 1,365 (상장폐지 전이 −43 반영).
- **DB funding 랭킹 재검증: SKHYNIXUSDT +0.239% 가 실제 2위, SAMSUNGUSDT 3위, BTWUSDT 6위 진입** — 사용자 발견과 정확히 일치. updated_at 초 단위 fresh.

### 데이터 위생 9항목 체크 (CLAUDE.md 의무)
1. lifecycle status: 전 상태 upsert (TRADING 외 SETTLING/CLOSE 도 status 전이 반영 — allowlist 정확성의 원천) ✅
2. REST+WS allowlist: 기존 tradingSymbolsByMarket 경유 불변 ✅
3. **주기 재로드: 본 hotfix 가 #3 의 이행** (24h 주기 + 부팅 1회 — 기존엔 DB→메모리 방향만 있고 공급자→DB 방향 부재) ✅
4. stale row: 정책 불변. exchangeInfo 응답에서 완전히 사라진 row 의 잔존 처리는 deferred (아래) ✅
5. 극단값 guard: 계산식 무변경 ✅
6. 워밍업 가드: 무관 ✅
7. RLS: DB 변경 0 (기존 symbols 테이블) ✅
8. 공식 문서 주석: syncSymbolsTask 헤더에 URL+조회일자 ✅
9. site=DB: SKHYNIXUSDT/BTWUSDT funding 이 Binance `fapi/v1/premiumIndex` 와 대조 일치 (BTW +0.0966% 등) + 사용자 랭킹 재확인 ✅

### 신규 deferred
- `[10-23]` exchangeInfo 응답에서 사라진 row 의 status 잔존 처리 / ChunkedRelay 동적 구독 (재시작 없이 신규 심볼 WS 합류).

---

## 5. Step 2.5 — `[10-11]` @arr stall 사고 근본 수정 ✅ (2026-06-10, 긴급 삽입)

> **단일 진실 = `M2-themeA-incident-arr-stream-stall.md`** (사고 전말 §1~§8 + 구현 §9 + ★근본 원인 재규명 §10). 여기엔 테마 A 관점 요약만.

- **본질**: Step 2 카드가 가시화한 DB stale 의 진짜 원인은 **Binance 2026-04-23 USDM WS 레거시 URL 폐지** ("@arr 큰 프레임" 가설은 오진 — 4/27 청산 정지·4/28 Windows 사건까지 소급 재해석됨).
- **수정**: `/market` base URL 1줄 + `BinanceChunkedRelay`(250/conn) + `StreamCoalescer`(1초 재조립 → 기존 핸들러 무변경) + USDM ticker full 승격(`[3-50]`). worker 161 test + code-reviewer Critical 0.
- **배포 실측** (05:09 UTC): markPrice freshness 0.35s / 청산 재개 / USDM 24h 변화율 593심볼 / funding site=DB 8자리 일치 / sawtooth 소멸 (CHK 14연결 maxSilence=0s).
- 신규 deferred: `[10-12]`(relay 3중복) / `[10-13]`(spot chunk watchdog 관측) / `[10-14]`(dstream·spot 폐지 공지 감시).

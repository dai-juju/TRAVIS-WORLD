# M2 사이클 2 — GenericChart (Composable Stage 2 series + Stage 3 chart form) — task-record, 단일 진실

> **상태**: 🔄 **진행 중 — Step 1~4 ✅ (2026-07-08) + Step 5 등록·라이브 G2 ✅ (2026-07-09, §4e·§4f)**. chart-card 라이브 + **G2 핵심 게이트 전부 PASS**(AI 자율 분기 5/5 · limit=시간범위 정확 역산 · 오버레이 · site=DB 모양 일치 · 기존 카드 회귀 0 · 사이클 1 G3 동반 PASS = `[10-77]` 묘비). **라이브가 잡은 결함 4건 당일 hotfix 4연쇄**(§4f — marketType 500/축소 되먹임/RO 소진/★uPlot.min.css 누락 = DPR>1 잘림). **▶ 남은 것 = UIUX 확장 논의(호버·interval 토글 — 사용자 결정 대기, crypto-trader 자문 완료) → Step 6(펀딩).**
> **⚠️ 배포 원자성 (사용자 결정 2026-07-08, reviewer W1)**: Step 3 은 **로컬 커밋만 — push 는 Step 5(chart-card 등록)와 함께**. push=Vercel 자동배포라 chart-card 없는 상태에서 AI 가 history datasource 를 인지하면 "over time" 쿼리가 fallback 으로 퇴행하는 창이 열림(graceful 하나 UX 퇴행). Step 4 도 동일(로컬 커밋). **Step 5 완료 시 일괄 push.**
> **목표**: 5 shape 중 마지막 구멍 `series` 서빙을 닫고 모양-제네릭 chart form 신설 — "BTC OI를 차트로" 류 쿼리 첫 가능. 완료 시 새 metric 은 registry 등록만으로 표·피드·차트 전부 자동 유입.
> **상위 단일 진실**: `M2-composable-expressiveness.md §11 항목 4`. 분해 = `@roadmap-milestone-manager` 6-step (2026-07-08).

---

## 1. 사용자 확정 결정 4건 (2026-07-08 계획 세션)

1. **사이클 2 착수** — 사이클 1 G3(Realtime usage 추세)는 병행 관측 (블록킹 아님, step 흡수 금지).
2. **펀딩 히스토리 적재 = 후반 Step 6** — 6 metric(데이터 이미 있음)으로 차트 먼저 완주, 펀딩은 별도 G2 (실패 귀속 분리).
3. **오버레이 = (a) 다중 심볼 × 같은 metric** ("BTC vs ETH OI" — 기존 카드 계약 + `in` 필터로 표현, 계약 변경 0). (b) 다중 metric 이중축 = **Stage 4 펜싱** (CardDataBinding 구조 변경 = AI 계약 확장 영역, roadmap-mgr scope 판정 수용). (c) OI+가격 = 데이터 축 갭으로 불가 → `[10-88]` 등재.
4. **차트 엔진 = uPlot** (nextjs-frontend 자문: canvas gzip ~15KB, UHD620 최적, 진짜 numeric 시간축 → 혼합 cadence 오버레이 정확, 펀딩 계단/바 내장 `paths.stepped()/bars()`. lightweight-charts 는 index 시간축 왜곡 + 가격 시맨틱 내장 + TV iframe 역할 중복으로 기각).

## 2. 선결 측정 (2026-07-08 실측 — 계획의 사실 기반)

- `history_futures_indicator` **6,008,451행**: 6 metric(OI/LSR 3종/taker/basis) 채워짐(forward-fill 24/7 정상), **funding 컬럼(predicted/last_settled) 0행 확정** (MCP SQL 실측) → Step 6 에서 collector-history 7번째 task + backfill.
- 웹 프론트에 history 테이블 읽는 코드 0건 = series 마지막 구멍. `refreshInterval` 코드 0건(ff#2 연기분 — 이번 첫 실사용). 차트 라이브러리 전무(TV 는 순수 iframe).
- `initialFetch.fetchAll` 은 symbol 보조 정렬 강제라 시계열 부적합 → series 전용 fetch 경로 필요. 범위 pushdown(`RangeFilter`)은 재사용.

## 3. Step 분해 (roadmap-milestone-manager, 예상 3~4 세션)

| Step | 내용 | 화면 변경 | 상태 |
|---|---|---|---|
| 1 | **Shape 계약 정식화** — servableShapes/acceptsShapes + 호환성 불변식 레이어 (렌더 게이트 무변경) | 없음 | ✅ 2026-07-08 |
| 2 | `useDataServiceSeries` 훅 (4번째, 고립·미배선) + refreshInterval 첫 구현 | 없음 | ✅ 2026-07-08 |
| 3 | history datasource 6종 등록 + `chartDescriptors.ts` 팩 (id 네이밍 = zod 게이트) | 없음 | ✅ 2026-07-08 |
| 4 | GenericChart form 제작 (uPlot, 4파일: descriptors/format/useUplot/ChartCard, 미등록 격리) | 테스트만 | ✅ 2026-07-08 |
| 5 | 등록 + 플립 + **라이브 G2** (site=DB + 오버레이 + AI 자율 분기 + 기존 8 datasource 회귀 0) | ✅ 차트 라이브 | 🔄 코드 ✅ 2026-07-09 / G2 대기 |
| 6 | 펀딩 히스토리 적재 (collector 7번째 task + backfill + 이산성 canonical) + **별도 G2** | ✅ 펀딩 차트 | 📋 |

**Scope 차단선**: (b) 다중 metric 이중축(Stage 4) / (c) 가격 오버레이(`[10-88]`) / `[10-84]` 청산 집계 / `[10-85]` 히트맵 / `[10-86]` ticker coalescing(G3 후 판단) / Stage 1b / TradingView 대체 / G3 관측의 step 흡수.

## 4. Step 1 ✅ — Shape 계약 정식화 (2026-07-08, 화면 변경 0)

**무엇을 만들었나**:
- ➕ `packages/shared/src/registries/shapeKind.ts` — `DataShapeKindSchema` (scalar/record/set/series/events, scalar=Stage 1b placeholder).
- ➕ `packages/shared/src/registries/shapeCompat.ts` — `shapeIntersection`/`areShapesCompatible` (graceful, throw 금지. **렌더 게이트 아님** — 불변식/미래 feasibility 진단 전용).
- `DatasourceEntry.servableShapes` + `ComponentEntry.acceptsShapes` — **optional, no default** (shape 는 배선이 아니라 정체성 — `['set']` 같은 default 는 liquidation/kline 을 조용히 오선언. 구멍은 default 가 아닌 표적 불변식으로 봉합). AI 비노출 (promptInjection allowlist 자동 + 회귀 가드).
- `defaults.ts` 전수 태깅: 티커 2종·지표 5종·symbols_meta = `['record','set']` / liquidation = `['events','set']` / kline = `['series']`(모양은 진실, 배달은 외부 TV) / ticker·indicator-card = `['record']` / table-card = `['set']` / kline-chart-card = `['series']` / feed-card = `['events']`.
- 불변식 테스트 8종 (shared +8, web +3): ① 렌더 대상 datasource 태깅 필수 ② 전 컴포넌트 태깅 필수 ③ **dataShapes 조합 전수 shape 호환**(무의미 조합 등록을 빌드타임에 시끄럽게 실패) ④ **정확값 스냅샷 핀**(code-reviewer W1 — 과다·오태깅 가시화) ⑤ **렌더 매트릭스 17쌍 byte-identical 스냅샷**(web) ⑥ AI 비노출 회귀 ⑦ graceful ⑧ enum 5종 + web descriptor 상수 등치 2종(TABLE/FEED_CONSUMES_SHAPE ≡ acceptsShapes).

**★ 설계 확정 (zod-schema-architect 자문 — 승인 계획의 "술어 교체"를 정정)**:
1. **복수 `servableShapes`** — 단수 shape 는 라이브 사실과 모순 (ticker 가 record+set, liquidation 이 events+set 로 이미 동시 서빙 중).
2. **2층 게이트** — 작동 게이트 = 기존 `dataShapes` 멤버십 **무변경** (`renderableDatasource.ts` 0줄 수정 = byte-identical 자동). dataShapes 는 "이 form 이 이 datasource 용 descriptor 팩(시맨틱 레이어)을 가짐"이라는 shape 가 못 담는 정보를 실질 보유 — 순수 shape 게이트로 교체하면 descriptor 없는 새 set datasource 가 새어 빈 표(F3 재발). **shape = 필요조건이지 충분조건 아님**, 등록/테스트 시점 호환성 불변식 레이어로만 신설.
3. **kline = `['series']`** — "우리 레이어 미서빙"은 shape 축이 아니라 배달 축(table 부재)의 문제. GenericChart 오판은 dataShapes 멤버십이 구조 차단. `'external'` 마커는 YAGNI.
4. descriptor 전방 주석 2곳(tableDescriptors/feedDescriptors "게이트 이동" 서술) 현재형 정정.

**검증**: shared **77** test(+8) / web **369** test(+3) / worker·collector-history type-check clean / web lint 0. **code-reviewer 0 Critical** — W1(교집합-비공집합 검사는 과다 태깅에 무력 → 정확값 핀 테스트 즉시 반영, 메모리 신설) · W2(descriptor "7 datasource" stale 주석 정정) · S1/S3(→ `[10-87]` 등재: feasibility 진단은 "실서빙 AND 조건" 필수 + 핫패스 진입 시 mergeCommonFields 경량화) · S2(정확값 핀이 동시 해소).

**신규 deferred**: `[10-87]`(shapeCompat feasibility AND 조건 + 성능) · `[10-88]`(가격 history series 공급 부재 — 오버레이 (c) 데이터 축 갭).

**▶ 다음 = Step 2 (`useDataServiceSeries` 훅)** — plan mode + zod(반환 계약)·backend-infra(recorded_at 인덱스) 자문 게이트.

## 4b. Step 2 ✅ — `useDataServiceSeries` 훅 (2026-07-08, 고립·미배선 = 화면 변경 0)

**무엇을 만들었나** (어떤 카드도 import 안 함 — 첫 소비자 = Step 4 GenericChart):
- ➕ `apps/web/lib/dataService/seriesFetch.ts` — 심볼당 병렬 fetch orchestrator. `initialFetch` 재사용(재구현 0): eq 축 + eq symbol + range(lookback ISO) + **order timeField DESC + limit → 클라 reverse(oldest-first)**. `Promise.allSettled` 부분 실패(실패 심볼만 skip+warn). fulfilled-빈배열("데이터 없음"=정상, rows:[] 그룹 포함)과 rejected(fetch 에러) 구분.
- ➕ `apps/web/lib/dataService/useDataServiceSeries.ts` — 4번째 훅 (useSyncExternalStore 골격 미러). 불변식 A~G: (A) **주기 pull**(refreshIntervalMs setInterval — TRAVIS 첫 주기 pull, inFlight 겹침 skip) (B) **호출자 콜백 0개**(fetch 를 primitive 옵션으로 완전 명세 — ref-라이브 방어 표면 자체가 없음, symbols[] 만 값-기준 join 메모) (C) oldest-first 훅 보증 (D) **soft/hard 실패 분리**(첫 fetch 실패=error / 재fetch 실패=기존 곡선+ready 유지+`lastUpdatedAt` 미전진) (E) **per-series 참조 재사용**(length+마지막 row shallow — 무변화 곡선은 이전 참조 = uPlot setData 절약, 비-마지막 버킷 in-place UPDATE 미감지는 문서화된 트레이드오프) (F) 재구독 진입부 명시 clear (G) 부분 실패 심볼은 이전 곡선 유지.
- `types.ts` 가산: `SeriesGroup`(key≠symbol 분리 — Stage 4 다중 metric 확장 여지) / Options / Result(`lastUpdatedAt` — staleness 를 status 오버로드 없이 소비자 계산). `index.ts` export.
- 테스트 +25 (seriesFetch 6 + 훅 19): 병렬 조립·IN/fetchAll 금지 박제·reverse·부분실패·lookback ISO·생명주기·soft/hard·참조재사용·in-place 감지·타이머·unmount·enabled 토글·dedupe.

**★ 자문 2건 수렴 (zod + backend-infra, 2026-07-08)**:
1. **per-symbol 병렬 = 계약** (backend-infra EXPLAIN 실측): PK(exchange,market_type,symbol,interval,recorded_at) prefix 완전 정합 → Index Scan Backward 조기종료 **7ms** vs `symbol IN`+글로벌 정렬 = retention 창 전체(1.2만행) 스캔+heapsort **500ms/디스크 911버퍼**(Disk IO 사고 재발 벡터) + 글로벌 limit 심볼 독식. → 600만행 시계열에 `in`+`order`+`limit` 금지(테스트 박제).
2. RLS anon SELECT `qual=true` 실측 통과(위생 #7) / **market_type = DB 저장값 `futures_usdm`**(WS 토픽 "usdm" 과 다름 — 자문 중 0행 실함정) / refreshInterval 은 **interval 비례**(권장 interval/2 — 5m 봉을 30초마다 재fetch 하는 낭비 차단, 카드 8~12장 × 심볼 2~3 Small compute 무해) / 증분 fetch = YAGNI(`[10-89]`).
3. zod 관여 0 확정 — 훅은 순수 TS(3형제 일관). interval enum 등 AI 계약은 Step 3/5 에서.

**code-reviewer 0 Critical / 3W / 6S — 반영**: **W1**(fulfilled-empty 가 작동 곡선 덮어씀 — soft-fail 이 rejection 만 덮는 비대칭 → "직전 데이터 있음+이번 0행=의심 신호, 이전 곡선 유지" 채택+테스트) / **W2**(catch hard-soft·inFlight 겹침·enabled 토글 테스트 3개 추가) / **W3**(Architecture.md 프론트 dataService 절에 주기 pull 반영) / **S2**(soft warn = 실패 전환 시 1회, 정상 복귀 시 재무장) / **S3**(중복 심볼 dedupe). S1(무해 옵션 변경 loading 플래시)+증분+S4(무변화 bail-out) = **`[10-89]` 등재**. S5/S6 = 문서화된 트레이드오프 보류.

**검증**: web **394** test(+25) / type-check / lint 전부 clean. 미배선 = 화면 변경 0.

**▶ 다음 = Step 3 (history datasource 6종 등록 + chartDescriptors 팩)** — zod(id 네이밍 확정) + crypto-domain(6 metric 시맨틱) 자문 게이트.

## 4c. Step 3 ✅ — history datasource 6종 + chartDescriptors 팩 (2026-07-08, 화면 변경 0 · 로컬 커밋만)

**무엇을 만들었나**:
- `defaults.ts`: **history 시계열 datasource 6종** — `open_interest_history` / `top_ls_ratio_accounts_history` / `top_ls_ratio_positions_history` / `global_ls_ratio_history` / `taker_long_short_history` / `basis_history`. 전부 `table: history_futures_indicator` 공유, category `_history`, refreshTier low, `servableShapes: ['series']`, transport 미설정(주기 pull 은 경로 A/B 와 직교 — 무관 확정). 공통 골격 헬퍼 `historySeriesEntry` + `HISTORY_SERIES_FIELDS`.
- now 쪽 4개(open_interest/long_short_ratio/taker_long_short/basis) description 에 **history 논리 id 역참조** 1줄 추가 (zod 판정: 유스케이스 포인터 = 하드매핑 아님·허용). premium_index 의 stale "for history use `history_futures_indicator`"(물리 테이블명+0행 이중 stale) 제거.
- ➕ `apps/web/lib/cards/chartDescriptors.ts` — 3번째 시맨틱 팩(series): `ChartDescriptor`(valueField/timeField/seriesStyle/midline/tone/formatValue/axisUnitLabel/defaultInterval) + 6 descriptor + `CHART_CONSUMES_SHAPE='series'`.
- 테스트: chartDescriptors 8종(키 핀·실컬럼 핀·도메인 시맨틱 핀·graceful) + registries 6종(값 컬럼 미노출·recorded_at string·interval ['=']·market_type override·직렬화/비노출·공통 골격) + Step 1 정확값 핀 +6.

**★ 설계 확정 (zod 자문 — id 네이밍 deferred decision 해소)**:
1. **(A) 신규 6 id 확정** — (B) 기존 id 재사용은 "now 테이블(심볼당 1행, 시계열 부재)에 series 를 광고하는 허위" + `tableByShape`/`resolveDatasourceTable(id, shape)` 전파 등 구조 변경 강제라 강한 기각.
2. **분할 규약 = metric-per-natural-line** — 차트는 한 카드=한 라인, metric 선택자가 config 에 없어 **id 가 곧 metric 선택자**. LSR 3분할(now `long_short_ratio` 1개와 의도된 비대칭 — 표는 3컬럼 나열, 차트는 라인당 1). Step 6 = `funding_history` 7번째.
3. **값 컬럼 queryableFields 제외** — seriesFetch 가 값 필터 pushdown 안 함 → 노출 시 AI "OI > X" 필터가 스키마 통과 후 조용히 무시(silent-wrong). queryableFields = 축 5종만(exchange/symbol 상속 + market_type override[선물 2종]/interval[enum9, `=`]/recorded_at[string ISO — liquidation trade_time 교훈]).

**★ 차트 시맨틱 확정 (crypto-domain 자문)**: OI=area+**모노크롬 강제**(OI 상승≠롱/숏 — 방향색은 오정보)+축제목 단위(USDM base/COINM contracts)+0앵커 금지 / LSR 3종+taker=line+**1.0 midline**(균형점 — 없으면 시계열 의미 상실) / basis=**basis_rate 주 플롯**(USD 절대값은 가격 수준 비례라 부적합)+**0 midline**(contango/backwardation)+neutral(carry 상태지 압력 아님) / **null=gap**(spanGaps:false — COINM global 미제공, 절대 0 plot/연결 금지) / 계단(step)은 스냅샷 지표에 오정보. **멀티심볼: 비율=native 오버레이 / OI 절대량=정규화(%변화) 또는 dual-axis 가 도메인 표준 → Step 4 form 결정 사항(flag)**. taker_vol 절대량은 bar 관례 — MVP 주 라인(ratio)만. G2 site=DB 대조 위치는 Binance 선물 페이지 "Trading Data" 섹션(사용자 라이브 실측 요망 — 오늘 fetch 게이트) + taker_vol 단위 라이브 1콜 재검증(Step 5/6).

**code-reviewer 0 Critical / 3W / 3S — 반영**: **W1**(소비 form 없는 datasource 의 AI 노출 = 과도기 over-advertisement — superRefine 거부 graceful 이나 "over time" 쿼리가 fallback 퇴행) → **사용자 결정: Step 3~4 로컬 커밋만, push 는 Step 5 와 원자적으로** / **W2**(datasource description 키워드에 form 단어 "chart" = 직교 오염) → 제거 / **W3**(defaults.ts ~910줄) → `[10-90]` 등재 / **S1**(operators spread = 타입 위드닝이지 mutate 방어 아님 — Zod safeParse 가 재클론) → 주석 / **S2**(axisUnitLabel usdm·basis line 핀) → 테스트 추가 / S3(defaultInterval 은 defaultLimit 사고와 다른 정당 기본값 — 생략=의미 부재) 확인.

**검증**: shared **83** test(+6) / web **402** test(+8) / type-check(shared·web·worker) / lint 전부 clean.

**▶ 다음 = Step 4 (GenericChart form 제작 — uPlot 도입, 미등록 격리, 로컬 커밋)** — nextjs-frontend(구현 자문은 계획 세션에 완료 — 4파일 구조/React Flow 함정/저사양 절제) + crypto-trader 예비 UX.

## 4d. Step 4 ✅ — GenericChart form (uPlot 1.6.32, 미등록 격리, 2026-07-08 · 로컬 커밋만)

**무엇을 만들었나** (registerCards/componentRegistry 미등록 = AI 도달 불가, 화면 변경 0):
- ➕ `apps/web/lib/cards/chartFormat.ts` — 순수 픽셀 매핑: `intervalToMs`/`refreshMsForInterval`(interval/2, 30초~10분 클램프)/`DEFAULT_CHART_POINTS`(300)/`buildAlignedData`(timestamp 합집합, **null=gap**)/`downsampleAligned`(폭×2 stride + 최신 보존 — **인덱스 기준 균일 적용**)/`seriesStrokes`+`SERIES_STROKE_VARS`(캔버스 실색↔DOM 범례 var 쌍둥이, 등치 테스트)/`buildChartOptions`(커서·legend·select off = wheel 소유권 React Flow, spanGaps:false, formatValue 축, area fill)/`midlinePlugin`(y 범위 밖 미표시, try-catch)/`withAlpha`.
- ➕ `apps/web/lib/cards/useUplot.ts` — 명령형 격리 훅: 1회 생성(재생성 = **seriesKey(구성) 변경 시만** — 동수 심볼 스왑도 커버)/setData 갱신/데이터 소멸 시 파괴(stale 곡선 방지)/비동기 첫 데이터 도착 시 createRef 경유 지연 생성/ResizeObserver contentRect→setSize(SSR·jsdom 가드)/`uPlot.pxRatio=1` 전역 클램프(정적 프로퍼티 — Options 필드 아님)/`readChartTheme`(getComputedStyle 로 CSS var→캔버스 실색; 세션 중 테마 토글 미반영 = 문서화된 한계)/**prepareData(다운샘플)를 실측 폭으로 명령형 레이어에서 적용**.
- ➕ `apps/web/components/cards/ChartCard.tsx` — form 노드(FeedCard 패턴 미러): `resolveChartSymbols`(단일 `data.symbol` / 오버레이 = filters `symbol in [...]` 번역), interval = AI ?? descriptor.defaultInterval, maxPoints = limit ?? 300, 상태 오버레이(absolute inset — coming soon/missing symbol scope/error/loading/no data), 다중 심볼 DOM 범례(SERIES_STROKE_VARS 1:1), sanitizeTitle/useLoadingTimeout.
- 테스트 +26 (chartFormat 11 + ChartCard 8 + useUplot 5 + C1 회귀 등): 정렬/다운샘플/옵션 프리셋/midline graceful/상태 분기/config→훅 번역/생명주기 4경로.

**★ [10-71] 교훈 실증**: 첫 구현이 렌더 중 `containerRef.current.clientWidth` 를 읽는 실수 → **react-hooks/refs lint 가 정확히 차단** → 다운샘플을 useUplot(명령형 레이어, 폭=DOM 관심사)으로 이동. lint 부팅이 산 가드였음.

**code-reviewer 1 Critical / 4W / 4S — 전부 처리**:
- **C1 (즉시 수정 + 회귀 테스트)**: 다운샘플의 "마지막 포인트 보존"을 시리즈별 **값 비교**로 판단 → null/평평한 꼬리(COINM global 등 정상 데이터)에서 x↔y 길이 불일치 → uPlot AlignedData 계약 위반 = **차트 무음 실종**. 인덱스로 1회 판정해 전 시리즈 균일 적용으로 수정. 메모리 신설.
- **W1**: `pxRatio` 는 Options 필드가 아닌 정적 프로퍼티(무효 옵션을 `as` 캐스트가 숨김) → `uPlot.pxRatio=1` 전역 설정 + 테스트. **W3/W4**: useUplot 생명주기 4경로 + null-tail 다운샘플 테스트 추가. **W2**: maxPoints 가 표시 밀도이자 **조회 시간범위**(maxPoints×interval)를 겸함 — AI 가 "최근 30일" 의도 시 limit 미지정이면 조용히 12.5일(1h 기준) → **Step 5 registry description 에서 "chart limit = 과거 포인트 수(=시간범위)" 명시로 회수 (Step 5 TODO 박제)**.
- **S1**(seriesCount→seriesKey 구성 키)/**S2**(데이터 소멸 시 차트 파괴)/**S3**(number epoch=ms 주석)/**S4**(상태 오버레이 absolute) 전부 반영.

**검증**: web **428** test(+26) / type-check / lint(react-hooks/refs 포함) 전부 clean. uplot 신규 의존성(gzip ~15KB).

**Step 5 TODO 인계**: ① 양쪽 레지스트리 등록(acceptsShapes ['series'], dataShapes=chartDescriptors 6종 등치 불변식) ② description 에 W2(limit=시간범위) 명시 ③ 필요 시 refine(단일-series 카드 symbol/filters 스코프) ④ **Step 3~5 일괄 push + Vercel 배포 + 라이브 G2** ⑤ crypto-trader UX(오버레이 절대량 스케일 — 정규화는 도메인 표준이나 MVP 는 raw, G2 실측 후 판단).

## 4e. Step 5 — chart-card 등록 = 라이브 플립 (코드 ✅ 2026-07-09 · 일괄 push · G2 대기)

**무엇을 했나** (실코드 변경 2곳 — 나머지는 registry 파생 자동 반영 = superRefine/renderableDatasource/promptInjection **변경 0**, 확장성 설계의 실증):
- `defaults.ts`: **chart-card registerComponent** — dataShapes = history 6종(requiredFields `["interval"]` — 값 컬럼은 queryableFields 의도적 부재라 "requiredFields ⊆ queryableFields" 불변식상 불가, kline 선례) / `acceptsShapes: ["series"]` / updateMode value / defaultSize lg / subscribesByTopic 미선언(=false, 주기 pull). **description 에 W2 회수**: "limit = 과거 포인트 수 = limit × interval 시간범위, 기본 300, 24h@5m→288" 명시(silent cap 아닌 명시 계약 — feedback_card_default_overrides_ai_intent 정합) + retention 절사 각주(reviewer S1) + 오버레이(`symbol in [...]`) + 캔들(TV)/스냅샷(indicator·table) 구분 유도. 키워드 hint 1줄 4단어(상한 준수).
- `registerCards.ts`: ChartCard React 맵 1줄 (feedback_registry_react_ai_sync 양쪽 등록).
- 불변식 테스트 4곳: ① shared 정확값 핀 `compShapes` + subscribesByTopic 핀에 chart-card 추가 ② **등치 2건 박제**(descriptorKeys ≡ chart-card.dataShapes / CHART_CONSUMES_SHAPE ≡ acceptsShapes — 파일 헤더 약속 이행, feed 미러) ③ 렌더 매트릭스 스냅샷 **17→23쌍**(chart-card × history 6종) ④ `ChartCard.test.tsx` **합성 등록 폐기 → registerDefaults() 실등록 전환**(픽스처↔실 registry drift 차단, "coming soon"은 dataShapes 밖 now_spot_ticker 로 표현).
- ➕ `vitest.setup.ts` **matchMedia 스텁**: uPlot 이 모듈 로드 시 `domEnv && setPxRatio()` → matchMedia 호출(uPlot.cjs L175 실측) — **Node SSR 은 domEnv 가드로 안전 확인**, jsdom 만 미구현이라 registerCards 를 import 하는 무관 테스트 2개가 수집 단계 사망 → 셋업 1회 스텁(기존 구현 보호 가드, 개별 vi.mock 산포 회피).
- stale 주석 현재형 정정 3곳(ChartCard 헤더 "미등록 격리"→"등록 완료" / chartDescriptors "Step 5 시 박제 예정"→"박제됨").

**code-reviewer 0 Critical / 1W / 3S — 전부 처리**: **W1**(missing-scope 분기 주석이 **존재하지 않는** "Step 5 refine" 인용 — superRefine (2.5) 는 subscribesByTopic×ws_direct 만 발화라 chart-card 미해당 = graceful 분기가 유일한 1차 방어선 + AI 가 symbol 없이 emit 시 스키마 통과라 **self-correction 미작동 갭**) → 주석 사실 정정 + **`[10-91]` 등재**(`[10-78]` 동류 — Stage 1b/4 acceptsShapes 파생 강제로 일반화, 카드별 일회성 refine 은 YAGNI 선례) + 메모리 `feedback_stateguard_comment_cites_absent_refine` 신설. **S1**(1d×300=300일 > retention 180일) → description retention 각주 반영. S2(키워드 hint 카드 2개 — 상한 여유) / S3(matchMedia 스텁 안전 — 가드+고정 객체) 확인.

**검증**: type-check 6패키지 clean / shared **83** test / web **430** test(+2 등치) / web ESLint exit 0. TODO ③(symbol refine)은 `[10-91]` 로 정식 연기.

**▶ 남은 것 = 라이브 G2 (사용자 협업)**: ① 일괄 push 4커밋(`09cb300`·`d16863c`·`c2ffd5a`·본 커밋) → Vercel 배포 ② site=DB(Binance "Trading Data" 대조 + taker_vol 단위 1콜 재검증) ③ 오버레이 "BTC vs ETH OI" ④ AI 자율 분기(top OI→table / over time→chart / BTC funding→indicator) ⑤ 기존 8 datasource 회귀 0 ⑥ 도메인 시맨틱 육안(OI 모노크롬·1.0/0 midline·null=gap) ⑦ crypto-trader UX(오버레이 절대량 스케일) ⑧ **사이클 1 G3 병행**(Dashboard usage 추세 + favicon 404 소멸 + deadlock 빈도).

## 4f. Step 5 라이브 G2 ✅ (2026-07-09 — Playwright+Supabase MCP+사용자 육안 협업)

**게이트 결과 (전부 PASS)**:
- ✅ **AI 자율 분기 5/5** (하드코딩 0, description 만으로): "OI trend"→chart / "compare BTC vs ETH"→chart 오버레이 / "top 10 by OI"→**table**(10행) / "BTC funding"→**indicator** / "watch liquidation flow"→**feed**(라이브 수신). 5종 form 공존 + 콘솔 에러 0.
- ✅ **limit=시간범위 (Step 4 W2 회수 실증)**: AI 가 24h@5m→**limit 288** / 24h@1h→**limit 24** 정확 역산 + marketType/filters 완비 (log_chat 박제).
- ✅ **오버레이 (a)**: `symbol in [BTCUSDT,ETHUSDT]` + DOM 범례 2색. ⚠️ 절대량 스케일 실측(ETH OI≫BTC → BTC 라인 바닥) = crypto-domain 예고 적중 → UIUX 논의 D 항목.
- ✅ **site=DB 모양 일치 (사용자 스크린샷 + 시간대 정렬)**: Binance "Data" OI(1h) vs TRAVIS — 오후 저점(~99.3K, 4~5pm KST)·심야 고점(~102.0~102.3K, 0~2am KST)·이후 되돌림 흐름 일치. TRAVIS 우측 끝은 `[10-35]` lag 로 ~7h 이른 지점에서 종료(겹치는 창 기준 판정).
- ✅ **사이클 1 G3 동반 PASS** → `[10-77]` 묘비 (Realtime 1.41M/5M 28% + 일별 하향 + favicon 404 소멸 + deadlock 0).

**★ 라이브가 잡은 결함 4건 — 당일 hotfix 4연쇄 (전부 개발/테스트 환경 불가시 부류)**:
1. `383fc3e` **marketType 누락 500**: AI 가 marketType 만 생략 → PK prefix 단절 → EXPLAIN 9.8s/73k buffers(Disk IO 벡터) → statement timeout(57014). 2겹(description "Always set marketType" + ChartCard registry 파생 가드 "missing market scope") — ff#1 `54d7b98` 선례 미러. 재검증에서 AI 정상 emit. `[10-91]` 라이브 실증 보강.
2. `24bcaab` **카드 점진 축소**(480×320→314×195 고착): nextjs-frontend 소스 조사 — RF v12 무죄(setAttributes 생산자는 parent-확장/NodeResizer 드래그 2곳뿐, measured 되쓰기 없음) → 범인 = uPlot read→write 되먹임(자기 픽셀 크기를 DOM 에 쓰는 유일한 카드 콘텐츠). 마운트 div `absolute inset-0` 격리 + 오버레이 z-10.
3. `8d59a49` **미교정 canvas 잔존**: 생성이 레이아웃 안정 전 크기에서 일어나면 RO 초기 발화 소진 → 생성 직후 재-observe(명세 보장 초기 발화로 setSize 자동 교정).
4. `c1670cc` ★ **진범 = uPlot.min.css import 누락**: uPlot 은 canvas CSS 크기를 JS 아닌 자기 스타일시트(canvas{width:100%})에 위임 — Step 4 도입 때 누락. **DPR=1(개발/테스트)에선 버퍼=CSS 라 우연히 정상, 사용자 환경(Windows 125% = DPR 1.25)에서만 1.25배 넘쳐 잘림**. 동반 정정: `uPlot.pxRatio=1` 클램프 = **no-op 판명**(1.6.32 렌더는 모듈 클로저 변수, 정적 프로퍼티는 읽기용 미러 — mock 의 static 이 테스트 통과시킨 사각, feedback_mock_test_invariant_blind_spot 동류) → 제거, DPR 네이티브 수용. vitest CSS 전역 스텁(styleStub alias) 동반.
- (+ `f8d0c40` 본 등록 / `833470f`·병합 lint 정리 — 세션 커밋 총 6개, 검증 각 회 web 431/type-check/lint clean.)

**부수 발견 (기록)**:
- `[10-35]` **forward-fill lag 사용자-facing 실증**: 5m 8.6h/1h 7.2h lag (worker 정상 가동 = 순회 주기). 차트 우측 끝이 "지금"이 아님 — 회수 우선순위 재평가 후보로 보강.
- y축 라벨 폭 잘림(",000,000" — size 64px 초과) + 오버레이 스케일 = UIUX 논의에 포함.

**▶ 다음 = UIUX 확장 (사용자 발의 2026-07-09)**: ① 호버 수치 ② interval 토글(PRD §3 "카드 설정에서 조절" 예정과 정합). crypto-trader 자문 완료(A 고정영역 legend / B 포인트수 유지 / C 5종 압축 / D %정규화는 roadmap 위임 / E "last point (Nh ago)" freshness). → **사용자 4결정 확정·구현 = §4g.**

## 4g. UIUX 확장 ✅ 구현 (2026-07-09 — 사용자 결정 4건, 프리뷰 협의로 확정)

**사용자 결정** (AskUserQuestion 프리뷰 — crypto-trader 권장과 갈린 곳은 사용자 취향 존중): ① 호버 = **플로팅 툴팁**(Binance 식 — 권장안 고정영역 대신) ② 토글 정책 = **포인트 수 유지**(권장) ③ 선택지 = **9종 드롭다운**(권장 5종 압축 대신) ④ freshness = **"last point (Nh ago)"**(권장).

**구현**:
- `chartFormat.ts` ➕`tooltipPlugin(descriptor, labels)` — uPlot plugin(init/setCursor/destroy 짝, u.over 자식 div = React 밖 명령형 격리, CSS var() 테마 즉응, 전 훅 try/catch) + cursor 활성화(수직선+스냅 포인트, **drag/select 는 계속 off** = wheel/드래그 소유권 React Flow 유지). 값 포맷 = descriptor.formatValue(시맨틱 파생). 오버레이 = 심볼 병기, null = "—".
- `ChartCard.tsx` — **interval 토글**: 선택지 = registry queryableFields interval enum **파생**(하드코딩 0, datasource 가 바뀌면 자동 추종) + `<select className="nodrag">`(RF v12 기본 noDragClassName 소스 실측 확인) + effectiveInterval = 토글 > AI > descriptor, maxPoints 유지(포인트 수 유지 = 시간범위 확장). **freshness**: 마지막 데이터 포인트 recorded_at(Date.parse 숫자 최댓값) → "last point {시각} ({N}h ago)" 상시 고지 + 기존 "as of {fetch 시각}" 제거(데이터 시각이 진실). now = `useNow()` 5s 틱 — ★ 첫 구현의 렌더 중 `Date.now()` 를 **react-hooks/purity 가 실차단** → IndicatorCard 선례로 정정.
- 테스트 +5(tooltipPlugin 3 + ChartCard 토글/freshness 2) = web **436**.

**code-reviewer 0 Critical / 3W / 3S**: **W1**(freshness ISO 사전식 비교 — buildAlignedData 의 숫자 해석과 두 갈래, "Z" vs "+00:00" 무음 취약) → Date.parse 통일 + 메모리 `feedback_iso_lexical_vs_numeric_time_compare` 신설. **W2**(defaultInterval ∈ enum 불변식) → **기존 테스트가 이미 커버**(chartDescriptors.test "defaultInterval 은 registry interval enum 에 실존" — Step 3 박제) 확인. W3(ChartCard 308줄 — 다음 확장 시 useChartControls 추출 검토, 관찰만). S1(24h+ 시 날짜 병기)/S2(소형 카드 헤더 밀집) = **라이브 실측 후 판단**, S3(툴팁 row 재사용) 보류.

**▶ 다음 = 라이브 확인(사용자: 툴팁/토글/freshness 체감) → Step 6(펀딩).**

## 5. 진행 로그

| 날짜 | Step | 결과 |
|---|---|---|
| 2026-07-08 | 계획 세션 | ✅ 사용자 확정 4건(§1) + 선결 측정(§2: 펀딩 0행 확정) + roadmap-mgr 6-step 분해 + nextjs-frontend(uPlot 선정) + 계획 승인 (plan 파일 `parallel-questing-leaf.md`). |
| 2026-07-08 | Step 1 | ✅ Shape 계약 정식화 (§4). zod 자문(2층 게이트 정정) + code-reviewer 0C/2W(전부 반영). shared 77/web 369/lint 0. 커밋 `2967ee8`. |
| 2026-07-08 | Step 2 | ✅ `useDataServiceSeries` (§4b). 자문 2건 수렴(per-symbol 병렬 7ms vs IN 500ms 실측) + code-reviewer 0C/3W/6S(W 전부+S2·S3 반영, `[10-89]` 등재). web 394/type-check/lint clean. 커밋 `20d6429`. |
| 2026-07-08 | Step 3 | ✅ history 6종 + chartDescriptors (§4c). zod(id (A) 확정·값컬럼 미노출) + crypto-domain(OI 모노크롬·1.0/0 midline·null=gap) + code-reviewer 0C/3W/3S 전부 처리. **로컬 커밋만(배포 원자성 — 사용자 결정), push=Step 5.** shared 83/web 402 clean. 커밋 `09cb300`. |
| 2026-07-08 | Step 4 | ✅ GenericChart form (§4d) — uPlot 도입 + chartFormat/useUplot/ChartCard + 테스트 26. code-reviewer **1C**(다운샘플 길이 불일치 — 즉시 수정+회귀)/4W/4S 전부 처리. [10-71] lint 가 렌더 중 ref 읽기 실차단. web 428 clean. 로컬 커밋 `d16863c` (push 보류). |
| 2026-07-08 | 세션 마감 정합화 | ✅ 상위 문서 sweep — ROADMAP §사이클 2(진행 반영)/M2-composable 헤더·§11/usage-feedback 헤더(7·8회전)/Architecture §8(series 구멍 → 구현 완료 + 2층 게이트)/deferred [10-89] ④(테마 토글 색). **미push 로컬 커밋 3개(`09cb300`·`d16863c`·본 docs) = Step 5 에서 일괄 push.** |
| 2026-07-09 | Step 5 코드 | ✅ chart-card 양쪽 등록 + 등치 불변식 2건 + 렌더 매트릭스 23쌍 + ChartCard.test 실등록 전환 + matchMedia 스텁(§4e). code-reviewer 0C/1W/3S 전부 처리(`[10-91]` 등재 + 메모리 신설). shared 83/web 430/type-check/lint clean. **일괄 push 4커밋(배포 원자성 이행). ▶ 라이브 G2 대기.** |
| 2026-07-09 | Step 5 라이브 G2 | ✅ **전 게이트 PASS**(§4f) — AI 분기 5/5 · limit 역산 · 오버레이 · site=DB 모양 일치(사용자 육안+시간대 정렬) · 사이클 1 G3 동반 PASS(`[10-77]` 묘비). **hotfix 4연쇄**(marketType 500 / 축소 되먹임 / RO 소진 / ★uPlot.min.css 누락=DPR>1 잘림). `[10-35]` lag 실증 보강. crypto-trader UX 자문. **▶ UIUX 확장(호버·토글) 사용자 결정 대기 → Step 6.** |

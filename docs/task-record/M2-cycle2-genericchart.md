# M2 사이클 2 — GenericChart (Composable Stage 2 series + Stage 3 chart form) — task-record, 단일 진실

> **상태**: 🔄 **진행 중 — Step 1 ✅ + Step 2 ✅ (2026-07-08, 같은 날 연속 완주)**. 계획 승인 + Shape 계약 + `useDataServiceSeries` 훅.
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
| 3 | history datasource 6종 등록 + `chartDescriptors.ts` 팩 (id 네이밍 = zod 게이트) | 없음 | 📋 |
| 4 | GenericChart form 제작 (uPlot, 4파일: descriptors/format/useUplot/ChartCard, 미등록 격리) | 테스트만 | 📋 |
| 5 | 등록 + 플립 + **라이브 G2** (site=DB + 오버레이 + AI 자율 분기 + 기존 8 datasource 회귀 0) | ✅ 차트 라이브 | 📋 |
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

## 5. 진행 로그

| 날짜 | Step | 결과 |
|---|---|---|
| 2026-07-08 | 계획 세션 | ✅ 사용자 확정 4건(§1) + 선결 측정(§2: 펀딩 0행 확정) + roadmap-mgr 6-step 분해 + nextjs-frontend(uPlot 선정) + 계획 승인 (plan 파일 `parallel-questing-leaf.md`). |
| 2026-07-08 | Step 1 | ✅ Shape 계약 정식화 (§4). zod 자문(2층 게이트 정정) + code-reviewer 0C/2W(전부 반영). shared 77/web 369/lint 0. 커밋 `2967ee8`. |
| 2026-07-08 | Step 2 | ✅ `useDataServiceSeries` (§4b). 자문 2건 수렴(per-symbol 병렬 7ms vs IN 500ms 실측) + code-reviewer 0C/3W/6S(W 전부+S2·S3 반영, `[10-89]` 등재). web 394/type-check/lint clean. |
